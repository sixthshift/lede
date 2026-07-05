// Drizzle schema — spec.md §4.2. VERBATIM: the four tables (entries, profile,
// settings, secrets). Pure — imports ONLY 'drizzle-orm/sqlite-core' + 'drizzle-orm'
// so the client can import table types without pulling in better-sqlite3 (the
// native driver lives ONLY in db/index.ts).
import { sqliteTable, text, integer, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

import type { EntryMeta, Paper, ProviderId, Section, TailoredResume } from "@shared/types";

// ── all resume content ────────────────────────────────────
export const entries = sqliteTable("entries", {
  id: text("id").primaryKey(),
  section: text("section").notNull(), // Section union
  meta: text("meta", { mode: "json" }).notNull().$type<EntryMeta>(),
  facts: text("facts", { mode: "json" }).notNull().$type<string[]>(),
  tags: text("tags", { mode: "json" }).notNull().$type<string[]>(),
  framings: text("framings", { mode: "json" }).$type<string[] | null>(),
  sortKey: integer("sort_key").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ── identity + socials + optional base summary (singleton) ─
export const profile = sqliteTable(
  "profile",
  {
    id: integer("id").primaryKey().default(1),
    name: text("name").notNull().default(""),
    headline: text("headline"),
    email: text("email").notNull().default(""),
    phone: text("phone"),
    location: text("location"),
    links: text("links", { mode: "json" })
      .notNull()
      .$type<{ type: "github" | "linkedin" | "site" | "other"; label: string; url: string }[]>()
      .default([]),
    baseSummary: text("base_summary"), // optional; AI reworks it, else fully generated
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({ singleton: check("profile_singleton", sql`${t.id} = 1`) }),
);

// ── non-secret prefs (singleton) ──────────────────────────
export const settings = sqliteTable(
  "settings",
  {
    id: integer("id").primaryKey().default(1),
    provider: text("provider").notNull().default("anthropic"), // ProviderId
    model: text("model").notNull().default("claude-opus-4-8"),
    baseUrl: text("base_url"), // only for the openai-compatible provider
    layout: text("layout", { mode: "json" })
      .notNull() // ordered, toggleable resume sections
      .$type<{ section: Section | "summary"; enabled: boolean }[]>()
      .default([]),
    paper: text("paper").notNull().default("letter").$type<Paper>(), // page size, global (§28.1)
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({ singleton: check("settings_singleton", sql`${t.id} = 1`) }),
);

// ── a tailoring record for one job, NOT a hiring tracker (§27) ──
export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  company: text("company"),
  role: text("role"),
  jobDescription: text("job_description").notNull(),
  context: text("context"), // guides emphasis only — never a fact source
  targetPages: integer("target_pages").notNull().default(1).$type<1 | 2>(), // page budget for this role (§28.1)
  current: text("current", { mode: "json" }).$type<TailoredResume | null>(),
  locked: text("locked", { mode: "json" }).$type<TailoredResume | null>(),
  genState: text("gen_state").notNull().default("untailored"), // 'untailored'|'tailoring'|'tailored'|'failed'
  currentMeta: text("current_meta", { mode: "json" }).$type<{
    at: number;
    provider: ProviderId;
    model: string;
  } | null>(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ── sensitive material, ISOLATED (singleton) ──────────────
export const secrets = sqliteTable(
  "secrets",
  {
    id: integer("id").primaryKey().default(1),
    apiKeyEnc: text("api_key_enc", { mode: "json" }) // AES-256-GCM, encrypted w/ LEDE_MASTER_KEY. Reversible.
      .$type<{ iv: string; tag: string; ciphertext: string } | null>(),
    apiKeyValidatedAt: integer("api_key_validated_at"),
    auth: text("auth", { mode: "json" }) // scrypt hash + salt. One-way, NOT encryption.
      .$type<{ hash: string; salt: string } | null>(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({ singleton: check("secrets_singleton", sql`${t.id} = 1`) }),
);
