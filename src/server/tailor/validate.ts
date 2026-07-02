// No-fabrication validation — spec.md §6.3, §23.
// Mechanical only: no LLM/second generate* call here.

import type { Entry, TailoredResume } from "@shared/types";

export class FabricationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FabricationError";
  }
}

// A "number token" is a digit run (commas allowed as thousands separators,
// an optional decimal part) plus any directly-attached unit letters/%
// (e.g. "30k", "50%", "10x", "2021"). Never a bare substring: the digit run
// must not be glued to a preceding letter/digit, so "1" never matches inside
// "2021".
const NUMBER_TOKEN_RE = /(?<![A-Za-z0-9])\d[\d,]*(?:\.\d+)?[A-Za-z%]*/g;

function normalizeToken(token: string): string {
  return token.replace(/,/g, "");
}

export function extractNumbers(text: string): string[] {
  return text.match(NUMBER_TOKEN_RE) ?? [];
}

export function hasNumberToken(blob: string, num: string): boolean {
  const target = normalizeToken(num);
  return extractNumbers(blob).some((tok) => normalizeToken(tok) === target);
}

export function validateNoFabrication(
  resume: TailoredResume,
  entries: Entry[],
  baseSummary?: string | null,
): void {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const keptFacts: string[] = [];

  for (const section of resume.sections) {
    for (const group of section.groups) {
      for (const item of group.items) {
        const entry = byId.get(item.entryId);
        if (!entry) throw new FabricationError(`unknown entry ${item.entryId}`);
        keptFacts.push(...entry.facts);
        const blob = entry.facts.join(" ");
        for (const num of extractNumbers(item.text)) {
          if (!hasNumberToken(blob, num)) {
            throw new FabricationError(`number "${num}" not in facts of ${item.entryId}`);
          }
        }
      }
    }
  }

  // summary numbers must trace to a kept entry's facts — or the user's own baseSummary (§16)
  const keptBlob = [...keptFacts, baseSummary ?? ""].join(" ");
  for (const num of extractNumbers(resume.summary)) {
    if (!hasNumberToken(keptBlob, num)) {
      throw new FabricationError(`summary number "${num}" not grounded`);
    }
  }
}
