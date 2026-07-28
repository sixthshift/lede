// ClaudeCliEngine's spawn contract, boundary parsing, and scratch-dir
// lifecycle, driven entirely by the fake `claude` in test/helpers/claude-stub.
// Every test prepends the stub to PATH (this container ships a REAL claude, so
// nothing here may ever fall through to a subscription call) and the one
// binary-missing case REPLACES PATH with a claude-free dir.

import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { LetterDecisionZ, TailorDecisionZ } from "@shared/schema";
import type { Layout, LetterDecision, TailorDecision } from "@shared/types";
import { SEED_ENTRIES } from "../src/server/seed";
import {
  ClaudeCliEngine,
  ClaudeCliError,
  DISALLOWED_TOOLS,
  buildJsonOutputSuffix,
} from "../src/server/tailor/claude-cli";
import { buildUserPrompt, tailor } from "../src/server/tailor/engine";
import { buildLetterUserPrompt } from "../src/server/tailor/letter-prompt";
import {
  type ClaudeStub,
  type StubRecord,
  installClaudeStub,
  pathWithStub,
  pathWithoutClaude,
} from "./helpers/claude-stub";

const JD = "Senior platform engineer; owns the SDK and the developer experience.";

const CANNED_DECISION: TailorDecision = {
  signals: {
    roleLevel: "Senior",
    weights: ["platform/SDK productization"],
    hardRequirements: ["TypeScript"],
  },
  summary: "Platform engineer who productizes internal tooling.",
  items: [
    {
      entryId: "cloudcase-frontend-rewrite",
      text: "Replaced legacy jQuery with a three-layer React/TypeScript architecture.",
      rank: 1,
      leadRationale: "leads with platform/SDK productization — the JD's top weighted requirement",
    },
  ],
  cut: [{ entryId: "cloudcase-rules-engine", reason: "less relevant to the SDK ask" }],
};

const CANNED_LETTER: LetterDecision = {
  greeting: "Dear hiring team,",
  body: [
    {
      text: "I built the component library, platform SDK, and React app your role owns.",
      groundedOn: ["cloudcase-frontend-rewrite"],
    },
  ],
  closing: "Thanks for your time,",
};

const LAYOUT: Layout = [{ section: "experience", enabled: true }];

// Restored wholesale in afterEach — including the OAuth variable, which this
// container may genuinely have set: a test that overwrites it with a sentinel
// must hand the real one back.
const SAVED_ENV_KEYS = [
  "PATH",
  "LEDE_STUB_RECORD",
  "LEDE_STUB_MODE",
  "LEDE_STUB_PAYLOAD",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "LEDE_TEST_ENV_WITNESS",
] as const;

let stub: ClaudeStub;
let payloadPath: string;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of SAVED_ENV_KEYS) savedEnv[key] = process.env[key];

  stub = installClaudeStub();
  payloadPath = path.join(stub.dir, "payload.json");

  process.env.PATH = pathWithStub(stub.dir);
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
});

function setPayload(value: unknown): void {
  writeFileSync(payloadPath, JSON.stringify(value), "utf-8");
}

function flag(record: StubRecord, name: string): string | undefined {
  const i = record.argv.indexOf(name);
  return i >= 0 ? record.argv[i + 1] : undefined;
}

function record0(): StubRecord {
  return stub.readRecords()[0];
}

function engine(model = "sonnet", timeoutMs?: number): ClaudeCliEngine {
  return new ClaudeCliEngine(timeoutMs === undefined ? { model } : { model, timeoutMs });
}

async function captureError(run: () => Promise<unknown>): Promise<ClaudeCliError> {
  try {
    await run();
  } catch (err) {
    expect(err).toBeInstanceOf(ClaudeCliError);
    return err as ClaudeCliError;
  }
  throw new Error("expected the call to reject");
}

describe("ClaudeCliEngine — full parity across both judgment calls", () => {
  it("decide() returns the stub's canned decision verbatim", async () => {
    setPayload(CANNED_DECISION);
    await expect(engine().decide(JD, SEED_ENTRIES)).resolves.toEqual(CANNED_DECISION);
  });

  it("decideLetter() returns the stub's canned letter decision verbatim", async () => {
    setPayload(CANNED_LETTER);
    await expect(engine().decideLetter(JD, SEED_ENTRIES)).resolves.toEqual(CANNED_LETTER);
  });
});

describe("ClaudeCliEngine — the spawn contract the recording proves", () => {
  it("passes -p, JSON output, an in-cwd system prompt file, and the frozen deny list", async () => {
    setPayload(CANNED_DECISION);
    await engine().decide(JD, SEED_ENTRIES);

    const [record] = stub.readRecords();
    expect(record.argv).toContain("-p");
    expect(flag(record, "--output-format")).toBe("json");
    expect(flag(record, "--disallowed-tools")).toBe(DISALLOWED_TOOLS);
    expect(DISALLOWED_TOOLS).toBe("Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Task");

    const systemPath = flag(record, "--system-prompt-file");
    expect(systemPath).toBeDefined();
    expect(path.dirname(systemPath as string)).toBe(record.cwd);
  });

  it("sends the user prompt on stdin and never as an argv element", async () => {
    setPayload(CANNED_DECISION);
    await engine().decide(JD, SEED_ENTRIES, "prefer platform work");

    const [record] = stub.readRecords();
    expect(record.stdin).toBe(buildUserPrompt(JD, "prefer platform work"));
    for (const arg of record.argv) expect(arg).not.toContain(JD);
  });

  it("sends the letter user prompt on stdin too", async () => {
    setPayload(CANNED_LETTER);
    await engine().decideLetter(JD, SEED_ENTRIES, "I want to own the SDK");

    const [record] = stub.readRecords();
    expect(record.stdin).toBe(buildLetterUserPrompt(JD, "I want to own the SDK"));
  });

  it("runs in a scratch cwd holding nothing but system.md", async () => {
    setPayload(CANNED_DECISION);
    await engine().decide(JD, SEED_ENTRIES);

    const [record] = stub.readRecords();
    expect(record.cwdEntries).toEqual(["system.md"]);
  });

  it("passes the configured model through — sonnet, then opus", async () => {
    setPayload(CANNED_DECISION);
    await engine("sonnet").decide(JD, SEED_ENTRIES);
    await engine("opus").decide(JD, SEED_ENTRIES);

    const models = stub.readRecords().map((r) => flag(r, "--model"));
    expect(models).toEqual(["sonnet", "opus"]);
  });

  it("inherits the whole server env, not a scrubbed subset", async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "sentinel-oauth-value";
    process.env.LEDE_TEST_ENV_WITNESS = "sentinel-witness-value";
    setPayload(CANNED_DECISION);
    await engine().decide(JD, SEED_ENTRIES);

    const [record] = stub.readRecords();
    expect(record.env.CLAUDE_CODE_OAUTH_TOKEN).toBe("sentinel-oauth-value");
    expect(record.env.LEDE_TEST_ENV_WITNESS).toBe("sentinel-witness-value");
  });
});

describe("ClaudeCliEngine — the scratch dir is per-call and always removed", () => {
  it("gives two sequential calls two different dirs, neither surviving the call", async () => {
    setPayload(CANNED_DECISION);
    await engine().decide(JD, SEED_ENTRIES);
    await engine().decide(JD, SEED_ENTRIES);

    const [first, second] = stub.readRecords();
    expect(first.cwd).not.toBe(second.cwd);
    expect(existsSync(first.cwd)).toBe(false);
    expect(existsSync(second.cwd)).toBe(false);
  });

  it("removes the dir on a failed call too", async () => {
    process.env.LEDE_STUB_MODE = "prose";
    await captureError(() => engine().decide(JD, SEED_ENTRIES));

    const [record] = stub.readRecords();
    expect(existsSync(record.cwd)).toBe(false);
  });
});

describe("ClaudeCliEngine — the system prompt file it writes", () => {
  it("carries the live TailorDecisionZ JSON Schema, so schema drift breaks this", async () => {
    setPayload(CANNED_DECISION);
    await engine().decide(JD, SEED_ENTRIES);

    const [record] = stub.readRecords();
    expect(record.systemPrompt).toContain(JSON.stringify(z.toJSONSchema(TailorDecisionZ), null, 2));
  });

  it("carries the live LetterDecisionZ JSON Schema for letters", async () => {
    setPayload(CANNED_LETTER);
    await engine().decideLetter(JD, SEED_ENTRIES);

    const [record] = stub.readRecords();
    expect(record.systemPrompt).toContain(JSON.stringify(z.toJSONSchema(LetterDecisionZ), null, 2));
  });

  it("is exactly the shared system text plus the CLI-only suffix", async () => {
    setPayload(CANNED_DECISION);
    await engine().decide(JD, SEED_ENTRIES);

    const suffix = buildJsonOutputSuffix(TailorDecisionZ);
    expect(suffix.startsWith("\n\n")).toBe(true);
    expect(record0().systemPrompt?.endsWith(suffix)).toBe(true);
  });
});

describe("ClaudeCliEngine — boundary parsing", () => {
  it("accepts a result wrapped in a ```json fence", async () => {
    process.env.LEDE_STUB_MODE = "ok-fenced";
    setPayload(CANNED_DECISION);
    await expect(engine().decide(JD, SEED_ENTRIES)).resolves.toEqual(CANNED_DECISION);
  });

  it("rejects prose as bad_output", async () => {
    process.env.LEDE_STUB_MODE = "prose";
    const err = await captureError(() => engine().decide(JD, SEED_ENTRIES));
    expect(err.code).toBe("bad_output");
  });

  it("rejects a well-formed result that fails the schema as bad_output", async () => {
    process.env.LEDE_STUB_MODE = "schema-invalid";
    const err = await captureError(() => engine().decide(JD, SEED_ENTRIES));
    expect(err.code).toBe("bad_output");
  });

  it("treats a wrapper reporting is_error as an exit-class failure", async () => {
    process.env.LEDE_STUB_MODE = "is-error";
    const err = await captureError(() => engine().decide(JD, SEED_ENTRIES));
    expect(err.code).toBe("exit");
  });

  it("treats a non-zero exit as exit-class", async () => {
    process.env.LEDE_STUB_MODE = "exit1";
    const err = await captureError(() => engine().decide(JD, SEED_ENTRIES));
    expect(err.code).toBe("exit");
  });

  it("never lets the child's stderr — which can hold the whole env — reach the error", async () => {
    process.env.LEDE_STUB_MODE = "echo-env-stderr-exit1";
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "sentinel-oauth-value";

    const err = await captureError(() => engine().decide(JD, SEED_ENTRIES));
    expect(err.code).toBe("exit");
    expect(err.message).not.toContain("sentinel-oauth-value");
    expect(err.detail ?? "").not.toContain("sentinel-oauth-value");
  });

  it("reports a missing binary distinctly from a failing one", async () => {
    process.env.PATH = pathWithoutClaude();
    const err = await captureError(() => engine().decide(JD, SEED_ENTRIES));
    expect(err.code).toBe("binary_missing");
  });

  it("kills a child that never answers and reports timeout", async () => {
    process.env.LEDE_STUB_MODE = "hang";
    const err = await captureError(() => engine(undefined, 400).decide(JD, SEED_ENTRIES));
    expect(err.code).toBe("timeout");
  });

  it("performs exactly one attempt per call — no internal retry", async () => {
    process.env.LEDE_STUB_MODE = "is-error-once";
    setPayload(CANNED_DECISION);

    await captureError(() => engine().decide(JD, SEED_ENTRIES));
    expect(stub.readRecords()).toHaveLength(1);

    await expect(engine().decide(JD, SEED_ENTRIES)).resolves.toEqual(CANNED_DECISION);
    expect(stub.readRecords()).toHaveLength(2);
  });
});

describe("claude stub — library-derived answers survive the real validators", () => {
  it("produces a decision the whole tailor() pipeline accepts", async () => {
    process.env.LEDE_STUB_MODE = "library-derived";
    const resume = await tailor(engine(), JD, SEED_ENTRIES, LAYOUT);

    const items = resume.sections.flatMap((s) => s.groups.flatMap((g) => g.items));
    expect(items).toHaveLength(SEED_ENTRIES.length);
    expect(resume.summary).not.toMatch(/\d/);
  });
});
