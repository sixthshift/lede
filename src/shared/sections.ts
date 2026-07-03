// Section registry — single source of per-section behavior (spec.md §4.3).
// Drives prompt policy, ordering enforcement, and rendering from one place.

import type { Section, EntryMeta } from '@shared/types';

export const SECTIONS: Record<Section, {
  label: string;
  rephrase: 'full' | 'light' | 'none';   // how much the AI may re-represent facts
  order: 'recency' | 'relevance' | 'manual';
  groupBy?: (m: EntryMeta) => string;    // rendering group key (e.g. company+role); undefined = flat list
  metaText?: (m: EntryMeta) => string;   // rephrase:'none' fallback display text when an entry's facts are empty
}> = {
  experience:    { label: 'Experience',     rephrase: 'full',  order: 'recency',   groupBy: m => `${(m as any).company} · ${(m as any).role} · ${(m as any).period}` },
  project:       { label: 'Projects',       rephrase: 'full',  order: 'recency',   groupBy: m => (m as any).name },
  education:     { label: 'Education',       rephrase: 'light', order: 'recency',   groupBy: m => `${(m as any).school} · ${(m as any).degree}` },
  award:         { label: 'Awards',         rephrase: 'light', order: 'recency' },
  certification: { label: 'Certifications', rephrase: 'none',  order: 'recency',
    metaText: m => [(m as any).name, (m as any).issuer].filter(Boolean).join(' — ') },
  publication:   { label: 'Publications',   rephrase: 'none',  order: 'recency',
    metaText: m => [(m as any).title, (m as any).venue].filter(Boolean).join(' — ') },
  reference:     { label: 'References',     rephrase: 'none',  order: 'manual',
    metaText: m => [(m as any).name, (m as any).relationship].filter(Boolean).join(', ') },
  skill:         { label: 'Skills',         rephrase: 'none',  order: 'relevance', groupBy: m => (m as any).category ?? '' },
  interest:      { label: 'Interests',      rephrase: 'none',  order: 'relevance' }, // no meta fields beyond `section` — the interest name lives in facts
  language:      { label: 'Languages',      rephrase: 'none',  order: 'manual',
    metaText: m => (m as any).level ?? '' }, // no `name` field on language meta (§4.1) — the language name lives in facts
};

export const SECTION_VALUES: Section[] = [
  'experience', 'project', 'education', 'award', 'certification',
  'publication', 'reference', 'skill', 'interest', 'language',
];
