// Client-safe JD-signal coverage matcher — the SAME "does this rationale
// name this signal" primitive the server's flip-eval (evalcore.ts) uses, so
// the coverage readout and the flip-eval can never drift on what "references
// a signal" means. evalcore.ts is server-only (imports node:crypto); this
// module has no node:* imports so it can be shared with the client, which
// renders uncoveredSignals() per-render in a later ticket.
//
// LIMIT (accepted, disclosed): matching is ANY shared >=4-char token between
// a signal phrase and a rationale — two signals sharing only an incidental
// >=4-char token (e.g. "container orchestration" / "container deposit
// tracking") can both read covered off the same rationale. Loose on purpose:
// a false negative (an addressed signal reading uncovered) is worse than a
// false positive here, since the readout only ever claims absence.

import type { TailoredResume } from "@shared/types";

export function tokenize(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function rationaleReferencesPhrase(rationale: string, phrase: string): boolean {
  const rationaleLower = rationale.toLowerCase();
  return tokenize(phrase).some((tok) => tok.length >= 4 && rationaleLower.includes(tok));
}

// Every candidate signal (weights, then hardRequirements — roleLevel
// excluded; that's a resume-wide framing, not a specific claim a lede either
// does or doesn't address) that NO group's LEDE rationale references.
// "Lede" = items[0] per group (assemble() already orders rank-ascending);
// only group.leadRationale is read — never a non-lede item's rationale, and
// never any item's .text, so a signal token that only appears in prose
// (not in a lede's rationale) still reads uncovered.
export function uncoveredSignals(resume: TailoredResume): string[] {
  const candidates = [...new Set([...resume.signals.weights, ...resume.signals.hardRequirements])];

  const ledeRationales = resume.sections
    .flatMap((section) => section.groups)
    .map((group) => group.leadRationale ?? "")
    .filter((rationale) => rationale.trim().length > 0);

  return candidates.filter(
    (signal) => !ledeRationales.some((rationale) => rationaleReferencesPhrase(rationale, signal)),
  );
}
