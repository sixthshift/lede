// Shared domain types — spec.md §4.1 (Entry), §4.2 (Profile/Layout), §5 (Output contract), §6.1 (ProviderId).
// Imported by both server and client via `@shared/types`.

// DocumentFormatV2 (spec.md §31.2, epic E9) lives in format-v2.ts; imported
// here (and re-exported at the bottom of this file) so LockedFormat/Application
// below — and every consumer importing document-format types from this one
// place — can reference it without a second import.
import type { DocumentFormatV2 } from "@shared/format-v2";

export type Section =
  | "experience"
  | "project"
  | "education"
  | "award"
  | "certification"
  | "publication"
  | "reference"
  | "skill"
  | "interest"
  | "language";

// section-specific provenance — discriminated union on `section`
// skill/language `level` (§31.4): a CONTENT value 1–5; the 5 renamable
// labels shown for those numbers are FORMAT (levelDisplay/levelLabels,
// src/shared/format-v2.ts) — tailoring never reads level (§1 tag-scoring
// tripwire extends to levels: level-scoring is a failed ticket).
export type EntryMeta =
  | { section: "experience"; company: string; role: string; period: string; location?: string }
  | { section: "project"; name: string; role?: string; period?: string; url?: string }
  | {
      section: "education";
      school: string;
      degree: string;
      field?: string;
      period?: string;
      location?: string;
    }
  | { section: "award"; title: string; issuer?: string; date?: string }
  | {
      section: "certification";
      name: string;
      issuer?: string;
      date?: string;
      credentialId?: string;
      url?: string;
    }
  | {
      section: "publication";
      title: string;
      venue?: string;
      date?: string;
      authors?: string;
      url?: string;
    }
  | {
      section: "reference";
      name: string;
      relationship?: string;
      company?: string;
      email?: string;
      phone?: string;
    }
  | { section: "skill"; category?: string; level?: number }
  | { section: "interest" }
  | { section: "language"; level?: number };

export type Entry = {
  id: string; // stable slug, e.g. "cloudcase-rules-engine"
  section: Section;
  meta: EntryMeta; // must match `section`
  facts: string[]; // FACT-LOCK. The unit of fact. Select/reorder/re-represent around; never invent.
  //   narrative sections: the bullet's sub-claims
  //   skill/interest/language: the label itself, e.g. ["TypeScript"]
  //   certification/reference: often []
  tags: string[]; // grouping/filtering only — NOT selection scoring
  framings?: string[]; // optional pre-written re-representations (angle-specific "ledes")
  sortKey: number; // YYYYMM(DD) int → deterministic recency/manual order
};

// ── identity (§4.2) ──
export type Profile = {
  name: string;
  headline?: string;
  email: string;
  phone?: string;
  location?: string;
  links: { type: "github" | "linkedin" | "site" | "other"; label: string; url: string }[];
  baseSummary?: string; // optional; AI reworks it, else fully generated
  photoUrl?: string; // asset is identity; display (shown/size/shape) lives on DocumentFormat.photo (§28.3)
};

// ── ordered, toggleable resume sections (§4.2 settings.layout) ──
export type Layout = { section: Section | "summary"; enabled: boolean }[];

// ── providers (§6.1) ──
export type ProviderId = "anthropic" | "openai" | "google" | "openai-compatible";

// ── page model (§28.1): paper is a global setting, targetPages is per-application ──
export type Paper = "letter" | "a4";

// ── output contract (§5): the model decides, the server assembles ──
export type JDSignals = { roleLevel: string; weights: string[]; hardRequirements: string[] };

// ── what the MODEL returns (schema-enforced via `generateObject`) ──
export type TailorDecision = {
  signals: JDSignals;
  summary: string; // generated, or reworked from profile.baseSummary
  items: {
    entryId: string; // must match a real entry exactly
    text: string; // re-represented facts (server overrides for rephrase:'none' sections)
    rank: number; // the tailor's relevance order, global across the item's SECTION; 1 = strongest.
    //   items within a group always follow rank (lowest = the group's lede);
    //   relevance-ordered sections also order groups by min member rank (§4.3)
    leadRationale?: string; // set on each group's leading (lowest-rank) item
  }[];
  cut: { entryId: string; reason: string }[]; // buried/dropped + why
};

// ── what the MODEL returns for a cover letter (schema-enforced via
// `generateObject`) — lightly structured: greeting / body paragraphs / closing.
// Mirrors TailorDecision's judgment-only shape (v2 §grounding). ──
export type LetterDecision = {
  greeting: string;
  body: {
    text: string;
    groundedOn: string[]; // entry ID strings this paragraph's facts trace to; [] for a hand-added paragraph
  }[];
  closing: string;
};

// ── what the SERVER assembles and stores for a cover letter — same three
// parts as LetterDecision; groundedOn survives assembly untouched. ──
export type CoverLetter = {
  greeting: string;
  body: {
    text: string;
    groundedOn: string[];
  }[];
  closing: string;
};

// ── what the SERVER assembles and the UI renders ──
// level (E9-F4b2): copied verbatim from the source entry's meta.level at
// assemble time — skill/language only (the only EntryMeta variants that
// carry it), undefined otherwise. Never model-derived; tailoring stays
// blind to it (§31.4) — this is display plumbing, not scoring.
export type TailoredItem = { entryId: string; text: string; level?: number };
// headingParts (E9-F2d): the SAME provenance as `heading` (assemble()'s
// groupBy key), just not yet joined into one string — title/subtitle are
// always the entry's own meta fields (e.g. role/company), `date` is the
// entry's own freeform period/date string, unformatted. ADDITIVE: `heading`
// stays the string every existing renderer/consumer already reads; a
// snapshot from before this ticket has no `headingParts` and still renders
// via the `heading` fallback (src/client/document/sections.tsx).
export type TailoredGroupHeadingParts = {
  title: string;
  subtitle?: string;
  date?: string;
  // location (E9-F2e): the entry's own meta.location, same provenance rule as
  // title/subtitle/date — only experience/education carry a location field
  // on EntryMeta; project/other groupable sections have none, so it stays
  // undefined there.
  location?: string;
};
export type TailoredGroup = {
  heading?: string;
  headingParts?: TailoredGroupHeadingParts;
  leadRationale?: string;
  items: TailoredItem[];
}; // e.g. one job
export type TailoredSection = { section: Section; groups: TailoredGroup[] };
export type TailoredResume = {
  signals: JDSignals;
  summary: string;
  sections: TailoredSection[]; // layout order; groups & flat-item order per the section registry
  cut: { entryId: string; reason: string }[];
};

// ── document design layer (§28.3): the curated, self-hosted font registry ──
// (a later ticket registers the actual faces via Font.register; metric
// stand-ins for the Word classics: Arimo→Arial, Tinos→Times New Roman, Carlito→Calibri)
export type FontId =
  | "ibm-plex-sans"
  | "ibm-plex-serif"
  | "ibm-plex-mono"
  | "arimo"
  | "tinos"
  | "carlito";

// ── bounded design-panel overrides on top of a template (§28.3) ──
// persisted per application as `format`, with instance defaults in
// `settings.defaultFormat`. The renderer never cuts (§28.4) — this only styles.
export type DocumentFormat = {
  templateId: string;
  typography: {
    body: { family: FontId; size: number; lineHeight: number }; // size 9–12pt
    heading: { family: FontId; weight: 400 | 500 | 600 | 700 };
  };
  colors: { primary: string; text: string }; // primary drives headings/rules/links per template
  page: { marginX: number; marginY: number; sectionGap: number }; // pt, bounded ranges
  photo: { hidden: boolean; size: number; shape: "circle" | "rounded" | "square" }; // default hidden
  sections: Partial<Record<Section, { columns?: 1 | 2 | 3 }>>; // e.g. skills in 2 columns
};

// ── frozen at lock time alongside the resume snapshot (§28.3) — mirrors the
// DB shape (server/db/schema.ts's LockedFormat); the fit ladder is a later
// epic, so resolvedDensity is 'as-set' = 'comfortable' until then. §31/E9-F0d1:
// the persisted format moved from v1 `DocumentFormat` to `DocumentFormatV2` —
// the ONE engine's input (src/shared/format-v2.ts) ──
export type LockedFormat = {
  format: DocumentFormatV2;
  resolvedDensity: "comfortable" | "standard" | "compact";
  paper: Paper;
};

// ── a tailoring record for one job — NOT a hiring tracker; no status field (§27) ──
export type Application = {
  id: string;
  company?: string;
  role?: string;
  jobDescription: string;
  context?: string; // guides emphasis only — never a fact source
  targetPages: 1 | 2; // page budget for this role, default 1 (§28.1)
  format: DocumentFormatV2 | null; // per-app override of settings.defaultFormat (§28.3, v2 since E9-F0d1)
  current: TailoredResume | null;
  locked: TailoredResume | null;
  lockedFormat: LockedFormat | null; // frozen at lock time (§28.3)
  genState: "untailored" | "tailoring" | "tailored" | "failed";
  currentMeta: { at: number; provider: ProviderId; model: string } | null;
  createdAt: number;
  updatedAt: number;
};

// ── DocumentFormat v2 (spec.md §31.2, epic E9) — additive; re-exported here
// so consumers can keep importing document-format types from one place. The
// v1 `DocumentFormat` above is unchanged; see src/shared/format-v2.ts. ──
export type { DocumentFormatV2 } from "@shared/format-v2";
