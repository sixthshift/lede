import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import { openDb, migrateDb, seedSingletons, initDb, DEFAULT_LAYOUT } from "../src/server/db";
import { entries, profile, settings, secrets, applications } from "../src/server/db/schema";
import type { TailoredResume } from "../src/shared/types";

const tmpDirs: string[] = [];

function freshDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-db-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("fresh migrate against an empty tmp DATA_DIR", () => {
  it("creates exactly {entries, profile, settings, secrets} and enforces the singleton CHECK", () => {
    const dataDir = freshDataDir();
    const { db, sqlite } = openDb(dataDir);
    migrateDb(db);

    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'",
      )
      .all()
      .map((row) => (row as { name: string }).name)
      .sort();
    expect(tables).toEqual(["applications", "entries", "profile", "secrets", "settings"]);

    expect(() => db.run(sql`INSERT INTO profile (id, updated_at) VALUES (2, 0)`)).toThrow();
    expect(() =>
      db.run(sql`INSERT INTO settings (id, layout, updated_at) VALUES (2, '[]', 0)`),
    ).toThrow();
    expect(() => db.run(sql`INSERT INTO secrets (id, updated_at) VALUES (2, 0)`)).toThrow();

    sqlite.close();
  });
});

describe("restart persistence", () => {
  it("an entry inserted before close reads back after reopening the same DATA_DIR", () => {
    const dataDir = freshDataDir();

    const first = openDb(dataDir);
    migrateDb(first.db);
    first.db
      .insert(entries)
      .values({
        id: "acme-widget",
        section: "project",
        meta: { section: "project", name: "Widget" },
        facts: ["Built a widget."],
        tags: ["backend"],
        framings: null,
        sortKey: 202401,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();
    first.sqlite.close();

    const second = openDb(dataDir);
    const rows = second.db.select().from(entries).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("acme-widget");
    second.sqlite.close();
  });
});

describe("applications table (§27)", () => {
  function sampleResume(): TailoredResume {
    return {
      signals: { roleLevel: "senior", weights: ["backend"], hardRequirements: ["5+ years"] },
      summary: "Backend engineer with a track record of shipping.",
      sections: [
        {
          section: "experience",
          groups: [
            {
              heading: "Acme",
              leadRationale: "Strongest match.",
              items: [{ entryId: "acme-widget", text: "Built a widget." }],
            },
          ],
        },
      ],
      cut: [{ entryId: "e2", reason: "Not relevant to backend role." }],
    };
  }

  it("creates the applications table with every §27 column (insert+read a full row incl json fields)", () => {
    const dataDir = freshDataDir();
    const { db, sqlite } = openDb(dataDir);
    migrateDb(db);

    const now = Date.now();
    const resume = sampleResume();
    db.insert(applications)
      .values({
        id: "app-1",
        company: "Acme Corp",
        role: "Senior Backend Engineer",
        jobDescription: "We are hiring a senior backend engineer...",
        context: "Emphasize distributed systems experience.",
        current: resume,
        locked: null,
        genState: "tailored",
        currentMeta: { at: now, provider: "anthropic", model: "claude-opus-4-8" },
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const rows = db.select().from(applications).all();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.id).toBe("app-1");
    expect(row.company).toBe("Acme Corp");
    expect(row.role).toBe("Senior Backend Engineer");
    expect(row.jobDescription).toBe("We are hiring a senior backend engineer...");
    expect(row.context).toBe("Emphasize distributed systems experience.");
    expect(row.locked).toBeNull();
    expect(row.genState).toBe("tailored");
    expect(row.createdAt).toBe(now);
    expect(row.updatedAt).toBe(now);

    // RED-TEAM: json $type columns round-trip DEEP-EQUAL, not just "present".
    expect(row.current).toEqual(resume);
    expect(row.currentMeta).toEqual({ at: now, provider: "anthropic", model: "claude-opus-4-8" });

    sqlite.close();
  });

  it("defaults genState to 'untailored' when omitted on insert", () => {
    const dataDir = freshDataDir();
    const { db, sqlite } = openDb(dataDir);
    migrateDb(db);

    const now = Date.now();
    db.insert(applications)
      .values({
        id: "app-2",
        jobDescription: "Some job description.",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const rows = db.select().from(applications).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].genState).toBe("untailored");
    expect(rows[0].company).toBeNull();
    expect(rows[0].role).toBeNull();
    expect(rows[0].context).toBeNull();
    expect(rows[0].current).toBeNull();
    expect(rows[0].currentMeta).toBeNull();

    sqlite.close();
  });

  it("has no hiring-status column — only genState", () => {
    const dataDir = freshDataDir();
    const { db, sqlite } = openDb(dataDir);
    migrateDb(db);

    const columns = sqlite
      .prepare("PRAGMA table_info(applications)")
      .all()
      .map((c) => (c as { name: string }).name);

    expect(columns).toEqual([
      "id",
      "company",
      "role",
      "job_description",
      "context",
      "current",
      "locked",
      "gen_state",
      "current_meta",
      "created_at",
      "updated_at",
      "target_pages",
    ]);
    expect(columns).not.toContain("status");
    expect(columns).not.toContain("hiring_status");

    sqlite.close();
  });
});

describe("singleton seeding", () => {
  it("seeds profile(1), secrets(1), and settings(1) with the full §4.2 layout, all enabled", () => {
    const dataDir = freshDataDir();
    const { db, sqlite } = initDb(dataDir);

    const profileRow = db.select().from(profile).all();
    expect(profileRow).toHaveLength(1);
    expect(profileRow[0].id).toBe(1);

    const secretsRow = db.select().from(secrets).all();
    expect(secretsRow).toHaveLength(1);
    expect(secretsRow[0].id).toBe(1);

    const settingsRow = db.select().from(settings).all();
    expect(settingsRow).toHaveLength(1);
    expect(settingsRow[0].id).toBe(1);
    expect(settingsRow[0].layout).toEqual(DEFAULT_LAYOUT);
    expect(settingsRow[0].layout.every((l) => l.enabled)).toBe(true);
    expect(settingsRow[0].layout.map((l) => l.section)).toEqual([
      "summary",
      "experience",
      "project",
      "skill",
      "education",
      "award",
      "certification",
      "publication",
      "language",
      "interest",
      "reference",
    ]);

    sqlite.close();
  });

  it("is idempotent (re-seeding does not throw or duplicate rows)", () => {
    const dataDir = freshDataDir();
    const { db, sqlite } = initDb(dataDir);
    expect(() => seedSingletons(db)).not.toThrow();
    expect(db.select().from(settings).all()).toHaveLength(1);
    sqlite.close();
  });
});
