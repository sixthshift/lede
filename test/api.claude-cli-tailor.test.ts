// T005 — the application tailor route's claude-cli branch: engine selection
// that is keyless BY CONSTRUCTION (the secrets table is never read on this
// path), the CLI's four failure codes as four distinct 502s, and the OAuth
// token's absence from every surface one request can produce.
//
// PATH is always PREPENDED with the fake `claude` (test/helpers/claude-stub) —
// this container ships a REAL claude, so a case that merely hoped otherwise
// would spend a subscription call — and the binary-missing case REPLACES PATH
// with a claude-free dir rather than assuming absence.
//
// Every case here drives the LIVE engine mode; NODE_ENV=test defaults
// loadConfig() to "fixture", so the file sets LEDE_TAILOR_ENGINE and restores
// it. The one fixture-mode case sets it back deliberately.

import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/server/config";
import { encrypt } from "../src/server/crypto";
import { initDb, type Db } from "../src/server/db";
import { secrets, settings } from "../src/server/db/schema";
import { buildApp } from "../src/server/index";
import { applicationsRoutes } from "../src/server/routes/applications";
import { seedIfEmpty } from "../src/server/seed";
import { ClaudeCliEngine } from "../src/server/tailor/claude-cli";
import { CONTRAST_JDS } from "../src/server/tailor/evalcore";
import {
  type ClaudeStub,
  installClaudeStub,
  pathWithStub,
  pathWithoutClaude,
} from "./helpers/claude-stub";

const JD = "Hiring a platform engineer to own the SDK and the developer experience.";

// Short enough that the `hang` stub costs a rounding error against the file
// timeout, long enough that a real spawn plus stdin write always beats it.
const CLI_TIMEOUT_MS = 400;

const SAVED_ENV_KEYS = [
  "PATH",
  "LEDE_TAILOR_ENGINE",
  "LEDE_STUB_RECORD",
  "LEDE_STUB_MODE",
  "LEDE_STUB_PAYLOAD",
  // This container may genuinely have the OAuth variable set; the hygiene case
  // overwrites it with a sentinel and must hand the real one back.
  "CLAUDE_CODE_OAUTH_TOKEN",
] as const;

const tmpDirs: string[] = [];
let stub: ClaudeStub;
// Computed ONCE per test, off the pristine PATH: a variant that replaces PATH
// with a claude-free dir would otherwise poison the value the next variant
// rebuilds from — and a PATH holding only the stub loses `node`, which the
// stub's own shebang needs.
let stubPath: string;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of SAVED_ENV_KEYS) savedEnv[key] = process.env[key];

  stub = installClaudeStub();
  stubPath = pathWithStub(stub.dir);
  process.env.PATH = stubPath;
  process.env.LEDE_STUB_RECORD = stub.recordPath;
  process.env.LEDE_STUB_MODE = "library-derived";
  process.env.LEDE_STUB_PAYLOAD = path.join(stub.dir, "payload.json");
  process.env.LEDE_TAILOR_ENGINE = "live";
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  stub.cleanup();
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function freshDb(): Db {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-cli-tailor-"));
  tmpDirs.push(dir);
  return initDb(dir).db;
}

// A seeded library plus a configured provider/model is the entire precondition
// the CLI branch has — it reads nothing else, and notably no key.
function seededDb(provider: string, model: string): Db {
  const db = freshDb();
  seedIfEmpty(db);
  configureProvider(db, provider, model);
  return db;
}

function configureProvider(db: Db, provider: string, model: string): void {
  db.update(settings)
    .set({ provider, model, updatedAt: Date.now() })
    .where(eq(settings.id, 1))
    .run();
}

function secretsRow(db: Db) {
  return db.select().from(secrets).where(eq(secrets.id, 1)).get()!;
}

async function createApplication(app: FastifyInstance, jobDescription = JD): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/applications",
    payload: { jobDescription },
  });
  expect(res.statusCode).toBe(200);
  return res.json().id as string;
}

function postTailor(app: FastifyInstance, id: string) {
  return app.inject({ method: "POST", url: `/api/applications/${id}/tailor`, payload: {} });
}

function getApplication(app: FastifyInstance, id: string) {
  return app.inject({ method: "GET", url: `/api/applications/${id}` });
}

// The timeout code needs a sub-second bound and the only knob for it is the
// engine's own, so that one variant reaches the route through
// applicationsRoutes' deps seam instead of resolveEngine. logger: true so its
// error logging is captured exactly like buildApp's.
function shortTimeoutApp(db: Db): FastifyInstance {
  const app = Fastify({ logger: true });
  applicationsRoutes(app, db, {
    engine: new ClaudeCliEngine({ model: "sonnet", timeoutMs: CLI_TIMEOUT_MS }),
    config: { tailorEngine: "live" },
  });
  return app;
}

// Captures everything written to stdout/stderr while `fn` runs (Fastify's pino
// logger writes there) so a test can assert a secret never appears in it.
async function captureIO(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  (process.stdout.write as unknown) = (chunk: unknown, ...rest: unknown[]) => {
    chunks.push(String(chunk));
    return (origOut as (...a: unknown[]) => boolean)(chunk, ...rest);
  };
  (process.stderr.write as unknown) = (chunk: unknown, ...rest: unknown[]) => {
    chunks.push(String(chunk));
    return (origErr as (...a: unknown[]) => boolean)(chunk, ...rest);
  };
  try {
    await fn();
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return chunks.join("");
}

// ── failure variants: one stub behaviour per CLI failure code ──
type FailureVariant = {
  label: string;
  error: string;
  appFor: (db: Db) => FastifyInstance;
  arrange: () => void;
};

const FAILURE_VARIANTS: FailureVariant[] = [
  {
    label: "a claude-free PATH",
    error: "claude_cli_binary_missing",
    appFor: (db) => buildApp(db),
    arrange: () => {
      process.env.PATH = pathWithoutClaude();
    },
  },
  {
    label: "a non-zero exit",
    error: "claude_cli_exit",
    appFor: (db) => buildApp(db),
    arrange: () => {
      process.env.LEDE_STUB_MODE = "exit1";
    },
  },
  {
    label: "a child that never answers",
    error: "claude_cli_timeout",
    appFor: shortTimeoutApp,
    arrange: () => {
      process.env.LEDE_STUB_MODE = "hang";
    },
  },
  {
    label: "prose where JSON was asked for",
    error: "claude_cli_bad_output",
    appFor: (db) => buildApp(db),
    arrange: () => {
      process.env.LEDE_STUB_MODE = "prose";
    },
  },
];

// The env-dumping child is a fifth arrangement of an existing code, not a fifth
// code: it exits non-zero (so it maps to claude_cli_exit) but writes its whole
// environment to stderr on the way out, which is the only variant that puts the
// token itself in the engine's reach.
const ENV_DUMP_VARIANT: FailureVariant = {
  label: "a child that dumps its whole env to stderr",
  error: "claude_cli_exit",
  appFor: (db) => buildApp(db),
  arrange: () => {
    process.env.LEDE_STUB_MODE = "echo-env-stderr-exit1";
  },
};

// Re-establishes the baseline (stub on PATH, a usable answer) before applying
// the variant, so variants can run back to back in one test without one's PATH
// or mode leaking into the next.
function applyVariant(variant: FailureVariant): void {
  process.env.PATH = stubPath;
  process.env.LEDE_STUB_MODE = "library-derived";
  variant.arrange();
}

describe("POST /api/applications/:id/tailor — provider claude-cli tailors with no stored key at all", () => {
  it("200 + genState 'tailored' + currentMeta pinned to claude-cli and the configured model, secrets row still empty", async () => {
    const db = seededDb("claude-cli", "sonnet");
    expect(secretsRow(db).apiKeyEnc).toBeNull();

    const app = buildApp(db);
    const id = await createApplication(app);

    const res = await postTailor(app, id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.genState).toBe("tailored");
    expect(body.current).not.toBeNull();
    expect(body.currentMeta.provider).toBe("claude-cli");
    expect(body.currentMeta.model).toBe("sonnet");

    const fetched = await getApplication(app, id);
    expect(fetched.json().genState).toBe("tailored");

    // The decision really came from the stubbed CLI, invoked with the
    // configured model as a `claude` alias.
    const records = stub.readRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.argv).toContain("--model");
    expect(records[0]!.argv[records[0]!.argv.indexOf("--model") + 1]).toBe("sonnet");

    // Still keyless afterwards: nothing on this path writes or needs a key.
    expect(secretsRow(db).apiKeyEnc).toBeNull();
  });

  it("CONTRAST: reconfiguring the model moves both currentMeta.model and the CLI's --model", async () => {
    const db = seededDb("claude-cli", "sonnet");
    const app = buildApp(db);
    const id = await createApplication(app);

    expect((await postTailor(app, id)).json().currentMeta.model).toBe("sonnet");

    configureProvider(db, "claude-cli", "opus");
    const second = await postTailor(app, id);
    expect(second.statusCode).toBe(200);
    expect(second.json().currentMeta.model).toBe("opus");

    const records = stub.readRecords();
    expect(records).toHaveLength(2);
    expect(records[1]!.argv[records[1]!.argv.indexOf("--model") + 1]).toBe("opus");
  });
});

describe("CONTRAST: the keyless branch is claude-cli-only", () => {
  it("provider anthropic with no stored key still 400s no_api_key, and never spawns the CLI", async () => {
    const db = seededDb("anthropic", "claude-opus-4-8");
    const app = buildApp(db);
    const id = await createApplication(app);

    const res = await postTailor(app, id);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "no_api_key" });

    expect((await getApplication(app, id)).json().genState).toBe("untailored");
    expect(stub.readRecords()).toHaveLength(0);
  });
});

describe("CONTRAST: fixture-first — the engine mode outranks the configured provider", () => {
  it("tailorEngine=fixture with provider claude-cli replays through FixtureEngine and records ZERO CLI invocations", async () => {
    process.env.LEDE_TAILOR_ENGINE = "fixture";
    const db = seededDb("claude-cli", "sonnet");
    const app = buildApp(db);
    const id = await createApplication(app, CONTRAST_JDS[0]!.jd);

    const res = await postTailor(app, id);
    expect(res.statusCode).toBe(200);
    expect(res.json().genState).toBe("tailored");
    expect(res.json().current).not.toBeNull();

    expect(stub.readRecords()).toHaveLength(0);
  });
});

describe("secrets isolation: a stored BYOK key is neither read nor touched on the CLI path", () => {
  it("tailoring succeeds through the stub with a key present, and secrets.apiKeyEnc is byte-identical before and after", async () => {
    const db = seededDb("claude-cli", "sonnet");
    db.update(secrets)
      .set({
        apiKeyEnc: encrypt(`sk-untouched-${randomUUID()}`, loadConfig().masterKey),
        apiKeyValidatedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .where(eq(secrets.id, 1))
      .run();
    const before = JSON.stringify(secretsRow(db).apiKeyEnc);
    expect(before).not.toBe("null");

    const app = buildApp(db);
    const id = await createApplication(app);
    const res = await postTailor(app, id);
    expect(res.statusCode).toBe(200);
    expect(res.json().currentMeta.provider).toBe("claude-cli");

    expect(JSON.stringify(secretsRow(db).apiKeyEnc)).toBe(before);
  });

  it("the CLI engine module imports neither the secrets table nor decrypt", async () => {
    // The nearest STATIC boundary for "never reads the secrets table": the
    // engine cannot reach a key it has no import path to, whatever a route
    // hands it.
    const source = readFileSync(
      new URL("../src/server/tailor/claude-cli.ts", import.meta.url),
      "utf-8",
    );
    const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers).not.toContain("../crypto");
    expect(specifiers).not.toContain("../db/schema");
    expect(source).not.toMatch(/\bsecrets\b/);
    expect(source).not.toMatch(/\bdecrypt\b/);
  });
});

describe("failure mapping: each CLI failure code becomes its own 502, application left 'failed'", () => {
  for (const variant of FAILURE_VARIANTS) {
    it(`${variant.label} -> 502 ${variant.error}, genState 'failed'`, async () => {
      const db = seededDb("claude-cli", "sonnet");
      const app = variant.appFor(db);
      const id = await createApplication(app);
      applyVariant(variant);

      const res = await postTailor(app, id);
      expect(res.statusCode).toBe(502);
      expect(res.json()).toEqual({ error: variant.error });

      expect((await getApplication(app, id)).json().genState).toBe("failed");
    });
  }

  it("the four variants produce four DISTINCT error strings", async () => {
    const observed: string[] = [];
    for (const variant of FAILURE_VARIANTS) {
      const db = seededDb("claude-cli", "sonnet");
      const app = variant.appFor(db);
      const id = await createApplication(app);
      applyVariant(variant);

      const res = await postTailor(app, id);
      expect(res.statusCode).toBe(502);
      observed.push(res.json().error as string);
    }

    expect(observed).toEqual(FAILURE_VARIANTS.map((variant) => variant.error));
    expect(new Set(observed).size).toBe(4);
  });
});

describe("token hygiene: the OAuth token reaches the child and nothing else", () => {
  it("a sentinel token appears in no response body, no persisted row, no captured log line, and not in the backup export", async () => {
    const sentinel = `oauth-sentinel-${randomUUID()}`;
    // Deleted then re-set so it lands last in the child's environ, which is what
    // puts it inside the stderr tail the env-dumping variant produces. Without
    // that, an absent sentinel would prove nothing but the truncation window.
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = sentinel;

    const db = seededDb("claude-cli", "sonnet");
    const payloads: string[] = [];
    const ids: string[] = [];

    const logs = await captureIO(async () => {
      // Built INSIDE the capture window: pino binds its destination at
      // construction, so an instance created beforehand would write past the
      // patched stdout and the scan below would be reading an empty string.
      const app = buildApp(db);

      const okId = await createApplication(app);
      ids.push(okId);
      const ok = await postTailor(app, okId);
      expect(ok.statusCode).toBe(200);
      payloads.push(ok.payload);

      for (const variant of [...FAILURE_VARIANTS, ENV_DUMP_VARIANT]) {
        const variantApp = variant.appFor(db);
        const id = await createApplication(variantApp);
        ids.push(id);
        applyVariant(variant);

        const res = await postTailor(variantApp, id);
        expect(res.statusCode).toBe(502);
        expect(res.json()).toEqual({ error: variant.error });
        payloads.push(res.payload);
      }

      // The persisted rows themselves — a failure message stored on the row
      // would be as much of a leak as one returned.
      for (const id of ids) payloads.push((await getApplication(app, id)).payload);

      const exported = await app.inject({ method: "GET", url: "/api/export" });
      expect(exported.statusCode).toBe(200);
      payloads.push(exported.payload);
    });

    // Positive control: the child genuinely received the token, so its absence
    // above is redaction doing work rather than the engine withholding the env.
    const records = stub.readRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(sentinel);
    }
    // Positive controls on the log scan itself: server output really was
    // captured (the request URLs are in it), and the env-dumping child's error
    // DID reach the log — carrying the redaction marker where the token stood,
    // which is what makes the sentinel's absence below evidence rather than
    // silence.
    expect(logs).toContain(ids[0]!);
    expect(logs).toContain("[redacted]");

    for (const payload of payloads) expect(payload).not.toContain(sentinel);
    expect(logs).not.toContain(sentinel);
  });
});
