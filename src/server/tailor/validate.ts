// No-fabrication validation — spec.md §6.3, §23.
// Mechanical only: no LLM/second generate* call here.

import { SECTIONS } from "@shared/sections";
import type { Entry, Section, TailorDecision, TailoredResume } from "@shared/types";

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

// ── Decision-contract validation — mechanical, structural invariants over the
// model's flat TailorDecision (partition + rank) and the assembled resume
// (lede rationale). Sibling to validateNoFabrication: no LLM/generate* call
// here either. NOT wired into tailor()/the route by this ticket — a later
// ticket calls validateDecisionContract BEFORE assemble() and
// validateLedeRationale AFTER it.

export class DecisionContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionContractError";
  }
}

// Partition + rank, both readable straight off the raw decision (no assemble
// needed — rank's "section" comes from a library lookup, not a decision field).
export function validateDecisionContract(decision: TailorDecision, entries: Entry[]): void {
  validatePartition(decision, entries);
  validateRanks(decision, entries);
}

// The library's entry-id set must equal items ∪ cut, exactly: every id
// accounted for in exactly one list, no foreign id, no id repeated within a
// list. Each check is a multiset check (assertNoInternalDuplicates runs
// before the cross-list check) so a duplicate within one list reports as
// that — distinct from an id legitimately shared across both lists.
function validatePartition(decision: TailorDecision, entries: Entry[]): void {
  const libraryIds = new Set(entries.map((e) => e.id));
  const itemIds = decision.items.map((i) => i.entryId);
  const cutIds = decision.cut.map((c) => c.entryId);

  assertNoInternalDuplicates(itemIds, "items");
  assertNoInternalDuplicates(cutIds, "cut");

  const itemIdSet = new Set(itemIds);
  const cutIdSet = new Set(cutIds);

  for (const id of itemIdSet) {
    if (!libraryIds.has(id)) {
      throw new DecisionContractError(`items references entry "${id}", not in the library`);
    }
    if (cutIdSet.has(id)) {
      throw new DecisionContractError(`entry "${id}" appears in both items and cut`);
    }
  }
  for (const id of cutIdSet) {
    if (!libraryIds.has(id)) {
      throw new DecisionContractError(`cut references entry "${id}", not in the library`);
    }
  }
  for (const id of libraryIds) {
    if (!itemIdSet.has(id) && !cutIdSet.has(id)) {
      throw new DecisionContractError(`entry "${id}" is missing from both items and cut`);
    }
  }
}

function assertNoInternalDuplicates(ids: string[], listName: "items" | "cut"): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new DecisionContractError(`entry "${id}" appears twice within ${listName}`);
    }
    seen.add(id);
  }
}

// rank is the tailor's relevance order WITHIN an item's section (§5) — a
// section the raw decision doesn't carry, so it's resolved via the library.
// Uniqueness is scoped per section (a Map-of-Maps): the same rank value in
// two different sections is fine, only a same-section collision throws.
function validateRanks(decision: TailorDecision, entries: Entry[]): void {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const seenBySection = new Map<Section, Map<number, string>>();

  for (const item of decision.items) {
    if (!Number.isInteger(item.rank) || item.rank < 1) {
      throw new DecisionContractError(
        `item "${item.entryId}" has rank ${item.rank}; must be an integer >= 1`,
      );
    }
    const entry = byId.get(item.entryId);
    if (!entry) {
      throw new DecisionContractError(`item "${item.entryId}" is not in the library`);
    }
    const bucket = seenBySection.get(entry.section) ?? new Map<number, string>();
    const collidingId = bucket.get(item.rank);
    if (collidingId !== undefined) {
      throw new DecisionContractError(
        `duplicate rank ${item.rank} in section "${entry.section}": entries "${collidingId}" and "${item.entryId}"`,
      );
    }
    bucket.set(item.rank, item.entryId);
    seenBySection.set(entry.section, bucket);
  }
}

// Lede-rationale scope: every rephrase:"full" section's group lede (assemble()'s
// rank-lowest item, exposed as group.leadRationale — see assemble.ts's toGroup)
// must carry a non-blank leadRationale. Needs the ASSEMBLED resume, not the raw
// decision: grouping (which items share a lede) is assemble's call, not the
// model's. A non-lede item's missing rationale is out of scope by construction
// — this only ever reads group.leadRationale, never a non-lede item's field.
//
// Reconciled against every recorded fixture in test/fixtures/decisions/*.json
// (test/decision-contract.test.ts): all three SEED_ENTRIES share one
// company/role/period, so groupBy collapses every fixture's items into a
// single experience group, and the one recorded leadRationale always lands on
// that group's lowest-rank (lede) item. No loosening was needed — "every
// full-rephrase-section lede" holds as originally scoped.
export function validateLedeRationale(resume: TailoredResume): void {
  for (const section of resume.sections) {
    if (SECTIONS[section.section].rephrase !== "full") continue;
    for (const group of section.groups) {
      const lede = group.items[0];
      if (!lede) continue;
      if (!group.leadRationale || group.leadRationale.trim().length === 0) {
        throw new DecisionContractError(
          `full-rephrase section "${section.section}" group "${group.heading ?? lede.entryId}" lede "${lede.entryId}" is missing leadRationale`,
        );
      }
    }
  }
}
