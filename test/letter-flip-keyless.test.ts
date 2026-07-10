// T06 — letter-flip contrast guard over COMMITTED fixtures (repair).
//
// Phase 0 requires the letter-flip contrast to replay keylessly, but until
// now it was exercised only over synthetic hand-rolled data
// (test/evalcore-letter.test.ts) and over the live model (scripts/eval-letter.ts,
// key-gated). Nothing asserted letterFlipPredicate/letterFlipContrast over the
// actual recorded fixtures in test/fixtures/letters/, and nothing read
// manifest.json's `leadingEntryId` at all — a hand-edited fixture (wrong lead
// entry, or a ground-on-everything superset) could silently break the flip
// and this suite would stay green. This file closes that gap: pure data +
// predicate assertions, no engine, no key.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { CoverLetter, LetterDecision } from "@shared/types";
import { letterFlipPredicate, letterFlipContrast } from "../src/server/tailor/evalcore";
import { assembleLetter } from "../src/server/tailor/letter";

const FIXTURES_DIR = path.join(process.cwd(), "test/fixtures/letters");

type LetterFixtureFile = { key: string; name: string; decision: LetterDecision };
type ManifestEntry = { name: string; key: string; leadingEntryId: string; attempts: number };
type Manifest = { fixtures: ManifestEntry[] };

function readFixture(name: string): LetterFixtureFile {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, `${name}.json`), "utf-8"));
}

const manifest: Manifest = JSON.parse(
  readFileSync(path.join(FIXTURES_DIR, "manifest.json"), "utf-8"),
);

function leadingEntryIdFor(name: string): string {
  const entry = manifest.fixtures.find((f) => f.name === name);
  if (!entry) throw new Error(`manifest.json has no fixture entry named "${name}"`);
  return entry.leadingEntryId;
}

// name -> fixture file + assembled CoverLetter, loaded once for all cases below.
const FIXTURE_NAMES = ["platform-sdk", "rules-engine", "frontend-rewrite"] as const;

const loaded = FIXTURE_NAMES.map((name) => {
  const fixture = readFixture(name);
  const letter = assembleLetter(fixture.decision);
  return { name, letter, leadingEntryId: leadingEntryIdFor(name) };
});

// ── 1. per-fixture lead check — manifest.leadingEntryId actually read ──

describe("letterFlipPredicate over the recorded letter fixtures", () => {
  it("platform-sdk: lead paragraph cites cloudcase-platform-sdk", () => {
    const f = loaded.find((l) => l.name === "platform-sdk")!;
    expect(f.leadingEntryId).toBe("cloudcase-platform-sdk");
    expect(letterFlipPredicate(f.letter, f.leadingEntryId)).toBe(true);
  });

  it("rules-engine: lead paragraph cites cloudcase-rules-engine", () => {
    const f = loaded.find((l) => l.name === "rules-engine")!;
    expect(f.leadingEntryId).toBe("cloudcase-rules-engine");
    expect(letterFlipPredicate(f.letter, f.leadingEntryId)).toBe(true);
  });

  it("frontend-rewrite: lead paragraph cites cloudcase-frontend-rewrite", () => {
    const f = loaded.find((l) => l.name === "frontend-rewrite")!;
    expect(f.leadingEntryId).toBe("cloudcase-frontend-rewrite");
    expect(letterFlipPredicate(f.letter, f.leadingEntryId)).toBe(true);
  });
});

// ── 2. contrast check — pairwise-non-empty groundedOn unions in BOTH
// directions across the three real fixtures ──

describe("letterFlipContrast over the recorded letter fixtures", () => {
  it("the three real letters pairwise-differ in both directions", () => {
    const letters = loaded.map((l) => ({ name: l.name, letter: l.letter }));
    expect(letterFlipContrast(letters)).toBe(true);
  });
});

// ── 3. NEGATIVE CONTROLS (REQUIRED) — this is the anti-vacuity guard that
// closes the audited gap: without these, this file would only prove the
// predicates run, not that they'd CATCH a broken/laundered fixture. Both
// controls build mutated IN-MEMORY COPIES of the loaded fixtures (via
// structuredClone) — the committed fixture files themselves are never
// touched or rewritten. ──

describe("negative controls — predicates must FAIL on a broken fixture", () => {
  it("(a) wrong-lead mutant: swapping the lead paragraph's groundedOn to the wrong entry fails letterFlipPredicate", () => {
    const platformSdk = loaded.find((l) => l.name === "platform-sdk")!;
    const wrongLeadLetter: CoverLetter = structuredClone(platformSdk.letter);

    // Swap the lead paragraph to cite a real but WRONG entry (another
    // fixture's target) instead of this fixture's own leadingEntryId.
    wrongLeadLetter.body[0]!.groundedOn = ["cloudcase-rules-engine"];

    expect(letterFlipPredicate(wrongLeadLetter, platformSdk.leadingEntryId)).toBe(false);
  });

  it("(b) superset mutant: one letter grounding on EVERY entry id collapses the pairwise contrast", () => {
    const [platformSdk, rulesEngine, frontendRewrite] = loaded;

    // Every entryId that appears anywhere across the three real fixtures.
    const allEntryIds = loaded.flatMap((l) => l.leadingEntryId);

    // A "ground-on-everything" mutant: every body paragraph cites every
    // entry id from every fixture — a laundered fixture that would trivially
    // "pass" a naive one-directional presence check.
    const supersetLetter: CoverLetter = structuredClone(frontendRewrite!.letter);
    for (const paragraph of supersetLetter.body) {
      paragraph.groundedOn = [...allEntryIds];
    }

    const mutatedSet = [
      { name: platformSdk!.name, letter: platformSdk!.letter },
      { name: rulesEngine!.name, letter: rulesEngine!.letter },
      { name: "frontend-rewrite (superset mutant)", letter: supersetLetter },
    ];

    // The superset mutant's union is a strict superset of both real letters'
    // unions, so the difference collapses to empty in their direction —
    // letterFlipContrast must reject this, exactly the "ground-on-everything"
    // case the pairwise-both-directions check exists to catch.
    expect(letterFlipContrast(mutatedSet)).toBe(false);
  });
});
