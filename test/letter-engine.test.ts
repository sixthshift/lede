import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

import type { LetterDecision } from "@shared/types";
import { LetterDecisionZ } from "@shared/schema";
import { SEED_ENTRIES } from "../src/server/seed";
import { hashKey } from "../src/server/tailor/evalcore";
import { renderLibrary } from "../src/server/tailor/prompt";

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", () => ({ generateObject: generateObjectMock }));

import { ProviderEngine, FixtureEngine, NoFixtureError } from "../src/server/tailor/engine";
import { LETTER_SYSTEM_PROMPT, buildLetterUserPrompt } from "../src/server/tailor/letter-prompt";

function makeLetterDecision(overrides: Partial<LetterDecision> = {}): LetterDecision {
  return {
    greeting: "Dear Hiring Team,",
    body: [
      {
        text: "I built a platform SDK exposing the platform programmatically for the first time.",
        groundedOn: ["cloudcase-platform-sdk"],
      },
    ],
    closing: "Sincerely,",
    ...overrides,
  };
}

// ── prompt.ts stays untouched (byte-stability of the resume SYSTEM_PROMPT) ──

describe("prompt.ts is untouched by this ticket", () => {
  it("SYSTEM_PROMPT still starts with the frozen resume framing", () => {
    const promptSrc = readFileSync(
      path.join(process.cwd(), "src/server/tailor/prompt.ts"),
      "utf-8",
    );
    expect(promptSrc).toContain("You are Lede's resume tailor.");
  });
});

// ── LETTER_SYSTEM_PROMPT — focus instruction added, fact-lock intact ──

describe("LETTER_SYSTEM_PROMPT — focus instruction", () => {
  it("instructs the model to build the letter around one lead experience, not inventory the library", () => {
    expect(LETTER_SYSTEM_PROMPT).toMatch(/one\s+(?:single\s+)?lead experience/i);
    expect(LETTER_SYSTEM_PROMPT).toContain("Do not mention every project or entry in the library");
  });

  it("instructs that a letter's grounding should differ across different job descriptions", () => {
    expect(LETTER_SYSTEM_PROMPT).toMatch(/visibly different/i);
  });

  it("still contains the fact-lock — never invent, groundedOn traceability", () => {
    expect(LETTER_SYSTEM_PROMPT).toContain("never invent");
    expect(LETTER_SYSTEM_PROMPT).toContain(
      "Never invent a number, name, tool, outcome, or claim that is not already in",
    );
    expect(LETTER_SYSTEM_PROMPT).toContain("groundedOn");
  });
});

// ── buildLetterUserPrompt — byte-identical prefix guard ──

describe("buildLetterUserPrompt — byte-identical with no motivation/context/voice", () => {
  const jd = "some job description";
  const baseline = `Write a cover letter for this job description:\n\n${jd}`;

  it("returns the exact hardcoded baseline with no optional args", () => {
    expect(buildLetterUserPrompt(jd)).toBe(
      "Write a cover letter for this job description:\n\nsome job description",
    );
  });

  it("returns the exact baseline with null motivation/context/voice", () => {
    expect(buildLetterUserPrompt(jd, null, null, null)).toBe(baseline);
  });

  it("returns the exact baseline with empty-string motivation/context/voice", () => {
    expect(buildLetterUserPrompt(jd, "", "", "")).toBe(baseline);
  });

  it("appends a labelled motivation block, prefix unchanged", () => {
    const prompt = buildLetterUserPrompt(jd, "my motivation");
    expect(prompt).toBe(
      "Write a cover letter for this job description:\n\nsome job description" +
        "\n\nMotivation (why this candidate wants this role; guides phrasing, not a source of facts):\nmy motivation",
    );
    expect(prompt.startsWith(baseline)).toBe(true);
  });

  it("appends context after motivation, in order, when both are present", () => {
    const prompt = buildLetterUserPrompt(jd, "my motivation", "emphasize platform work");
    const motivationOnly = buildLetterUserPrompt(jd, "my motivation");
    expect(prompt.startsWith(motivationOnly)).toBe(true);
    expect(prompt.indexOf("Motivation")).toBeLessThan(prompt.indexOf("Tailoring context"));
    expect(prompt).toContain("emphasize platform work");
  });

  it("appends voice after context, in order, when all three are present", () => {
    const prompt = buildLetterUserPrompt(
      jd,
      "my motivation",
      "emphasize platform work",
      "crisp, direct, first-person",
    );
    const withoutVoice = buildLetterUserPrompt(jd, "my motivation", "emphasize platform work");
    expect(prompt.startsWith(withoutVoice)).toBe(true);
    expect(prompt.indexOf("Tailoring context")).toBeLessThan(prompt.indexOf("Voice exemplars"));
    expect(prompt).toContain("crisp, direct, first-person");
  });

  it("context can appear without motivation, prefix still byte-identical to base", () => {
    const prompt = buildLetterUserPrompt(jd, null, "emphasize platform work");
    expect(prompt.startsWith(baseline)).toBe(true);
    expect(prompt).toContain("Tailoring context");
  });
});

// ── FixtureEngine.decideLetter — no fixtures dir ──

describe("FixtureEngine.decideLetter — no recorded letter fixtures", () => {
  it("throws NoFixtureError (code 'no_fixture') when the letters dir is missing", async () => {
    const missingDir = path.join(tmpdir(), `lede-letters-missing-${Date.now()}`);
    const engine = new FixtureEngine(
      path.join(process.cwd(), "test/fixtures/decisions"),
      missingDir,
    );
    await expect(engine.decideLetter("some jd", SEED_ENTRIES)).rejects.toBeInstanceOf(
      NoFixtureError,
    );
    try {
      await engine.decideLetter("some jd", SEED_ENTRIES);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(NoFixtureError);
      expect((err as NoFixtureError).code).toBe("no_fixture");
      expect((err as NoFixtureError).scenarios).toEqual([]);
    }
  });

  it("throws NoFixtureError when the letters dir exists but is empty", async () => {
    const emptyDir = mkdtempSync(path.join(tmpdir(), "lede-letters-empty-"));
    const engine = new FixtureEngine(path.join(process.cwd(), "test/fixtures/decisions"), emptyDir);
    await expect(engine.decideLetter("some jd", SEED_ENTRIES)).rejects.toBeInstanceOf(
      NoFixtureError,
    );
  });
});

// ── FixtureEngine.decideLetter — key-match, not first-found ──

describe("FixtureEngine.decideLetter — resolves by hash key, not filename/first-file fallback", () => {
  let dir: string;
  const jdA = "job description A — platform SDK cover letter";
  const jdB = "job description B — legacy rules engine cover letter";
  const decisionA = makeLetterDecision({ greeting: "Dear Team A," });
  const decisionB = makeLetterDecision({ greeting: "Dear Team B," });

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "lede-letter-fixtures-"));
    // Write B first so a naive "first file" fallback would return the wrong one for jdA.
    writeFileSync(
      path.join(dir, "b.json"),
      JSON.stringify({ key: hashKey(jdB, SEED_ENTRIES), name: "letter-b", decision: decisionB }),
    );
    writeFileSync(
      path.join(dir, "a.json"),
      JSON.stringify({ key: hashKey(jdA, SEED_ENTRIES), name: "letter-a", decision: decisionA }),
    );
  });

  it("resolves jdA to decisionA, not decisionB, even though b.json is written/read first", async () => {
    const engine = new FixtureEngine(path.join(process.cwd(), "test/fixtures/decisions"), dir);
    await expect(engine.decideLetter(jdA, SEED_ENTRIES)).resolves.toEqual(decisionA);
  });

  it("resolves jdB to decisionB, not decisionA", async () => {
    const engine = new FixtureEngine(path.join(process.cwd(), "test/fixtures/decisions"), dir);
    await expect(engine.decideLetter(jdB, SEED_ENTRIES)).resolves.toEqual(decisionB);
  });

  it("ignores motivation/context/voice for matching — same fixture regardless of those args", async () => {
    const engine = new FixtureEngine(path.join(process.cwd(), "test/fixtures/decisions"), dir);
    await expect(
      engine.decideLetter(jdA, SEED_ENTRIES, "some motivation", "some context", "some voice"),
    ).resolves.toEqual(decisionA);
  });
});

// ── ProviderEngine.decideLetter — wiring + retry ──

describe("ProviderEngine.decideLetter — wiring to generateObject", () => {
  const jd = "some job description";

  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("passes LetterDecisionZ as schema and a system string built from LETTER_SYSTEM_PROMPT + renderLibrary", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: makeLetterDecision() });

    const engine = new ProviderEngine({
      provider: "google",
      model: "gemini-2.5-flash",
      apiKey: "k",
    });
    await engine.decideLetter(jd, SEED_ENTRIES);

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    const callArgs = generateObjectMock.mock.calls[0]![0];
    expect(callArgs.schema).toBe(LetterDecisionZ);
    expect(callArgs.system).toContain(LETTER_SYSTEM_PROMPT);
    expect(callArgs.system).toContain(renderLibrary(SEED_ENTRIES));
    expect(callArgs.prompt).toBe(buildLetterUserPrompt(jd));
  });

  it("threads motivation/context/voice into buildLetterUserPrompt", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: makeLetterDecision() });

    const engine = new ProviderEngine({
      provider: "google",
      model: "gemini-2.5-flash",
      apiKey: "k",
    });
    await engine.decideLetter(jd, SEED_ENTRIES, "my motivation", "my context", "my voice");
    const callArgs = generateObjectMock.mock.calls[0]![0];
    expect(callArgs.prompt).toBe(
      buildLetterUserPrompt(jd, "my motivation", "my context", "my voice"),
    );
  });

  it("resolves after exactly 2 calls when the first attempt throws", async () => {
    const decision = makeLetterDecision();
    generateObjectMock
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ object: decision });

    const engine = new ProviderEngine({
      provider: "google",
      model: "gemini-2.5-flash",
      apiKey: "k",
    });
    await expect(engine.decideLetter(jd, SEED_ENTRIES)).resolves.toEqual(decision);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("rejects after exactly 2 calls when both attempts throw", async () => {
    generateObjectMock.mockRejectedValue(new Error("permanent"));

    const engine = new ProviderEngine({
      provider: "google",
      model: "gemini-2.5-flash",
      apiKey: "k",
    });
    await expect(engine.decideLetter(jd, SEED_ENTRIES)).rejects.toThrow("permanent");
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });
});
