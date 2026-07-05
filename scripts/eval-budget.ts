// Length budget -> selection eval — spec.md §28.8-D; mirrors scripts/eval.ts.
// THE key-gated behavioral gate: a tighter 1-page budget must bury/drop MORE
// entries than a looser 2-page budget, each cut carrying a real reason.
// Never falls back to FixtureEngine — missing key is a hard failure, not a skip.

import { ProviderEngine, tailor } from "../src/server/tailor/engine";
import { deriveContentBudget } from "../src/server/tailor/budget";
import { SEED_ENTRIES } from "../src/server/seed";
import { SECTION_VALUES } from "../src/shared/sections";
import { DEFAULT_FORMAT } from "../src/shared/format";
import type { Layout, TailoredResume } from "../src/shared/types";

const MODEL = "gemini-2.5-flash";
const PAPER = "letter" as const;

const layout: Layout = [
  { section: "summary", enabled: true },
  ...SECTION_VALUES.map((section) => ({ section, enabled: true })),
];

const JD = `Senior Software Engineer, Platform

We're looking for a senior engineer to lead the modernization of our core
rules engine and internal developer platform. You'll own architecture
decisions, mentor engineers, and drive delivery of high-impact projects that
cut onboarding time and improve reliability. Strong background in platform
architecture, lifecycle frameworks, and shipping under ambiguity required.`;

function reasonsAreNonEmpty(resume: TailoredResume): boolean {
  return resume.cut.every((c) => c.reason.trim().length > 0);
}

async function main() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.error(
      "eval-budget: GOOGLE_GENERATIVE_AI_API_KEY is not set — refusing to run. " +
        "This oracle is key-gated and never falls back to FixtureEngine; " +
        "set the key to run the live length-budget-to-selection gate.",
    );
    process.exit(1);
  }

  const engine = new ProviderEngine({ provider: "google", model: MODEL, apiKey });

  const budget1 = deriveContentBudget({ paper: PAPER, targetPages: 1, format: DEFAULT_FORMAT });
  const budget2 = deriveContentBudget({ paper: PAPER, targetPages: 2, format: DEFAULT_FORMAT });

  console.log(`\n=== budgets ===`);
  console.log(`1-page: ${budget1}`);
  console.log(`2-page: ${budget2}`);

  const resume1 = await tailor(engine, JD, SEED_ENTRIES, layout, undefined, undefined, budget1);
  const resume2 = await tailor(engine, JD, SEED_ENTRIES, layout, undefined, undefined, budget2);

  const cut1 = resume1.cut.length;
  const cut2 = resume2.cut.length;
  const stricterCutsMore = cut1 > cut2;
  const reasons1Ok = reasonsAreNonEmpty(resume1);
  const reasons2Ok = reasonsAreNonEmpty(resume2);

  console.log(`\n=== RUN ===`);
  console.log(`1-page budget: cut.length=${cut1}, all reasons non-empty=${reasons1Ok}`);
  console.log(`2-page budget: cut.length=${cut2}, all reasons non-empty=${reasons2Ok}`);
  console.log(
    `\n1-page budget cuts strictly more than 2-page budget (${cut1} > ${cut2}) = ${stricterCutsMore}`,
  );

  const ok = stricterCutsMore && reasons1Ok && reasons2Ok;

  if (!ok) {
    console.error("\neval-budget: FAIL");
    if (!stricterCutsMore)
      console.error(
        `  - 1-page budget did not cut strictly more than 2-page budget (${cut1} vs ${cut2})`,
      );
    if (!reasons1Ok) console.error("  - 1-page budget: one or more cuts has an empty reason");
    if (!reasons2Ok) console.error("  - 2-page budget: one or more cuts has an empty reason");
    process.exit(1);
  }

  console.log(
    "\neval-budget: PASS — a tighter 1-page budget buries/drops strictly more entries than a " +
      "2-page budget, and every cut carries a non-empty reason.",
  );
}

main().catch((err) => {
  console.error("eval-budget: fatal error:", err);
  process.exit(1);
});
