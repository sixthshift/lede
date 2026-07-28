// Byte-level parity between ClaudeCliEngine and ProviderEngine at the point
// where each hands the model its two strings — plus the proof that the CLI's
// JSON-output suffix lives ONLY in the CLI engine.
//
// The EXPECTED values are CAPTURED, never recomputed. Every expectation here
// comes out of `generateObjectMock.mock.calls[0][0]` after a real
// ProviderEngine run: the AI-SDK call boundary is the reference implementation.
// Re-deriving the expectation by calling SYSTEM_PROMPT/renderLibrary/
// buildUserPrompt in the assertion would prove only that the assertion can
// spell the composition — it would pass even if BOTH engines drifted together,
// which is precisely the failure this file exists to catch.
//
// R16 ("the shared prompt/schema/assembly/validation/fixture/eval surface is
// unmodified") is proved in two halves. This file owns one: the parity
// assertions below go red the instant the CLI path stops using the shared
// composition verbatim, and the isolation assertions pin the CLI suffix out of
// both shared system prompts. The other half is the campaign fast check
// `bunx vitest run`, whose pre-existing suites — test/prompt.test.ts,
// test/letter-engine.test.ts, test/schema.test.ts, test/assemble.test.ts,
// test/validate.test.ts — pin those modules' own behaviour, plus the campaign
// gate. Those files are deliberately neither weakened nor duplicated here.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { LetterDecisionZ, TailorDecisionZ } from "@shared/schema";
import type { LetterDecision, TailorDecision } from "@shared/types";
import { SEED_ENTRIES } from "../src/server/seed";
import { ClaudeCliEngine, buildJsonOutputSuffix } from "../src/server/tailor/claude-cli";

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
// File-scoped, and harmless: claude-cli.ts never imports `ai`, so the CLI side
// of every comparison below runs against the real engine code.
vi.mock("ai", () => ({ generateObject: generateObjectMock }));

import { ProviderEngine } from "../src/server/tailor/engine";
import { LETTER_SYSTEM_PROMPT } from "../src/server/tailor/letter-prompt";
import { SYSTEM_PROMPT } from "../src/server/tailor/prompt";
import { type ClaudeStub, installClaudeStub, pathWithStub } from "./helpers/claude-stub";

const JD = "Senior platform engineer; owns the SDK and the developer experience.";
const CONTEXT = "lead with the platform work, not the rules engine";
const BUDGET = "about 6 items across 2 sections";
const VOICE = "crisp, direct, first-person";
const MOTIVATION = "I want to own a platform surface end to end";

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

// The stub is MANDATORY, not hygiene: this container ships a real `claude`, so
// PATH is prepended on every test and restored afterwards.
const SAVED_ENV_KEYS = ["PATH", "LEDE_STUB_RECORD", "LEDE_STUB_MODE", "LEDE_STUB_PAYLOAD"] as const;

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

  generateObjectMock.mockReset();
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  stub.cleanup();
});

type SdkCall = { system: string; prompt: string; schema: unknown };

// The capture. Whatever ProviderEngine put on the wire IS the expectation.
async function captureSdkCall(
  object: unknown,
  run: (engine: ProviderEngine) => Promise<unknown>,
): Promise<SdkCall> {
  const before = generateObjectMock.mock.calls.length;
  generateObjectMock.mockResolvedValue({ object });
  await run(new ProviderEngine({ provider: "google", model: "gemini-2.5-flash", apiKey: "k" }));
  const args = generateObjectMock.mock.calls[before]?.[0];
  expect(args).toBeDefined();
  return {
    system: args.system as string,
    prompt: args.prompt as string,
    schema: args.schema,
  };
}

type CliCall = { systemPrompt: string; stdin: string };

// The CLI side, observed the only way it can be: the stub reads the
// `--system-prompt-file` back before the engine's `finally` removes the
// scratch dir, and records it alongside stdin.
async function captureCliCall(
  payload: unknown,
  run: (engine: ClaudeCliEngine) => Promise<unknown>,
): Promise<CliCall> {
  writeFileSync(payloadPath, JSON.stringify(payload), "utf-8");
  const before = stub.readRecords().length;
  await run(new ClaudeCliEngine({ model: "sonnet" }));
  const record = stub.readRecords()[before];
  expect(record).toBeDefined();
  expect(record.systemPrompt).not.toBeNull();
  return { systemPrompt: record.systemPrompt as string, stdin: record.stdin };
}

// system.md === <captured system, byte for byte> + <CLI suffix, byte for byte>.
// Asserted by split rather than by equality against a rebuilt string so a
// failure names WHICH half drifted.
function expectSystemFileIsCapturedPlusSuffix(
  cli: CliCall,
  captured: SdkCall,
  schema: z.ZodType,
): void {
  expect(cli.systemPrompt.startsWith(captured.system)).toBe(true);
  expect(cli.systemPrompt.slice(0, captured.system.length)).toBe(captured.system);
  expect(cli.systemPrompt.slice(captured.system.length)).toBe(buildJsonOutputSuffix(schema));
}

describe("ClaudeCliEngine — resume prompt parity with the captured generateObject call", () => {
  it("no-context baseline: system.md is the captured system plus the suffix, stdin is the captured prompt", async () => {
    const captured = await captureSdkCall(CANNED_DECISION, (e) => e.decide(JD, SEED_ENTRIES));
    const cli = await captureCliCall(CANNED_DECISION, (e) => e.decide(JD, SEED_ENTRIES));

    expect(captured.schema).toBe(TailorDecisionZ);
    expectSystemFileIsCapturedPlusSuffix(cli, captured, TailorDecisionZ);
    expect(cli.stdin).toBe(captured.prompt);
  });

  it("context + budget + voice: same parity, all three threaded through identically", async () => {
    const captured = await captureSdkCall(CANNED_DECISION, (e) =>
      e.decide(JD, SEED_ENTRIES, CONTEXT, BUDGET, VOICE),
    );
    const cli = await captureCliCall(CANNED_DECISION, (e) =>
      e.decide(JD, SEED_ENTRIES, CONTEXT, BUDGET, VOICE),
    );

    expectSystemFileIsCapturedPlusSuffix(cli, captured, TailorDecisionZ);
    expect(cli.stdin).toBe(captured.prompt);
    // Guards against a captured/CLI pair that agree only because both dropped
    // the optional blocks.
    expect(cli.stdin).toContain(CONTEXT);
    expect(cli.stdin).toContain(BUDGET);
    expect(cli.stdin).toContain(VOICE);
  });
});

describe("ClaudeCliEngine — letter prompt parity with the captured generateObject call", () => {
  it("no-context baseline: system.md is the captured letter system plus the suffix, stdin is the captured prompt", async () => {
    const captured = await captureSdkCall(CANNED_LETTER, (e) => e.decideLetter(JD, SEED_ENTRIES));
    const cli = await captureCliCall(CANNED_LETTER, (e) => e.decideLetter(JD, SEED_ENTRIES));

    expect(captured.schema).toBe(LetterDecisionZ);
    expectSystemFileIsCapturedPlusSuffix(cli, captured, LetterDecisionZ);
    expect(cli.stdin).toBe(captured.prompt);
  });

  it("motivation + context + voice: same parity, all three threaded through identically", async () => {
    const captured = await captureSdkCall(CANNED_LETTER, (e) =>
      e.decideLetter(JD, SEED_ENTRIES, MOTIVATION, CONTEXT, VOICE),
    );
    const cli = await captureCliCall(CANNED_LETTER, (e) =>
      e.decideLetter(JD, SEED_ENTRIES, MOTIVATION, CONTEXT, VOICE),
    );

    expectSystemFileIsCapturedPlusSuffix(cli, captured, LetterDecisionZ);
    expect(cli.stdin).toBe(captured.prompt);
    expect(cli.stdin).toContain(MOTIVATION);
    expect(cli.stdin).toContain(CONTEXT);
    expect(cli.stdin).toContain(VOICE);
  });
});

describe("ClaudeCliEngine — the optional blocks move both sides by the same bytes", () => {
  it("resume: the delta context+budget+voice adds is identical on the captured and CLI sides", async () => {
    const capturedBase = await captureSdkCall(CANNED_DECISION, (e) => e.decide(JD, SEED_ENTRIES));
    const cliBase = await captureCliCall(CANNED_DECISION, (e) => e.decide(JD, SEED_ENTRIES));
    const capturedRich = await captureSdkCall(CANNED_DECISION, (e) =>
      e.decide(JD, SEED_ENTRIES, CONTEXT, BUDGET, VOICE),
    );
    const cliRich = await captureCliCall(CANNED_DECISION, (e) =>
      e.decide(JD, SEED_ENTRIES, CONTEXT, BUDGET, VOICE),
    );

    // Contrast: the blocks really do change something.
    expect(capturedRich.prompt).not.toBe(capturedBase.prompt);
    // And they extend the baseline rather than rewriting it, on both sides, by
    // the same bytes.
    expect(capturedRich.prompt.startsWith(capturedBase.prompt)).toBe(true);
    expect(cliRich.stdin.startsWith(cliBase.stdin)).toBe(true);
    expect(cliRich.stdin.slice(cliBase.stdin.length)).toBe(
      capturedRich.prompt.slice(capturedBase.prompt.length),
    );

    // Omitting them leaves the system text byte-identical before the suffix —
    // the library is the only thing in there.
    const suffix = buildJsonOutputSuffix(TailorDecisionZ);
    expect(cliBase.systemPrompt.slice(0, -suffix.length)).toBe(
      cliRich.systemPrompt.slice(0, -suffix.length),
    );
    expect(capturedBase.system).toBe(capturedRich.system);
  });

  it("letter: the delta motivation+context+voice adds is identical on the captured and CLI sides", async () => {
    const capturedBase = await captureSdkCall(CANNED_LETTER, (e) =>
      e.decideLetter(JD, SEED_ENTRIES),
    );
    const cliBase = await captureCliCall(CANNED_LETTER, (e) => e.decideLetter(JD, SEED_ENTRIES));
    const capturedRich = await captureSdkCall(CANNED_LETTER, (e) =>
      e.decideLetter(JD, SEED_ENTRIES, MOTIVATION, CONTEXT, VOICE),
    );
    const cliRich = await captureCliCall(CANNED_LETTER, (e) =>
      e.decideLetter(JD, SEED_ENTRIES, MOTIVATION, CONTEXT, VOICE),
    );

    expect(capturedRich.prompt).not.toBe(capturedBase.prompt);
    expect(capturedRich.prompt.startsWith(capturedBase.prompt)).toBe(true);
    expect(cliRich.stdin.startsWith(cliBase.stdin)).toBe(true);
    expect(cliRich.stdin.slice(cliBase.stdin.length)).toBe(
      capturedRich.prompt.slice(capturedBase.prompt.length),
    );

    const suffix = buildJsonOutputSuffix(LetterDecisionZ);
    expect(cliBase.systemPrompt.slice(0, -suffix.length)).toBe(
      cliRich.systemPrompt.slice(0, -suffix.length),
    );
    expect(capturedBase.system).toBe(capturedRich.system);
  });
});

describe("the CLI JSON-output suffix exists only in the CLI engine", () => {
  const INSTRUCTION = "Output ONLY a JSON object valid against the JSON Schema below.";
  const suffixes = [
    { label: "TailorDecisionZ", text: buildJsonOutputSuffix(TailorDecisionZ) },
    { label: "LetterDecisionZ", text: buildJsonOutputSuffix(LetterDecisionZ) },
  ];

  it("the CLI engine's own constant carries the instruction and the embedded JSON Schema", () => {
    for (const { text } of suffixes) {
      expect(text.startsWith("\n\n")).toBe(true);
      expect(text).toContain(INSTRUCTION);
      expect(text).toContain('"$schema"');
    }
    expect(suffixes[0].text).toContain(JSON.stringify(z.toJSONSchema(TailorDecisionZ), null, 2));
    expect(suffixes[1].text).toContain(JSON.stringify(z.toJSONSchema(LetterDecisionZ), null, 2));
  });

  it("neither shared system prompt carries the instruction or any embedded JSON Schema", () => {
    for (const shared of [SYSTEM_PROMPT, LETTER_SYSTEM_PROMPT]) {
      expect(shared).not.toContain(INSTRUCTION);
      expect(shared).not.toContain("## Output format");
      expect(shared).not.toContain('"$schema"');
      expect(shared).not.toContain('"additionalProperties"');
      for (const { text } of suffixes) expect(shared).not.toContain(text);
      expect(shared).not.toContain(JSON.stringify(z.toJSONSchema(TailorDecisionZ), null, 2));
      expect(shared).not.toContain(JSON.stringify(z.toJSONSchema(LetterDecisionZ), null, 2));
    }
  });

  it("the suffix reaches the model only through the CLI path, never the AI-SDK path", async () => {
    const captured = await captureSdkCall(CANNED_DECISION, (e) => e.decide(JD, SEED_ENTRIES));
    expect(captured.system).not.toContain(INSTRUCTION);
    expect(captured.prompt).not.toContain(INSTRUCTION);

    const cli = await captureCliCall(CANNED_DECISION, (e) => e.decide(JD, SEED_ENTRIES));
    expect(cli.systemPrompt).toContain(INSTRUCTION);
    expect(cli.stdin).not.toContain(INSTRUCTION);
  });
});
