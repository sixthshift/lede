// Phase 0 letter-flip acceptance oracle — spec.md §22, §25 letter analog;
// ailoop T04. THE key-gated behavioral gate for cover letters: live model,
// real lead-paragraph flips, groundedOn contrast across the 3 JDs. Never
// falls back to FixtureEngine — missing key is a hard failure, not a skip.

import { ProviderEngine } from "../src/server/tailor/engine";
import { tailorLetter } from "../src/server/tailor/letter";
import {
  CONTRAST_JDS,
  letterFlipPredicate,
  letterFlipContrast,
} from "../src/server/tailor/evalcore";
import { SEED_ENTRIES } from "../src/server/seed";
import type { CoverLetter } from "../src/shared/types";

const MODEL = "gemini-2.5-flash";

type JdLetterResult = {
  name: string;
  target: string;
  letter?: CoverLetter;
  flips: boolean;
  error?: string;
};

function snippet(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function main() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.error(
      "eval-letter: GOOGLE_GENERATIVE_AI_API_KEY is not set — refusing to run. " +
        "This oracle is key-gated and never falls back to FixtureEngine; " +
        "set the key to run the live letter-flip acceptance gate.",
    );
    process.exit(1);
  }

  const engine = new ProviderEngine({ provider: "google", model: MODEL, apiKey });

  const results: JdLetterResult[] = [];
  for (const { name, jd, target } of CONTRAST_JDS) {
    try {
      const letter = await tailorLetter(engine, jd, SEED_ENTRIES);
      const flips = letterFlipPredicate(letter, target);
      results.push({ name, target, letter, flips });
    } catch (err) {
      results.push({ name, target, flips: false, error: (err as Error).message });
    }
  }

  console.log("\n=== LETTER-FLIP RUN ===");
  for (const r of results) {
    const status = r.flips ? "PASS" : "FAIL";
    const lead = r.letter?.body[0];
    const leadCites = lead?.groundedOn.join(", ") || "(none)";
    console.log(
      `[${r.name}] expected=${r.target} lead-cites=[${leadCites}] -> ${status}` +
        (r.error ? ` ERROR: ${r.error}` : ""),
    );
    if (lead) {
      console.log(`  argument: "${snippet(lead.text)}"`);
    }
  }

  const allFlip = results.every((r) => r.flips);

  const contrastInput = results
    .filter((r): r is JdLetterResult & { letter: CoverLetter } => !!r.letter)
    .map((r) => ({ name: r.name, letter: r.letter }));
  const contrastOk =
    contrastInput.length === CONTRAST_JDS.length && letterFlipContrast(contrastInput);

  console.log(`\nall 3 JDs' lead paragraph cites the expected target = ${allFlip}`);
  console.log(`groundedOn genuinely differs per JD (no superset) = ${contrastOk}`);

  if (!allFlip || !contrastOk) {
    console.error("\neval-letter: FAIL");
    for (const r of results) {
      if (!r.flips) {
        const lead = r.letter?.body[0];
        console.error(
          `  - [${r.name}] lead paragraph did not cite ${r.target} ` +
            `(cited: ${lead?.groundedOn.join(", ") || "(none)"})` +
            (r.error ? ` ERROR: ${r.error}` : ""),
        );
      }
    }
    if (!contrastOk) {
      console.error(
        "  - groundedOn contrast failed — a letter's citations are a subset/superset of " +
          "another's, so the flip could pass by a ground-on-everything letter",
      );
    }
    process.exit(1);
  }

  console.log(
    "\neval-letter: PASS — all 3 JDs' lead paragraph cites the JD-appropriate lead entry, " +
      "and groundedOn genuinely differs per JD.",
  );
}

main().catch((err) => {
  console.error("eval-letter: fatal error:", err);
  process.exit(1);
});
