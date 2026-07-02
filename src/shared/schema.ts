// zod schemas — spec.md §4.4, §5, §17.
// TailorDecisionZ is hand-written (never table-derived): it's passed straight
// to the AI SDK's `generateObject` as the LLM output contract.

import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { SECTION_VALUES } from "@shared/sections";
import { entries } from "../server/db/schema";

// ── §4.1 EntryMeta, one object per section, strict (reject foreign fields) ──
const experienceMetaZ = z.object({
  section: z.literal("experience"),
  company: z.string().min(1).max(120),
  role: z.string().min(1).max(120),
  period: z.string().min(1).max(120),
  location: z.string().min(1).max(120).optional(),
}).strict();

const projectMetaZ = z.object({
  section: z.literal("project"),
  name: z.string().min(1).max(120),
  role: z.string().min(1).max(120).optional(),
  period: z.string().min(1).max(120).optional(),
  url: z.string().min(1).max(120).optional(),
}).strict();

const educationMetaZ = z.object({
  section: z.literal("education"),
  school: z.string().min(1).max(120),
  degree: z.string().min(1).max(120),
  field: z.string().min(1).max(120).optional(),
  period: z.string().min(1).max(120).optional(),
  location: z.string().min(1).max(120).optional(),
}).strict();

const awardMetaZ = z.object({
  section: z.literal("award"),
  title: z.string().min(1).max(120),
  issuer: z.string().min(1).max(120).optional(),
  date: z.string().min(1).max(120).optional(),
}).strict();

const certificationMetaZ = z.object({
  section: z.literal("certification"),
  name: z.string().min(1).max(120),
  issuer: z.string().min(1).max(120).optional(),
  date: z.string().min(1).max(120).optional(),
  credentialId: z.string().min(1).max(120).optional(),
  url: z.string().min(1).max(120).optional(),
}).strict();

const publicationMetaZ = z.object({
  section: z.literal("publication"),
  title: z.string().min(1).max(120),
  venue: z.string().min(1).max(120).optional(),
  date: z.string().min(1).max(120).optional(),
  authors: z.string().min(1).max(120).optional(),
  url: z.string().min(1).max(120).optional(),
}).strict();

const referenceMetaZ = z.object({
  section: z.literal("reference"),
  name: z.string().min(1).max(120),
  relationship: z.string().min(1).max(120).optional(),
  company: z.string().min(1).max(120).optional(),
  email: z.string().min(1).max(120).optional(),
  phone: z.string().min(1).max(120).optional(),
}).strict();

const skillMetaZ = z.object({
  section: z.literal("skill"),
  category: z.string().min(1).max(120).optional(),
  level: z.string().min(1).max(120).optional(),
}).strict();

const interestMetaZ = z.object({
  section: z.literal("interest"),
}).strict();

const languageMetaZ = z.object({
  section: z.literal("language"),
  level: z.string().min(1).max(120).optional(),
}).strict();

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
    } else if (!LABEL_SECTIONS.has(entry.section) && !NO_FACTS_REQUIRED.has(entry.section) && entry.facts.length < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["facts"],
        message: `section "${entry.section}" requires at least 1 fact`,
      });
    }
  });

export const entryImport = z.array(entryInput).max(200);

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
});

// ── §4.2/§9 settings input (provider/model/baseUrl/layout) ──
const layoutEntryZ = z.object({
  section: z.enum([...SECTION_VALUES, "summary"]),
  enabled: z.boolean(),
});

export const settingsInput = z.object({
  provider: z.string().min(1).max(120).optional(),
  model: z.string().min(1).max(120).optional(),
  baseUrl: z.string().min(1).max(200).nullish(),
  layout: z.array(layoutEntryZ).optional(),
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
