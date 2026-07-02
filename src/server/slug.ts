// Entry id slug generator — spec.md §17: kebab of section + a distinguishing
// meta field (company/name/school/title/label) + a few fact words, ≤80 chars,
// dedupe by appending -2, -3, ... on collision.
import type { EntryMeta, Section } from "@shared/types";

const MAX_LEN = 80;
const FACT_WORDS = 4;

function kebab(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The one meta field per section that best distinguishes entries within it —
// the "label" case (skill/interest/language) has no such field; the fact
// itself (the label) already carries the distinguishing content.
function distinguishingField(meta: EntryMeta): string {
  switch (meta.section) {
    case "experience":
      return meta.company;
    case "project":
      return meta.name;
    case "education":
      return meta.school;
    case "award":
      return meta.title;
    case "certification":
      return meta.name;
    case "publication":
      return meta.title;
    case "reference":
      return meta.name;
    case "skill":
      return meta.category ?? "";
    case "interest":
    case "language":
      return "";
  }
}

function factWords(facts: string[]): string {
  return (facts[0] ?? "").split(/\s+/).slice(0, FACT_WORDS).join(" ");
}

export type SlugInput = { section: Section; meta: EntryMeta; facts: string[] };

export function generateSlug(entry: SlugInput, existingIds: ReadonlySet<string>): string {
  const base =
    [kebab(entry.section), kebab(distinguishingField(entry.meta)), kebab(factWords(entry.facts))]
      .filter(Boolean)
      .join("-")
      .slice(0, MAX_LEN)
      .replace(/-+$/, "") || kebab(entry.section) || "entry";

  if (!existingIds.has(base)) return base;

  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_LEN - suffix.length)}${suffix}`;
    if (!existingIds.has(candidate)) return candidate;
  }
}
