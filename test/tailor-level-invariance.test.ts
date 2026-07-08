// Anti-scoring control for skill/language meta.level (§31.4, extends the §1
// tag-scoring tripwire): level is CONTENT the FORMAT layer renders later
// (levelDisplay, format-v2.ts) — tailoring must stay completely blind to it.
// Mirrors engine.test.ts's "FixtureEngine — hash keying" pattern: two
// libraries identical in every field EXCEPT skill/language level values get
// their own recorded fixture (FixtureEngine keys on hashKey(jd, entries), so
// differing entries need differing keys), both holding the SAME decision.
// If assemble()/tailor() ever started reading level, the two resulting
// resumes would diverge even though the decision is byte-identical.
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Entry, Layout, TailorDecision } from "@shared/types";
import { hashKey } from "../src/server/tailor/evalcore";
import { FixtureEngine, tailor } from "../src/server/tailor/engine";

const JD = "job description — skill/language level invariance control";

const LAYOUT: Layout = [
  { section: "skill", enabled: true },
  { section: "language", enabled: true },
];

function skillEntry(id: string, level: number, sortKey: number): Entry {
  return {
    id,
    section: "skill",
    meta: { section: "skill", category: "Backend", level },
    facts: [id],
    tags: [],
    sortKey,
  };
}

function languageEntry(id: string, level: number, sortKey: number): Entry {
  return {
    id,
    section: "language",
    meta: { section: "language", level },
    facts: [id],
    tags: [],
    sortKey,
  };
}

// Same ids/facts/category/sortKey/tags in both libraries — level is the ONLY
// difference, and it's not just reordered, it's a genuinely different value
// per entry (so a level-driven sort or filter would visibly change output).
const LIBRARY_A: Entry[] = [
  skillEntry("skill-rust", 1, 202401),
  skillEntry("skill-go", 3, 202402),
  skillEntry("skill-python", 5, 202403),
  languageEntry("lang-spanish", 1, 202301),
  languageEntry("lang-french", 5, 202302),
];

const LIBRARY_B: Entry[] = [
  skillEntry("skill-rust", 5, 202401),
  skillEntry("skill-go", 2, 202402),
  skillEntry("skill-python", 1, 202403),
  languageEntry("lang-spanish", 4, 202301),
  languageEntry("lang-french", 2, 202302),
];

// One decision, reused verbatim for both libraries — ranks are deliberately
// NOT correlated with either library's level values, so if level ever leaked
// into ordering the two resumes would stop matching this shared expectation.
function decision(): TailorDecision {
  return {
    signals: { roleLevel: "senior", weights: ["backend"], hardRequirements: [] },
    summary: "Backend engineer with broad language skills.",
    items: [
      { entryId: "skill-python", text: "python", rank: 1 },
      { entryId: "skill-rust", text: "rust", rank: 2 },
      { entryId: "skill-go", text: "go", rank: 3 },
      { entryId: "lang-french", text: "french", rank: 1 },
      { entryId: "lang-spanish", text: "spanish", rank: 2 },
    ],
    cut: [],
  };
}

describe("tailor pipeline — blind to skill/language meta.level (§31.4 anti-scoring control)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "lede-level-invariance-"));
    const shared = decision();
    writeFileSync(
      path.join(dir, "library-a.json"),
      JSON.stringify({ key: hashKey(JD, LIBRARY_A), name: "library-a", decision: shared }),
    );
    writeFileSync(
      path.join(dir, "library-b.json"),
      JSON.stringify({ key: hashKey(JD, LIBRARY_B), name: "library-b", decision: shared }),
    );
  });

  it("produces an identical resume (selection + order) for libraries differing only in level", async () => {
    const engine = new FixtureEngine(dir);

    const resumeA = await tailor(engine, JD, LIBRARY_A, LAYOUT);
    const resumeB = await tailor(engine, JD, LIBRARY_B, LAYOUT);

    expect(resumeA).toEqual(resumeB);
  });

  it("is non-vacuous: the two libraries really do carry different level values", () => {
    const levelsA = [...LIBRARY_A].map((e) => (e.meta as { level?: number }).level);
    const levelsB = [...LIBRARY_B].map((e) => (e.meta as { level?: number }).level);
    expect(levelsA).not.toEqual(levelsB);
  });

  it("is non-vacuous: selection/order is actually decision-driven, not incidentally identical", async () => {
    const engine = new FixtureEngine(dir);
    const resume = await tailor(engine, JD, LIBRARY_A, LAYOUT);

    const skillOrder = resume.sections
      .find((s) => s.section === "skill")!
      .groups.flatMap((g) => g.items.map((i) => i.entryId));
    // rank order (python=1, rust=2, go=3), NOT level order (rust=1, go=3, python=5).
    expect(skillOrder).toEqual(["skill-python", "skill-rust", "skill-go"]);

    // language is order:"manual" with no groupBy — ordered by entry.sortKey,
    // not by decision rank (spanish=202301 < french=202302), same either way
    // regardless of level.
    const languageOrder = resume.sections
      .find((s) => s.section === "language")!
      .groups.flatMap((g) => g.items.map((i) => i.entryId));
    expect(languageOrder).toEqual(["lang-spanish", "lang-french"]);
  });
});
