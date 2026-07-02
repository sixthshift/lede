// Shared domain types — spec.md §4.1 (Entry), §4.2 (Profile/Layout), §5 (Output contract), §6.1 (ProviderId).
// Imported by both server and client via `@shared/types`.

export type Section =
  | 'experience' | 'project' | 'education' | 'award' | 'certification'
  | 'publication' | 'reference' | 'skill' | 'interest' | 'language';

// section-specific provenance — discriminated union on `section`
export type EntryMeta =
  | { section: 'experience';    company: string; role: string; period: string; location?: string }
  | { section: 'project';       name: string; role?: string; period?: string; url?: string }
  | { section: 'education';     school: string; degree: string; field?: string; period?: string; location?: string }
  | { section: 'award';         title: string; issuer?: string; date?: string }
  | { section: 'certification'; name: string; issuer?: string; date?: string; credentialId?: string; url?: string }
  | { section: 'publication';   title: string; venue?: string; date?: string; authors?: string; url?: string }
  | { section: 'reference';     name: string; relationship?: string; company?: string; email?: string; phone?: string }
  | { section: 'skill';         category?: string; level?: string }
  | { section: 'interest' }
  | { section: 'language';      level?: string };

export type Entry = {
  id: string;                 // stable slug, e.g. "cloudcase-rules-engine"
  section: Section;
  meta: EntryMeta;            // must match `section`
  facts: string[];            // FACT-LOCK. The unit of fact. Select/reorder/re-represent around; never invent.
                              //   narrative sections: the bullet's sub-claims
                              //   skill/interest/language: the label itself, e.g. ["TypeScript"]
                              //   certification/reference: often []
  tags: string[];             // grouping/filtering only — NOT selection scoring
  framings?: string[];        // optional pre-written re-representations (angle-specific "ledes")
  sortKey: number;            // YYYYMM(DD) int → deterministic recency/manual order
};

// ── identity (§4.2) ──
export type Profile = {
  name: string;
  headline?: string;
  email: string;
  phone?: string;
  location?: string;
  links: { type: 'github' | 'linkedin' | 'site' | 'other'; label: string; url: string }[];
  baseSummary?: string;        // optional; AI reworks it, else fully generated
};

// ── ordered, toggleable resume sections (§4.2 settings.layout) ──
export type Layout = { section: Section | 'summary'; enabled: boolean }[];

// ── providers (§6.1) ──
export type ProviderId = 'anthropic' | 'openai' | 'google' | 'openai-compatible';

// ── output contract (§5): the model decides, the server assembles ──
export type JDSignals = { roleLevel: string; weights: string[]; hardRequirements: string[] };

// ── what the MODEL returns (schema-enforced via `generateObject`) ──
export type TailorDecision = {
  signals: JDSignals;
  summary: string;                      // generated, or reworked from profile.baseSummary
  items: {
    entryId: string;                    // must match a real entry exactly
    text: string;                       // re-represented facts (server overrides for rephrase:'none' sections)
    rank: number;                       // the tailor's relevance order, global across the item's SECTION; 1 = strongest.
                                        //   items within a group always follow rank (lowest = the group's lede);
                                        //   relevance-ordered sections also order groups by min member rank (§4.3)
    leadRationale?: string;             // set on each group's leading (lowest-rank) item
  }[];
  cut: { entryId: string; reason: string }[];   // buried/dropped + why
};

// ── what the SERVER assembles and the UI renders ──
export type TailoredItem  = { entryId: string; text: string };
export type TailoredGroup = { heading?: string; leadRationale?: string; items: TailoredItem[] }; // e.g. one job
export type TailoredSection = { section: Section; groups: TailoredGroup[] };
export type TailoredResume = {
  signals: JDSignals;
  summary: string;
  sections: TailoredSection[];          // layout order; groups & flat-item order per the section registry
  cut: { entryId: string; reason: string }[];
};
