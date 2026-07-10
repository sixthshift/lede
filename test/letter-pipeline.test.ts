// T16 — letter grounding/fabrication pipeline tests + fixture acceptance.
// Exercises the recorded letter fixtures end-to-end (not hand-rolled decisions):
// precondition on the fixtures existing, provenance authenticity, schema
// acceptance/rejection, per-citation fabrication scoping, and a full
// FixtureEngine -> tailorLetter round trip against the actual recordings.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { LetterDecisionZ } from "@shared/schema";
import type { CoverLetter, LetterDecision } from "@shared/types";
import { SEED_ENTRIES } from "../src/server/seed";
import { CONTRAST_JDS } from "../src/server/tailor/evalcore";
import { FixtureEngine } from "../src/server/tailor/engine";
import { tailorLetter, validateLetterNoFabrication } from "../src/server/tailor/letter";
import { FabricationError } from "../src/server/tailor/validate";

const FIXTURES_DIR = path.join(process.cwd(), "test/fixtures/letters");

type LetterFixtureFile = { key: string; name: string; decision: LetterDecision };

function readFixture(name: string): LetterFixtureFile {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, `${name}.json`), "utf-8"));
}

// ── 1. HARD PRECONDITION — the recorded fixtures must actually exist ──

describe("recorded letter fixtures precondition", () => {
  it("test/fixtures/letters contains the 3 recorded fixtures + manifest.json", () => {
    const files = readdirSync(FIXTURES_DIR);
    expect(files).toContain("platform-sdk.json");
    expect(files).toContain("rules-engine.json");
    expect(files).toContain("frontend-rewrite.json");
    expect(files).toContain("manifest.json");
  });
});

// ── 2. PROVENANCE AUTHENTICITY — un-fakeable signal is usage.total.totalTokens > 0 ──

describe("manifest.json provenance authenticity", () => {
  const manifest = JSON.parse(readFileSync(path.join(FIXTURES_DIR, "manifest.json"), "utf-8"));

  it("recorded with the expected model", () => {
    expect(manifest.model).toBe("gemini-2.5-flash");
  });

  it("carries non-zero token usage (a hand-authored/placeholder fixture would have 0)", () => {
    expect(manifest.usage.total.totalTokens).toBeGreaterThan(0);
    expect(manifest.usage.total.inputTokens).toBeGreaterThan(0);
    expect(manifest.usage.total.outputTokens).toBeGreaterThan(0);
  });

  it("carries a real, parseable recordedAt timestamp (not empty/epoch-0)", () => {
    expect(manifest.recordedAt).toBeTruthy();
    const parsed = new Date(manifest.recordedAt);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(parsed.getTime()).toBeGreaterThan(0);
  });
});

// ── 3. SCHEMA — LetterDecisionZ accepts each recorded decision; a deleted
// groundedOn key fails ──

describe("LetterDecisionZ over the recorded fixtures", () => {
  for (const name of ["platform-sdk", "rules-engine", "frontend-rewrite"]) {
    it(`accepts ${name}.json's recorded decision`, () => {
      const fixture = readFixture(name);
      expect(LetterDecisionZ.safeParse(fixture.decision).success).toBe(true);
    });
  }

  it("rejects a copy of a recorded decision with a body paragraph's groundedOn key deleted", () => {
    const fixture = readFixture("platform-sdk");
    const mutated = structuredClone(fixture.decision) as unknown as {
      body: Array<Record<string, unknown>>;
    };
    delete mutated.body[0]!.groundedOn;
    expect(LetterDecisionZ.safeParse(mutated).success).toBe(false);
  });
});

// ── 4. FABRICATION, THREE CASES — per-citation, not library-pool ──
//
// X = cloudcase-rules-engine, facts include "~30k lines" and "~50% of time".
// Y = cloudcase-frontend-rewrite, whose facts contain NO numbers at all —
// a real, different SEED_ENTRIES entry, so citing only Y while a number
// belongs to X is a meaningful, non-trivial per-citation test.

const X = SEED_ENTRIES.find((e) => e.id === "cloudcase-rules-engine")!;
const Y = SEED_ENTRIES.find((e) => e.id === "cloudcase-frontend-rewrite")!;

describe("validateLetterNoFabrication — per-citation scoping over SEED_ENTRIES", () => {
  it("(a) a number present in NO entry's facts throws FabricationError", () => {
    const letter: CoverLetter = {
      greeting: "Dear Hiring Team,",
      body: [{ text: "I improved throughput by 77%.", groundedOn: [X.id] }],
      closing: "Sincerely,",
    };
    expect(() => validateLetterNoFabrication(letter, SEED_ENTRIES)).toThrow(FabricationError);
  });

  it("(b) the same number, cited against the entry whose facts DO contain it, passes", () => {
    const letter: CoverLetter = {
      greeting: "Dear Hiring Team,",
      body: [
        {
          text: "I built a rules engine spanning ~30k lines of unstructured rules.",
          groundedOn: [X.id],
        },
      ],
      closing: "Sincerely,",
    };
    expect(() => validateLetterNoFabrication(letter, SEED_ENTRIES)).not.toThrow();
  });

  it("(c) a number in X's facts, cited against Y only (X uncited), throws — proves per-citation scoping", () => {
    const letter: CoverLetter = {
      greeting: "Dear Hiring Team,",
      body: [
        {
          text: "I built a rules engine spanning ~30k lines of unstructured rules.",
          groundedOn: [Y.id],
        },
      ],
      closing: "Sincerely,",
    };
    expect(() => validateLetterNoFabrication(letter, SEED_ENTRIES)).toThrow(FabricationError);
  });
});

// ── 5. END-TO-END — FixtureEngine replay matches the recorded fixture verbatim ──

describe("tailorLetter over FixtureEngine — matches the recorded fixtures", () => {
  for (const { name, jd } of CONTRAST_JDS) {
    it(`${name}: recorded decision replays and validates against SEED_ENTRIES`, async () => {
      const fixture = readFixture(name);
      const engine = new FixtureEngine();
      const letter = await tailorLetter(engine, jd, SEED_ENTRIES);

      expect(letter.greeting).toBe(fixture.decision.greeting);
      expect(letter.body).toEqual(fixture.decision.body);
      expect(letter.closing).toBe(fixture.decision.closing);
    });
  }
});
