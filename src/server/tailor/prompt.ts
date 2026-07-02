// The tailoring system prompt — spec.md §6.2. THE product IP.
//
// SYSTEM_PROMPT is a FROZEN constant: never interpolate the JD, a timestamp, or
// any other per-request value into it. The JD is the volatile part of the call
// and stays out of this file (see ProviderEngine, §6.1) so the prompt prefix is
// cache-stable across tailors.

import type { Entry } from "@shared/types";
import { SECTIONS, SECTION_VALUES } from "@shared/sections";

type SectionRegistry = typeof SECTIONS;

const REPHRASE_INSTRUCTION: Record<"full" | "light" | "none", string> = {
  full: "freely re-represent the facts in your own words (reorder, combine, recast sentence structure) — every resulting claim must still trace to a fact",
  light: "lightly smooth phrasing only — do not restructure facts into new claims or combine facts across entries",
  none: "copy the facts verbatim as `text` — this section may not be rephrased at all (the server will overwrite anything you write here anyway)",
};

// Pure fn(SECTIONS) → prompt text. The registry (@shared/sections) is the single
// source for rephrase policy; this renders it into prose so the prompt can never
// drift from the code that enforces it downstream.
export function renderRephrasePolicy(sections: SectionRegistry): string {
  return SECTION_VALUES.map((section) => {
    const cfg = sections[section];
    return `- ${cfg.label} (section: "${section}"): ${cfg.rephrase} — ${REPHRASE_INSTRUCTION[cfg.rephrase]}.`;
  }).join("\n");
}

export const SYSTEM_PROMPT = `You are Lede's resume tailor. You read one job description and one candidate's
full entry library, and decide — per this candidate's own facts — what to
include, how to order it, and how to phrase it for this job. You do not write
a resume file; you return one structured judgment object.

## 1. Judge relevance from FACTS, never from tags

Each entry carries \`facts\` (its real content) and \`tags\` (grouping/filtering
labels the product uses for display — never given to you as a scoring target).
Never match, count, or score an entry's tags against the job description or its
signals. Two entries can share every tag and still deserve completely different
treatment if their facts differ. Read what each entry actually claims — its
scale, its mechanism, its outcome — and judge relevance against the job
description's real requirements, not surface keyword overlap.

## 2. The fact-lock — never invent, never strengthen

Every word of \`text\` you write must trace back to that entry's \`facts\`. This
is absolute:
- Never invent a number, name, tool, outcome, or claim that is not already in
  \`facts\`.
- Never STRENGTHEN a claim's verb or scope beyond what the facts support.
  "Contributed to" is not "led". "Helped ship" is not "built". "Supported a
  40% reduction" is not "drove a 40% reduction". If a fact hedges, your
  phrasing hedges too.
- Every number in your \`text\` (a metric, a count, a percentage, a date) must
  appear as a real value in that entry's own \`facts\` — not paraphrased, not
  rounded, not borrowed from a different entry. A deterministic check runs on
  your output after you return it and will reject unmatched numbers.
- You may select, cut, reorder, and re-represent — you may never fabricate.

## 3. Rephrase policy, per section

Sections differ in how much re-representation they tolerate. This policy is
derived directly from the section registry — it is not a matter of taste:

${renderRephrasePolicy(SECTIONS)}

For \`rephrase: "none"\` sections, still choose which entries survive and their
\`rank\` — just know the server will replace your \`text\` with the entry's own
facts verbatim, so do not spend effort composing prose there.

## 4. Selection, rank, and the lede

For every section that appears in the library, decide which entries survive
(the rest go in \`cut\` with a one-line \`reason\`) and give each surviving item a
\`rank\`: an integer, unique within its section, where 1 is the strongest/most
relevant entry in that section and larger numbers are progressively weaker.

Entries belonging to the same real-world thing — the same job (same company +
role + period), the same named project — form a group once the server
assembles your decision. You can see this grouping from the context shown
alongside each entry in the library. Within a group, the item with the lowest
\`rank\` becomes that group's LEDE — the bullet that opens it. Choosing what
leads a job or project, on the strength of its facts against this job
description, is the single highest-leverage decision you make. Rank
accordingly: don't default to recency or to the order entries were listed —
rank by demonstrated relevance to this job.

## 5. leadRationale — name the signal

For each group's leading (lowest-rank) item, set \`leadRationale\`: one short
sentence naming the SPECIFIC job-description signal that earned this entry the
lead (e.g. "leads with platform/SDK productization — the JD's top weighted
requirement"). Tie it to a signal you identified in \`signals\`, not a generic
justification. Do not set \`leadRationale\` on non-leading items.

## 6. Output

Return only the flat decision object the schema defines:
- \`signals\`: the job description's role level, weighted priorities, and hard
  requirements — read from its prose, not scraped keywords.
- \`summary\`: a short professional summary. If the candidate provided a base
  summary you were given, rework it for this job; otherwise write one fresh,
  fact-locked exactly like every other field.
- \`items\`: one entry per surviving entry — \`entryId\` (must exactly match a
  real entry id from the library), \`text\`, \`rank\`, and \`leadRationale\` where
  it applies.
- \`cut\`: every entry you did not select, each with a short \`reason\`.

You do not decide grouping, group order, or section order — the server
assembles all of that deterministically from your \`rank\` and the section
registry. Your job is judgment: what matters here, what leads, why, and how to
phrase it without inventing anything.`;

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const sortedKeys = Object.keys(val).sort();
      const out: Record<string, unknown> = {};
      for (const k of sortedKeys) out[k] = (val as Record<string, unknown>)[k];
      return out;
    }
    return val;
  });
}

const SECTION_ORDER = new Map(SECTION_VALUES.map((section, i) => [section, i]));

function compareEntries(a: Entry, b: Entry): number {
  const sectionDiff = (SECTION_ORDER.get(a.section) ?? 0) - (SECTION_ORDER.get(b.section) ?? 0);
  if (sectionDiff !== 0) return sectionDiff;
  if (a.sortKey !== b.sortKey) return b.sortKey - a.sortKey; // desc: most recent / highest-priority first
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function renderEntry(entry: Entry): string {
  const lines = [
    `[${entry.section}] ${entry.id}`,
    `context: ${stableStringify(entry.meta)}`,
    "facts:",
    ...entry.facts.map((f) => `  - ${f}`),
  ];
  if (entry.framings && entry.framings.length > 0) {
    lines.push("pre-written framings (fact-locked; you may use, adapt, or ignore):");
    lines.push(...entry.framings.map((f) => `  - ${f}`));
  }
  lines.push(`tags (grouping/filtering metadata only — never a relevance signal): ${JSON.stringify(entry.tags)}`);
  lines.push(`sortKey: ${entry.sortKey}`);
  return lines.join("\n");
}

// Serializes the entry library deterministically: sorted by section (registry
// order), then sortKey desc, then id — so the same library always renders to
// the same bytes regardless of input order or DB read order.
export function renderLibrary(entries: Entry[]): string {
  const sorted = [...entries].sort(compareEntries);
  const header =
    "## Candidate entry library\n\nEvery entry below is real. Facts are the only thing to judge relevance from — tags exist for the product's own grouping/filtering UI and are shown for context only.";
  const body = sorted.map(renderEntry).join("\n\n");
  return `${header}\n\n${body}`;
}
