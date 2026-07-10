// Cover letter assemble + no-fabrication validation — mirrors validate.ts's
// mechanical, per-item number-grounding, scoped to a letter's paragraphs.
// No LLM-checks-LLM: this is a regex/set check, exactly like the resume validator.

import type { CoverLetter, Entry, LetterDecision } from "@shared/types";
import { extractNumbers, FabricationError, hasNumberToken } from "./validate";
import type { TailorEngine } from "./engine";

// Light pass-through: the model's judgment becomes the stored shape verbatim.
// groundedOn is never touched here — grounding is judged, not derived.
export function assembleLetter(decision: LetterDecision): CoverLetter {
  return {
    greeting: decision.greeting,
    body: decision.body.map((p) => ({ text: p.text, groundedOn: p.groundedOn })),
    closing: decision.closing,
  };
}

// Every paragraph's groundedOn ids must exist; every number in a paragraph's
// text must trace to the facts of THAT paragraph's cited entries only — a
// number sitting in some other, uncited entry's facts does not ground it
// (the fact-lock is per-citation, not a library-wide pool).
export function validateLetterNoFabrication(letter: CoverLetter, entries: Entry[]): void {
  const byId = new Map(entries.map((e) => [e.id, e]));

  for (const paragraph of letter.body) {
    const cited = paragraph.groundedOn.map((id) => {
      const entry = byId.get(id);
      if (!entry) throw new FabricationError(`unknown entry ${id}`);
      return entry;
    });
    const blob = cited.flatMap((e) => e.facts).join(" ");
    for (const num of extractNumbers(paragraph.text)) {
      if (!hasNumberToken(blob, num)) {
        throw new FabricationError(`number "${num}" not grounded in cited entries`);
      }
    }
  }
}

export async function tailorLetter(
  engine: TailorEngine,
  jd: string,
  entries: Entry[],
  motivation?: string | null,
  context?: string | null,
  voice?: string | null,
): Promise<CoverLetter> {
  const decision = await engine.decideLetter(jd, entries, motivation, context, voice);
  const letter = assembleLetter(decision);
  validateLetterNoFabrication(letter, entries);
  return letter;
}
