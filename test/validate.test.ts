import { describe, it, expect } from "vitest";
import {
  FabricationError,
  validateNoFabrication,
  extractNumbers,
  hasNumberToken,
} from "../src/server/tailor/validate";
import type { Entry, TailoredResume } from "@shared/types";

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

function resumeWithItems(
  items: { entryId: string; text: string }[],
  summary = "Summary.",
): TailoredResume {
  return {
    signals: { roleLevel: "", weights: [], hardRequirements: [] },
    summary,
    sections: [{ section: "experience", groups: [{ items }] }],
    cut: [],
  };
}

describe("extractNumbers / hasNumberToken", () => {
  it("'30k' passes only if facts contain '30k', throws if facts contain only '30'", () => {
    expect(hasNumberToken("grew revenue by 30k", "30k")).toBe(true);
    expect(hasNumberToken("grew revenue by 30", "30k")).toBe(false);
  });

  it("'50%' does not match a fact of '50'", () => {
    expect(hasNumberToken("improved conversion by 50", "50%")).toBe(false);
  });

  it("'1,000' matches a fact of '1000'", () => {
    expect(hasNumberToken("served 1000 customers", "1,000")).toBe(true);
  });

  it("does not substring-match '1' inside '2021'", () => {
    expect(hasNumberToken("worked there in 2021", "1")).toBe(false);
  });

  it("extracts attached-unit tokens distinctly from bare numbers", () => {
    expect(extractNumbers("scaled from 10x to 50% growth in 2021")).toEqual(["10x", "50%", "2021"]);
  });
});

describe("validateNoFabrication", () => {
  const e1 = entry("e1", ["led team of 5", "shipped in 30k lines"]);
  const e2 = entry("e2", ["cut costs by 50%"]);

  it("passes on clean output", () => {
    const resume = resumeWithItems([
      { entryId: "e1", text: "Led a team of 5, shipping 30k lines." },
      { entryId: "e2", text: "Cut costs by 50%." },
    ]);
    expect(() => validateNoFabrication(resume, [e1, e2])).not.toThrow();
  });

  it("throws on unknown entryId", () => {
    const resume = resumeWithItems([{ entryId: "ghost", text: "Did things." }]);
    expect(() => validateNoFabrication(resume, [e1, e2])).toThrow(FabricationError);
  });

  it("throws when a number is scoped to a DIFFERENT entry's facts but absent from its own", () => {
    // 50% only exists in e2's facts, but is attributed to e1's item.
    const resume = resumeWithItems([
      { entryId: "e1", text: "Led a team of 5 and cut costs by 50%." },
      { entryId: "e2", text: "Cut costs by 50%." },
    ]);
    expect(() => validateNoFabrication(resume, [e1, e2])).toThrow(FabricationError);
  });

  it("throws and names the invented token when a fake number is buried deep (late group, non-leading item)", () => {
    const resume: TailoredResume = {
      signals: { roleLevel: "", weights: [], hardRequirements: [] },
      summary: "Experienced engineer.",
      sections: [
        {
          section: "experience",
          groups: [{ items: [{ entryId: "e1", text: "Led a team of 5." }] }],
        },
        {
          section: "project",
          groups: [
            { items: [{ entryId: "e2", text: "Cut costs by 50%." }] },
            {
              items: [
                { entryId: "e1", text: "Also shipped 30k lines." },
                { entryId: "e2", text: "Invented a 999% improvement." },
              ],
            },
          ],
        },
      ],
      cut: [],
    };
    expect(() => validateNoFabrication(resume, [e1, e2])).toThrow(/999%/);
  });

  it("passes when a summary number is grounded only in baseSummary", () => {
    const resume = resumeWithItems(
      [{ entryId: "e1", text: "Led a team of 5." }],
      "Brings 12 years of experience.",
    );
    expect(() =>
      validateNoFabrication(resume, [e1, e2], "Brings 12 years of experience."),
    ).not.toThrow();
  });

  it("throws when a summary number is not traceable to kept facts or baseSummary", () => {
    const resume = resumeWithItems(
      [{ entryId: "e1", text: "Led a team of 5." }],
      "Brings 12 years of experience.",
    );
    expect(() => validateNoFabrication(resume, [e1, e2], null)).toThrow(FabricationError);
  });

  // RED-TEAM #6 (E6-A3): context guides emphasis, never a fact source (§27).
  // validateNoFabrication's signature takes entries only — a number that
  // exists ONLY in a context string, in no entry's facts, must still be
  // treated as ungrounded if it shows up in a resume item or the summary.
  it("RED-TEAM #6: a number present only in context (in no entry) still fabricates in an item", () => {
    // validateNoFabrication has no context parameter at all — this call
    // signature itself is the contract: context is never an argument.
    expect(validateNoFabrication.length).toBe(3); // (resume, entries, baseSummary?)

    const context = "Ideally 77 years of combined team experience across the org.";
    const resume = resumeWithItems([
      { entryId: "e1", text: "Led a team of 5 with 77 years of combined experience." },
    ]);
    // The context string is never passed to validateNoFabrication — proving
    // it cannot ground the "77" even if it were (incorrectly) consulted.
    void context;
    expect(() => validateNoFabrication(resume, [e1, e2])).toThrow(FabricationError);
  });

  it("RED-TEAM #6: a context-only number in the summary still fabricates", () => {
    const resume = resumeWithItems(
      [{ entryId: "e1", text: "Led a team of 5." }],
      "Brings 77 years of combined team experience.",
    );
    expect(() => validateNoFabrication(resume, [e1, e2], null)).toThrow(FabricationError);
  });
});
