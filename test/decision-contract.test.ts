import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  DecisionContractError,
  validateDecisionContract,
  validateLedeRationale,
} from "../src/server/tailor/validate";
import { assemble } from "../src/server/tailor/assemble";
import { SECTIONS } from "@shared/sections";
import { SEED_ENTRIES } from "../src/server/seed";
import type { Entry, EntryMeta, Layout, TailorDecision } from "@shared/types";

function entry(
  id: string,
  section: Entry["section"],
  meta: EntryMeta,
  facts: string[] = [],
  sortKey = 202401,
): Entry {
  return { id, section, meta, facts, tags: [], sortKey };
}

function decision(items: TailorDecision["items"], cut: TailorDecision["cut"] = []): TailorDecision {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "Summary.",
    items,
    cut,
  };
}

function layoutFor(sections: { section: Layout[number]["section"]; enabled: boolean }[]): Layout {
  return sections;
}

const expMeta = (period: string): EntryMeta => ({
  section: "experience",
  company: "Acme",
  role: "Eng",
  period,
});

describe("validateDecisionContract — partition", () => {
  const e1 = entry("e1", "experience", expMeta("A"));
  const e2 = entry("e2", "experience", expMeta("B"));
  const e3 = entry("e3", "experience", expMeta("C"));
  const lib = [e1, e2, e3];

  it("omitting a library entry from both lists throws", () => {
    const d = decision([{ entryId: "e1", text: "t", rank: 1 }], [{ entryId: "e2", reason: "r" }]);
    expect(() => validateDecisionContract(d, lib)).toThrow(DecisionContractError);
    expect(() => validateDecisionContract(d, lib)).toThrow(/e3/);
  });

  it("an exact partition passes (id in exactly one list)", () => {
    const d = decision(
      [{ entryId: "e1", text: "t", rank: 1 }],
      [
        { entryId: "e2", reason: "r" },
        { entryId: "e3", reason: "r" },
      ],
    );
    expect(() => validateDecisionContract(d, lib)).not.toThrow();
  });

  it("an id in BOTH items and cut throws", () => {
    const d = decision(
      [
        { entryId: "e1", text: "t", rank: 1 },
        { entryId: "e2", text: "t", rank: 2 },
      ],
      [
        { entryId: "e2", reason: "r" },
        { entryId: "e3", reason: "r" },
      ],
    );
    expect(() => validateDecisionContract(d, lib)).toThrow(/both items and cut/);
  });

  it("a foreign id, realistically shaped but absent from the library, throws", () => {
    // "cloudcase-security-audit" follows the same id convention as the real
    // seed entries (cloudcase-*) but isn't one of e1/e2/e3.
    const d = decision(
      [
        { entryId: "e1", text: "t", rank: 1 },
        { entryId: "cloudcase-security-audit", text: "t", rank: 2 },
      ],
      [{ entryId: "e2", reason: "r" }],
    );
    expect(() => validateDecisionContract(d, lib)).toThrow(/cloudcase-security-audit/);
  });

  it("the SAME id appearing TWICE within items (partition otherwise exact) throws — distinct from the both-lists case", () => {
    const d = decision(
      [
        { entryId: "e1", text: "t", rank: 1 },
        { entryId: "e1", text: "t", rank: 2 },
      ],
      [
        { entryId: "e2", reason: "r" },
        { entryId: "e3", reason: "r" },
      ],
    );
    let error: unknown;
    try {
      validateDecisionContract(d, lib);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(DecisionContractError);
    expect((error as Error).message).toMatch(/twice within items/);
    expect((error as Error).message).not.toMatch(/both items and cut/);
  });

  it("the same id appearing twice within cut throws", () => {
    const d = decision(
      [{ entryId: "e1", text: "t", rank: 1 }],
      [
        { entryId: "e2", reason: "r" },
        { entryId: "e3", reason: "r" },
        { entryId: "e3", reason: "r" },
      ],
    );
    expect(() => validateDecisionContract(d, lib)).toThrow(/twice within cut/);
  });
});

describe("validateDecisionContract — rank", () => {
  // Each test's library is scoped to exactly the entries its decision
  // references (an exact partition, cut: []) so partition never interferes
  // with what the test is actually probing — rank.
  const exp1 = entry("exp1", "experience", expMeta("A"));
  const exp2 = entry("exp2", "experience", expMeta("B"));
  const edu1 = entry("edu1", "education", { section: "education", school: "S", degree: "D" });
  const skill1 = entry("skill1", "skill", { section: "skill" });

  it("two items in the SAME section with equal rank throws, naming section + rank + colliding ids", () => {
    const d = decision([
      { entryId: "exp1", text: "t", rank: 1 },
      { entryId: "exp2", text: "t", rank: 1 },
    ]);
    let error: unknown;
    try {
      validateDecisionContract(d, [exp1, exp2]);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(DecisionContractError);
    const message = (error as Error).message;
    expect(message).toMatch(/experience/);
    expect(message).toMatch(/\b1\b/);
    expect(message).toMatch(/exp1/);
    expect(message).toMatch(/exp2/);
  });

  it("the same rank value repeated across 3+ DIFFERENT sections passes", () => {
    const d = decision([
      { entryId: "exp1", text: "t", rank: 1 },
      { entryId: "edu1", text: "t", rank: 1 },
      { entryId: "skill1", text: "t", rank: 1 },
    ]);
    expect(() => validateDecisionContract(d, [exp1, edu1, skill1])).not.toThrow();
  });

  it("a non-integer rank (1.5) throws", () => {
    const d = decision([{ entryId: "exp1", text: "t", rank: 1.5 }]);
    expect(() => validateDecisionContract(d, [exp1])).toThrow(DecisionContractError);
  });

  it("NaN rank throws", () => {
    const d = decision([{ entryId: "exp1", text: "t", rank: Number.NaN }]);
    expect(() => validateDecisionContract(d, [exp1])).toThrow(DecisionContractError);
  });

  it("Infinity rank throws", () => {
    const d = decision([{ entryId: "exp1", text: "t", rank: Number.POSITIVE_INFINITY }]);
    expect(() => validateDecisionContract(d, [exp1])).toThrow(DecisionContractError);
  });

  it('a string rank ("1") throws', () => {
    const d = decision([{ entryId: "exp1", text: "t", rank: "1" as unknown as number }]);
    expect(() => validateDecisionContract(d, [exp1])).toThrow(DecisionContractError);
  });

  it("rank 0 throws", () => {
    const d = decision([{ entryId: "exp1", text: "t", rank: 0 }]);
    expect(() => validateDecisionContract(d, [exp1])).toThrow(DecisionContractError);
  });

  it("a negative rank throws", () => {
    const d = decision([{ entryId: "exp1", text: "t", rank: -1 }]);
    expect(() => validateDecisionContract(d, [exp1])).toThrow(DecisionContractError);
  });

  it("unique integer ranks pass", () => {
    const d = decision([
      { entryId: "exp1", text: "t", rank: 1 },
      { entryId: "exp2", text: "t", rank: 2 },
    ]);
    expect(() => validateDecisionContract(d, [exp1, exp2])).not.toThrow();
  });
});

describe("validateLedeRationale — post-assemble", () => {
  // exp1/exp2 share company/role/period so assemble groups them together
  // (one experience group, two members) — same shape as the real fixtures.
  const exp1 = entry("exp1", "experience", expMeta("A"));
  const exp2 = entry("exp2", "experience", expMeta("A"));
  const lib = [exp1, exp2];
  const layout = layoutFor([{ section: "experience", enabled: true }]);

  it("a full-section group whose lowest-rank item has MISSING leadRationale throws", () => {
    const d = decision([
      { entryId: "exp1", text: "t", rank: 1 },
      { entryId: "exp2", text: "t", rank: 2 },
    ]);
    const resume = assemble(d, lib, layout);
    expect(() => validateLedeRationale(resume)).toThrow(DecisionContractError);
  });

  it("a full-section group whose lowest-rank item has an EMPTY leadRationale throws", () => {
    const d = decision([
      { entryId: "exp1", text: "t", rank: 1, leadRationale: "" },
      { entryId: "exp2", text: "t", rank: 2 },
    ]);
    const resume = assemble(d, lib, layout);
    expect(() => validateLedeRationale(resume)).toThrow(DecisionContractError);
  });

  it("a full-section group whose lowest-rank item has a WHITESPACE-only leadRationale throws", () => {
    const d = decision([
      { entryId: "exp1", text: "t", rank: 1, leadRationale: "   " },
      { entryId: "exp2", text: "t", rank: 2 },
    ]);
    const resume = assemble(d, lib, layout);
    expect(() => validateLedeRationale(resume)).toThrow(DecisionContractError);
  });

  it("a full-section lede with a non-blank leadRationale passes", () => {
    const d = decision([
      { entryId: "exp1", text: "t", rank: 1, leadRationale: "Because it's the strongest match." },
      { entryId: "exp2", text: "t", rank: 2 },
    ]);
    const resume = assemble(d, lib, layout);
    expect(() => validateLedeRationale(resume)).not.toThrow();
  });

  it("the requirement follows RANK/assembled-lede, not raw array position", () => {
    // rank:2 item is listed FIRST in the raw array; rank:1 (the true lede)
    // is listed second and carries the rationale. assemble() sorts group
    // items by rank ascending, so the lede is still exp1 (rank 1) — a
    // naive "check raw items[0]" implementation would wrongly flag this.
    const d = decision([
      { entryId: "exp2", text: "t", rank: 2 },
      { entryId: "exp1", text: "t", rank: 1, leadRationale: "Strongest, ranked first." },
    ]);
    const resume = assemble(d, lib, layout);
    expect(() => validateLedeRationale(resume)).not.toThrow();
  });

  it("a NON-lede item missing its rationale in a full-rephrase section does NOT throw", () => {
    // Matches the real recorded fixtures' shape: only the lede (rank 1)
    // carries leadRationale; rank 2+ never do.
    const d = decision([
      { entryId: "exp1", text: "t", rank: 1, leadRationale: "Leads the group." },
      { entryId: "exp2", text: "t", rank: 2 },
    ]);
    const resume = assemble(d, lib, layout);
    expect(() => validateLedeRationale(resume)).not.toThrow();
  });

  it("a lede in a light/none section (education/skill) with NO rationale passes", () => {
    const eduEntries = [
      entry("edu1", "education", { section: "education", school: "S", degree: "D" }),
    ];
    const eduLayout = layoutFor([{ section: "education", enabled: true }]);
    const d = decision([{ entryId: "edu1", text: "t", rank: 1 }]);
    const resume = assemble(d, eduEntries, eduLayout);
    expect(() => validateLedeRationale(resume)).not.toThrow();

    const skillEntries = [entry("skill1", "skill", { section: "skill" })];
    const skillLayout = layoutFor([{ section: "skill", enabled: true }]);
    const skillDecision = decision([{ entryId: "skill1", text: "t", rank: 1 }]);
    const skillResume = assemble(skillDecision, skillEntries, skillLayout);
    expect(() => validateLedeRationale(skillResume)).not.toThrow();
  });
});

describe("fixture reconciliation — recorded decisions never fail the validator", () => {
  const FIXTURES_DIR = path.join(process.cwd(), "test/fixtures/decisions");
  const layout = layoutFor([{ section: "experience", enabled: true }]);

  // Every recorded decision file (manifest.json carries no `decision` field
  // and is skipped).
  const fixtureFiles = readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(path.join(FIXTURES_DIR, name), "utf8")))
    .filter((f): f is { key: string; name?: string; decision: TailorDecision } => "decision" in f);

  it("has at least one recorded fixture to reconcile against", () => {
    expect(fixtureFiles.length).toBeGreaterThan(0);
  });

  it("every recorded fixture passes partition + rank + lede-rationale, checking a non-zero count of full-section ledes", () => {
    let checkedLedeCount = 0;

    for (const fixture of fixtureFiles) {
      expect(() => validateDecisionContract(fixture.decision, SEED_ENTRIES)).not.toThrow();

      const resume = assemble(fixture.decision, SEED_ENTRIES, layout, SECTIONS);
      expect(() => validateLedeRationale(resume)).not.toThrow();

      for (const section of resume.sections) {
        if (SECTIONS[section.section].rephrase !== "full") continue;
        checkedLedeCount += section.groups.length;
      }
    }

    // Each fixture's items are all cloudcase-* SEED_ENTRIES, which share one
    // company/role/period — groupBy collapses them into exactly one
    // experience group per fixture, so this is exactly fixtureFiles.length.
    // Asserting > 0 (rather than an exact count) is what would catch a
    // loosening to a near-vacuous scope, without over-pinning the number.
    expect(checkedLedeCount).toBeGreaterThan(0);
  });
});
