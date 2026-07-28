// T006 — POST /api/settings/test-connection: the claude-cli readiness probe as
// an HTTP surface. What is proved here is that the 200 is EARNED by a real
// round trip (the stub's recording is the witness: the pinned argv, a system
// prompt file inside the scratch cwd, the prompt on stdin, and no `--version`
// anywhere), that each way the CLI can fail arrives as its own 502 with the
// tailor route's identical error string, that a non-claude-cli provider is
// rejected before anything is spawned, and that the OAuth token never rides
// out on a response or a log line.
//
// PATH is always PREPENDED with the fake `claude` (test/helpers/claude-stub) —
// this container ships a REAL claude, so a case that merely hoped otherwise
// would spend a subscription call — and the binary-missing case REPLACES PATH
// with a claude-free dir rather than assuming absence.

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initDb, type Db } from "../src/server/db";
import { secrets, settings } from "../src/server/db/schema";
import { buildApp } from "../src/server/index";
import type { ProviderKeyValidator } from "../src/server/keyvalidation";
import { settingsRoutes } from "../src/server/routes/settings";
import {
  ClaudeCliEngine,
  DISALLOWED_TOOLS,
  type ClaudeCliProbe,
} from "../src/server/tailor/claude-cli";
import { SYSTEM_PROMPT } from "../src/server/tailor/prompt";
import {
  type ClaudeStub,
  type StubRecord,
  installClaudeStub,
  pathWithStub,
  pathWithoutClaude,
} from "./helpers/claude-stub";

// The reply the probe's schema accepts, spelled out here rather than imported:
// the stub stands in for a model, so it has to speak the contract from the
// outside. If the probe's expected reply ever changes, this goes red — which is
// the point, since the operator-visible meaning of a green probe changes with it.
const PROBE_REPLY = JSON.stringify({ ready: true });

// Short enough that the `hang` stub costs a rounding error against the file
// timeout, long enough that a real spawn plus stdin write always beats it.
const CLI_TIMEOUT_MS = 400;

// The only knob the engine has, and the only reason this seam is used: the
// route's own probe waits out the production bound, which no test can afford.
const shortTimeoutProbe: ClaudeCliProbe = (model) =>
  new ClaudeCliEngine({ model, timeoutMs: CLI_TIMEOUT_MS }).probe();

const acceptValidator: ProviderKeyValidator = async () => {};

const SAVED_ENV_KEYS = [
  "PATH",
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
  const payloadPath = path.join(stub.dir, "payload.json");
  writeFileSync(payloadPath, PROBE_REPLY, "utf-8");

  process.env.PATH = stubPath;
  process.env.LEDE_STUB_RECORD = stub.recordPath;
  process.env.LEDE_STUB_MODE = "ok";
  process.env.LEDE_STUB_PAYLOAD = payloadPath;
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
  const dir = mkdtempSync(path.join(tmpdir(), "lede-cli-testconn-"));
  tmpDirs.push(dir);
  return initDb(dir).db;
}

// A configured provider/model is the whole precondition — no library, no key.
function dbWithProvider(provider: string, model = "sonnet"): Db {
  const db = freshDb();
  db.update(settings)
    .set({ provider, model, updatedAt: Date.now() })
    .where(eq(settings.id, 1))
    .run();
  return db;
}

// The route reached through buildApp, i.e. exactly as it ships (real probe,
// real spawn, PATH-resolved stub). Variants that need a sub-second timeout use
// probeApp instead.
function probeApp(db: Db, probe?: ClaudeCliProbe): FastifyInstance {
  const app = Fastify({ logger: false });
  settingsRoutes(app, db, acceptValidator, probe);
  return app;
}

function postTestConnection(app: FastifyInstance) {
  return app.inject({ method: "POST", url: "/api/settings/test-connection" });
}

function flag(record: StubRecord, name: string): string | undefined {
  const i = record.argv.indexOf(name);
  return i >= 0 ? record.argv[i + 1] : undefined;
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

// ── failure variants: one stub arrangement per CLI failure code ──
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
    appFor: (db) => probeApp(db, shortTimeoutProbe),
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
// token itself inside the tail `detail` carries.
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
  process.env.LEDE_STUB_MODE = "ok";
  variant.arrange();
}

describe("POST /api/settings/test-connection — provider claude-cli, a healthy CLI", () => {
  it("200 {ok:true}, and the recording shows ONE round trip on the pinned spawn contract", async () => {
    const db = dbWithProvider("claude-cli", "sonnet");
    const res = await postTestConnection(buildApp(db));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const records = stub.readRecords();
    expect(records).toHaveLength(1);
    const [record] = records;

    expect(record.argv).toContain("-p");
    expect(flag(record, "--output-format")).toBe("json");
    expect(flag(record, "--model")).toBe("sonnet");
    expect(flag(record, "--disallowed-tools")).toBe(DISALLOWED_TOOLS);

    // The system prompt file lives inside the per-request scratch cwd, which
    // holds nothing else — same contract the tailoring calls ride.
    const systemPath = flag(record, "--system-prompt-file");
    expect(systemPath).toBeDefined();
    expect(path.dirname(systemPath as string)).toBe(record.cwd);
    expect(record.cwdEntries).toEqual(["system.md"]);

    // An existence probe is the rejected design; its flag appears nowhere.
    expect(record.argv).not.toContain("--version");
    expect(record.argv.join(" ")).not.toContain("--version");

    // The prompt arrived on stdin, never as an argv element.
    expect(record.stdin.trim().length).toBeGreaterThan(0);
    for (const arg of record.argv) expect(arg).not.toBe(record.stdin);
  });

  it("re-probes per request and follows the configured model", async () => {
    const db = dbWithProvider("claude-cli", "sonnet");
    const app = buildApp(db);
    expect((await postTestConnection(app)).statusCode).toBe(200);

    db.update(settings)
      .set({ model: "opus", updatedAt: Date.now() })
      .where(eq(settings.id, 1))
      .run();
    expect((await postTestConnection(app)).statusCode).toBe(200);

    expect(stub.readRecords().map((r) => flag(r, "--model"))).toEqual(["sonnet", "opus"]);
  });

  it("asks its OWN trivial question — the probe carries no shared tailor prompt and no library", async () => {
    const db = dbWithProvider("claude-cli");
    expect((await postTestConnection(buildApp(db))).statusCode).toBe(200);

    const [record] = stub.readRecords();
    expect(record.systemPrompt).not.toBeNull();
    // It still asks for JSON (that is what makes the reply parseable at all)…
    expect(record.systemPrompt).toContain("Output ONLY a JSON object");
    // …but it is not the tailor's system prompt, and no entry was rendered into it.
    expect(record.systemPrompt).not.toContain(SYSTEM_PROMPT);
    expect(record.systemPrompt).not.toContain("facts:");
  });

  it("stays keyless: the secrets row is empty before and after a successful probe", async () => {
    const db = dbWithProvider("claude-cli");
    const before = db.select().from(secrets).where(eq(secrets.id, 1)).get()!;
    expect(before.apiKeyEnc).toBeNull();

    expect((await postTestConnection(buildApp(db))).statusCode).toBe(200);

    expect(db.select().from(secrets).where(eq(secrets.id, 1)).get()!.apiKeyEnc).toBeNull();
  });
});

describe("failure taxonomy: each way the CLI can fail is its own 502", () => {
  for (const variant of FAILURE_VARIANTS) {
    it(`${variant.label} -> 502 ${variant.error}`, async () => {
      const db = dbWithProvider("claude-cli");
      const app = variant.appFor(db);
      applyVariant(variant);

      const res = await postTestConnection(app);
      expect(res.statusCode).toBe(502);
      expect(res.json().error).toBe(variant.error);
    });
  }

  it("the four variants produce four DISTINCT error strings", async () => {
    const observed: string[] = [];
    for (const variant of FAILURE_VARIANTS) {
      const db = dbWithProvider("claude-cli");
      const app = variant.appFor(db);
      applyVariant(variant);

      const res = await postTestConnection(app);
      expect(res.statusCode).toBe(502);
      observed.push(res.json().error as string);
    }

    expect(observed).toEqual(FAILURE_VARIANTS.map((variant) => variant.error));
    expect(new Set(observed).size).toBe(4);
  });

  it("CONTRAST: an exit-0 child answering prose is bad_output, not a pass", async () => {
    const db = dbWithProvider("claude-cli");
    process.env.LEDE_STUB_MODE = "prose";

    const res = await postTestConnection(buildApp(db));
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("claude_cli_bad_output");

    // The child really did run and really did exit 0 — the 502 comes from the
    // parse, which is what makes the 200 above evidence of a round trip.
    expect(stub.readRecords()).toHaveLength(1);
  });

  it("a non-zero exit carries the child's own stderr tail in detail", async () => {
    const db = dbWithProvider("claude-cli");
    process.env.LEDE_STUB_MODE = "exit1";

    const res = await postTestConnection(buildApp(db));
    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body.error).toBe("claude_cli_exit");
    expect(body.detail).toContain("simulated non-zero exit");
  });

  it("a child that floods stderr gets a TRUNCATED tail, not the whole stream", async () => {
    const db = dbWithProvider("claude-cli");
    process.env.LEDE_STUB_MODE = "echo-env-stderr-exit1";

    const res = await postTestConnection(buildApp(db));
    expect(res.statusCode).toBe(502);
    const detail = res.json().detail as string;
    // Leading ellipsis is the engine's truncation marker; the whole env dump is
    // far longer than the bound, so an untruncated detail would fail both.
    expect(detail.startsWith("…")).toBe(true);
    expect(detail.length).toBeLessThan(700);
  });

  it("codes that fail before any answer carry no detail at all", async () => {
    const db = dbWithProvider("claude-cli");
    process.env.PATH = pathWithoutClaude();

    const res = await postTestConnection(buildApp(db));
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: "claude_cli_binary_missing" });
  });
});

describe("CONTRAST: the probe is claude-cli-only and spawns nothing otherwise", () => {
  for (const provider of ["anthropic", "openai"]) {
    it(`provider ${provider} -> 400, zero CLI invocations`, async () => {
      const db = dbWithProvider(provider, "claude-opus-4-8");
      const res = await postTestConnection(buildApp(db));

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "provider_not_testable" });
      // A distinct string, not a recycled CLI code: nothing about the CLI was
      // observed, so claiming one of its failures would be a lie.
      expect(res.json().error).not.toMatch(/^claude_cli_/);

      expect(stub.readRecords()).toHaveLength(0);
    });
  }
});

describe("token hygiene: the OAuth token reaches the child and nothing else", () => {
  it("a sentinel token appears in no response body and no captured log line", async () => {
    const sentinel = `oauth-sentinel-${randomUUID()}`;
    // Deleted then re-set so it lands last in the child's environ, which is what
    // puts it inside the stderr tail the env-dumping variant produces. Without
    // that, an absent sentinel would prove nothing but the truncation window.
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = sentinel;

    const payloads: string[] = [];

    const logs = await captureIO(async () => {
      // Built INSIDE the capture window: pino binds its destination at
      // construction, so an instance created beforehand would write past the
      // patched stdout and the scan below would be reading an empty string.
      const okApp = buildApp(dbWithProvider("claude-cli"));
      const ok = await postTestConnection(okApp);
      expect(ok.statusCode).toBe(200);
      payloads.push(ok.payload);

      for (const variant of [...FAILURE_VARIANTS, ENV_DUMP_VARIANT]) {
        const variantApp = variant.appFor(dbWithProvider("claude-cli"));
        applyVariant(variant);

        const res = await postTestConnection(variantApp);
        expect(res.statusCode).toBe(502);
        expect(res.json().error).toBe(variant.error);
        payloads.push(res.payload);
      }
    });

    // Positive control: the child genuinely received the token, so its absence
    // below is redaction doing work rather than the engine withholding the env.
    const records = stub.readRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(sentinel);
    }
    // Positive control on the log scan itself: server output really was
    // captured. And the env-dumping child's stderr DID reach a response body,
    // carrying the redaction marker where the token stood — which is what makes
    // the sentinel's absence evidence rather than silence.
    expect(logs).toContain("/api/settings/test-connection");
    expect(payloads[payloads.length - 1]).toContain("[redacted]");

    for (const payload of payloads) expect(payload).not.toContain(sentinel);
    expect(logs).not.toContain(sentinel);
  });
});
