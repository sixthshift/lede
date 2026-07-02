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

import { ProviderEngine, FixtureEngine, NoFixtureError, tailor, makeEngine, type TailorEngine } from "../src/server/tailor/engine";

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
      expect((err as NoFixtureError).scenarios).toEqual(expect.arrayContaining(["scenario-a", "scenario-b"]));
    }
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
    generateObjectMock.mockRejectedValueOnce(new Error("transient")).mockResolvedValueOnce({ object: decision });

    const engine = new ProviderEngine({ provider: "google", model: "gemini-2.5-flash", apiKey: "k" });
    await expect(engine.decide(jd, SEED_ENTRIES)).resolves.toEqual(decision);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("rejects after exactly 2 calls when both attempts throw", async () => {
    generateObjectMock.mockRejectedValue(new Error("permanent"));

    const engine = new ProviderEngine({ provider: "google", model: "gemini-2.5-flash", apiKey: "k" });
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

// ── WIRING ──

describe("ProviderEngine.decide — wiring to generateObject", () => {
  const jd = "some job description";

  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("passes TailorDecisionZ as schema and a system string containing renderLibrary(entries)", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: makeDecision() });

    const engine = new ProviderEngine({ provider: "google", model: "gemini-2.5-flash", apiKey: "k" });
    await engine.decide(jd, SEED_ENTRIES);

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    const callArgs = generateObjectMock.mock.calls[0]![0];
    expect(callArgs.schema).toBe(TailorDecisionZ);
    expect(callArgs.system).toContain(renderLibrary(SEED_ENTRIES));
  });
});
