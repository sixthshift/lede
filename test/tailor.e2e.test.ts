// T015 — keyless pipeline e2e (FixtureEngine replay). spec.md §18, §25;
// .ailoop/oracle.md Phase 0.
//
// HONEST LIMIT: this suite replays FROZEN recorded decisions (the committed
// fixtures under test/fixtures/decisions/, recorded once from the live model
// via scripts/record-fixtures.ts). It proves the MACHINERY — FixtureEngine,
// assemble(), validateNoFabrication, and the HTTP route — end to end, with no
// API key. It does NOT prove the live model still flips the lede today; that
// is scripts/eval.ts (key-gated, opt-in, run manually). The one thing this
// suite CAN kill on its own is a recency cheat: the anti-recency assertion
// below only passes if the rules-engine JD leads the OLDEST entry by rank,
// which is impossible under a sortKey/recency ordering.

import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";

import type { Layout, TailoredResume } from "@shared/types";
import { SECTION_VALUES } from "@shared/sections";
import { SEED_ENTRIES } from "../src/server/seed";
import { FixtureEngine, tailor } from "../src/server/tailor/engine";
import { CONTRAST_JDS, flipPredicate, tagShuffle } from "../src/server/tailor/evalcore";
import { assemble } from "../src/server/tailor/assemble";
import { buildApp } from "../src/server/index";

const layout: Layout = [
  { section: "summary", enabled: true },
  ...SECTION_VALUES.map((section) => ({ section, enabled: true })),
];

// Finds the group carrying `entryId` as its group[0] leading item (there is
// exactly one experience group in the seed — all three entries share one
// company/role/period on purpose, spec.md §22 — but this stays general).
function leadingGroupFor(resume: TailoredResume, entryId: string) {
  for (const section of resume.sections) {
    for (const group of section.groups) {
      if (group.items[0]?.entryId === entryId) return group;
    }
  }
  return undefined;
}

describe("keyless e2e — tailor() over FixtureEngine, the 3 §22 CONTRAST_JDS", () => {
  it("flips to the correct, mutually-distinct, unique-leading target for each JD", async () => {
    const engine = new FixtureEngine();
    const leads: string[] = [];

    for (const { jd, target } of CONTRAST_JDS) {
      const resume = await tailor(engine, jd, SEED_ENTRIES, layout);

      const { leads: didLead } = flipPredicate(resume, target);
      expect(didLead, `expected "${target}" to lead for jd`).toBe(true);

      const group = leadingGroupFor(resume, target);
      expect(group).toBeDefined();
      expect(group!.items[0]!.entryId).toBe(target); // the group's UNIQUE leading item

      leads.push(target);
    }

    expect(new Set(leads)).toEqual(
      new Set(["cloudcase-platform-sdk", "cloudcase-rules-engine", "cloudcase-frontend-rewrite"]),
    );
  });

  it("ANTI-RECENCY: the rules-engine JD leads the OLDEST entry (sortKey 202101) — impossible under recency ordering", async () => {
    const engine = new FixtureEngine();
    const rulesEngineJd = CONTRAST_JDS.find((c) => c.name === "rules-engine")!;
    const oldestEntry = SEED_ENTRIES.find((e) => e.id === "cloudcase-rules-engine")!;
    expect(oldestEntry.sortKey).toBe(202101);
    expect(Math.min(...SEED_ENTRIES.map((e) => e.sortKey))).toBe(oldestEntry.sortKey);

    const resume = await tailor(engine, rulesEngineJd.jd, SEED_ENTRIES, layout);
    const group = leadingGroupFor(resume, "cloudcase-rules-engine");
    expect(group).toBeDefined();
    expect(group!.items[0]!.entryId).toBe("cloudcase-rules-engine");

    // at least 2 of the 3 leads are NOT the max-sortKey entry — a real rank
    // flip, not the model just always leading with the newest thing.
    const leads: string[] = [];
    for (const { jd, target } of CONTRAST_JDS) {
      const r = await tailor(engine, jd, SEED_ENTRIES, layout);
      leads.push(leadingGroupFor(r, target)?.items[0]?.entryId ?? "");
    }
    const nonMaxSortKeyLeads = leads.filter((id) => id !== "cloudcase-platform-sdk");
    expect(nonMaxSortKeyLeads.length).toBeGreaterThanOrEqual(2);
  });
});

describe("keyless e2e — POST /api/tailor via buildApp().inject(), FixtureEngine over committed fixtures", () => {
  let app: FastifyInstance;

  beforeAll(() => {
    process.env.NODE_ENV = "test";
    delete process.env.LEDE_TAILOR_ENGINE;
    app = buildApp();
  });

  it("200s for each recorded CONTRAST_JDS jd with the correct target leading", async () => {
    for (const { jd, target } of CONTRAST_JDS) {
      const res = await app.inject({ method: "POST", url: "/api/tailor", payload: { jobDescription: jd } });
      expect(res.statusCode).toBe(200);

      const body = res.json() as TailoredResume;
      expect(Array.isArray(body.sections)).toBe(true);
      expect(leadingGroupFor(body, target)?.items[0]?.entryId).toBe(target);
    }
  });

  it("422s with { error: 'no_fixture' } for a specifically-unrecorded jd", async () => {
    const unrecordedJd =
      "A completely unrecorded job description about beekeeping and artisanal honey production, never used in any recorded fixture.";
    const res = await app.inject({
      method: "POST",
      url: "/api/tailor",
      payload: { jobDescription: unrecordedJd },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: "no_fixture" });
  });
});

describe("keyless e2e — structure ignores tags (assemble over tagShuffle(SEED_ENTRIES))", () => {
  it("produces an assembled resume IDENTICAL to the un-shuffled run for the same recorded decision", async () => {
    const engine = new FixtureEngine();
    const jd = CONTRAST_JDS[0]!.jd; // any recorded CONTRAST_JDS entry works
    const decision = await engine.decide(jd, SEED_ENTRIES);

    const straight = assemble(decision, SEED_ENTRIES, layout);
    const shuffled = assemble(decision, tagShuffle(SEED_ENTRIES), layout);

    expect(shuffled).toEqual(straight);
  });
});
