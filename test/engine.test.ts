import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Layout, TailorDecision } from "@shared/types";
import { TailorDecisionZ } from "@shared/schema";
import { SEED_ENTRIES } from "../src/server/seed";
import { hashKey } from "../src/server/tailor/evalcore";
import { renderLibrary } from "../src/server/tailor/prompt";
import { FabricationError } from "../src/server/tailor/validate";

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", () => ({ generateObject: generateObjectMock }));

import {
  ProviderEngine,
  FixtureEngine,
  NoFixtureError,
  tailor,
  makeEngine,
  buildUserPrompt,
  type TailorEngine,
} from "../src/server/tailor/engine";

const LAYOUT: Layout = [{ section: "experience", enabled: true }];

function makeDecision(overrides: Partial<TailorDecision> = {}): TailorDecision {
  return {
    signals: { roleLevel: "senior", weights: ["platform"], hardRequirements: [] },
    summary: "Built platform tooling.",
    items: [
      {
        entryId: "cloudcase-platform-sdk",
        text: "built a platform SDK exposing the platform programmatically for the first time",
        rank: 1,
      },
    ],
    cut: [],
    ...overrides,
  };
}

class StubEngine implements TailorEngine {
  constructor(private decision: TailorDecision) {}
  async decide(): Promise<TailorDecision> {
    return this.decision;
  }
}

// ── VALIDATE-WIRED CONTRAST ──

describe("tailor() — validate is actually wired, not just assemble", () => {
  it("throws FabricationError when the stub decision injects a number not in any fact", async () => {
    const decision = makeDecision({
      items: [{ entryId: "cloudcase-platform-sdk", text: "grew adoption by 9999%", rank: 1 }],
    });
    const engine = new StubEngine(decision);
    await expect(tailor(engine, "jd", SEED_ENTRIES, LAYOUT)).rejects.toThrow(FabricationError);
  });

  it("returns a TailoredResume for a clean, fact-grounded decision", async () => {
    const decision = makeDecision();
    const engine = new StubEngine(decision);
    const resume = await tailor(engine, "jd", SEED_ENTRIES, LAYOUT);
    expect(resume.sections).toHaveLength(1);
    expect(resume.sections[0]!.groups.flatMap((g) => g.items).map((i) => i.entryId)).toContain(
      "cloudcase-platform-sdk",
    );
  });
});

// ── HASH KEYING ──

describe("FixtureEngine — hash keying, not filename/first-file fallback", () => {
  let dir: string;
  const jdA = "job description A — platform SDK work";
  const jdB = "job description B — legacy rules engine cleanup";
  const jdC = "job description C — completely unrecorded scenario";
  const decisionA = makeDecision({ summary: "Scenario A summary." });
  const decisionB = makeDecision({ summary: "Scenario B summary." });

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "lede-fixtures-"));
    writeFileSync(
      path.join(dir, "a.json"),
      JSON.stringify({ key: hashKey(jdA, SEED_ENTRIES), name: "scenario-a", decision: decisionA }),
    );
    writeFileSync(
      path.join(dir, "b.json"),
      JSON.stringify({ key: hashKey(jdB, SEED_ENTRIES), name: "scenario-b", decision: decisionB }),
    );
  });

  it("resolves each jd to its own recorded fixture by hash", async () => {
    const engine = new FixtureEngine(dir);
    await expect(engine.decide(jdA, SEED_ENTRIES)).resolves.toEqual(decisionA);
    await expect(engine.decide(jdB, SEED_ENTRIES)).resolves.toEqual(decisionB);
  });

  it("throws NoFixtureError (code 'no_fixture') for an unrecorded jd, even though fixtures exist", async () => {
    const engine = new FixtureEngine(dir);
    await expect(engine.decide(jdC, SEED_ENTRIES)).rejects.toBeInstanceOf(NoFixtureError);
    try {
      await engine.decide(jdC, SEED_ENTRIES);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(NoFixtureError);
      expect((err as NoFixtureError).code).toBe("no_fixture");
      expect((err as NoFixtureError).scenarios).toEqual(
        expect.arrayContaining(["scenario-a", "scenario-b"]),
      );
    }
  });
});

// ── CONCURRENT/PARTIAL FIXTURE FILES (T018) ──

describe("FixtureEngine — tolerates malformed/partial fixture files (shared-dir race)", () => {
  it("still resolves the valid key when a truncated and an empty .json sit alongside it", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lede-fixtures-race-"));
    const jd = "job description — race scenario";
    const decision = makeDecision({ summary: "Race scenario summary." });

    writeFileSync(
      path.join(dir, "valid.json"),
      JSON.stringify({ key: hashKey(jd, SEED_ENTRIES), name: "race-valid", decision }),
    );
    // Simulates another worker caught mid-write (truncated JSON).
    writeFileSync(path.join(dir, "truncated.json"), '{"key": "abc", "decision": {');
    // Simulates another worker caught mid-delete/mid-create.
    writeFileSync(path.join(dir, "empty.json"), "");

    const engine = new FixtureEngine(dir);
    await expect(engine.decide(jd, SEED_ENTRIES)).resolves.toEqual(decision);
  });
});

// ── RETRY COUNT ──

describe("ProviderEngine — retry policy", () => {
  const jd = "some job description";

  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("resolves after exactly 2 calls when the first attempt throws", async () => {
    const decision = makeDecision();
    generateObjectMock
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ object: decision });

    const engine = new ProviderEngine({
      provider: "google",
      model: "gemini-2.5-flash",
      apiKey: "k",
    });
    await expect(engine.decide(jd, SEED_ENTRIES)).resolves.toEqual(decision);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("rejects after exactly 2 calls when both attempts throw", async () => {
    generateObjectMock.mockRejectedValue(new Error("permanent"));

    const engine = new ProviderEngine({
      provider: "google",
      model: "gemini-2.5-flash",
      apiKey: "k",
    });
    await expect(engine.decide(jd, SEED_ENTRIES)).rejects.toThrow("permanent");
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });
});

// ── FACTORY ──

describe("makeEngine", () => {
  it("returns FixtureEngine under NODE_ENV=test", () => {
    expect(makeEngine({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBeInstanceOf(FixtureEngine);
  });

  it("returns FixtureEngine when LEDE_TAILOR_ENGINE=fixture", () => {
    expect(
      makeEngine({ NODE_ENV: "production", LEDE_TAILOR_ENGINE: "fixture" } as NodeJS.ProcessEnv),
    ).toBeInstanceOf(FixtureEngine);
  });

  it("returns ProviderEngine when LEDE_TAILOR_ENGINE=live", () => {
    expect(
      makeEngine({
        NODE_ENV: "production",
        LEDE_TAILOR_ENGINE: "live",
        GOOGLE_GENERATIVE_AI_API_KEY: "k",
      } as NodeJS.ProcessEnv),
    ).toBeInstanceOf(ProviderEngine);
  });
});

// ── CONTEXT PLUMBING (E6-A3) ──

describe("buildUserPrompt — the T014 baseline is byte-identical with no context", () => {
  const jd = "some job description";
  const baseline = `Tailor for this job description:\n\n${jd}`;

  it("returns the exact baseline string when context is undefined", () => {
    expect(buildUserPrompt(jd)).toBe(baseline);
  });

  it("returns the exact baseline string when context is null", () => {
    expect(buildUserPrompt(jd, null)).toBe(baseline);
  });

  it("returns the exact baseline string when context is an empty string", () => {
    expect(buildUserPrompt(jd, "")).toBe(baseline);
  });

  it("appends a clearly-labelled context block when context is provided", () => {
    const prompt = buildUserPrompt(jd, "prioritize distributed systems experience");
    expect(prompt.startsWith(baseline)).toBe(true);
    expect(prompt).toContain("prioritize distributed systems experience");
    expect(prompt).toContain("Tailoring context");
  });
});

describe("ProviderEngine.attempt — calls buildUserPrompt for the `prompt` field", () => {
  const jd = "some job description";

  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("with no context, sends the byte-identical baseline prompt", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: makeDecision() });
    const engine = new ProviderEngine({
      provider: "google",
      model: "gemini-2.5-flash",
      apiKey: "k",
    });
    await engine.decide(jd, SEED_ENTRIES);
    const callArgs = generateObjectMock.mock.calls[0]![0];
    expect(callArgs.prompt).toBe(buildUserPrompt(jd));
  });

  it("with context, sends the context-augmented prompt", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: makeDecision() });
    const engine = new ProviderEngine({
      provider: "google",
      model: "gemini-2.5-flash",
      apiKey: "k",
    });
    await engine.decide(jd, SEED_ENTRIES, "emphasize platform work");
    const callArgs = generateObjectMock.mock.calls[0]![0];
    expect(callArgs.prompt).toBe(buildUserPrompt(jd, "emphasize platform work"));
    expect(callArgs.prompt).toContain("emphasize platform work");
  });
});

// ── WIRING ──

// ── BUDGET PLUMBING (E7-D1a, §28.5) ──

describe("buildUserPrompt — budget block is appended AFTER context, guarded like context", () => {
  const jd = "some job description";
  const baseline = `Tailor for this job description:\n\n${jd}`;

  it("no budget arg — byte-identical baseline (no context)", () => {
    expect(buildUserPrompt(jd)).toBe(baseline);
  });

  it("no budget arg — byte-identical context path", () => {
    expect(buildUserPrompt(jd, "emphasize platform work")).toBe(
      `${baseline}\n\nTailoring context (guides emphasis; not a source of facts):\nemphasize platform work`,
    );
  });

  it("null/empty budget — byte-identical to the no-budget baseline", () => {
    expect(buildUserPrompt(jd, null, null)).toBe(baseline);
    expect(buildUserPrompt(jd, null, "")).toBe(baseline);
  });

  it("null/empty budget with context — byte-identical to the context-only baseline", () => {
    const withContext = buildUserPrompt(jd, "emphasize platform work");
    expect(buildUserPrompt(jd, "emphasize platform work", null)).toBe(withContext);
    expect(buildUserPrompt(jd, "emphasize platform work", "")).toBe(withContext);
  });

  it("a real budget with no context appends after the base prompt", () => {
    const prompt = buildUserPrompt(jd, null, "Aim for roughly 40 bullets (~500 words) total.");
    expect(prompt.startsWith(baseline)).toBe(true);
    expect(prompt).toContain("Aim for roughly 40 bullets");
    expect(prompt).toContain("Content budget");
  });

  it("a real budget with context appends after the context block, not before it", () => {
    const prompt = buildUserPrompt(
      jd,
      "emphasize platform work",
      "Aim for roughly 40 bullets (~500 words) total.",
    );
    const contextOnly = buildUserPrompt(jd, "emphasize platform work");
    expect(prompt.startsWith(contextOnly)).toBe(true);
    expect(prompt).toContain("Aim for roughly 40 bullets");
    expect(prompt.indexOf("Tailoring context")).toBeLessThan(prompt.indexOf("Content budget"));
  });
});

describe("ProviderEngine.attempt — budget threads into the `prompt` field", () => {
  const jd = "some job description";

  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("with no budget, sends exactly buildUserPrompt(jd) — unchanged from pre-budget behavior", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: makeDecision() });
    const engine = new ProviderEngine({
      provider: "google",
      model: "gemini-2.5-flash",
      apiKey: "k",
    });
    await engine.decide(jd, SEED_ENTRIES);
    const callArgs = generateObjectMock.mock.calls[0]![0];
    expect(callArgs.prompt).toBe(buildUserPrompt(jd));
  });

  it("with context and no budget, sends buildUserPrompt(jd, ctx) unchanged", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: makeDecision() });
    const engine = new ProviderEngine({
      provider: "google",
      model: "gemini-2.5-flash",
      apiKey: "k",
    });
    await engine.decide(jd, SEED_ENTRIES, "emphasize platform work");
    const callArgs = generateObjectMock.mock.calls[0]![0];
    expect(callArgs.prompt).toBe(buildUserPrompt(jd, "emphasize platform work"));
  });

  it("with a budget, the prompt contains the derived budget text and still starts with the base(+context) prefix", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: makeDecision() });
    const engine = new ProviderEngine({
      provider: "google",
      model: "gemini-2.5-flash",
      apiKey: "k",
    });
    const budget = "Aim for roughly 40 bullets (~500 words) total so the resume fits 1 page.";
    await engine.decide(jd, SEED_ENTRIES, "emphasize platform work", budget);
    const callArgs = generateObjectMock.mock.calls[0]![0];
    expect(callArgs.prompt).toBe(buildUserPrompt(jd, "emphasize platform work", budget));
    expect(callArgs.prompt.startsWith(buildUserPrompt(jd, "emphasize platform work"))).toBe(true);
    expect(callArgs.prompt).toContain(budget);
  });
});

describe("FixtureEngine — ignores budget (keys on jd+entries only, per hashKey's contract)", () => {
  it("resolves the same fixture regardless of budget argument", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lede-fixtures-budget-"));
    const jd = "job description — budget-ignoring scenario";
    const decision = makeDecision({ summary: "Budget-ignoring scenario summary." });
    writeFileSync(
      path.join(dir, "a.json"),
      JSON.stringify({ key: hashKey(jd, SEED_ENTRIES), name: "budget-scenario", decision }),
    );

    const engine = new FixtureEngine(dir);
    await expect(engine.decide(jd, SEED_ENTRIES, null, "some budget")).resolves.toEqual(decision);
    await expect(engine.decide(jd, SEED_ENTRIES, null, null)).resolves.toEqual(decision);
  });
});

describe("ProviderEngine.decide — wiring to generateObject", () => {
  const jd = "some job description";

  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("passes TailorDecisionZ as schema and a system string containing renderLibrary(entries)", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: makeDecision() });

    const engine = new ProviderEngine({
      provider: "google",
      model: "gemini-2.5-flash",
      apiKey: "k",
    });
    await engine.decide(jd, SEED_ENTRIES);

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    const callArgs = generateObjectMock.mock.calls[0]![0];
    expect(callArgs.schema).toBe(TailorDecisionZ);
    expect(callArgs.system).toContain(renderLibrary(SEED_ENTRIES));
  });
});
