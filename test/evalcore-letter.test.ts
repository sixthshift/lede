import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  letterFlipPredicate,
  letterFlipContrast,
  recordOneLetter,
  type LetterRecordEngine,
} from "../src/server/tailor/evalcore";
import { SEED_ENTRIES } from "../src/server/seed";
import type { CoverLetter, LetterDecision } from "@shared/types";

// ── letterFlipPredicate ──

function letterWithBody(body: CoverLetter["body"]): CoverLetter {
  return { greeting: "Hello,", body, closing: "Best," };
}

describe("letterFlipPredicate", () => {
  it("true when the target is cited by the LEAD (first) paragraph", () => {
    const letter = letterWithBody([
      { text: "para one", groundedOn: ["target", "other"] },
      { text: "para two", groundedOn: ["other"] },
    ]);
    expect(letterFlipPredicate(letter, "target")).toBe(true);
  });

  it("false when the target is cited only by a NON-LEAD (later) paragraph", () => {
    const letter = letterWithBody([
      { text: "para one", groundedOn: ["other"] },
      { text: "para two", groundedOn: ["target"] },
    ]);
    expect(letterFlipPredicate(letter, "target")).toBe(false);
  });

  it("false when the target is not cited anywhere", () => {
    const letter = letterWithBody([
      { text: "para one", groundedOn: ["other"] },
      { text: "para two", groundedOn: ["another"] },
    ]);
    expect(letterFlipPredicate(letter, "target")).toBe(false);
  });

  it("false when the body is empty", () => {
    const letter = letterWithBody([]);
    expect(letterFlipPredicate(letter, "target")).toBe(false);
  });
});

// ── letterFlipContrast ──

describe("letterFlipContrast", () => {
  it("false when all three letters have identical groundedOn unions", () => {
    const letters = ["a", "b", "c"].map((name) => ({
      name,
      letter: letterWithBody([{ text: "x", groundedOn: ["one", "two"] }]),
    }));
    expect(letterFlipContrast(letters)).toBe(false);
  });

  it("true when the three letters' groundedOn unions pairwise-differ in both directions", () => {
    const letters = [
      { name: "a", letter: letterWithBody([{ text: "x", groundedOn: ["one", "two"] }]) },
      { name: "b", letter: letterWithBody([{ text: "x", groundedOn: ["two", "three"] }]) },
      { name: "c", letter: letterWithBody([{ text: "x", groundedOn: ["three", "one"] }]) },
    ];
    expect(letterFlipContrast(letters)).toBe(true);
  });

  it("SUPERSET TRAP: false when one letter's union is a strict superset of another's", () => {
    const letters = [
      { name: "a", letter: letterWithBody([{ text: "x", groundedOn: ["one"] }]) },
      { name: "b", letter: letterWithBody([{ text: "x", groundedOn: ["one", "two"] }]) },
      { name: "c", letter: letterWithBody([{ text: "x", groundedOn: ["three"] }]) },
    ];
    // b's union {one, two} is a strict superset of a's union {one} — the
    // difference in the a -> b direction is empty, so this must fail even
    // though b -> a is non-empty and a/c, b/c pairwise-differ both ways.
    expect(letterFlipContrast(letters)).toBe(false);
  });

  it("unions are computed across ALL body paragraphs, not just the lead", () => {
    const letters = [
      {
        name: "a",
        letter: letterWithBody([
          { text: "x", groundedOn: ["one"] },
          { text: "y", groundedOn: ["two"] },
        ]),
      },
      { name: "b", letter: letterWithBody([{ text: "x", groundedOn: ["three"] }]) },
    ];
    expect(letterFlipContrast(letters)).toBe(true);
  });
});

// ── recordOneLetter — pure per-JD record/verify step ──

const TARGET = "cloudcase-platform-sdk";
const JD = "some job description that does not name any entry";

function mockEngine(decision: LetterDecision): LetterRecordEngine {
  return {
    async decideLetter() {
      return decision;
    },
  };
}

function writeFixtureIfOk(
  dir: string,
  name: string,
  result: Awaited<ReturnType<typeof recordOneLetter>>,
): void {
  // Mirrors record-letter-fixtures.ts's gate: only write on ok:true.
  if (result.ok) {
    writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(result.decision));
  }
}

describe("recordOneLetter", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ok:true when the lead paragraph cites the target and the letter is fabrication-clean", async () => {
    const decision: LetterDecision = {
      greeting: "Hello,",
      body: [{ text: "Grounded paragraph.", groundedOn: [TARGET] }],
      closing: "Best,",
    };
    const result = await recordOneLetter(mockEngine(decision), JD, SEED_ENTRIES, TARGET);
    expect(result.ok).toBe(true);
  });

  it("ok:false and writes NO fixture when the lead paragraph does not cite the target (no flip)", async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "lede-letter-test-"));
    const decision: LetterDecision = {
      greeting: "Hello,",
      // cites a real entry, but not the target — a non-flip, not a fabrication issue.
      body: [{ text: "Grounded but wrong lead.", groundedOn: ["cloudcase-rules-engine"] }],
      closing: "Best,",
    };
    const result = await recordOneLetter(mockEngine(decision), JD, SEED_ENTRIES, TARGET);
    expect(result.ok).toBe(false);

    writeFixtureIfOk(tmpDir, "platform-sdk", result);
    expect(readdirSync(tmpDir)).toEqual([]);
  });

  it("ok:false and writes NO fixture when the letter is ungrounded (fabricated number)", async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "lede-letter-test-"));
    const decision: LetterDecision = {
      greeting: "Hello,",
      // cites the target, but 99% is not in cloudcase-platform-sdk's facts.
      body: [{ text: "Improved throughput by 99%.", groundedOn: [TARGET] }],
      closing: "Best,",
    };
    const result = await recordOneLetter(mockEngine(decision), JD, SEED_ENTRIES, TARGET);
    expect(result.ok).toBe(false);

    writeFixtureIfOk(tmpDir, "platform-sdk", result);
    expect(readdirSync(tmpDir)).toEqual([]);
  });

  it("ok:false when decideLetter itself throws", async () => {
    const failingEngine: LetterRecordEngine = {
      async decideLetter() {
        throw new Error("model call failed");
      },
    };
    const result = await recordOneLetter(failingEngine, JD, SEED_ENTRIES, TARGET);
    expect(result.ok).toBe(false);
  });
});
