// assemble() — deterministic structure from the flat model decision. spec.md §5, §4.3.
// The model returns judgment only; every structural choice (grouping, group
// order, section order) is decided here, never by the model.

import type { Entry, EntryMeta, Layout, Section, TailorDecision, TailoredGroup, TailoredItem, TailoredResume } from "@shared/types";
import { SECTIONS } from "@shared/sections";

type DecisionItem = TailorDecision["items"][number];
type SectionRegistry = typeof SECTIONS;
type SectionRule = SectionRegistry[Section];

type Resolved = { item: DecisionItem; entry: Entry };

export function assemble(
  decision: TailorDecision,
  entries: Entry[],
  layout: Layout,
  sections: SectionRegistry = SECTIONS,
): TailoredResume {
  const byId = new Map(entries.map((e) => [e.id, e]));

  const bySection = new Map<Section, Resolved[]>();
  for (const item of decision.items) {
    const entry = byId.get(item.entryId);
    if (!entry) throw new Error(`assemble: unknown entry "${item.entryId}"`);
    const bucket = bySection.get(entry.section) ?? [];
    bucket.push({ item, entry });
    bySection.set(entry.section, bucket);
  }

  const resultSections: TailoredResume["sections"] = [];
  for (const layoutEntry of layout) {
    if (!layoutEntry.enabled) continue;
    const section = layoutEntry.section;
    if (section === "summary") continue;

    const resolved = bySection.get(section);
    if (!resolved || resolved.length === 0) continue;

    resultSections.push({ section, groups: buildGroups(resolved, sections[section]) });
  }

  return {
    signals: decision.signals,
    summary: decision.summary,
    sections: resultSections,
    cut: decision.cut,
  };
}

function buildGroups(resolved: Resolved[], rule: SectionRule): TailoredGroup[] {
  if (!rule.groupBy) {
    const ordered = orderByRegistry(resolved, rule.order);
    return [toGroup(undefined, ordered, rule)];
  }

  const groupBy = rule.groupBy;
  const buckets = new Map<string, Resolved[]>();
  for (const r of resolved) {
    const key = groupBy(r.entry.meta as EntryMeta);
    const bucket = buckets.get(key) ?? [];
    bucket.push(r);
    buckets.set(key, bucket);
  }

  const groups = [...buckets.entries()].map(([heading, members]) => {
    const ordered = [...members].sort((a, b) => a.item.rank - b.item.rank);
    return { heading, ordered, key: groupKey(members, rule.order) };
  });

  groups.sort((a, b) => (rule.order === "recency" ? b.key - a.key : a.key - b.key));

  return groups.map(({ heading, ordered }) => toGroup(heading, ordered, rule));
}

// Order for the top-level unit when there is no grouping: the registry's
// `order` field, applied directly to items (never to `rank` unless the
// section's order IS relevance). Ordering WITHIN a group is always by rank —
// handled separately, in buildGroups.
function orderByRegistry(resolved: Resolved[], order: SectionRule["order"]): Resolved[] {
  const copy = [...resolved];
  switch (order) {
    case "recency":
      return copy.sort((a, b) => b.entry.sortKey - a.entry.sortKey);
    case "relevance":
      return copy.sort((a, b) => a.item.rank - b.item.rank);
    case "manual":
      return copy.sort((a, b) => a.entry.sortKey - b.entry.sortKey);
  }
}

// A group's own sort key, server-computed from its members — never trusted
// from the model: recency = MAX member sortKey, relevance = MIN member rank,
// manual = MIN member sortKey.
function groupKey(members: Resolved[], order: SectionRule["order"]): number {
  switch (order) {
    case "recency":
      return Math.max(...members.map((m) => m.entry.sortKey));
    case "relevance":
      return Math.min(...members.map((m) => m.item.rank));
    case "manual":
      return Math.min(...members.map((m) => m.entry.sortKey));
  }
}

function toGroup(heading: string | undefined, ordered: Resolved[], rule: SectionRule): TailoredGroup {
  const items: TailoredItem[] = ordered.map((r) => ({ entryId: r.entry.id, text: coerceText(r, rule) }));
  const leadRationale = ordered[0]?.item.leadRationale;
  return { heading, leadRationale, items };
}

// rephrase:'none' sections never carry model-composed text — the server
// overrides it with the entry's own facts, verbatim (joined; empty facts
// render as '' and are rendered from `meta` alone downstream).
function coerceText(r: Resolved, rule: SectionRule): string {
  if (rule.rephrase !== "none") return r.item.text;
  return r.entry.facts.join(" ");
}
