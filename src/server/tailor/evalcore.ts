// Shared eval-core — spec.md §22, §25; .ailoop/oracle.md Phase 0 gates.
// Single source for the fixture key, the flip definition, and the JD set so
// FixtureEngine (T010), record-fixtures (T013), the live eval (T014), and the
// keyless suite (T015) can never drift apart (red-team Findings A+B).

import { createHash } from "node:crypto";
import type { CoverLetter, Entry, LetterDecision, TailoredResume } from "@shared/types";
import { rationaleReferencesPhrase } from "@shared/signal-coverage";
import { assembleLetter, validateLetterNoFabrication } from "./letter";
import { FabricationError } from "./validate";

// ── 1. the ONE fixture key ──
// Deterministic and order-insensitive over entries: sort by id before
// hashing so entry array order never changes the key.
export function hashKey(jd: string, entries: Entry[]): string {
  const sorted = [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const payload = JSON.stringify({ jd, entries: sorted });
  return createHash("sha256").update(payload).digest("hex");
}

// ── 2. the 3 §22 contrasting JDs, each mapped to its expected leading entry ──
// Anti-leakage: no JD contains its target's entry id or any ≥12-char
// substring of that target's `facts` (see SEED_ENTRIES in ../seed) — the
// model must judge from facts, not keyword-match.
export const CONTRAST_JDS: { name: string; jd: string; target: string }[] = [
  {
    name: "platform-sdk",
    target: "cloudcase-platform-sdk",
    jd:
      "We're a mid-market SaaS company opening our product to outside developers — something we've never offered " +
      "before. Historically all functionality lived behind our own UI; now enterprise customers want to build " +
      "directly on top of us. We need an engineer to design and ship the public-facing developer surface — stable " +
      "contracts, versioning, docs, and a client library that partners can integrate against with confidence. " +
      "You'll work closely with solutions engineering to turn early adopter pain points into a smooth onboarding " +
      "flow, and with product to decide what capabilities get exposed externally versus kept private.",
  },
  {
    name: "rules-engine",
    target: "cloudcase-rules-engine",
    jd:
      "Our core decisioning system has grown organically over several years into a sprawling, hard-to-navigate " +
      "module that only a handful of tenured engineers truly understand. New hires take a long time to become " +
      "productive, and small changes carry outsized risk of breaking something unrelated elsewhere. We're hiring " +
      "a senior engineer to lead an effort to impose real structure here — clearer conventions, well-defined " +
      "ownership boundaries, and guardrails that let someone joining the team next month get oriented quickly. " +
      "Success looks like a shorter ramp-up for new engineers and fewer surprise regressions in production.",
  },
  {
    name: "frontend-rewrite",
    target: "cloudcase-frontend-rewrite",
    jd:
      "We are hiring a frontend platform lead to own the technical direction of our web application. Our current " +
      "UI has fallen behind modern practice and slows every feature team down. You'll define and build a shared " +
      "design system and component foundation in React and TypeScript that other product teams build on top of, " +
      "set conventions for state management and testing, and migrate the app incrementally without stopping " +
      "feature delivery. This is a hands-on staff-level role: you'll be writing code, reviewing technical " +
      "decisions, and mentoring engineers on frontend best practices.",
  },
];

// ── 3. the flip predicate ──
// `leads`: target is the UNIQUE lowest-rank leading item of its group (i.e.
// assemble()'s items[0], since assemble already orders by rank ascending)
// and is not cut.
// `rationaleNamesSignal`: that group's leadRationale is non-empty and
// references at least one token drawn from resume.signals (weights /
// hardRequirements / roleLevel) — not generic filler.
export function flipPredicate(
  resume: TailoredResume,
  targetId: string,
): { leads: boolean; rationaleNamesSignal: boolean } {
  const isCut = resume.cut.some((c) => c.entryId === targetId);

  let leadingGroup: TailoredResume["sections"][number]["groups"][number] | undefined;
  for (const section of resume.sections) {
    for (const group of section.groups) {
      if (group.items[0]?.entryId === targetId) {
        leadingGroup = group;
      }
    }
  }

  const leads = !!leadingGroup && !isCut;
  if (!leads || !leadingGroup) return { leads, rationaleNamesSignal: false };

  const rationale = leadingGroup.leadRationale ?? "";
  const rationaleNamesSignal =
    rationale.trim().length > 0 && rationaleReferencesSignal(rationale, resume.signals);

  return { leads, rationaleNamesSignal };
}

// Reuses the shared client-safe matcher (@shared/signal-coverage) — the flip
// eval and the coverage readout must never drift on what "references a
// signal" means. Unlike uncoveredSignals(), this candidate set still
// includes roleLevel: a flip is "the rationale names ANY signal", while
// coverage's per-signal readout deliberately excludes the resume-wide
// roleLevel framing.
function rationaleReferencesSignal(rationale: string, signals: TailoredResume["signals"]): boolean {
  const candidateTokens = [signals.roleLevel, ...signals.weights, ...signals.hardRequirements];
  return candidateTokens.some((phrase) => rationaleReferencesPhrase(rationale, phrase));
}

// ── 4. tag-shuffle control (Finding B) ──
// Deep copy with `tags` arrays permuted ACROSS entries (entry A gets entry
// B's tags, etc.); id/meta/facts/framings/sortKey untouched.
export function tagShuffle(entries: Entry[]): Entry[] {
  const tagSets = entries.map((e) => [...e.tags]);
  const shuffled = rotate(tagSets);

  return entries.map((e, i) => ({
    ...structuredClone(e),
    tags: shuffled[i]!,
  }));
}

// Rotate by one so every entry gets a DIFFERENT entry's tags (a true
// permutation with no fixed point, for arrays of length > 1).
function rotate<T>(arr: T[]): T[] {
  if (arr.length <= 1) return [...arr];
  return [...arr.slice(1), arr[0]!];
}

// ── 5. the letter-flip predicate (T04) ──
// The LEAD body paragraph — body[0], the letter's opening argument — must
// cite the target. A target that only shows up in a later paragraph is not a
// flip: it proves the letter *mentions* the entry, not that it *leads* with
// it, so this stays strict about position, not mere presence.
export function letterFlipPredicate(letter: CoverLetter, targetEntryId: string): boolean {
  const lead = letter.body[0];
  return !!lead && lead.groundedOn.includes(targetEntryId);
}

// ── 6. the letter-flip contrast control (T04) ──
// Per letter, the union of groundedOn ids across ALL body paragraphs must
// pairwise-differ from every other letter's union, in BOTH directions. A
// letter whose union is a strict superset of another's still has an empty
// difference in the subset's direction, so it fails here even though every
// id it cites is "different" in the naive one-directional sense — that
// superset case is exactly what a ground-on-everything letter looks like.
export function letterFlipContrast(letters: { name: string; letter: CoverLetter }[]): boolean {
  const unions = letters.map((l) => new Set(l.letter.body.flatMap((p) => p.groundedOn)));

  for (let i = 0; i < unions.length; i++) {
    for (let j = i + 1; j < unions.length; j++) {
      const a = unions[i]!;
      const b = unions[j]!;
      const aMinusB = [...a].some((id) => !b.has(id));
      const bMinusA = [...b].some((id) => !a.has(id));
      if (!aMinusB || !bMinusA) return false;
    }
  }
  return true;
}

// ── 7. the per-JD record/verify step (T04) ──
// Mirrors record-fixtures.ts's decide -> assemble -> validate -> flip-check
// sequence for a single JD, but as a pure(ish) function: no fs access, so it
// is unit-testable keylessly against a mock engine. The caller (a record
// script) is the one that writes a fixture, and only when `ok` is true — a
// failing flip or fabrication check is reported here, never forced.
export type LetterRecordEngine = {
  decideLetter: (
    jd: string,
    entries: Entry[],
    motivation?: string | null,
    context?: string | null,
    voice?: string | null,
  ) => Promise<LetterDecision>;
};

export type RecordOneLetterResult =
  | { ok: true; decision: LetterDecision }
  | { ok: false; reason: string };

export async function recordOneLetter(
  engine: LetterRecordEngine,
  jd: string,
  entries: Entry[],
  targetEntryId: string,
): Promise<RecordOneLetterResult> {
  let decision: LetterDecision;
  try {
    decision = await engine.decideLetter(jd, entries);
  } catch (err) {
    return { ok: false, reason: `decideLetter() failed — ${(err as Error).message}` };
  }

  try {
    const letter = assembleLetter(decision);
    validateLetterNoFabrication(letter, entries);

    if (!letterFlipPredicate(letter, targetEntryId)) {
      const leadCites = letter.body[0]?.groundedOn.join(", ") || "(none)";
      return {
        ok: false,
        reason: `did not flip — lead paragraph cites [${leadCites}], not "${targetEntryId}"`,
      };
    }

    return { ok: true, decision };
  } catch (err) {
    if (err instanceof FabricationError) {
      return { ok: false, reason: `fabrication check failed — ${err.message}` };
    }
    return { ok: false, reason: `unexpected error — ${(err as Error).message}` };
  }
}
