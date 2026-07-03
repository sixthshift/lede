// Section registry — single source of per-section behavior (spec.md §4.3).
// Drives prompt policy, ordering enforcement, and rendering from one place.

import type { EntryMeta, Section } from "@shared/types";

// The meta variant that belongs to a given section — lets each section's
// groupBy/metaText see its own fields (m.company, m.name, …) instead of the
// whole union. The runtime invariant "meta matches section" is what makes the
// narrowing sound; consumers that hold a general Section re-assert it once.
type MetaOf<S extends Section> = Extract<EntryMeta, { section: S }>;

type SectionConfig<S extends Section> = {
  label: string;
  rephrase: "full" | "light" | "none"; // how much the AI may re-represent facts
  order: "recency" | "relevance" | "manual";
  groupBy?: (m: MetaOf<S>) => string; // rendering group key (e.g. company+role); undefined = flat list
  metaText?: (m: MetaOf<S>) => string; // rephrase:'none' fallback display text when an entry's facts are empty
};

export const SECTIONS: { [S in Section]: SectionConfig<S> } = {
  experience: {
    label: "Experience",
    rephrase: "full",
    order: "recency",
    groupBy: (m) => `${m.company} · ${m.role} · ${m.period}`,
  },
  project: { label: "Projects", rephrase: "full", order: "recency", groupBy: (m) => m.name },
  education: {
    label: "Education",
    rephrase: "light",
    order: "recency",
    groupBy: (m) => `${m.school} · ${m.degree}`,
  },
  award: { label: "Awards", rephrase: "light", order: "recency" },
  certification: {
    label: "Certifications",
    rephrase: "none",
    order: "recency",
    metaText: (m) => [m.name, m.issuer].filter(Boolean).join(" — "),
  },
  publication: {
    label: "Publications",
    rephrase: "none",
    order: "recency",
    metaText: (m) => [m.title, m.venue].filter(Boolean).join(" — "),
  },
  reference: {
    label: "References",
    rephrase: "none",
    order: "manual",
    metaText: (m) => [m.name, m.relationship].filter(Boolean).join(", "),
  },
  skill: {
    label: "Skills",
    rephrase: "none",
    order: "relevance",
    groupBy: (m) => m.category ?? "",
  },
  // interest has no meta fields beyond `section` — the interest name lives in facts
  interest: { label: "Interests", rephrase: "none", order: "relevance" },
  // language meta carries no `name` field (§4.1) — the language name lives in facts
  language: {
    label: "Languages",
    rephrase: "none",
    order: "manual",
    metaText: (m) => m.level ?? "",
  },
};

export const SECTION_VALUES: Section[] = [
  "experience",
  "project",
  "education",
  "award",
  "certification",
  "publication",
  "reference",
  "skill",
  "interest",
  "language",
];
