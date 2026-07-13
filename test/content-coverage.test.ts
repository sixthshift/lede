import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STOP_WORDS,
  extractRawJdTerms,
  assembleCandidates,
  classifyCoverage,
  type CoverageCandidate,
} from "../src/shared/content-coverage";
import { uncoveredSignals } from "../src/shared/signal-coverage";
import type { Entry, JDSignals, TailoredResume } from "../src/shared/types";

const contentCoveragePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/shared/content-coverage.ts",
);
const contentCoverageSrc = readFileSync(contentCoveragePath, "utf8");

// ── fixture builders ──

function entry(id: string, facts: string[]): Entry {
  return {
    id,
    section: "skill",
    meta: { section: "skill" },
    facts,
    tags: [],
    sortKey: 0,
  };
}

function signals(weights: string[], hardRequirements: string[] = []): JDSignals {
  return { roleLevel: "senior", weights, hardRequirements };
}

// ═══ classifyCoverage — bucket contrast + flips ═══

describe("classifyCoverage: bucket contrast", () => {
  it("term with all tokens present in extractedText -> on-page, empty entryIds", () => {
    const candidates: CoverageCandidate[] = [{ term: "API versioning", provenance: "signal" }];
    const rows = classifyCoverage({
      extractedText: ["Shipped API versioning across the platform"],
      candidates,
      entries: [],
    });
    expect(rows).toEqual([
      { term: "API versioning", provenance: "signal", bucket: "on-page", entryIds: [] },
    ]);
  });

  it("term absent from text but all tokens in one entry's facts -> in-facts, that entry's id in entryIds", () => {
    const candidates: CoverageCandidate[] = [
      { term: "container orchestration", provenance: "signal" },
    ];
    const e1 = entry("e1", ["Ran container orchestration for a fleet of services"]);
    const rows = classifyCoverage({
      extractedText: ["Generic resume text with no overlap"],
      candidates,
      entries: [e1],
    });
    expect(rows).toEqual([
      {
        term: "container orchestration",
        provenance: "signal",
        bucket: "in-facts",
        entryIds: ["e1"],
      },
    ]);
  });

  it("flip: same term, once present in extractedText -> on-page, entryIds empty (even though the entry still has it)", () => {
    const candidates: CoverageCandidate[] = [
      { term: "container orchestration", provenance: "signal" },
    ];
    const e1 = entry("e1", ["Ran container orchestration for a fleet of services"]);
    const rows = classifyCoverage({
      extractedText: ["Led container orchestration initiatives company-wide"],
      candidates,
      entries: [e1],
    });
    expect(rows[0]).toEqual({
      term: "container orchestration",
      provenance: "signal",
      bucket: "on-page",
      entryIds: [],
    });
  });

  it("term absent from text and every entry's facts -> unsupported, empty entryIds", () => {
    const candidates: CoverageCandidate[] = [{ term: "distributed systems", provenance: "signal" }];
    const rows = classifyCoverage({
      extractedText: ["Generic resume text"],
      candidates,
      entries: [entry("e1", ["Unrelated fact about testing"])],
    });
    expect(rows[0]).toEqual({
      term: "distributed systems",
      provenance: "signal",
      bucket: "unsupported",
      entryIds: [],
    });
  });

  it("flip: adding an entry whose facts contain the term -> in-facts", () => {
    const candidates: CoverageCandidate[] = [{ term: "distributed systems", provenance: "signal" }];
    const rows = classifyCoverage({
      extractedText: ["Generic resume text"],
      candidates,
      entries: [
        entry("e1", ["Unrelated fact about testing"]),
        entry("e2", ["Owned our distributed systems architecture"]),
      ],
    });
    expect(rows[0].bucket).toBe("in-facts");
    expect(rows[0].entryIds).toEqual(["e2"]);
  });

  it("entryIds pinned exactly to the ONE matching entry among several (not all ids, not just contains)", () => {
    const candidates: CoverageCandidate[] = [{ term: "distributed systems", provenance: "signal" }];
    const rows = classifyCoverage({
      extractedText: ["Generic resume text"],
      candidates,
      entries: [
        entry("e1", ["Unrelated fact about testing"]),
        entry("e2", ["Owned our distributed systems architecture"]),
        entry("e3", ["Another unrelated fact about design"]),
      ],
    });
    expect(rows[0].entryIds).toEqual(["e2"]);
  });
});

// ═══ classifyCoverage — match rule, BOTH sides, rejected-variant tests ═══

describe("classifyCoverage: match rule (page-side)", () => {
  it("one-incidental-token multi-token term is NOT on-page (fails under any-shared-token)", () => {
    // "container deposit tracking" shares only "container" with the text below;
    // an any-shared-token matcher would wrongly call this on-page.
    const candidates: CoverageCandidate[] = [
      { term: "container deposit tracking", provenance: "signal" },
    ];
    const rows = classifyCoverage({
      extractedText: ["Owned our container rollout end to end"],
      candidates,
      entries: [],
    });
    expect(rows[0].bucket).not.toBe("on-page");
  });

  it("multi-token match split by real word order/spacing still reads on-page (fails under whole-phrase substring)", () => {
    // "design system" candidate; the extracted text is line-broken/reordered
    // the way a PDF extraction would render it, so a whole-phrase substring
    // check would miss it.
    const candidates: CoverageCandidate[] = [{ term: "design system", provenance: "signal" }];
    const rows = classifyCoverage({
      extractedText: ["Our design language and component system evolved over two years"],
      candidates,
      entries: [],
    });
    expect(rows[0].bucket).toBe("on-page");
  });
});

describe("classifyCoverage: match rule (facts-side)", () => {
  it("one-incidental-token multi-token term against facts is unsupported, NOT in-facts (fails if facts side is looser)", () => {
    const candidates: CoverageCandidate[] = [
      { term: "container deposit tracking", provenance: "signal" },
    ];
    const rows = classifyCoverage({
      extractedText: ["Nothing relevant here"],
      candidates,
      entries: [entry("e1", ["Owned our container rollout end to end"])],
    });
    expect(rows[0].bucket).toBe("unsupported");
    expect(rows[0].entryIds).toEqual([]);
  });
});

describe("classifyCoverage: case-insensitivity, both sides varied", () => {
  it("Aws (term case) matches aws (text case) — case-insensitive, >=2-char floor", () => {
    const candidates: CoverageCandidate[] = [{ term: "Aws", provenance: "raw-jd" }];
    const rows = classifyCoverage({
      extractedText: ["Deployed services on aws infrastructure"],
      candidates,
      entries: [],
    });
    expect(rows[0].bucket).toBe("on-page");
  });
});

describe("classifyCoverage: >=2-char match floor, dedicated", () => {
  it("2-char token ML matches, surviving a >=2 floor (fails under a >=3 or >=4 floor)", () => {
    const candidates: CoverageCandidate[] = [{ term: "ML", provenance: "raw-jd" }];
    const rows = classifyCoverage({
      extractedText: ["Shipped ML models to production"],
      candidates,
      entries: [],
    });
    expect(rows[0].bucket).toBe("on-page");
  });

  it("2-char token Go matches inside facts text, surviving a >=2 floor", () => {
    const candidates: CoverageCandidate[] = [{ term: "Go", provenance: "raw-jd" }];
    const rows = classifyCoverage({
      extractedText: ["Nothing relevant here"],
      candidates,
      entries: [entry("e1", ["Wrote backend services in Go"])],
    });
    expect(rows[0].bucket).toBe("in-facts");
  });
});

// ═══ disclosed no-synonym limit ═══

describe("classifyCoverage: disclosed no-synonym/abbreviation limit", () => {
  it("postgres (facts) vs postgresql (JD term) -> unsupported (no synonym matching, by design)", () => {
    const candidates: CoverageCandidate[] = [{ term: "postgresql", provenance: "raw-jd" }];
    const rows = classifyCoverage({
      extractedText: ["Nothing relevant here"],
      candidates,
      entries: [entry("e1", ["Administered a postgres database for years"])],
    });
    expect(rows[0].bucket).toBe("unsupported");
  });

  it("k8s (facts) vs kubernetes (JD term) -> unsupported (a second, unrelated abbreviation pair)", () => {
    const candidates: CoverageCandidate[] = [{ term: "kubernetes", provenance: "raw-jd" }];
    const rows = classifyCoverage({
      extractedText: ["Nothing relevant here"],
      candidates,
      entries: [entry("e1", ["Ran k8s clusters in production"])],
    });
    expect(rows[0].bucket).toBe("unsupported");
  });

  it("source contains no hardcoded synonym literal (no per-string deny-list)", () => {
    expect(contentCoverageSrc).not.toMatch(/["']postgres["']/i);
    expect(contentCoverageSrc).not.toMatch(/["']postgresql["']/i);
    expect(contentCoverageSrc).not.toMatch(/["']k8s["']/i);
    expect(contentCoverageSrc).not.toMatch(/["']kubernetes["']/i);
  });

  it("documents the no-synonym limit in a comment", () => {
    expect(contentCoverageSrc.toLowerCase()).toMatch(/synonym/);
  });
});

// ═══ candidate assembly ═══

describe("assembleCandidates: signals portion is the RAW union, not uncoveredSignals()", () => {
  it("a rationale-covered signal is still present in candidates (proves raw union) yet absent from uncoveredSignals()", () => {
    const sigs = signals(["platform SDK productization"]);
    const jd = "We need someone with platform experience.";
    const candidates = assembleCandidates(sigs, jd);
    expect(candidates.map((c) => c.term)).toContain("platform SDK productization");

    // Same signal, but the resume's lede rationale NAMES it — so the
    // rationale-filtered uncoveredSignals() return is empty, while
    // assembleCandidates still includes the raw term. This is the proof
    // that assembleCandidates does not couple to uncoveredSignals().
    const resume: TailoredResume = {
      signals: sigs,
      summary: "summary",
      sections: [
        {
          section: "experience",
          groups: [
            {
              heading: "group",
              leadRationale: "led the platform SDK effort",
              items: [{ entryId: "e1", text: "shipped a client SDK", rank: 1 }],
            },
          ],
        },
      ],
      cut: [],
    };
    expect(uncoveredSignals(resume)).not.toContain("platform SDK productization");
    expect(uncoveredSignals(resume)).toEqual([]);
    // yet the raw candidate set still names it
    expect(candidates.map((c) => c.term)).toContain("platform SDK productization");
  });

  it("roleLevel is excluded from the signal-derived candidate set", () => {
    const sigs: JDSignals = {
      roleLevel: "principal engineer",
      weights: ["testing rigor"],
      hardRequirements: [],
    };
    const candidates = assembleCandidates(sigs, "generic filler text");
    expect(candidates.map((c) => c.term)).not.toContain("principal engineer");
  });
});

describe("STOP_WORDS + raw-JD extraction", () => {
  it("STOP_WORDS.has('experience') is true (direct unit assertion)", () => {
    expect(STOP_WORDS.has("experience")).toBe(true);
  });

  it("extraction function references the STOP_WORDS identifier (no parallel inline blacklist)", () => {
    expect(contentCoverageSrc).toMatch(/STOP_WORDS/);
    // the function body of extractRawJdTerms must itself use it, not just declare it
    const fnStart = contentCoverageSrc.indexOf("export function extractRawJdTerms");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = contentCoverageSrc.slice(fnStart, fnStart + 1200);
    expect(fnBody).toMatch(/STOP_WORDS\.has/);
  });

  it("a generics-stuffed JD sentence yields >=2 surviving real skills of different shapes (plain noun + bigram/acronym) in top-15, generics absent", () => {
    const jd =
      "We are looking for a strong candidate to join our team. " +
      "The role requires experience with responsibilities across years of work. " +
      "Ability to work with a distributed team is required. " +
      "Must have strong experience with Kubernetes and design system thinking.";
    const terms = extractRawJdTerms(jd);
    expect(terms).toContain("kubernetes"); // plain noun-skill
    expect(terms).toContain("design system"); // bigram
    for (const generic of [
      "looking",
      "candidate",
      "join",
      "team",
      "role",
      "experience",
      "responsibilities",
      "years",
      "work",
      "strong",
      "ability",
      "required",
    ]) {
      expect(terms).not.toContain(generic);
    }
  });
});

describe("acronym rule: shape check, not an allowlist", () => {
  it("a made-up uppercase token (ZQX) becomes a candidate", () => {
    const terms = extractRawJdTerms("We require deep ZQX proficiency for this position.");
    expect(terms).toContain("zqx");
  });

  it("a made-up lowercase short token (zqx) does not become a candidate", () => {
    const terms = extractRawJdTerms("We require deep zqx proficiency for this position.");
    expect(terms).not.toContain("zqx");
  });

  it("a common lowercase short word (go) does not become a candidate", () => {
    const terms = extractRawJdTerms("You will go above and beyond in this role.");
    expect(terms).not.toContain("go");
  });
});

describe("cap ordering: frequency beats first appearance", () => {
  it("a high-frequency term appearing LATE is kept while a low-frequency term appearing EARLY is dropped", () => {
    // "uniquely" appears EARLIEST but only once (freq=1) — an appearance-only
    // ranking would rank it #1 and keep it easily. 15 filler skills each
    // appear twice (freq=2), crowding the cap. "recurrent" appears LAST in
    // the JD (worst position) but 3 times (freq=3) — an appearance-only
    // ranking would rank it last and drop it. Frequency-primary ranking
    // flips both: the 15 freq=2 fillers plus freq=3 "recurrent" already fill
    // the 15-slot cap, so freq=1 "uniquely" has no room left despite being
    // earliest — proving frequency, not position, decides.
    const fillers = Array.from(
      { length: 15 },
      (_, i) => `fillerskill${i} and fillerskill${i}`,
    ).join(" and ");
    const jd = `We value uniquely rare talent. ${fillers} and recurrent recurrent recurrent expertise.`;
    const terms = extractRawJdTerms(jd);
    expect(terms.length).toBeLessThanOrEqual(15);
    expect(terms).toContain("recurrent");
    expect(terms).not.toContain("uniquely");
  });
});

describe("provenance correctness", () => {
  it("signal-only term tags signal", () => {
    const sigs = signals(["platform SDK productization"]);
    const candidates = assembleCandidates(sigs, "an unrelated JD with no overlap at all");
    const row = candidates.find((c) => c.term === "platform SDK productization");
    expect(row?.provenance).toBe("signal");
  });

  it("raw-jd-only term tags raw-jd", () => {
    const sigs = signals([]);
    const candidates = assembleCandidates(sigs, "We require strong Kubernetes experience.");
    const row = candidates.find((c) => c.term.toLowerCase() === "kubernetes");
    expect(row?.provenance).toBe("raw-jd");
  });

  it("a term present in both sources tags signal, even with DIFFERING casing between the two occurrences (proves term-keyed case-folded dedup, not exact-string/position)", () => {
    const sigs = signals(["Kubernetes"]);
    const candidates = assembleCandidates(
      sigs,
      "We require strong kubernetes experience across the team.",
    );
    const matches = candidates.filter((c) => c.term.toLowerCase() === "kubernetes");
    expect(matches).toHaveLength(1);
    expect(matches[0].provenance).toBe("signal");
    expect(matches[0].term).toBe("Kubernetes"); // signal's own casing wins
  });
});

// ═══ read-only tripwire ═══

describe("read-only tripwire: src/server/tailor never imports content-coverage", () => {
  const tailorDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server/tailor");
  const files = readdirSync(tailorDir).filter((f) => f.endsWith(".ts"));

  it("scans every file under src/server/tailor/ (sanity: the dir is non-empty)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} contains no import/export specifier referencing content-coverage (static, type-only, dynamic, re-export, relative or @shared)`, () => {
      const src = readFileSync(path.join(tailorDir, file), "utf8");
      // Matches: import ... from '...content-coverage...'; export ... from '...';
      // import('...content-coverage...'); require('...content-coverage...')
      // in any quote style, absolute/relative/alias form.
      expect(src).not.toMatch(/content-coverage/);
    });
  }

  it("no @shared barrel exists that could re-export content-coverage", () => {
    const sharedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/shared");
    const sharedFiles = readdirSync(sharedDir);
    const barrelCandidates = sharedFiles.filter((f) => /^index\.tsx?$/.test(f));
    expect(barrelCandidates).toEqual([]);
  });
});

// ═══ client-safety ═══

describe("client-safety", () => {
  it("content-coverage.ts contains no node:* import", () => {
    expect(contentCoverageSrc).not.toMatch(/from\s+["']node:/);
  });
});
