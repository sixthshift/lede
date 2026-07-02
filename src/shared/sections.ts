// Section registry — single source of per-section behavior (spec.md §4.3).
// Drives prompt policy, ordering enforcement, and rendering from one place.

import type { Section, EntryMeta } from '@shared/types';

export const SECTIONS: Record<Section, {
  label: string;
  rephrase: 'full' | 'light' | 'none';   // how much the AI may re-represent facts
  order: 'recency' | 'relevance' | 'manual';
  groupBy?: (m: EntryMeta) => string;    // rendering group key (e.g. company+role); undefined = flat list
}> = {
  experience:    { label: 'Experience',     rephrase: 'full',  order: 'recency',   groupBy: m => `${(m as any).company} · ${(m as any).role} · ${(m as any).period}` },
  project:       { label: 'Projects',       rephrase: 'full',  order: 'recency',   groupBy: m => (m as any).name },
  education:     { label: 'Education',       rephrase: 'light', order: 'recency',   groupBy: m => `${(m as any).school} · ${(m as any).degree}` },
  award:         { label: 'Awards',         rephrase: 'light', order: 'recency' },
  certification: { label: 'Certifications', rephrase: 'none',  order: 'recency' },
  publication:   { label: 'Publications',   rephrase: 'none',  order: 'recency' },
  reference:     { label: 'References',     rephrase: 'none',  order: 'manual'  },
  skill:         { label: 'Skills',         rephrase: 'none',  order: 'relevance', groupBy: m => (m as any).category ?? '' },
  interest:      { label: 'Interests',      rephrase: 'none',  order: 'relevance' },
  language:      { label: 'Languages',      rephrase: 'none',  order: 'manual'  },
};

export const SECTION_VALUES: Section[] = [
  'experience', 'project', 'education', 'award', 'certification',
  'publication', 'reference', 'skill', 'interest', 'language',
];
