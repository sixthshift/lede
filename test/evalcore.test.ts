import { describe, it, expect } from "vitest";
import { hashKey, CONTRAST_JDS, flipPredicate, tagShuffle } from "../src/server/tailor/evalcore";
import { SEED_ENTRIES } from "../src/server/seed";
import type { Entry, TailoredResume } from "@shared/types";

// ── hashKey ──

describe("hashKey", () => {
  it("is deterministic and order-insensitive over entries", () => {
    const jd = "some job description";
    const shuffled = [...SEED_ENTRIES].reverse();
    expect(hashKey(jd, SEED_ENTRIES)).toBe(hashKey(jd, shuffled));
  });

  it("changes when the jd changes", () => {
    expect(hashKey("jd one", SEED_ENTRIES)).not.toBe(hashKey("jd two", SEED_ENTRIES));
  });

  it("changes when entry content changes", () => {
    const mutated = SEED_ENTRIES.map((e, i) => (i === 0 ? { ...e, facts: [...e.facts, "new fact"] } : e));
    expect(hashKey("jd", SEED_ENTRIES)).not.toBe(hashKey("jd", mutated));
  });
});

// ── anti-leakage ──

describe("CONTRAST_JDS — anti-leakage", () => {
  const byId = new Map(SEED_ENTRIES.map((e) => [e.id, e]));

  function longSubstrings(text: string, minLen: number): string[] {
    const subs: string[] = [];
    for (let start = 0; start + minLen <= text.length; start++) {
      subs.push(text.slice(start, start + minLen));
    }
    return subs;
  }

  for (const { name, jd, target } of CONTRAST_JDS) {
    it(`${name}: jd does not name or quote its target entry (${target})`, () => {
      const entry = byId.get(target);
      expect(entry, `target entry ${target} must exist in SEED_ENTRIES`).toBeDefined();

      expect(jd.toLowerCase().includes(target.toLowerCase())).toBe(false);

      const jdLower = jd.toLowerCase();
      const factsBlob = entry!.facts.join(" ").toLowerCase();
      const dangerousSubstrings = longSubstrings(factsBlob, 12).filter((s) => jdLower.includes(s));
      expect(dangerousSubstrings).toEqual([]);
    });
  }

  it("covers exactly the 3 §22 targets, mutually distinct", () => {
    const targets = CONTRAST_JDS.map((c) => c.target);
    expect(new Set(targets).size).toBe(3);
    expect(new Set(targets)).toEqual(
      new Set(["cloudcase-platform-sdk", "cloudcase-rules-engine", "cloudcase-frontend-rewrite"]),
    );
  });
});

// ── flipPredicate ──

function resumeWithGroups(
  groups: TailoredResume["sections"][number]["groups"],
  signals: TailoredResume["signals"] = { roleLevel: "senior", weights: ["developer velocity"], hardRequirements: [] },
  cut: TailoredResume["cut"] = [],
): TailoredResume {
  return {
    signals,
    summary: "Summary.",
    sections: [{ section: "experience", groups }],
    cut,
  };
}

describe("flipPredicate", () => {
  it("leads:true, rationaleNamesSignal:true when target is items[0] with a signal-naming rationale", () => {
    const resume = resumeWithGroups([
      {
        heading: "Acme",
        leadRationale: "Leads with this because it directly demonstrates developer velocity improvements.",
        items: [
          { entryId: "target", text: "..." },
          { entryId: "other", text: "..." },
        ],
      },
    ]);
    const result = flipPredicate(resume, "target");
    expect(result).toEqual({ leads: true, rationaleNamesSignal: true });
  });

  it("leads:false when the target is not the leading item", () => {
    const resume = resumeWithGroups([
      {
        heading: "Acme",
        leadRationale: "Leads with this because it directly demonstrates developer velocity improvements.",
        items: [
          { entryId: "other", text: "..." },
          { entryId: "target", text: "..." },
        ],
      },
    ]);
    const result = flipPredicate(resume, "target");
    expect(result.leads).toBe(false);
  });

  it("leads:false when the target leads a group but is also listed in cut", () => {
    const resume = resumeWithGroups(
      [
        {
          heading: "Acme",
          leadRationale: "Leads with this because it directly demonstrates developer velocity improvements.",
          items: [{ entryId: "target", text: "..." }],
        },
      ],
      undefined,
      [{ entryId: "target", reason: "buried" }],
    );
    const result = flipPredicate(resume, "target");
    expect(result.leads).toBe(false);
  });

  it("rationaleNamesSignal:false when the leadRationale is generic filler", () => {
    const resume = resumeWithGroups([
      {
        heading: "Acme",
        leadRationale: "This is the strongest and most relevant experience for this role.",
        items: [{ entryId: "target", text: "..." }],
      },
    ]);
    const result = flipPredicate(resume, "target");
    expect(result.leads).toBe(true);
    expect(result.rationaleNamesSignal).toBe(false);
  });

  it("rationaleNamesSignal:false when leadRationale is empty", () => {
    const resume = resumeWithGroups([
      { heading: "Acme", leadRationale: "", items: [{ entryId: "target", text: "..." }] },
    ]);
    const result = flipPredicate(resume, "target");
    expect(result.leads).toBe(true);
    expect(result.rationaleNamesSignal).toBe(false);
  });
});

// ── tagShuffle ──

describe("tagShuffle", () => {
  it("permutes tags across entries while preserving id/facts/sortKey/framings, without mutating the input", () => {
    const original = structuredClone(SEED_ENTRIES);
    const shuffled = tagShuffle(SEED_ENTRIES);

    // input unmutated
    expect(SEED_ENTRIES).toEqual(original);

    // distinct deep copy
    expect(shuffled).not.toBe(SEED_ENTRIES);
    shuffled.forEach((e, i) => expect(e).not.toBe(SEED_ENTRIES[i]));

    // identity fields preserved
    shuffled.forEach((e, i) => {
      const src = SEED_ENTRIES[i]!;
      expect(e.id).toBe(src.id);
      expect(e.meta).toEqual(src.meta);
      expect(e.facts).toEqual(src.facts);
      expect(e.sortKey).toBe(src.sortKey);
      expect(e.framings).toEqual(src.framings);
    });

    // tags actually permuted: every entry's tags now equal some OTHER entry's original tags
    const originalTagSets = SEED_ENTRIES.map((e) => JSON.stringify(e.tags));
    shuffled.forEach((e, i) => {
      expect(JSON.stringify(e.tags)).not.toBe(originalTagSets[i]);
      expect(originalTagSets).toContain(JSON.stringify(e.tags));
    });

    // the multiset of tag arrays is preserved (a true permutation, nothing lost/added)
    const shuffledTagSets = shuffled.map((e) => JSON.stringify(e.tags)).sort();
    expect(shuffledTagSets).toEqual([...originalTagSets].sort());
  });

  it("is a no-op-safe permutation on a single-entry array (can't avoid a fixed point)", () => {
    const single: Entry[] = [SEED_ENTRIES[0]!];
    const shuffled = tagShuffle(single);
    expect(shuffled).toEqual(single);
    expect(shuffled[0]).not.toBe(single[0]);
  });
});
