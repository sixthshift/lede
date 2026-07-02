import { describe, it, expect } from "vitest";
import { assemble } from "../src/server/tailor/assemble";
import type { Entry, EntryMeta, Layout, TailorDecision } from "@shared/types";

function entry(id: string, section: Entry["section"], meta: EntryMeta, facts: string[], sortKey: number): Entry {
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

describe("assemble — group ordering", () => {
  it("orders groups by MAX member sortKey (recency), not min or supplied order", () => {
    // Group A: two members, sortKeys supplied out of order [202101, 202503] -> max 202503.
    // Group B: one member, sortKey 202501. Naive min/first-supplied would rank B before A.
    // groupBy keys off company/role/period, so give A and B distinct periods to land in separate groups.
    const meta = (period: string): EntryMeta => ({ section: "experience", company: "Acme", role: "Eng", period });
    const entries = [
      entry("a1", "experience", meta("A"), ["did thing one"], 202101),
      entry("a2", "experience", meta("A"), ["did thing two"], 202503),
      entry("b1", "experience", meta("B"), ["did thing three"], 202501),
    ];

    const d = decision([
      { entryId: "a1", text: "one", rank: 2 },
      { entryId: "a2", text: "two", rank: 1 },
      { entryId: "b1", text: "three", rank: 1 },
    ]);
    const layout = layoutFor([{ section: "experience", enabled: true }]);

    const resume = assemble(d, entries, layout);
    const groups = resume.sections[0]!.groups;
    expect(groups).toHaveLength(2);
    expect(groups[0]!.heading).toBe("Acme · Eng · A");
    expect(groups[1]!.heading).toBe("Acme · Eng · B");
  });
});

describe("assemble — text coercion for rephrase:'none' sections", () => {
  it("overrides model text with the entry's own facts, verbatim", () => {
    const e = entry(
      "cert1",
      "certification",
      { section: "certification", name: "AWS Certified Solutions Architect" },
      ["AWS Certified Solutions Architect"],
      202401,
    );
    const d = decision([{ entryId: "cert1", text: "FABRICATED", rank: 1 }]);
    const layout = layoutFor([{ section: "certification", enabled: true }]);

    const resume = assemble(d, [e], layout);
    expect(resume.sections[0]!.groups[0]!.items[0]!.text).toBe("AWS Certified Solutions Architect");
  });

  it("renders an empty-facts entry as text:''", () => {
    const e = entry("cert2", "certification", { section: "certification", name: "Some Cert" }, [], 202401);
    const d = decision([{ entryId: "cert2", text: "FABRICATED", rank: 1 }]);
    const layout = layoutFor([{ section: "certification", enabled: true }]);

    const resume = assemble(d, [e], layout);
    expect(resume.sections[0]!.groups[0]!.items[0]!.text).toBe("");
  });
});

describe("assemble — section order & filtering follow layout", () => {
  const cert = entry("cert1", "certification", { section: "certification", name: "Cert" }, ["fact"], 202401);
  const award = entry("award1", "award", { section: "award", title: "Award" }, ["fact"], 202301);
  const pub = entry("pub1", "publication", { section: "publication", title: "Pub" }, ["fact"], 202201);

  it("orders sections by layout order, independent of entries/items insertion order", () => {
    // entries/items inserted award (A) then cert (B); layout lists cert before award.
    const entries = [award, cert];
    const d = decision([
      { entryId: "award1", text: "a", rank: 1 },
      { entryId: "cert1", text: "b", rank: 1 },
    ]);
    const layout = layoutFor([
      { section: "certification", enabled: true },
      { section: "award", enabled: true },
    ]);

    const resume = assemble(d, entries, layout);
    expect(resume.sections.map((s) => s.section)).toEqual(["certification", "award"]);
  });

  it("omits a section present in entries/decision but disabled in layout", () => {
    const entries = [award, cert, pub];
    const d = decision([
      { entryId: "award1", text: "a", rank: 1 },
      { entryId: "cert1", text: "b", rank: 1 },
      { entryId: "pub1", text: "c", rank: 1 },
    ]);
    const layout = layoutFor([
      { section: "certification", enabled: true },
      { section: "award", enabled: true },
      { section: "publication", enabled: false },
    ]);

    const resume = assemble(d, entries, layout);
    expect(resume.sections.map((s) => s.section)).toEqual(["certification", "award"]);
  });
});

describe("assemble — items within a group order by rank", () => {
  const meta: EntryMeta = { section: "experience", company: "Acme", role: "Eng", period: "2020-2023" };
  const e1 = entry("e1", "experience", meta, ["fact one"], 202001);
  const e2 = entry("e2", "experience", meta, ["fact two"], 202001);
  const layout = layoutFor([{ section: "experience", enabled: true }]);

  it("orders items lowest-rank-first (the lede)", () => {
    const d = decision([
      { entryId: "e1", text: "one", rank: 2 },
      { entryId: "e2", text: "two", rank: 1 },
    ]);
    const resume = assemble(d, [e1, e2], layout);
    expect(resume.sections[0]!.groups[0]!.items.map((i) => i.entryId)).toEqual(["e2", "e1"]);
  });

  it("flipping the ranks flips the leading item", () => {
    const d = decision([
      { entryId: "e1", text: "one", rank: 1 },
      { entryId: "e2", text: "two", rank: 2 },
    ]);
    const resume = assemble(d, [e1, e2], layout);
    expect(resume.sections[0]!.groups[0]!.items.map((i) => i.entryId)).toEqual(["e1", "e2"]);
  });
});
