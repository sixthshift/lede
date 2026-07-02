// Phase 0 acceptance oracle — spec.md §22, §25; .ailoop/oracle.md Phase 0 gates.
// THE key-gated behavioral gate: live model, real flips, tag-shuffle control.
// Never falls back to FixtureEngine — missing key is a hard failure, not a skip.

import { ProviderEngine, tailor } from "../src/server/tailor/engine";
import { CONTRAST_JDS, flipPredicate, tagShuffle } from "../src/server/tailor/evalcore";
import { SEED_ENTRIES } from "../src/server/seed";
import { SECTION_VALUES } from "../src/shared/sections";
import type { Entry, Layout, TailoredResume } from "../src/shared/types";

const MODEL = "gemini-2.5-flash";
const EXPECTED_TARGETS = new Set(CONTRAST_JDS.map((c) => c.target));

const layout: Layout = [
  { section: "summary", enabled: true },
  ...SECTION_VALUES.map((section) => ({ section, enabled: true })),
];

type JdResult = {
  name: string;
  target: string;
  leadingId: string | undefined;
  leads: boolean;
  rationaleNamesSignal: boolean;
  pass: boolean;
  error?: string;
};

function leadingEntryId(resume: TailoredResume): string | undefined {
  for (const section of resume.sections) {
    for (const group of section.groups) {
      if (group.items[0]) return group.items[0].entryId;
    }
  }
  return undefined;
}

async function runPass(engine: ProviderEngine, entries: Entry[]): Promise<JdResult[]> {
  const results: JdResult[] = [];
  for (const { name, jd, target } of CONTRAST_JDS) {
    try {
      const resume = await tailor(engine, jd, entries, layout);
      const { leads, rationaleNamesSignal } = flipPredicate(resume, target);
      results.push({
        name,
        target,
        leadingId: leadingEntryId(resume),
        leads,
        rationaleNamesSignal,
        pass: leads && rationaleNamesSignal,
      });
    } catch (err) {
      results.push({
        name,
        target,
        leadingId: undefined,
        leads: false,
        rationaleNamesSignal: false,
        pass: false,
        error: (err as Error).message,
      });
    }
  }
  return results;
}

function report(label: string, results: JdResult[]): void {
  console.log(`\n=== ${label} ===`);
  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(
      `[${r.name}] expected=${r.target} leading=${r.leadingId ?? "(none)"} ` +
        `leads=${r.leads} rationaleNamesSignal=${r.rationaleNamesSignal} -> ${status}` +
        (r.error ? ` ERROR: ${r.error}` : ""),
    );
  }
}

function allFlip(results: JdResult[]): boolean {
  return results.every((r) => r.pass);
}

// The 3 leading entryIds must be mutually distinct AND equal the expected
// target set — asserted as a set, not as 3 isolated per-JD checks.
function leadingSetMatchesExpected(results: JdResult[]): boolean {
  const ids = results.map((r) => r.leadingId).filter((x): x is string => !!x);
  if (ids.length !== results.length) return false;
  const distinct = new Set(ids);
  if (distinct.size !== ids.length) return false;
  if (distinct.size !== EXPECTED_TARGETS.size) return false;
  for (const id of distinct) if (!EXPECTED_TARGETS.has(id)) return false;
  return true;
}

async function main() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.error(
      "eval: GOOGLE_GENERATIVE_AI_API_KEY is not set — refusing to run. " +
        "This oracle is key-gated and never falls back to FixtureEngine; " +
        "set the key to run the live Phase 0 acceptance gate.",
    );
    process.exit(1);
  }

  const engine = new ProviderEngine({ provider: "google", model: MODEL, apiKey });

  const baseResults = await runPass(engine, SEED_ENTRIES);
  report("BASE RUN", baseResults);
  const baseAllFlip = allFlip(baseResults);
  const baseSetOk = leadingSetMatchesExpected(baseResults);
  console.log(
    `\nbase: all 3 JDs flip correctly = ${baseAllFlip}; ` +
      `leading ids form the expected mutually-distinct set = ${baseSetOk}`,
  );

  const shuffledEntries = tagShuffle(SEED_ENTRIES);
  const shuffleResults = await runPass(engine, shuffledEntries);
  report("TAG-SHUFFLE RUN", shuffleResults);
  const shuffleAllFlip = allFlip(shuffleResults);
  const shuffleSetOk = leadingSetMatchesExpected(shuffleResults);
  console.log(
    `\ntag-shuffle: all 3 JDs still flip correctly = ${shuffleAllFlip}; ` +
      `leading ids still form the expected mutually-distinct set = ${shuffleSetOk}`,
  );

  const unchanged = baseResults.every((base) => {
    const shuffled = shuffleResults.find((r) => r.name === base.name);
    return !!shuffled && shuffled.leadingId === base.leadingId;
  });
  console.log(`tag-shuffle: same target leads each JD as in the base run = ${unchanged}`);

  const ok = baseAllFlip && baseSetOk && shuffleAllFlip && shuffleSetOk && unchanged;

  if (!ok) {
    console.error("\neval: FAIL");
    for (const r of [...baseResults, ...shuffleResults]) {
      if (!r.pass) console.error(`  - [${r.name}] did not flip to ${r.target} (leading: ${r.leadingId ?? "(none)"})`);
    }
    if (!baseSetOk) console.error("  - base: leading ids are not the expected mutually-distinct target set");
    if (!shuffleSetOk) console.error("  - tag-shuffle: leading ids are not the expected mutually-distinct target set");
    if (!unchanged) console.error("  - tag-shuffle: a lede changed vs. the base run — this indicates tag-scoring");
    process.exit(1);
  }

  console.log(
    "\neval: PASS — all 3 JDs flip correctly to the expected mutually-distinct target set, " +
      "and the tag-shuffle control confirms scoring is fact-driven, not tag-driven.",
  );
}

main().catch((err) => {
  console.error("eval: fatal error:", err);
  process.exit(1);
});
