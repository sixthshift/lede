// Shared eval-core — spec.md §22, §25; .ailoop/oracle.md Phase 0 gates.
// Single source for the fixture key, the flip definition, and the JD set so
// FixtureEngine (T010), record-fixtures (T013), the live eval (T014), and the
// keyless suite (T015) can never drift apart (red-team Findings A+B).

import { createHash } from "node:crypto";
import type { Entry, TailoredResume } from "@shared/types";

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
  const rationaleNamesSignal = rationale.trim().length > 0 && rationaleReferencesSignal(rationale, resume.signals);

  return { leads, rationaleNamesSignal };
}

function rationaleReferencesSignal(rationale: string, signals: TailoredResume["signals"]): boolean {
  const rationaleLower = rationale.toLowerCase();
  const candidateTokens = [signals.roleLevel, ...signals.weights, ...signals.hardRequirements];

  return candidateTokens.some((phrase) => {
    const tokens = tokenize(phrase);
    return tokens.some((tok) => tok.length >= 4 && rationaleLower.includes(tok));
  });
}

function tokenize(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
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
