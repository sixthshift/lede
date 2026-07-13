// Read-only, keyless coverage classifier — the artifact-side complement to
// `signal-coverage.ts`'s rationale-side readout (SPEC.md "Content-ATS
// Coverage"). Client-safe: no `node:*` imports, so it can run in the browser
// and in tests without a server boundary.
//
// SCOPE TRIPWIRE (never cross): this module is display-only. It must never be
// imported by `src/server/tailor/**` (engine/assemble/prompt/validate/...) —
// data flows document -> report, never report -> tailor. Enforced by a
// source-grep test in test/content-coverage.test.ts, not by convention alone.
//
// DISCLOSED LIMIT: matching is token/string only, never synonym or
// abbreviation aware — `postgres` (facts) vs `postgresql` (JD), or `k8s` vs
// `kubernetes`, both land `unsupported` even though a human reader would call
// them the same skill. Accepted per SPEC.md "Locked decisions" (keyless,
// deterministic, no LLM/semantic matching) — the resulting blind spot is
// honest noise, not a silent miss.

import type { Entry, JDSignals } from "@shared/types";
import { tokenize } from "@shared/signal-coverage";

// Standard-English core + JD/resume generics named in SPEC.md "Locked
// decisions". The extraction function references this identifier directly —
// no parallel inline blacklist.
export const STOP_WORDS: Set<string> = new Set([
  // standard-English core
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "for",
  "with",
  "on",
  "at",
  "by",
  "is",
  "are",
  "as",
  "be",
  "been",
  "being",
  "was",
  "were",
  "will",
  "would",
  "can",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "we",
  "you",
  "your",
  "our",
  "their",
  "they",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "not",
  "no",
  "if",
  "but",
  "so",
  "than",
  "then",
  "into",
  "about",
  "across",
  "over",
  "under",
  "up",
  "down",
  "out",
  "off",
  "from",
  "all",
  "any",
  "some",
  "each",
  "every",
  "other",
  "such",
  "same",
  "also",
  "very",
  "more",
  "most",
  "less",
  "least",
  "one",
  "two",
  "three",
  // JD/resume generics
  "experience",
  "team",
  "role",
  "candidate",
  "responsibilities",
  "years",
  "strong",
  "ability",
  "looking",
  "join",
  "work",
  "working",
  "worked",
  "skills",
  "skill",
  "job",
  "position",
  "company",
  "opportunity",
  "requirements",
  "required",
  "preferred",
  "qualifications",
  "qualified",
  "including",
  "include",
  "includes",
  "etc",
  "using",
  "use",
  "used",
  "new",
  "help",
  "helping",
  "excellent",
  "great",
  "good",
  "knowledge",
  "understanding",
  "background",
  "environment",
  "related",
  "plus",
]);

// ── raw-JD extraction ──

const RAW_JD_CAP = 15;
const SHORT_TOKEN_FLOOR = 4;

// A source token is acronym-shaped iff every alphabetic character in its
// ORIGINAL (pre-lowercase) form is uppercase — a shape check on the JD text,
// never a lookup against a list of known acronyms.
function isAcronymShaped(sourceToken: string): boolean {
  const letters = sourceToken.replace(/[^A-Za-z]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

type RawJdCandidate = { term: string; count: number; firstIndex: number };

function recordCandidate(registry: Map<string, RawJdCandidate>, term: string, index: number): void {
  const existing = registry.get(term);
  if (existing) {
    existing.count += 1;
    return;
  }
  registry.set(term, { term, count: 1, firstIndex: index });
}

// Stop-word-filtered unigrams + adjacent non-stop-word bigrams from a JD
// string. Short tokens (<4 char) survive only if acronym-shaped in the
// source; signal-derived terms (assembled separately) have no such floor.
// Raw-JD-only candidates are capped at 15, ranked by JD frequency then first
// appearance (a tie-break that must diverge from appearance-only ordering).
export function extractRawJdTerms(jd: string): string[] {
  const sourceTokens = jd.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const registry = new Map<string, RawJdCandidate>();

  const survivingUnigramIndices: (number | null)[] = sourceTokens.map((sourceToken, i) => {
    const lower = sourceToken.toLowerCase();
    if (STOP_WORDS.has(lower)) return null;
    if (lower.length < SHORT_TOKEN_FLOOR && !isAcronymShaped(sourceToken)) return null;
    recordCandidate(registry, lower, i);
    return i;
  });

  for (let i = 0; i < sourceTokens.length - 1; i++) {
    if (survivingUnigramIndices[i] === null || survivingUnigramIndices[i + 1] === null) continue;
    const bigram = `${sourceTokens[i].toLowerCase()} ${sourceTokens[i + 1].toLowerCase()}`;
    recordCandidate(registry, bigram, i);
  }

  const ranked = [...registry.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.firstIndex - b.firstIndex;
  });

  return ranked.slice(0, RAW_JD_CAP).map((c) => c.term);
}

// ── candidate assembly ──

export type CoverageCandidate = { term: string; provenance: "signal" | "raw-jd" };

// signal-derived = the RAW weights ∪ hardRequirements union read directly
// from TailorDecision.signals (roleLevel excluded) — emphatically NOT
// signal-coverage.ts's uncoveredSignals() rationale-filtered return. Union
// with raw-JD terms, deduped case-insensitively (term-keyed, not
// position-based); on a term present in both sources, signal wins.
export function assembleCandidates(signals: JDSignals, jd: string): CoverageCandidate[] {
  const signalTerms = [...new Set([...signals.weights, ...signals.hardRequirements])];
  const rawJdTerms = extractRawJdTerms(jd);

  const byKey = new Map<string, CoverageCandidate>();
  for (const term of signalTerms) {
    byKey.set(term.toLowerCase(), { term, provenance: "signal" });
  }
  for (const term of rawJdTerms) {
    const key = term.toLowerCase();
    if (byKey.has(key)) continue; // signal already wins this term
    byKey.set(key, { term, provenance: "raw-jd" });
  }

  return [...byKey.values()];
}

// ── classification ──

export type CoverageBucket = "on-page" | "in-facts" | "unsupported";

export type CoverageRow = {
  term: string;
  provenance: "signal" | "raw-jd";
  bucket: CoverageBucket;
  entryIds: string[];
};

// A term matches a text iff EVERY one of its tokens (tokenize, kept at >=2
// chars — looser than tokenize's own >=4 floor, so short ATS keywords like
// `ML`/`Go`/`AWS` stay representable) is a case-insensitive substring of that
// text. SAME rule on both sides, so `in-facts` can never be looser than
// `on-page`.
function matchesText(term: string, text: string): boolean {
  const tokens = tokenize(term).filter((tok) => tok.length >= 2);
  if (tokens.length === 0) return false;
  const haystack = text.toLowerCase();
  return tokens.every((tok) => haystack.includes(tok));
}

export function classifyCoverage(input: {
  extractedText: string[];
  candidates: CoverageCandidate[];
  entries: Entry[];
}): CoverageRow[] {
  const pageText = input.extractedText.join(" ");

  return input.candidates.map(({ term, provenance }) => {
    if (matchesText(term, pageText)) {
      return { term, provenance, bucket: "on-page", entryIds: [] };
    }

    const matchingEntryIds = input.entries
      .filter((entry) => matchesText(term, entry.facts.join(" ")))
      .map((entry) => entry.id);

    if (matchingEntryIds.length > 0) {
      return { term, provenance, bucket: "in-facts", entryIds: matchingEntryIds };
    }

    return { term, provenance, bucket: "unsupported", entryIds: [] };
  });
}
