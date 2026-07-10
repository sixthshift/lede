// zod schemas — spec.md §4.4, §5, §17.
// TailorDecisionZ is hand-written (never table-derived): it's passed straight
// to the AI SDK's `generateObject` as the LLM output contract.

import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { SECTION_VALUES } from "@shared/sections";
import { formatV2Schema, resolveStoredFormat } from "@shared/format-v2";
import { entries } from "../server/db/schema";

// ── §4.1 EntryMeta, one object per section, strict (reject foreign fields) ──
const experienceMetaZ = z
  .object({
    section: z.literal("experience"),
    company: z.string().min(1).max(120),
    role: z.string().min(1).max(120),
    period: z.string().min(1).max(120),
    location: z.string().min(1).max(120).optional(),
  })
  .strict();

const projectMetaZ = z
  .object({
    section: z.literal("project"),
    name: z.string().min(1).max(120),
    role: z.string().min(1).max(120).optional(),
    period: z.string().min(1).max(120).optional(),
    url: z.string().min(1).max(120).optional(),
  })
  .strict();

const educationMetaZ = z
  .object({
    section: z.literal("education"),
    school: z.string().min(1).max(120),
    degree: z.string().min(1).max(120),
    field: z.string().min(1).max(120).optional(),
    period: z.string().min(1).max(120).optional(),
    location: z.string().min(1).max(120).optional(),
  })
  .strict();

const awardMetaZ = z
  .object({
    section: z.literal("award"),
    title: z.string().min(1).max(120),
    issuer: z.string().min(1).max(120).optional(),
    date: z.string().min(1).max(120).optional(),
  })
  .strict();

const certificationMetaZ = z
  .object({
    section: z.literal("certification"),
    name: z.string().min(1).max(120),
    issuer: z.string().min(1).max(120).optional(),
    date: z.string().min(1).max(120).optional(),
    credentialId: z.string().min(1).max(120).optional(),
    url: z.string().min(1).max(120).optional(),
  })
  .strict();

const publicationMetaZ = z
  .object({
    section: z.literal("publication"),
    title: z.string().min(1).max(120),
    venue: z.string().min(1).max(120).optional(),
    date: z.string().min(1).max(120).optional(),
    authors: z.string().min(1).max(120).optional(),
    url: z.string().min(1).max(120).optional(),
  })
  .strict();

const referenceMetaZ = z
  .object({
    section: z.literal("reference"),
    name: z.string().min(1).max(120),
    relationship: z.string().min(1).max(120).optional(),
    company: z.string().min(1).max(120).optional(),
    email: z.string().min(1).max(120).optional(),
    phone: z.string().min(1).max(120).optional(),
  })
  .strict();

// level (§31.4): CONTENT, 1–5 — the renamable labels for those numbers are
// FORMAT (formatV2Schema's levelLabels), never this schema's concern.
const skillMetaZ = z
  .object({
    section: z.literal("skill"),
    category: z.string().min(1).max(120).optional(),
    level: z.number().int().min(1).max(5).optional(),
  })
  .strict();

const interestMetaZ = z
  .object({
    section: z.literal("interest"),
  })
  .strict();

const languageMetaZ = z
  .object({
    section: z.literal("language"),
    level: z.number().int().min(1).max(5).optional(),
  })
  .strict();

export const entryMetaZ = z.discriminatedUnion("section", [
  experienceMetaZ,
  projectMetaZ,
  educationMetaZ,
  awardMetaZ,
  certificationMetaZ,
  publicationMetaZ,
  referenceMetaZ,
  skillMetaZ,
  interestMetaZ,
  languageMetaZ,
]);

// label sections carry exactly one fact (the label itself); narrative
// sections need at least one; certification/reference allow none.
const LABEL_SECTIONS = new Set(["skill", "interest", "language"]);
const NO_FACTS_REQUIRED = new Set(["certification", "reference"]);

// ── §4.4/§17 entry input, derived from the `entries` table (drizzle-zod) ──
export const entryInput = createInsertSchema(entries, {
  id: z.string().min(1).max(80).optional(),
  section: z.enum(SECTION_VALUES),
  meta: entryMetaZ,
  facts: z.array(z.string().min(1).max(300)).max(12),
  tags: z.array(z.string().min(1).max(40)).max(8),
  framings: z.array(z.string().min(1).max(200)).max(6).nullish(),
  sortKey: z.number().int(),
})
  .omit({ createdAt: true, updatedAt: true })
  .superRefine((entry, ctx) => {
    if (entry.meta.section !== entry.section) {
      ctx.addIssue({
        code: "custom",
        path: ["meta", "section"],
        message: `meta.section "${entry.meta.section}" does not match section "${entry.section}"`,
      });
    }

    if (LABEL_SECTIONS.has(entry.section) && entry.facts.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["facts"],
        message: `section "${entry.section}" requires exactly 1 fact, got ${entry.facts.length}`,
      });
    } else if (
      !LABEL_SECTIONS.has(entry.section) &&
      !NO_FACTS_REQUIRED.has(entry.section) &&
      entry.facts.length < 1
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["facts"],
        message: `section "${entry.section}" requires at least 1 fact`,
      });
    }
  });

export const entryImport = z.array(entryInput).max(200);

// ── DocumentFormat — bounded design-panel overrides, validated the same way
// regardless of storage location (settings.defaultFormat / application.format
// are both JSON columns). Declared ahead of settingsInput/applicationCreate/
// Update below, all of which reference it.
//
// §31/E9-F0d1: the API boundary moved from the v1 shape to `DocumentFormatV2`
// (spec.md §31.2) — `formatV2Schema` (src/shared/format-v2.ts) is the ONE
// engine's bound-enforcing validator; `documentFormatZ` is kept as the name
// every route/consumer already imports (mechanical rename would touch every
// call site for no behavior change), now aliased straight to it. The v1
// zod object this used to be is retired along with the v1 render path.
export const documentFormatZ = formatV2Schema;

// ── v1 DocumentFormat — retired at the E9 cutover (the v1 render path + this
// exact zod object, commit 1ddcaca), resurrected structurally here ONLY as an
// IMPORT-BOUNDARY compat shape (E9-F0d3): a backup file exported before the
// cutover carries this shape in applications[].format,
// applications[].lockedFormat.format, and settings.defaultFormat. Every LIVE
// write path (application create/update, settings PUT) stays `documentFormatZ`
// (v2-only, above) — this widened union exists for routes/backup.ts's
// POST /api/import alone, never re-deriving migration logic.
const FONT_IDS_V1 = [
  "ibm-plex-sans",
  "ibm-plex-serif",
  "ibm-plex-mono",
  "arimo",
  "tinos",
  "carlito",
] as const;
const hexColorV1Z = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const documentFormatV1Z = z.object({
  templateId: z.string().min(1),
  typography: z.object({
    body: z.object({
      family: z.enum(FONT_IDS_V1),
      size: z.number().min(9).max(12),
      lineHeight: z.number().min(1).max(1.8),
    }),
    heading: z.object({
      family: z.enum(FONT_IDS_V1),
      weight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]),
    }),
  }),
  colors: z.object({ primary: hexColorV1Z, text: hexColorV1Z }),
  page: z.object({
    marginX: z.number().min(18).max(72),
    marginY: z.number().min(18).max(72),
    sectionGap: z.number().min(0).max(24),
  }),
  photo: z.object({
    hidden: z.boolean(),
    size: z.number().min(32).max(160),
    shape: z.enum(["circle", "rounded", "square"]),
  }),
  sections: z.partialRecord(
    z.enum(SECTION_VALUES),
    z.object({ columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional() }),
  ),
});

// v1-shaped values fail formatV2Schema (no formatVersion/layout/typeScale/…)
// and fall through to documentFormatV1Z, so the union discriminates by full
// structural validation — the same criterion `isFormatV2` checks, just
// zod-enforced rather than duck-typed. `resolveStoredFormat` (already the
// read-boundary gate for sqlite) does the actual v1->v2 migration, so this
// import boundary reuses the identical function rather than re-deriving it.
export const documentFormatV1OrV2Z = z
  .union([formatV2Schema, documentFormatV1Z])
  .transform((value) => resolveStoredFormat(value));

// ── §4.2/§16 profile input (identity for the header) ──
const profileLinkZ = z.object({
  type: z.enum(["github", "linkedin", "site", "other"]),
  label: z.string().min(1).max(120),
  url: z.string().min(1).max(120),
});

export const profileInput = z.object({
  name: z.string().min(1).max(120),
  headline: z.string().min(1).max(120).nullish(),
  email: z.string().min(1).max(120),
  phone: z.string().min(1).max(120).nullish(),
  location: z.string().min(1).max(120).nullish(),
  links: z.array(profileLinkZ).max(8),
  baseSummary: z.string().min(1).max(2000).nullish(),
  photoUrl: z.string().optional(), // asset is identity; display lives on DocumentFormat.photo (§28.3)
});

// ── §4.2/§9 settings input (provider/model/baseUrl/layout) ──
const layoutEntryZ = z.object({
  section: z.enum([...SECTION_VALUES, "summary"]),
  enabled: z.boolean(),
});

// §9/E9-F5b user-defined format presets — a saved name + DocumentFormat pair,
// no scoring/status fields (locked: presets carry ONLY {id,name,format}).
export const userPresetZ = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  format: documentFormatZ,
});
export type UserPreset = z.infer<typeof userPresetZ>;

export const settingsInput = z.object({
  provider: z.string().min(1).max(120).optional(),
  model: z.string().min(1).max(120).optional(),
  baseUrl: z.string().min(1).max(200).nullish(),
  layout: z.array(layoutEntryZ).optional(),
  paper: z.enum(["letter", "a4"]).optional(),
  defaultFormat: documentFormatZ.optional(), // instance-level fallback for application.format (§28.3)
  presets: z.array(userPresetZ).optional(), // saved format presets (§9/E9-F5b)
});

// ── §27 application input — a tailoring record for one job, no hiring status ──
export const applicationCreate = z.object({
  company: z.string().min(1).max(200).nullish(),
  role: z.string().min(1).max(200).nullish(),
  jobDescription: z.string().min(1).max(20000),
  context: z.string().min(1).max(4000).nullish(),
  targetPages: z.union([z.literal(1), z.literal(2)]).optional(),
  format: documentFormatZ.nullish(), // per-app override of settings.defaultFormat (§28.3)
});

export const applicationUpdate = z.object({
  company: z.string().min(1).max(200).nullish(),
  role: z.string().min(1).max(200).nullish(),
  jobDescription: z.string().min(1).max(20000).optional(),
  context: z.string().min(1).max(4000).nullish(),
  targetPages: z.union([z.literal(1), z.literal(2)]).optional(),
  format: documentFormatZ.nullish(), // per-app override of settings.defaultFormat (§28.3)
});

// ── §5 the model's flat output contract — hand-written, passed straight to generateObject ──
const jdSignalsZ = z.object({
  roleLevel: z.string(),
  weights: z.array(z.string()),
  hardRequirements: z.array(z.string()),
});

export const TailorDecisionZ = z.object({
  signals: jdSignalsZ,
  summary: z.string(),
  items: z.array(
    z.object({
      entryId: z.string().min(1),
      text: z.string(),
      rank: z.number(),
      leadRationale: z.string().optional(),
    }),
  ),
  cut: z.array(
    z.object({
      entryId: z.string(),
      reason: z.string(),
    }),
  ),
});

// ── the letter's flat output contract — model returns judgment only, mirrors
// TailorDecisionZ; body paragraphs' groundedOn holds entry ID strings only,
// never fact text/motivation/context/voice (v2 §grounding) ──
export const LetterDecisionZ = z.object({
  greeting: z.string(),
  body: z
    .array(
      z.object({
        text: z.string(),
        groundedOn: z.array(z.string()),
      }),
    )
    .min(1),
  closing: z.string(),
});
