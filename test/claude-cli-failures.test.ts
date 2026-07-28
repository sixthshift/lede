// ClaudeCliEngine's failure half: the four-code taxonomy, the class-scoped
// single retry, the enforced timeout kill, and the token hygiene of any message
// that carries a child's own words.
//
// Every test prepends the fake `claude` from test/helpers/claude-stub to PATH —
// this container ships a REAL claude, so a test that merely hoped otherwise
// would spend a subscription call — and the binary-missing case REPLACES PATH
// with a claude-free dir rather than assuming absence.
//
// Attempt counts come from the stub's recording (one JSON line per invocation),
// which the stub writes BEFORE it acts, so even the mode that never answers is
// counted.

import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LetterDecision, TailorDecision } from "@shared/types";
import { SEED_ENTRIES } from "../src/server/seed";
import { ClaudeCliEngine, ClaudeCliError, isRetryableCode } from "../src/server/tailor/claude-cli";
import {
  type ClaudeStub,
  installClaudeStub,
  pathWithStub,
  pathWithoutClaude,
} from "./helpers/claude-stub";

const JD = "Senior platform engineer; owns the SDK and the developer experience.";

// Short enough that the `hang` stub costs a rounding error against the 30s file
// timeout, long enough that a real spawn + stdin write always beats it.
const TIMEOUT_MS = 400;

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
  cut: [],
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

// Restored wholesale in afterEach — including the OAuth variable, which this
// container may genuinely have set: a test that overwrites it with a sentinel
// must hand the real one back.
const SAVED_ENV_KEYS = [
  "PATH",
  "LEDE_STUB_RECORD",
  "LEDE_STUB_MODE",
  "LEDE_STUB_PAYLOAD",
  "CLAUDE_CODE_OAUTH_TOKEN",
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
  vi.restoreAllMocks();
});

function setPayload(value: unknown): void {
  writeFileSync(payloadPath, JSON.stringify(value), "utf-8");
}

function engine(timeoutMs?: number): ClaudeCliEngine {
  return new ClaudeCliEngine(
    timeoutMs === undefined ? { model: "sonnet" } : { model: "sonnet", timeoutMs },
  );
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

function messageAndDetail(err: ClaudeCliError): string {
  return `${err.message}\n${err.detail ?? ""}`;
}

describe("ClaudeCliEngine — four distinct codes, each from its own stub variant", () => {
  it("maps a claude-free PATH to binary_missing", async () => {
    process.env.PATH = pathWithoutClaude();
    const err = await captureError(() => engine().decide(JD, SEED_ENTRIES));
    expect(err.code).toBe("binary_missing");
  });

  it("maps a non-zero exit to exit, carrying the child's stderr tail", async () => {
    process.env.LEDE_STUB_MODE = "exit1";
    const err = await captureError(() => engine().decide(JD, SEED_ENTRIES));

    expect(err.code).toBe("exit");
    expect(err.detail).toBe("stub: simulated non-zero exit");
    expect(err.message).toContain("stub: simulated non-zero exit");
  });

  it("maps a wrapper reporting is_error to exit, carrying the result tail", async () => {
    process.env.LEDE_STUB_MODE = "is-error";
    const err = await captureError(() => engine().decide(JD, SEED_ENTRIES));

    expect(err.code).toBe("exit");
    expect(err.detail).toBe("the stub was told to report a failed result");
  });

  it("maps timeout expiry to timeout", async () => {
    process.env.LEDE_STUB_MODE = "hang";
    const err = await captureError(() => engine(TIMEOUT_MS).decide(JD, SEED_ENTRIES));

    expect(err.code).toBe("timeout");
    expect(err.message).toContain(`${TIMEOUT_MS}ms`);
  });

  it("maps prose to bad_output", async () => {
    process.env.LEDE_STUB_MODE = "prose";
    const err = await captureError(() => engine().decide(JD, SEED_ENTRIES));
    expect(err.code).toBe("bad_output");
  });

  it("maps a schema-invalid answer to bad_output", async () => {
    process.env.LEDE_STUB_MODE = "schema-invalid";
    const err = await captureError(() => engine().decide(JD, SEED_ENTRIES));
    expect(err.code).toBe("bad_output");
  });
});

describe("ClaudeCliEngine — the retry class is a pure function of the code", () => {
  it("retries exit and bad_output, never binary_missing or timeout", () => {
    expect(isRetryableCode("exit")).toBe(true);
    expect(isRetryableCode("bad_output")).toBe(true);
    expect(isRetryableCode("binary_missing")).toBe(false);
    expect(isRetryableCode("timeout")).toBe(false);
  });
});

describe("ClaudeCliEngine — a retryable class gets exactly one fresh-spawn retry", () => {
  it("returns the decision after the second attempt when the first result is is_error", async () => {
    process.env.LEDE_STUB_MODE = "is-error-once";
    setPayload(CANNED_DECISION);

    await expect(engine().decide(JD, SEED_ENTRIES)).resolves.toEqual(CANNED_DECISION);

    const records = stub.readRecords();
    expect(records).toHaveLength(2);
    // Fresh spawn, not a re-read: two distinct scratch dirs, both already gone.
    expect(records[0].cwd).not.toBe(records[1].cwd);
    expect(existsSync(records[0].cwd)).toBe(false);
    expect(existsSync(records[1].cwd)).toBe(false);
  });

  it("retries the letter call on the same terms", async () => {
    process.env.LEDE_STUB_MODE = "is-error-once";
    setPayload(CANNED_LETTER);

    await expect(engine().decideLetter(JD, SEED_ENTRIES)).resolves.toEqual(CANNED_LETTER);
    expect(stub.readRecords()).toHaveLength(2);
  });

  it("propagates bad_output after exactly two attempts when both answers are unusable", async () => {
    process.env.LEDE_STUB_MODE = "schema-invalid";
    const err = await captureError(() => engine().decide(JD, SEED_ENTRIES));

    expect(err.code).toBe("bad_output");
    expect(stub.readRecords()).toHaveLength(2);
  });

  it("propagates exit after exactly two attempts, never a third", async () => {
    process.env.LEDE_STUB_MODE = "exit1";
    const err = await captureError(() => engine().decide(JD, SEED_ENTRIES));

    expect(err.code).toBe("exit");
    expect(stub.readRecords()).toHaveLength(2);
  });
});

describe("ClaudeCliEngine — a non-retryable class is attempted once", () => {
  it("spawns the hanging child exactly once", async () => {
    process.env.LEDE_STUB_MODE = "hang";
    const err = await captureError(() => engine(TIMEOUT_MS).decide(JD, SEED_ENTRIES));

    expect(err.code).toBe("timeout");
    expect(stub.readRecords()).toHaveLength(1);
  });

  it("records nothing at all for a missing binary", async () => {
    // LIMIT, stated rather than implied: a binary that does not exist records
    // nothing, so attempt count is NOT observable on this path. What is proved
    // here is that no invocation happened and that the exported policy excludes
    // the class — the retry-count claim rests on the predicate, not on evidence
    // from this run.
    process.env.PATH = pathWithoutClaude();
    const err = await captureError(() => engine().decide(JD, SEED_ENTRIES));

    expect(err.code).toBe("binary_missing");
    expect(stub.readRecords()).toHaveLength(0);
    expect(isRetryableCode(err.code)).toBe(false);
  });
});

describe("ClaudeCliEngine — the timeout kill is enforced, not merely requested", () => {
  it("has genuinely reaped the child by the time the rejection surfaces", async () => {
    process.env.LEDE_STUB_MODE = "hang";
    const err = await captureError(() => engine(TIMEOUT_MS).decide(JD, SEED_ENTRIES));
    expect(err.code).toBe("timeout");

    // The stub records its own pid before hanging, so the process we signalled
    // is identifiable from outside the engine. Signal 0 probes liveness only.
    const [record] = stub.readRecords();
    let probe: NodeJS.ErrnoException | undefined;
    try {
      process.kill(record.pid, 0);
    } catch (e) {
      probe = e as NodeJS.ErrnoException;
    }
    expect(probe?.code).toBe("ESRCH");
  });

  it("removes the scratch dir on the timeout path too", async () => {
    process.env.LEDE_STUB_MODE = "hang";
    await captureError(() => engine(TIMEOUT_MS).decide(JD, SEED_ENTRIES));

    const [record] = stub.readRecords();
    expect(existsSync(record.cwd)).toBe(false);
  });

  it("leaves no scratch dir behind on any failure variant", async () => {
    for (const mode of ["exit1", "is-error", "prose", "schema-invalid", "hang"]) {
      process.env.LEDE_STUB_MODE = mode;
      await captureError(() => engine(TIMEOUT_MS).decide(JD, SEED_ENTRIES));
    }

    const records = stub.readRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) expect(existsSync(record.cwd)).toBe(false);
  });
});

describe("ClaudeCliEngine — the OAuth token never reaches a message or a log", () => {
  it("redacts the token out of a child that echoes its whole env to stderr", async () => {
    const sentinel = "sentinel-oauth-value-not-a-real-token";
    // Deleted then re-set so it lands last in the child's environ, which puts it
    // inside the surfaced stderr tail. Without that, an absent sentinel would
    // prove nothing but the truncation window.
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = sentinel;
    process.env.LEDE_STUB_MODE = "echo-env-stderr-exit1";

    const logs: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      });
    }

    const err = await captureError(() => engine().decide(JD, SEED_ENTRIES));

    // The child really did receive the token — so its absence below is redaction
    // doing work, not the engine withholding the env.
    const [record] = stub.readRecords();
    expect(record.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(sentinel);

    expect(err.code).toBe("exit");
    expect(messageAndDetail(err)).not.toContain(sentinel);
    expect(err.detail).toContain("[redacted]");
    expect(logs.join("\n")).not.toContain(sentinel);
  });
});
