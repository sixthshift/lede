// Boot gate (ticket T017): proves the REAL entrypoint boots under the REAL
// runner (tsx -> Node), not just that our source typechecks against Bun's
// ambient types. This is the test the escaped bug (ERR_DLOPEN_FAILED under
// `bun src/server/index.ts`) would have caught: better-sqlite3 is a Node-ABI
// native addon Bun's embedded V8 cannot dlopen.
import { describe, it, expect, afterEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import {
  mkdtempSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { openDb, migrateDb } from "../src/server/db";
import { applications, profile } from "../src/server/db/schema";
import * as schema from "../src/server/db/schema";
import type { CoverLetter, VoiceSource } from "../src/shared/types";
import { voiceSourceZ, profileInput, VOICE_SOURCES_CAP } from "../src/shared/schema";

const TSX_BIN = path.join(process.cwd(), "node_modules/.bin/tsx");
const ENTRYPOINT = path.join(process.cwd(), "src/server/index.ts");
const VALID_MASTER_KEY = randomBytes(32).toString("base64");
const VALID_SESSION_SECRET = "boot-smoke-session-secret-at-least-32-chars";

let child: ChildProcess | undefined;
let dataDir: string | undefined;

afterEach(() => {
  if (child && !child.killed) child.kill();
  child = undefined;
  if (dataDir) {
    rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  }
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const address = srv.address();
      if (address === null || typeof address === "string") {
        reject(new Error("could not determine a free port"));
        return;
      }
      const { port } = address;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function pollHealth(port: number, deadline: number): Promise<{ ok: boolean }> {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return (await res.json()) as { ok: boolean };
    } catch {
      // server not up yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`GET /api/health did not respond ok within the deadline (port ${port})`);
}

describe("boot smoke: real entrypoint under the real runner (tsx/Node)", () => {
  it("boots, serves GET /api/health -> {ok:true}, and creates the sqlite file under DATA_DIR", async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), "lede-boot-smoke-"));
    const port = await freePort();

    child = spawn(TSX_BIN, [ENTRYPOINT], {
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        PORT: String(port),
        NODE_ENV: "test",
        LEDE_MASTER_KEY: VALID_MASTER_KEY,
        LEDE_SESSION_SECRET: VALID_SESSION_SECRET,
      },
      stdio: "pipe",
    });

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    let exited: number | null = null;
    child.on("exit", (code) => {
      exited = code;
    });

    const body = await pollHealth(port, Date.now() + 15_000).catch((err) => {
      throw new Error(`${err.message}\nexit code: ${exited}\nstderr:\n${stderr}`);
    });

    expect(body).toEqual({ ok: true });
    expect(existsSync(path.join(dataDir, "lede.sqlite"))).toBe(true);
  }, 20_000);
});

// Process-level boot refusal (spec.md §8/§19/§23): the operator secrets are
// REQUIRED to boot and are NEVER auto-generated. A missing or malformed
// LEDE_MASTER_KEY must fail the process before it ever listens.
function spawnWithEnv(env: Record<string, string | undefined>): {
  waitForExit: () => Promise<number | null>;
} {
  const merged: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  child = spawn(TSX_BIN, [ENTRYPOINT], {
    env: merged,
    stdio: "pipe",
  });
  const proc = child;
  return {
    waitForExit: () =>
      new Promise((resolve) => {
        proc.on("exit", (code) => resolve(code));
      }),
  };
}

describe("boot refusal: missing/malformed operator secrets never boot, never write a key", () => {
  it("exits non-zero and never listens when LEDE_MASTER_KEY is unset", async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), "lede-boot-refusal-"));
    const port = await freePort();
    const { waitForExit } = spawnWithEnv({
      DATA_DIR: dataDir,
      PORT: String(port),
      NODE_ENV: "test",
      LEDE_MASTER_KEY: undefined,
      LEDE_SESSION_SECRET: VALID_SESSION_SECRET,
    });

    const code = await waitForExit();
    expect(code).not.toBe(0);
    await expect(pollHealth(port, Date.now() + 1_500)).rejects.toThrow();
    expect(existsSync(dataDir)).toBe(true);
    expect(readdirSync(dataDir)).toEqual([]);
  }, 20_000);

  it("exits non-zero and never listens when LEDE_MASTER_KEY is malformed (not 32 bytes)", async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), "lede-boot-refusal-"));
    const port = await freePort();
    const { waitForExit } = spawnWithEnv({
      DATA_DIR: dataDir,
      PORT: String(port),
      NODE_ENV: "test",
      LEDE_MASTER_KEY: Buffer.from("too short").toString("base64"),
      LEDE_SESSION_SECRET: VALID_SESSION_SECRET,
    });

    const code = await waitForExit();
    expect(code).not.toBe(0);
    await expect(pollHealth(port, Date.now() + 1_500)).rejects.toThrow();
    expect(existsSync(dataDir)).toBe(true);
    expect(readdirSync(dataDir)).toEqual([]);
  }, 20_000);
});

// ── drizzle/0006 (T11): motivation + letter snapshot columns on `applications` ──

const projectDrizzleDir = path.join(process.cwd(), "drizzle");

function freshTmpDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-migration-0006-"));
  return dir;
}

describe("drizzle/0006 — motivation + letter snapshot columns", () => {
  it("fresh boot applies through 0006: __drizzle_migrations records it, applications has the 5 new columns", () => {
    const dataDir = freshTmpDir();
    const { db, sqlite } = openDb(dataDir);
    migrateDb(db);

    const journal = JSON.parse(
      readFileSync(path.join(projectDrizzleDir, "meta", "_journal.json"), "utf-8"),
    );
    const entry0006 = journal.entries.find((e: { idx: number }) => e.idx === 6);
    expect(entry0006, "0006 must be registered in meta/_journal.json").toBeDefined();
    expect(entry0006.tag).toBe("0006_letter_snapshots");

    const migrationRows = sqlite
      .prepare("SELECT created_at FROM __drizzle_migrations ORDER BY created_at")
      .all() as { created_at: number }[];
    expect(migrationRows.map((r) => r.created_at)).toContain(entry0006.when);

    const columns = sqlite
      .prepare("PRAGMA table_info(applications)")
      .all()
      .map((c) => (c as { name: string }).name);
    expect(columns).toEqual(
      expect.arrayContaining([
        "motivation",
        "letter_current",
        "letter_previous",
        "letter_gen_state",
        "letter_failed_reason",
      ]),
    );

    sqlite.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("UPGRADE PATH: a DATA_DIR migrated only through 0005 applies 0006 additively, pre-existing row survives with new-column defaults", () => {
    const journal = JSON.parse(
      readFileSync(path.join(projectDrizzleDir, "meta", "_journal.json"), "utf-8"),
    );
    const priorEntries = journal.entries.filter((e: { idx: number }) => e.idx <= 5);

    const priorDir = mkdtempSync(path.join(tmpdir(), "lede-prior-migrations-0006-"));
    mkdirSync(path.join(priorDir, "meta"));
    for (const e of priorEntries) {
      writeFileSync(
        path.join(priorDir, `${e.tag}.sql`),
        readFileSync(path.join(projectDrizzleDir, `${e.tag}.sql`)),
      );
    }
    writeFileSync(
      path.join(priorDir, "meta", "_journal.json"),
      JSON.stringify({ version: journal.version, dialect: journal.dialect, entries: priorEntries }),
    );

    const dbFile = path.join(freshTmpDir(), "lede.sqlite");
    const sqlite = new Database(dbFile);
    const db = drizzle(sqlite, { schema });

    migrate(db, { migrationsFolder: priorDir });

    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO applications (id, job_description, gen_state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("pre-0006-app", "A pre-existing job description.", "untailored", now, now);

    // Now migrate against the REAL project drizzle/ folder — 0000-0005 are
    // already applied (by timestamp), so only 0006 runs.
    migrate(db, { migrationsFolder: "drizzle" });

    const rows = db.select().from(applications).all();
    const row = rows.find((r) => r.id === "pre-0006-app");
    expect(row, "the pre-existing row must survive the 0006 upgrade").toBeDefined();
    expect(row!.jobDescription).toBe("A pre-existing job description.");
    expect(row!.letterGenState).toBe("untailored");
    expect(row!.letterCurrent).toBeNull();
    expect(row!.letterPrevious).toBeNull();
    expect(row!.letterFailedReason).toBeNull();
    expect(row!.motivation).toBeNull();

    sqlite.close();
  });

  it("SQL DEFAULTS: inserting a row omitting the 5 new fields reads back letter_gen_state='untailored' and null snapshots", () => {
    const dataDir = freshTmpDir();
    const { db, sqlite } = openDb(dataDir);
    migrateDb(db);

    const now = Date.now();
    db.insert(applications)
      .values({
        id: "defaults-app",
        jobDescription: "Some job description.",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const rows = db.select().from(applications).all();
    const row = rows.find((r) => r.id === "defaults-app")!;
    expect(row.letterGenState).toBe("untailored");
    expect(row.letterCurrent).toBeNull();
    expect(row.letterPrevious).toBeNull();
    expect(row.letterFailedReason).toBeNull();
    expect(row.motivation).toBeNull();

    sqlite.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("CONTRAST: a row with letterCurrent set round-trips the JSON (non-null)", () => {
    const dataDir = freshTmpDir();
    const { db, sqlite } = openDb(dataDir);
    migrateDb(db);

    const letter: CoverLetter = {
      greeting: "Dear Hiring Manager,",
      body: [{ text: "I'm excited to apply.", groundedOn: ["entry-1"] }],
      closing: "Sincerely,",
    };

    const now = Date.now();
    db.insert(applications)
      .values({
        id: "letter-app",
        jobDescription: "Some job description.",
        motivation: "Genuinely excited about this team's mission.",
        letterCurrent: letter,
        letterGenState: "tailored",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const rows = db.select().from(applications).all();
    const row = rows.find((r) => r.id === "letter-app")!;
    expect(row.letterCurrent).toEqual(letter);
    expect(row.letterGenState).toBe("tailored");
    expect(row.motivation).toBe("Genuinely excited about this team's mission.");

    sqlite.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
});

// ── drizzle/0007 (T41): profile.voice_sources column ──

describe("drizzle/0007 — profile.voice_sources column", () => {
  it("fresh boot applies through 0007: __drizzle_migrations records it, profile has voice_sources", () => {
    const dataDir = freshTmpDir();
    const { db, sqlite } = openDb(dataDir);
    migrateDb(db);

    const journal = JSON.parse(
      readFileSync(path.join(projectDrizzleDir, "meta", "_journal.json"), "utf-8"),
    );
    const entry0007 = journal.entries.find((e: { idx: number }) => e.idx === 7);
    expect(entry0007, "0007 must be registered in meta/_journal.json").toBeDefined();
    expect(entry0007.tag).toBe("0007_voice_sources");

    const migrationRows = sqlite
      .prepare("SELECT created_at FROM __drizzle_migrations ORDER BY created_at")
      .all() as { created_at: number }[];
    expect(migrationRows.map((r) => r.created_at)).toContain(entry0007.when);

    const columns = sqlite
      .prepare("PRAGMA table_info(profile)")
      .all()
      .map((c) => (c as { name: string }).name);
    expect(columns).toEqual(expect.arrayContaining(["voice_sources"]));

    sqlite.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("UPGRADE PATH: a DATA_DIR migrated only through 0006 applies 0007 additively, pre-existing row survives with the new column's default", () => {
    const journal = JSON.parse(
      readFileSync(path.join(projectDrizzleDir, "meta", "_journal.json"), "utf-8"),
    );
    const priorEntries = journal.entries.filter((e: { idx: number }) => e.idx <= 6);

    const priorDir = mkdtempSync(path.join(tmpdir(), "lede-prior-migrations-0007-"));
    mkdirSync(path.join(priorDir, "meta"));
    for (const e of priorEntries) {
      writeFileSync(
        path.join(priorDir, `${e.tag}.sql`),
        readFileSync(path.join(projectDrizzleDir, `${e.tag}.sql`)),
      );
    }
    writeFileSync(
      path.join(priorDir, "meta", "_journal.json"),
      JSON.stringify({ version: journal.version, dialect: journal.dialect, entries: priorEntries }),
    );

    const dbFile = path.join(freshTmpDir(), "lede.sqlite");
    const sqlite = new Database(dbFile);
    const db = drizzle(sqlite, { schema });

    migrate(db, { migrationsFolder: priorDir });

    const now = Date.now();
    sqlite
      .prepare(`INSERT INTO profile (id, name, email, updated_at) VALUES (1, ?, ?, ?)`)
      .run("Pre-0007 Person", "pre-0007@example.com", now);

    // Now migrate against the REAL project drizzle/ folder — 0000-0006 are
    // already applied (by timestamp), so only 0007 runs.
    migrate(db, { migrationsFolder: "drizzle" });

    const rows = db.select().from(profile).all();
    const row = rows.find((r) => r.id === 1);
    expect(row, "the pre-existing row must survive the 0007 upgrade").toBeDefined();
    expect(row!.name).toBe("Pre-0007 Person");
    expect(row!.voiceSources).toEqual([]);

    sqlite.close();
  });

  it("SQL DEFAULT: inserting a profile row OMITTING voiceSources reads back voiceSources as [] (the default resolves on read, not merely pragma-visible)", () => {
    const dataDir = freshTmpDir();
    const { db, sqlite } = openDb(dataDir);
    migrateDb(db);

    const now = Date.now();
    db.insert(profile)
      .values({
        id: 1,
        name: "Defaults Person",
        email: "defaults@example.com",
        updatedAt: now,
      })
      .run();

    const rows = db.select().from(profile).all();
    const row = rows.find((r) => r.id === 1)!;
    expect(row.voiceSources).toEqual([]);

    sqlite.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("CONTRAST: a row with voiceSources set round-trips the JSON (non-empty)", () => {
    const dataDir = freshTmpDir();
    const { db, sqlite } = openDb(dataDir);
    migrateDb(db);

    const sources: VoiceSource[] = [
      { id: "vs-1", kind: "cover-letter", text: "I write in a direct, plain-spoken voice.", at: 1 },
    ];

    const now = Date.now();
    db.insert(profile)
      .values({
        id: 1,
        name: "Voiced Person",
        email: "voiced@example.com",
        voiceSources: sources,
        updatedAt: now,
      })
      .run();

    const rows = db.select().from(profile).all();
    const row = rows.find((r) => r.id === 1)!;
    expect(row.voiceSources).toEqual(sources);

    sqlite.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
});

// ── voiceSourceZ + profileInput.voiceSources + VOICE_SOURCES_CAP (T41) ──

describe("voiceSourceZ", () => {
  function validSource() {
    return { id: "vs-1", kind: "cover-letter" as const, text: "Direct and plain-spoken.", at: 1 };
  }

  it("accepts kind:'cover-letter'", () => {
    expect(voiceSourceZ.safeParse(validSource()).success).toBe(true);
  });

  it("accepts kind:'resume'", () => {
    expect(voiceSourceZ.safeParse({ ...validSource(), kind: "resume" }).success).toBe(true);
  });

  it("REJECTS kind:'other' ('other' is CUT)", () => {
    expect(voiceSourceZ.safeParse({ ...validSource(), kind: "other" }).success).toBe(false);
  });

  it("REJECTS any non-enum kind", () => {
    expect(voiceSourceZ.safeParse({ ...validSource(), kind: "bio" }).success).toBe(false);
  });
});

describe("profileInput.voiceSources (secondary guard; primary cap enforcement is T42)", () => {
  function baseProfile() {
    return { name: "Jane Doe", email: "jane@example.com", links: [] as never[] };
  }
  function source(i: number) {
    return { id: `vs-${i}`, kind: "cover-letter" as const, text: `source ${i}`, at: i };
  }

  it(`accepts exactly ${VOICE_SOURCES_CAP} voiceSources`, () => {
    const voiceSources = Array.from({ length: VOICE_SOURCES_CAP }, (_, i) => source(i));
    expect(profileInput.safeParse({ ...baseProfile(), voiceSources }).success).toBe(true);
  });

  it(`REJECTS ${VOICE_SOURCES_CAP + 1} voiceSources (zod .max(${VOICE_SOURCES_CAP}))`, () => {
    const voiceSources = Array.from({ length: VOICE_SOURCES_CAP + 1 }, (_, i) => source(i));
    expect(profileInput.safeParse({ ...baseProfile(), voiceSources }).success).toBe(false);
  });

  it("is omittable (existing PUT /api/profile payloads without voiceSources still validate)", () => {
    expect(profileInput.safeParse(baseProfile()).success).toBe(true);
  });
});

describe("VOICE_SOURCES_CAP", () => {
  it("is exported as the code constant 5 (cap ENFORCEMENT is T42, not proven here)", () => {
    expect(VOICE_SOURCES_CAP).toBe(5);
  });
});
