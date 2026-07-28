// ClaudeCliEngine — a third TailorEngine that reaches the model through the
// local `claude` binary instead of a BYOK HTTP provider. Sibling to
// ProviderEngine/FixtureEngine (engine.ts owns the interface); it lives in its
// own file because the spawn/temp-dir/boundary-parse plumbing is a different
// concern from the AI-SDK call, not because it is a different kind of engine.
//
// The CLI is driven as a ONE-SHOT, NON-AGENTIC judgment call: `-p` with
// `--output-format json`, every tool disallowed, and a scratch cwd holding
// nothing but the system prompt. It is a model call that happens to be a
// subprocess — never a coding agent.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

import { LetterDecisionZ, TailorDecisionZ } from "@shared/schema";
import type { Entry, LetterDecision, TailorDecision } from "@shared/types";
import { buildUserPrompt, type TailorEngine } from "./engine";
import { LETTER_SYSTEM_PROMPT, buildLetterUserPrompt } from "./letter-prompt";
import { SYSTEM_PROMPT, renderLibrary } from "./prompt";

// Every tool the CLI could otherwise reach, denied in one argv value. Frozen
// and comma-joined here rather than assembled at the call site: the deny list
// is the safety contract, so it is one literal a test can compare against
// byte-for-byte, not something a caller can widen.
export const DISALLOWED_TOOLS = "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Task";

const DEFAULT_TIMEOUT_MS = 120_000;

// How much of a failing child's own words an error carries, and how much of the
// stream is retained to produce it. The window is wider than the tail so
// `failureTail` can still distinguish a truncated stream from a short message.
const FAILURE_TAIL_CHARS = 500;
const STDERR_WINDOW_CHARS = 4_000;

// The CLI's output contract, appended to the SHARED system text — the AI SDK
// path gets structured output from `generateObject`, the CLI path has to ask
// for it in prose. Leading "\n\n" so the written file is exactly
// `<shared system> + <suffix>`: the shared prompts stay byte-identical across
// both engines and the split stays assertable.
export function buildJsonOutputSuffix(schema: z.ZodType): string {
  return `\n\n## Output format

Output ONLY a JSON object valid against the JSON Schema below. No preamble, no
explanation, no commentary after it. Do not wrap it in anything but an optional
\`\`\`json fence.

${JSON.stringify(z.toJSONSchema(schema), null, 2)}`;
}

// The full failure taxonomy is declared up front so callers can switch on it
// exhaustively from day one: `binary_missing` (no `claude` on PATH),
// `exit` (non-zero exit, or a wrapper that reports its own failure),
// `timeout` (we killed it), `bad_output` (it answered, unusably).
export type ClaudeCliErrorCode = "binary_missing" | "exit" | "timeout" | "bad_output";

// The retry class of a failure, as a pure function of its code — exported so
// callers and tests can read the policy without provoking it.
//
// `exit` and `bad_output` are the two classes a fresh spawn can plausibly
// change: a transient CLI/API failure, and a model that answered off-format
// once. `binary_missing` is deterministic (PATH will not change mid-call) and
// `timeout` has already spent the caller's whole budget — retrying either only
// buys latency.
export function isRetryableCode(code: ClaudeCliErrorCode): boolean {
  return code === "exit" || code === "bad_output";
}

export class ClaudeCliError extends Error {
  readonly code: ClaudeCliErrorCode;
  readonly detail?: string;

  constructor(code: ClaudeCliErrorCode, message: string, detail?: string) {
    super(detail ? `${message}: ${detail}` : message);
    this.name = "ClaudeCliError";
    this.code = code;
    this.detail = detail;
  }
}

export type ClaudeCliEngineConfig = {
  model: string;
  // Only knob on this engine, and only because the enforcing bound has to be
  // tunable to be testable at all — a real run always wants the default.
  timeoutMs?: number;
};

export class ClaudeCliEngine implements TailorEngine {
  constructor(private cfg: ClaudeCliEngineConfig) {}

  async decide(
    jd: string,
    entries: Entry[],
    context?: string | null,
    budget?: string | null,
    voice?: string | null,
  ): Promise<TailorDecision> {
    return this.judge(
      `${SYSTEM_PROMPT}\n\n${renderLibrary(entries)}${buildJsonOutputSuffix(TailorDecisionZ)}`,
      buildUserPrompt(jd, context, budget, voice),
      TailorDecisionZ,
    );
  }

  async decideLetter(
    jd: string,
    entries: Entry[],
    motivation?: string | null,
    context?: string | null,
    voice?: string | null,
  ): Promise<LetterDecision> {
    return this.judge(
      `${LETTER_SYSTEM_PROMPT}\n\n${renderLibrary(entries)}${buildJsonOutputSuffix(LetterDecisionZ)}`,
      buildLetterUserPrompt(jd, motivation, context, voice),
      LetterDecisionZ,
    );
  }

  // Both judgment calls share one retry policy: at most one extra attempt, and
  // only for a class a fresh spawn could change. No backoff — the retry absorbs
  // a one-off, it does not wait out an outage, and a request is holding the
  // connection open while it runs.
  private async judge<T>(systemText: string, prompt: string, schema: z.ZodType<T>): Promise<T> {
    try {
      return await this.attempt(systemText, prompt, schema);
    } catch (err) {
      if (!(err instanceof ClaudeCliError) || !isRetryableCode(err.code)) throw err;
      // Fresh child, fresh scratch dir — and the second failure is final, so it
      // propagates from here untouched.
      return await this.attempt(systemText, prompt, schema);
    }
  }

  // The retryable unit is spawn AND parse: a `bad_output` is only knowable once
  // the child's answer has been read, so a retry that re-spawned without
  // re-parsing would not cover the class it is for.
  private async attempt<T>(systemText: string, prompt: string, schema: z.ZodType<T>): Promise<T> {
    const scratchDir = mkdtempSync(path.join(os.tmpdir(), "lede-claude-cli-"));
    try {
      const systemPath = path.join(scratchDir, "system.md");
      writeFileSync(systemPath, systemText, "utf-8");
      return parseWrappedJson(await this.spawnClaude(scratchDir, systemPath, prompt), schema);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  }

  private spawnClaude(scratchDir: string, systemPath: string, prompt: string): Promise<string> {
    const timeoutMs = this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    return new Promise<string>((resolve, reject) => {
      const child = spawn(
        "claude",
        [
          "-p",
          "--output-format",
          "json",
          "--model",
          this.cfg.model,
          "--system-prompt-file",
          systemPath,
          "--disallowed-tools",
          DISALLOWED_TOOLS,
        ],
        // cwd is the scratch dir (nothing to read but the prompt we wrote) and
        // the env is the server's, inherited whole: an ambient
        // CLAUDE_CODE_OAUTH_TOKEN or ~/.claude login is how this engine
        // authenticates, so a scrubbed or allow-listed env would break the
        // only credential path it has.
        { cwd: scratchDir, env: process.env },
      );

      let stdout = "";
      let stderrTail = "";
      let killedByTimeout = false;
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      // This is the only layer that can enforce the bound — nothing above
      // cancels a subprocess — so the kill is unconditional (SIGKILL, not
      // SIGTERM: a wedged child must not get to decline). The rejection is
      // deferred to `exit`, which libuv emits only after reaping the child:
      // callers learn "timeout" once the process is genuinely gone, not once a
      // signal was posted to it.
      const timer = setTimeout(() => {
        killedByTimeout = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      const rejectTimeout = () =>
        settle(() =>
          reject(new ClaudeCliError("timeout", `claude did not answer within ${timeoutMs}ms`)),
        );

      child.stdout.setEncoding("utf-8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      // stderr is kept as a rolling window and only ever surfaced through
      // `failureTail`, which redacts: the CLI echoes its whole environment on
      // some failures and this engine's env carries the OAuth token. The window
      // is what keeps a runaway child from being held in memory whole.
      child.stderr.setEncoding("utf-8");
      child.stderr.on("data", (chunk: string) => {
        stderrTail = (stderrTail + chunk).slice(-STDERR_WINDOW_CHARS);
      });

      child.on("error", (err) => {
        settle(() => {
          const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
          reject(
            missing
              ? new ClaudeCliError("binary_missing", "no `claude` binary on PATH")
              : new ClaudeCliError("exit", "claude could not be spawned", err.message),
          );
        });
      });

      child.on("exit", () => {
        if (killedByTimeout) rejectTimeout();
      });

      child.on("close", (exitCode) => {
        if (killedByTimeout) {
          rejectTimeout();
          return;
        }
        settle(() => {
          if (exitCode !== 0) {
            reject(
              new ClaudeCliError(
                "exit",
                `claude exited with code ${exitCode}`,
                failureTail(stderrTail),
              ),
            );
            return;
          }
          resolve(stdout);
        });
      });

      child.stdin.end(prompt, "utf-8");
    });
  }
}

// ── boundary parse: stdout is a claim, not a decision ──

const wrapperZ = z.object({
  result: z.string(),
  is_error: z.boolean().optional(),
});

// stdout → CLI wrapper → the model's text → an optional fence → JSON → schema.
// Each hop is a distrusted boundary; a wrapper that reports its own failure is
// an `exit`-class outcome (the run failed) rather than `bad_output` (the run
// succeeded and said something unusable).
function parseWrappedJson<T>(stdout: string, schema: z.ZodType<T>): T {
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new ClaudeCliError("bad_output", "claude stdout was not JSON", snippet(stdout));
  }

  const wrapper = wrapperZ.safeParse(envelope);
  if (!wrapper.success) {
    throw new ClaudeCliError(
      "bad_output",
      "claude stdout was not a result wrapper",
      snippet(stdout),
    );
  }
  if (wrapper.data.is_error === true) {
    throw new ClaudeCliError(
      "exit",
      "claude reported an error result",
      failureTail(wrapper.data.result),
    );
  }

  const text = stripCodeFence(wrapper.data.result);
  let decision: unknown;
  try {
    decision = JSON.parse(text);
  } catch {
    throw new ClaudeCliError("bad_output", "claude result was not JSON", snippet(text));
  }

  const parsed = schema.safeParse(decision);
  if (!parsed.success) {
    throw new ClaudeCliError("bad_output", "claude result did not match the schema", snippet(text));
  }
  return parsed.data;
}

const FENCE_RE = /^\s*```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n?[ \t]*```\s*$/;

function stripCodeFence(text: string): string {
  const fenced = FENCE_RE.exec(text);
  return fenced ? fenced[1] : text;
}

// The head of an unusable answer — a malformed response is diagnosed from where
// it starts going wrong. Bounded so a runaway response can't become a runaway
// error message; redacted because the child's words are never trusted to be
// secret-free.
function snippet(text: string): string {
  const trimmed = redactSecrets(text).trim();
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}

// The tail of a failure — a CLI that dies says why in its last lines, not its
// first. Leading ellipsis marks a stream we truncated, so a short message is
// never mistaken for a complete one.
function failureTail(text: string): string {
  const trimmed = redactSecrets(text).trim();
  return trimmed.length > FAILURE_TAIL_CHARS ? `…${trimmed.slice(-FAILURE_TAIL_CHARS)}` : trimmed;
}

// The child inherits the whole server env, so anything it echoes can carry the
// OAuth token back to us. Redaction happens here — before an error message
// exists — rather than at a logging seam: there is no seam that could catch a
// thrown message, and a token that reaches the string has already escaped.
function redactSecrets(text: string): string {
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) return text;
  return text.split(token).join("[redacted]");
}
