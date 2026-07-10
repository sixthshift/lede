import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  assembleLetter,
  validateLetterNoFabrication,
  tailorLetter,
} from "../src/server/tailor/letter";
import { FabricationError } from "../src/server/tailor/validate";
import { FixtureEngine } from "../src/server/tailor/engine";
import { hashKey } from "../src/server/tailor/evalcore";
import type { CoverLetter, Entry, LetterDecision } from "@shared/types";

function entry(id: string, facts: string[]): Entry {
  return {
    id,
    section: "experience",
    meta: { section: "experience", company: "Acme", role: "Eng", period: "2020-2021" },
    facts,
    tags: [],
    sortKey: 202001,
  };
}

describe("assembleLetter", () => {
  it("is a pass-through: no drop/mutation of groundedOn", () => {
    const decision: LetterDecision = {
      greeting: "Dear Hiring Manager,",
      body: [
        { text: "I led a team of 5.", groundedOn: ["e1"] },
        { text: "No claims here.", groundedOn: [] },
      ],
      closing: "Sincerely, Me",
    };
    expect(assembleLetter(decision)).toEqual({
      greeting: decision.greeting,
      body: decision.body,
      closing: decision.closing,
    });
  });
});

describe("validateLetterNoFabrication", () => {
  const x = entry("e-x", ["shipped 30k lines of rules"]);
  const y = entry("e-y", ["cut costs by 50%"]);

  it("PER-CITATION: a number in an UNCITED entry's facts still fabricates when cited elsewhere", () => {
    // "30k" lives only in e-x's facts. A paragraph citing e-y (not e-x) that
    // contains "30k" must throw — proving grounding is scoped per-citation,
    // not checked against a library-wide pool of all entries' facts.
    const letter: CoverLetter = {
      greeting: "Dear Hiring Manager,",
      body: [{ text: "I shipped 30k lines of code.", groundedOn: ["e-y"] }],
      closing: "Sincerely, Me",
    };
    expect(() => validateLetterNoFabrication(letter, [x, y])).toThrow(FabricationError);
  });

  it("the SAME number passes when the paragraph cites the entry that actually has it", () => {
    const letter: CoverLetter = {
      greeting: "Dear Hiring Manager,",
      body: [{ text: "I shipped 30k lines of code.", groundedOn: ["e-x"] }],
      closing: "Sincerely, Me",
    };
    expect(() => validateLetterNoFabrication(letter, [x, y])).not.toThrow();
  });

  it("throws instanceof FabricationError on a nonexistent groundedOn entry id", () => {
    const letter: CoverLetter = {
      greeting: "Dear Hiring Manager,",
      body: [{ text: "No numbers at all.", groundedOn: ["ghost"] }],
      closing: "Sincerely, Me",
    };
    let caught: unknown;
    try {
      validateLetterNoFabrication(letter, [x, y]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FabricationError);
  });

  it("takes no motivation/context parameter", () => {
    expect(validateLetterNoFabrication.length).toBe(2); // (letter, entries)
    // @ts-expect-error — a 3rd (motivation) argument is not part of the contract.
    validateLetterNoFabrication({ greeting: "", body: [], closing: "" }, [], "some motivation");
  });
});

describe("tailorLetter", () => {
  const grounded = entry("cloudcase-rules-engine", ["shipped 30k lines of rules"]);

  it("runs engine -> assemble -> validate over a FixtureEngine and returns a validated CoverLetter", async () => {
    const jd = "We need a senior engineer to own a large rules engine.";
    const entries = [grounded];
    const key = hashKey(jd, entries);

    const letterDir = mkdtempSync(path.join(tmpdir(), "letter-fixtures-"));
    const decision: LetterDecision = {
      greeting: "Dear Hiring Manager,",
      body: [{ text: "I shipped 30k lines of rules.", groundedOn: ["cloudcase-rules-engine"] }],
      closing: "Sincerely, Me",
    };
    writeFileSync(
      path.join(letterDir, "fixture.json"),
      JSON.stringify({ key, name: "grounded-number", decision }),
    );

    const engine = new FixtureEngine(letterDir, letterDir);
    const letter = await tailorLetter(engine, jd, entries);

    expect(letter).toEqual(decision);

    rmSync(letterDir, { recursive: true, force: true });
  });
});
