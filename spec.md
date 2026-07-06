# Lede — Build Spec

_A self-hosted resume-tailoring tool that decides which of your experience **leads** for a specific role. Repositioning judgment, not keyword-matching._

Written to be implemented in one shot to an established MVP. Every decision that would otherwise stall a build is locked here; where a decision was a judgment call, the reasoning is stated inline so it can be overridden deliberately.

---

## 0. What Lede is (framing — read first)

Lede is a **real, self-hosted product**. A person runs their own instance (Docker) and uses it to tailor their resume to specific jobs. Not a portfolio throwaway, not a hosted SaaS.

- **Deployment: self-hosted, single-user per instance.** Each person deploys their own copy. No accounts, no multi-tenancy — one instance, one user. A light single-password gate protects the instance on a network.
- **Bring-your-own-key (BYOK), any provider.** The user supplies their own AI provider key (OpenAI, Anthropic, Google, or any OpenAI-compatible endpoint); the instance stores it encrypted and spends the user's own tokens. Operator and user are the same person.
- **How we choose tools:** on merit and robustness, and be able to defend the choice. Pick the smallest thing that genuinely serves the product; add weight when the problem is real. §20 lists what's in and what's deferred, each with its reason.

**Thesis / differentiator:** every existing tool (Teal, Rezi, auto-appliers) does keyword-match tailoring — the cheap half. None do repositioning. That judgment is the product. The name encodes it: a *lede* is the opening line of a story, chosen fresh for each one.

---

## 1. The core abstraction: the Entry

**Everything on a resume is an Entry: a discrete unit of fact the AI can select, order, cut, and — where the section allows — re-represent, but never invent beyond.** This is the whole domain. An entry's `facts` are the fact-lock (the quotable source of truth); the AI composes and draws upon them to derive JD-specific representations without fabricating.

The one non-negotiable principle: **selection and ordering are judged from `facts`, not from `tags`.** A closed tag vocabulary *is* keyword-matching — the thing we reject. All of a user's entries fit in the prompt, so the model reads the actual facts against the actual JD and judges relevance directly. Tags are for grouping and filtering only, never scoring. If you score `entry.tags ∩ jd.signals`, you've rebuilt Teal.

Corollaries:
- **One unified `entries` model**, discriminated by `section` (experience, project, education, award, certification, publication, reference, skill, interest, language). Sections differ only in their metadata and in how much the AI may re-represent them — captured by the **section registry** (§4.3), not by separate tables.
- **The summary is generated output**, composed fresh per JD from selected entries — not stored content (a user may keep an optional `baseSummary` for the AI to rework).
- **Granularity rule:** an entry is the smallest independently selectable/orderable unit. For narrative sections that's ≈ one bullet's worth — a job with 5 accomplishments is 5 experience entries, not one entry with 20 facts. This is what makes "select and cut" mean anything.
- **Skills are explicit entries**, curated by the user and selected/ordered by the JD — *not* derived from tags. (Tags may *suggest* skills as a bonus; they are not the mechanism.)
- **Two ordering axes, generalized by the registry:** recency-ordered sections (experience, education, publications…) are server-sorted by `sortKey` and never reordered across their group; relevance/manual sections (skills, awards…) the tailor may order.

---

## 2. Scope

**In scope (MVP):**
- **Applications** (§27): a job application is a persistent entity — a JD + optional tailoring context + the tailored, reordered resume it produces, with an explicit rationale for every lead decision. One tailored résumé per application, kept.
- An entry library (§26) that works as an intentionally over-complete **information bank** — section-aware editor, persistence, JSON import/export, and browse/filter that scales with the corpus.
- A reasoning UI surfacing *why* each section leads the way it does.
- Deterministic render to a clean, ATS-graded document (single-column `strict` templates by default) → real PDF export via the document engine (§28).
- BYOK: enter/validate/store (encrypted) a provider key (Anthropic, OpenAI, Google, or OpenAI-compatible); pick provider + model.
- A light password gate.
- Docker packaging for self-hosting.

**Section rollout:** the *schema* accommodates all ten sections now (so it's never reworked). Ship the pipeline + editor for **experience, project, education, and skill** first (the sections that move a hiring decision); the rest (award, certification, publication, interest, language, reference) come online as data + rendering, since the engine already handles their shape.

**Out of scope, with the merit reason (§20 expands):** no multi-user/accounts/hosted auth (single-user self-host); no vector DB/RAG (entries fit in the prompt); no Postgres (single-file SQLite is the right self-host fit); no auto-apply/scraping/ATS integration; **Applications are tailoring records, not a job tracker** — no application-status pipelines (applied/interviewing/rejected), kanban, or reminders (§27); the only status an application carries is its *generation* state, never a *hiring* state.

---

## 3. Architecture

Single Fastify service + Vite React SPA. One process, one container.

```
React SPA (Vite)                 Fastify API
──────────────────────           ──────────────────────────────────
Login (password gate) ─────────▶ /api/auth/*     session cookie
Settings (key, model) ─────────▶ /api/settings   key → encrypt → SQLite
Entry library editor  ─────────▶ /api/entries    CRUD → SQLite (Drizzle)
JD paste + tailor     ─────────▶ /api/tailor     decrypt key → provider → { resume }
Review + reorder      ◀───────── returns TailoredResume (+ rationale)
Export (PDF)          ── client  react-pdf render — preview IS the file (§28)
```

- **Dev:** Vite proxies `/api/*` to Fastify. **Prod:** Fastify serves the built SPA from `dist/` and `/api/*`. One port, one Docker container.
- The model call is **server-side** (protects the tailoring prompt IP). The user's key is decrypted in memory for the call and never leaves the server.

### 3.1 Tech stack (locked — full ledger §20)

| Concern | Choice | Merit reason |
|---|---|---|
| Runtime | Node ≥ 20, TypeScript, ESM | Modern default; SDK is ESM-first. |
| API | Fastify 4 | Small, fast, first-class TS; good session/static plugins. |
| DB | SQLite (`better-sqlite3`), single file, WAL | Ideal for single-user self-host — one file to back up, nothing to run. |
| ORM/migrations | Drizzle (`drizzle-orm` + `drizzle-kit`) | Typed queries + real migrations so instance upgrades evolve the schema safely. |
| LLM | Vercel AI SDK (`ai` + `@ai-sdk/*`) | Provider-agnostic (OpenAI, Anthropic, Google, OpenAI-compatible); `generateObject` returns a zod-validated `TailorDecision` across providers. |
| Frontend | React 18 + Vite | Fast dev loop. |
| UI primitives | shadcn/ui (Radix-based, copied in) | Accessible primitives done right + Tailwind-styled + code you own and re-theme. |
| Styling | Tailwind + shadcn theme mapped to our tokens | Velocity + consistency; re-themed so it isn't generic (§12). |
| Server state | TanStack Query | Caching, mutations, loading/error ergonomics. |
| Routing | `react-router-dom` | Real URLs; standard, cheap. |
| Validation | `zod` (+ `drizzle-zod`) | One lib; derive DB shapes from Drizzle, hand-write the LLM-output schema. |
| Crypto/auth | Node `crypto` (AES-256-GCM, scrypt) + `@fastify/secure-session` | No extra native crypto deps; encrypted session cookie. |

---

## 4. Data domain

Single-user → no `user_id` anywhere. **Four tables:** `entries` (all resume content), `profile` (identity), `settings` (prefs), `secrets` (sensitive material, isolated).

### 4.1 The Entry (TS domain type)

```ts
// src/shared/types.ts
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
```

An experience "job" is the set of experience entries sharing the same `company`/`role`/`period`; a project is entries sharing `name`; a skill is a single entry whose `facts[0]` is the skill. Grouping is a *rendering* concern driven by `meta`, not separate tables.

### 4.2 Drizzle schema

```ts
// src/server/db/schema.ts
import { sqliteTable, text, integer, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ── all resume content ────────────────────────────────────
export const entries = sqliteTable('entries', {
  id:        text('id').primaryKey(),
  section:   text('section').notNull(),                       // Section union
  meta:      text('meta',    { mode: 'json' }).notNull().$type<EntryMeta>(),
  facts:     text('facts',   { mode: 'json' }).notNull().$type<string[]>(),
  tags:      text('tags',    { mode: 'json' }).notNull().$type<string[]>(),
  framings:  text('framings',{ mode: 'json' }).$type<string[] | null>(),
  sortKey:   integer('sort_key').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// ── identity + socials + optional base summary (singleton) ─
export const profile = sqliteTable('profile', {
  id:          integer('id').primaryKey().default(1),
  name:        text('name').notNull().default(''),
  headline:    text('headline'),
  email:       text('email').notNull().default(''),
  phone:       text('phone'),
  location:    text('location'),
  links:       text('links', { mode: 'json' }).notNull()
                 .$type<{ type: 'github'|'linkedin'|'site'|'other'; label: string; url: string }[]>().default([]),
  baseSummary: text('base_summary'),                          // optional; AI reworks it, else fully generated
  updatedAt:   integer('updated_at').notNull(),
}, (t) => ({ singleton: check('profile_singleton', sql`${t.id} = 1`) }));

// ── non-secret prefs (singleton) ──────────────────────────
export const settings = sqliteTable('settings', {
  id:        integer('id').primaryKey().default(1),
  provider:  text('provider').notNull().default('anthropic'),   // ProviderId
  model:     text('model').notNull().default('claude-opus-4-8'),
  baseUrl:   text('base_url'),                                   // only for the openai-compatible provider
  layout:    text('layout', { mode: 'json' }).notNull()       // ordered, toggleable resume sections
               .$type<{ section: Section | 'summary'; enabled: boolean }[]>().default([]),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({ singleton: check('settings_singleton', sql`${t.id} = 1`) }));

// ── sensitive material, ISOLATED (singleton) ──────────────
export const secrets = sqliteTable('secrets', {
  id:                integer('id').primaryKey().default(1),
  apiKeyEnc:         text('api_key_enc', { mode: 'json' })    // AES-256-GCM, encrypted w/ LEDE_MASTER_KEY. Reversible.
                       .$type<{ iv: string; tag: string; ciphertext: string } | null>(),
  apiKeyValidatedAt: integer('api_key_validated_at'),
  auth:              text('auth', { mode: 'json' })           // scrypt hash + salt. One-way, NOT encryption.
                       .$type<{ hash: string; salt: string } | null>(),
  updatedAt:         integer('updated_at').notNull(),
}, (t) => ({ singleton: check('secrets_singleton', sql`${t.id} = 1`) }));
```

- **Secrets isolated in one table** so exports/data-dumps trivially exclude them and the "write-only, never returned" contract has a clear home. API key is *encrypted* (reversible — needed to call the provider); password is *hashed* (one-way). Different operations, clearly separated.
- **Singletons** via `id` default 1 + `CHECK (id = 1)`; on boot (post-migration) `INSERT OR IGNORE` each so reads always find a row. The seeded settings row sets `layout` to every section enabled, ordered summary → experience → project → skill → education → award → certification → publication → language → interest → reference — `[]` is only the column default; an empty layout would render an empty resume.
- **No join tables, no FKs.** `facts`/`tags`/`framings` are JSON arrays (normalizing buys nothing at this scale and would invite tag-scoring). No indexes beyond PKs — ordering is in-memory at this size.

### 4.3 The section registry (single source of per-section behavior)

One config drives the prompt policy, ordering enforcement, and rendering — so section behavior lives in exactly one place.

```ts
// src/shared/sections.ts
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
```

`order` sets the top-level unit's ordering — groups if `groupBy` is set, else items: `recency` sorts by `sortKey` (a group's key is the max of its members'; server-computed, never trusted from the model), `relevance` follows the tailor's `rank` (§5 — section-global, so groups sort by ascending min member rank and flat items by rank), `manual` follows `sortKey` as a user-set order. **Items within a group are always ordered by `rank`** — that is the "which bullet leads" decision, the one ordering the model owns.

### 4.4 Validation layer (zod, derived where possible)

`drizzle-zod` derives base validators from the schema; override JSON columns and add limits (drizzle-zod can't infer bounds), and validate `meta` as a discriminated union keyed on `section`.

```ts
// src/shared/schema.ts (sketch)
export const entryMetaZ = z.discriminatedUnion('section', [ /* one object per section, per §4.1 */ ]);

export const entryInput = createInsertSchema(entries, {
  id:       z.string().min(1).max(80).optional(),          // server slugs if absent
  section:  z.enum(SECTION_VALUES),
  meta:     entryMetaZ,                                     // refine: meta.section === entry.section
  facts:    z.array(z.string().min(1).max(300)).max(12),   // narrative ≥1; label sections exactly 1; empties allowed for cert/ref
  tags:     z.array(z.string().min(1).max(40)).max(8),
  framings: z.array(z.string().min(1).max(200)).max(6).nullish(),
  sortKey:  z.number().int(),
}).omit({ createdAt: true, updatedAt: true })
  .superRefine((e, ctx) => { /* meta.section must equal section; per-section facts arity */ });

export const entryImport = z.array(entryInput).max(200);
export const profileInput = z.object({ /* name, email, links[], baseSummary?, … per §4.2 */ });
```

The one schema **not** derived from a table is `TailorDecisionZ` (§5) — the LLM output contract, hand-written and passed directly to the AI SDK's `generateObject` as its schema. It (and the assembled `TailoredResume`) describe transient objects, never rows.

---

## 5. Output contract: the model decides, the server assembles

The model returns **judgment only** — a flat decision object. The server assembles it into the final ordered resume (§6.1 `assemble`). This keeps every structural choice (grouping, group order, section order) deterministic and out of the model's hands — where a model quietly errs.

```ts
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
```

- The model owns: signals, select/cut, `rank`, the composed `text`, per-group `leadRationale`, and the summary.
- The server owns (in `assemble`): grouping by the registry's `groupBy`, group/flat order by the registry's `order` (relevance = ascending min member rank), items-within-group by `rank`, coercing `text` for `rephrase:'none'` sections (the facts, verbatim; entries with empty `facts` — certification/reference — get `text: ''` and render from `meta` alone), and filtering to sections enabled in `settings.layout`.
- `leadRationale` lives on the group (per job) — the demo-valuable "why this bullet opens this job." `cut[]` makes burying legible.

---

## 6. The tailoring pipeline (`/api/tailor` — the actual product)

Everything else is CRUD. Steps 1–4 are one structured LLM call returning a flat decision; the server then assembles the structure and runs validation (step 5) — both deterministic.

1. **JD → signals.** What the company weights, role level, hard requirements — from prose, not surface keywords.
2. **Select + order.** Score each entry by *reading its facts*. Decide survivors, cuts, and order — within the section registry's rules.
3. **Decide the lede.** Per tailorable section, choose what leads and write `leadRationale`.
4. **Compose.** Write `summary`; for each item, re-represent its facts per the section's `rephrase` policy (`full`/`light`/`none`), grounded strictly in `facts`.
5. **Validate (deterministic).** Every item traces to a real entry; every number traces to that entry's facts. §6.3.

### 6.1 The engine (swappable — so success criteria run without a key)

The model call sits behind a `TailorEngine` interface. `tailor()` orchestrates engine → `assemble` → `validate` and is engine-agnostic, so the whole pipeline is testable, demoable, and CI-runnable **with no API key**. Only the real engine needs one.

```ts
// src/server/tailor/engine.ts
export interface TailorEngine { decide(jd: string, entries: Entry[]): Promise<TailorDecision>; }

// real — provider-agnostic via the Vercel AI SDK; uses the user's decrypted key (production)
export class ProviderEngine implements TailorEngine {
  constructor(private cfg: { provider: ProviderId; model: string; apiKey: string; baseURL?: string }) {}
  async decide(jd: string, entries: Entry[]): Promise<TailorDecision> {
    const model = resolveModel(this.cfg);                        // AI SDK LanguageModel (providers registry)
    const { object } = await generateObject({
      model,
      schema: TailorDecisionZ,                                   // AI SDK enforces + validates against the zod schema
      system: `${SYSTEM_PROMPT}\n\n${renderLibrary(entries)}`,   // frozen prompt + library (cache-stable)
      prompt: `Tailor for this job description:\n\n${jd}`,       // volatile part last
      providerOptions: providerOptionsFor(this.cfg.provider),   // Anthropic: thinking/effort + cache_control; others: sane defaults
    });
    return object;   // already validated to TailorDecision; retry once on failure, then 502
  }
}

// keyless — replays a recorded decision (tests / CI / demo); no API key, no cost
export class FixtureEngine implements TailorEngine {
  async decide(jd: string, entries: Entry[]): Promise<TailorDecision> {
    return loadFixtureDecision(jd, entries);   // by hash(jd, entries); recorded via scripts/record-fixtures.ts
  }
}

// orchestration — engine-agnostic, deterministic, keyless-testable
export async function tailor(engine: TailorEngine, jd: string, entries: Entry[], layout: Layout, baseSummary?: string | null): Promise<TailoredResume> {
  const decision = await engine.decide(jd, entries);        // the ONLY model-dependent step
  const resume = assemble(decision, entries, layout, SECTIONS);
  validateNoFabrication(resume, entries, baseSummary);
  return resume;
}
```

- **Engine selection:** production uses `ProviderEngine` with the user's chosen provider + key; dev/test/demo use `FixtureEngine` (env `LEDE_TAILOR_ENGINE` = `live` | `fixture`, default `fixture` under `NODE_ENV=test`). No key required to exercise everything except live model judgment. A fixture miss (no recording for `hash(jd, entries)`) fails loud — 422 `{ error: 'no_fixture' }` naming the recorded scenarios, never a silent fallback — so fixture-mode demos drive the recorded JDs.
- `SYSTEM_PROMPT` is frozen; `renderLibrary` serializes entries deterministically (by section, then `sortKey` desc, then `id`; stable key order); the volatile JD sits last. For the Anthropic provider the frozen prefix is marked with cache-control (via `providerOptions`) so repeated tailors reuse it at ~0.1×; other providers cache per their own rules (best-effort).
- The model returns a flat `TailorDecision` (§5); `assemble()` groups, orders, and coerces per the section registry + `settings.layout`. The model never controls structure.
- The AI SDK's `generateObject` takes the `TailorDecisionZ` zod schema directly and returns a validated object — it derives each provider's structured-output format itself, so there's no separate JSON-schema step. Our parse/retry stays as the safety net for weaker models.
- **Default provider/model: Anthropic `claude-opus-4-8`** (judgment task); the user picks provider + model in Settings since it's their tokens. Structured-output reliability and quality vary by model — the eval (§25) is how you vet one.

**Providers** live in `src/shared/providers.ts` — a `PROVIDERS` registry mapping each `ProviderId` (`anthropic` | `openai` | `google` | `openai-compatible`) to a label, a curated model list (free-text model id also allowed), and a default. `resolveModel({ provider, model, apiKey, baseURL })` builds the AI SDK model (`createAnthropic` / `createOpenAI` / `createGoogleGenerativeAI`, or `createOpenAI` with a custom `baseURL` for the compatible case — Ollama, OpenRouter, etc.). `providerOptionsFor` applies provider-specific extras (Anthropic thinking/effort + prompt-cache control; sane defaults elsewhere).

### 6.2 The prompt (the product's IP)

Encodes: facts-not-tags; the fact-lock (never invent, never strengthen — "contributed to" ≠ "led"); the section registry's rephrase policy (`full`/`light`/`none`, generated from the registry so prompt and code never drift); rank-within-group as the lede; a `leadRationale` on each group's leading item tied to a named JD signal; and return-only-the-flat-`TailorDecision` with every number grounded in facts. Full text lives in `prompt.ts` (the draft agreed in design).

**Tailoring context (from an Application, §27) — a hard boundary.** An application may carry free-text context beyond the JD ("this role stresses X; I have adjacent Y"). It is fed to the prompt **only to guide selection and emphasis** — it is *not* a source of quotable facts. The fact-lock is unchanged: every kept item and every number still traces to an **entry**'s `facts` (§6.3), never to context or JD text. If context names a real fact worth using, the flow's answer is to **promote it to a Library entry**, not to let the model quote loose prose. `validateNoFabrication` continues to check against `entries` alone — context is deliberately absent from `keptBlob`, so it can never launder a fabrication.

### 6.3 No-fabrication validation (deterministic, honestly imperfect — §23)

```ts
function validateNoFabrication(resume: TailoredResume, entries: Entry[], baseSummary?: string | null) {
  const byId = new Map(entries.map(e => [e.id, e]));
  const keptFacts: string[] = [];
  for (const s of resume.sections) for (const g of s.groups) for (const item of g.items) {
    const entry = byId.get(item.entryId);
    if (!entry) throw new FabricationError(`unknown entry ${item.entryId}`);  // hallucination guard
    keptFacts.push(...entry.facts);
    const blob = entry.facts.join(' ');
    for (const num of extractNumbers(item.text))
      if (!hasNumberToken(blob, num)) throw new FabricationError(`number "${num}" not in facts of ${item.entryId}`);
  }
  // summary numbers must trace to a kept entry's facts — or the user's own baseSummary (§16)
  const keptBlob = [...keptFacts, baseSummary ?? ''].join(' ');
  for (const num of extractNumbers(resume.summary))
    if (!hasNumberToken(keptBlob, num)) throw new FabricationError(`summary number "${num}" not grounded`);
}
```

`assemble()` has already coerced `text` for `rephrase:'none'` sections (§5), so those need only the identity check (empty-facts entries — certification/reference — carry no text at all). `extractNumbers`/`hasNumberToken` compare whole number tokens (digits plus attached `%`/`k`/`x`/units, thousands separators normalized) — not raw substrings, so `1` doesn't pass merely because `2021` appears. Catches invented numbers (the most damaging fabrication), not verb inflation. Do **not** add an LLM-checks-LLM pass and call it rigorous.

---

## 7. Auth (light, self-contained)

Single-user → a **single password gate**, not accounts.
- **First-run:** if no `auth` secret exists, prompt to set an instance password; store `scrypt(password, salt)`.
- **Login:** `POST /api/auth/login` verifies, issues an encrypted session cookie (`@fastify/secure-session`, secret from `LEDE_SESSION_SECRET`).
- **Guard:** all `/api/*` except `/api/auth/*` and `/api/health` require a valid session.
- **Throttling (2026-07-04 — a gate with unlimited attempts isn't a gate):** in-process counter, no deps: after **5 consecutive failed logins, refuse attempts for 30s** (per instance — single-user, so per-IP machinery is overkill); reset on success. Same response body whether wrong password or locked (no oracle for attackers). Setup (`/api/auth/setup`) throttles identically.
- **Session lifetime:** rolling **7-day** expiry — cookie `maxAge` refreshed on authenticated activity; logout invalidates immediately. A self-hosted tool shouldn't demand daily logins, and shouldn't mint immortal cookies either.
- **Escape hatch:** `LEDE_AUTH_DISABLED=true` for localhost/VPN-only use. Off by default.

---

## 8. BYOK — key handling

**When an AI provider key is needed:** only when the real model is actually invoked — a live tailor in production (the user's own BYOK key) and the opt-in developer quality checks (Phase 0 proving run, `scripts/eval.ts`, `scripts/record-fixtures.ts`). It is **never** required to build, boot, run the test/CI suite, or demo — those use `FixtureEngine` (§6.1, §18). This is distinct from `LEDE_MASTER_KEY` / `LEDE_SESSION_SECRET`, which the *operator* must set for the app to boot (§19) — those are the instance's own secrets, not a provider key.

- **Encryption:** AES-256-GCM (Node `crypto`). Master key from env `LEDE_MASTER_KEY` (32 bytes, base64); app **refuses to boot** without it. DB leak without the master key ⇒ key stays safe.
- **Storage:** `secrets.apiKeyEnc` holds `{ iv, tag, ciphertext }` — never plaintext.
- **Write-only API:** `PUT /api/settings/key` validates then stores ciphertext; `GET /api/settings` returns `{ keySet, model }` — never the key. Nothing logs it.
- **Validate on save:** one cheap provider call (a minimal `generateText`) with the key before storing; reject on failure.
- **Decrypt in memory only** at call time; discard after.
- **Delete:** `DELETE /api/settings/key` purges it.
- **Master-key rotation & mismatch (2026-07-04):** rotation is deliberately simple — there is exactly one secret, so rotating `LEDE_MASTER_KEY` = delete the stored key and re-enter it under the new master key. If decryption fails at call time (master key changed without rotating), the app must **not** crash or pretend: surface `keySet: false` with a distinct "stored key unreadable — re-enter it in Settings" state. No `_OLD`-key re-encryption machinery until multiple secrets exist.
- **Provider + model** in `settings.provider`/`settings.model` (+ `settings.baseUrl` for openai-compatible); default Anthropic `claude-opus-4-8`. Key errors (invalid/expired/quota/their 429) surface distinctly from app errors.

---

## 9. API

All JSON under `/api`, zod-validated, session-guarded except `/api/auth/*` and `/api/health`.

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/api/health` | — | `{ ok }` |
| `POST` | `/api/auth/setup` \| `/login` \| `/logout` | `{ password }` | session |
| `GET` | `/api/settings` | — | `{ keySet, provider, model, baseUrl, layout }` |
| `PUT` | `/api/settings/key` | `{ apiKey }` | `{ keySet: true }` (validates first) |
| `DELETE` | `/api/settings/key` | — | `{ keySet: false }` |
| `PUT` | `/api/settings` | `{ provider?, model?, baseUrl?, layout? }` | updated settings |
| `GET`/`PUT` | `/api/profile` | `Profile` | `Profile` |
| `GET` | `/api/entries` | `?section=` (optional filter) | `Entry[]` |
| `POST` | `/api/entries` | `Entry` (no id → slug) | `Entry` |
| `PUT` | `/api/entries/:id` | `Entry` | `Entry` |
| `DELETE` | `/api/entries/:id` | — | `{ ok }` |
| `POST` | `/api/entries/import` | `Entry[]` | `{ imported: n }` |
| `GET` | `/api/applications` | — | `Application[]` (metadata + genState; no heavy snapshots) |
| `POST` | `/api/applications` | `{ jobDescription, company?, role?, context? }` | `Application` |
| `GET` | `/api/applications/:id` | — | `Application` (incl. `current` + `locked` snapshots) |
| `PUT` | `/api/applications/:id` | `{ jobDescription?, company?, role?, context? }` | `Application` |
| `DELETE` | `/api/applications/:id` | — | `{ ok }` |
| `POST` | `/api/applications/:id/tailor` | — | `TailoredResume` (persisted as the app's `current`) |
| `POST` | `/api/applications/:id/lock` | — | `Application` (freezes `current` → immutable `locked`) |
| `DELETE` | `/api/applications/:id/lock` | — | `Application` (clears `locked`) |
| `POST` | `/api/applications/:id/undo-tailor` | — | `Application` (swaps `current` ↔ `previous`, §27) |
| `POST` | `/api/applications/:id/duplicate` | — | `Application` (fresh `untailored` copy of JD/context/company/role, §27) |
| `POST` | `/api/extract` | `{ text }` | `{ proposed: ProposedEntry[] }` (resume-import extraction, §29 — never writes) |
| `GET` | `/api/export` | — | `{ entries, profile, applications }` (full backup) |
| `POST` | `/api/import` | `{ entries?, profile?, applications? }` | `{ imported }` (full restore) |

`/api/applications/:id/tailor` runs the pipeline (§6) over the current library + the app's JD and optional `context` (§6.2 boundary: context guides, never a fact source), reads decrypted key + model, and **persists the result as the application's `current` snapshot** (self-contained full copy, §27; displaced `current` → `previous`). No key ⇒ 400 `{ error: 'no_api_key' }` (UI routes to Settings). Already tailoring ⇒ **409 `tailor_in_flight`** (§15). Map provider errors (generic across providers): auth → "key invalid"; provider rate-limit → 429; other provider failure → 502; zod failure on LLM output → 502 "model returned off-contract"; fixture mode, unrecorded JD → 422 `no_fixture` (§6.1). A failed tailor leaves the app's `current`/`previous` untouched and sets genState `failed` **with a typed `failedReason`** (taxonomy in §15). Export/import cover **library + profile + applications** so a self-host backup is the whole instance, not just entries (§27).

---

## 10. Rendering (deterministic — semantics live here, mechanics in §28)

- The document renders a `TailoredResume` deterministically: header (profile §16 — name/contact/links), summary, then each `TailoredSection` (registry `label` + groups) in `layout` order, groups per the registry's `groupBy`. Templates (§28.2) vary composition, never content or section order.
- **Rendering/export mechanics are §28's** (`@react-pdf/renderer`; the preview is the actual PDF). **PDFs are produced *only* by the react-pdf document engine (§28.0). Browser printing — `window.print()` / a `print.css` "Save as PDF" through the print dialog — is explicitly NOT how a PDF is created here, and is not an interim path, a fallback, or a stopgap (rejected 2026-07-05).** The DOM + `print.css` pipeline shipped by earlier phases is legacy to be deleted, not a supported export; it must never be surfaced to the user as a way to get a PDF.
- **Document invariants every template must satisfy:** real extractable text (embedded, subset fonts with correct ToUnicode); standard bullets; contact info in body flow, never header/footer regions; no text baked into images; `strict` templates single-column with extraction order = content order (§28.6).
- `leadRationale` and `cut[]` are **never** on the document — reasoning UI only (§11); §28.8-A gates this via text extraction.

---

## 11. Reasoning UI (the differentiator)

Split view: rendered resume | reasoning. Shows `signals` ("this JD weights X, then Y…"), each group's (each job's) `leadRationale` as a callout on its leading bullet, and a "What got buried" panel from `cut[]`. Simplest legible version (text callouts, not animation). Timebox.

---

## 12. Design system

**Soft product surface** (2026-07-04 — supersedes the original borders-over-shadows utilitarian skin). Polished, calm, functional: a gray canvas with white raised surfaces, gentle layered shadows, tinted status pills, one blue accent. Opinion comes from surface depth + type hierarchy + color discipline — still no ornament for its own sake, no gradients. One serif voice used sparingly (the editorial nod: `Lede` wordmark + rationale callouts). App chrome uses the tokens below; the resume document is exempt — its typography belongs to the chosen §28 template, and the preview shows the actual rendered PDF (§28.0), so screen = file by construction.

- **Type — IBM Plex** (self-hosted via `@fontsource/*`): Plex Sans (UI/body), Plex Mono (IDs, metadata overlines, numbers — functional only), Plex Serif (the `Lede` wordmark + `leadRationale` callouts only). Scale (rem): .75/.8125/.875/1/1.125/1.25/1.5/1.875; page titles 1.5rem semibold tracking-tight.
- **Color:** `--ink:#18181b --ink-soft:#52525b --ink-faint:#a1a1aa --bg:#f4f4f6` (page canvas) `--surface:#fff` (cards/header/inputs) `--bg-subtle:#fafafa --border:#e4e4e7 --border-strong:#d4d4d8 --accent:#2643bd (blue-pencil ink — the editor's mark) --accent-hover:#1e35a0 --accent-weak:#e9edfa --success:#15803d --warn:#b45309 --danger:#b91c1c`, plus soft tint pairs (`--success-soft --warn-soft --danger-soft`) for pills and notices. No gradients.
- **Depth:** shadow ramp `--shadow-xs/sm/md/lg` — inputs/buttons xs, cards sm, resume sheet + popovers md, dialogs lg. Hairline borders remain, softened (`border/70`), no longer the only separator.
- **Spacing** 4/8/12/16/24/32/48; **radius** 8px base (10–12 cards/dialogs, pills full); inputs 32–36px, white on the gray canvas.
- **Status pills:** tinted bg + colored text, never loud solid fills — tailored=success, tailoring=accent, failed=danger, untailored=outline. Destructive actions are quiet (ghost/tinted) until confirmed.
- **shadcn theming:** re-theme on day one — map tokens to shadcn CSS variables, Plex font stack, `--accent` as primary. Config task, not per-component.

---

## 13. Component inventory

**shadcn/ui for generic primitives** (copied into `components/ui/`, re-themed, owned). **Hand-built domain components** for the parts that are Lede.

From shadcn: `button input textarea label form dialog dropdown-menu tooltip tabs badge card sonner alert select skeleton` (pull Radix + `cva`/`clsx`/`tailwind-merge`/`lucide-react`).

The page/navigation model this inventory realizes is **§26 (Information Architecture)**; the Applications entity it renders is **§27**.

```
AppShell → NavTabs (Applications | Library | Settings)   ← top-bar tabs (§26)
Auth: LoginGate

ApplicationsView (/applications)
  ApplicationsList: ApplicationCard (company/role/JD preview, genState, updatedAt)
    + NewApplication (create act — the "officialness", §27)
  ApplicationDetail (/applications/:id)
    JobPanel: JD + context editor (company/role/context) · "Tailor" / "Re-tailor" · "Lock final"
    FormatBar(§28): TemplatePicker + DesignPanel entry · target-pages toggle · fit chip · Download PDF
    TailorProgress(§15)
    ResultView(split) — shows the app's `current` (or `locked`) snapshot:
      DocumentPreview (§28: pdf.js canvas of the real PDF; templates render ProfileHeader,
          SummarySection, SectionBlock (registry-driven) → GroupBlock → ItemRow via react-pdf)
      ReasoningPanel (never on the document): SignalsBar→WeightBar, SectionRationale→Callout, CutList
    (empty state: "add missing facts in Library →" — the Applications↔Library loop, §26)

LibraryView (/library)  — the information bank (§26)
  LibraryToolbar (Add · Import · Export · "Import from resume…" → ImportReview, §29)
  LibraryFilter (section · tag · text — PROGRESSIVE: earns its space as the corpus grows; §26)
  SectionAccordion (one per Section, registry label)
    EntryCard (facts preview, Tag chips, edit/delete)
  EntryEditor (Dialog) — SECTION-AWARE: renders the right meta fields per section
      (SectionMetaFields), plus RepeatableList(facts, framings) + TagInput.
      Label sections (skill/interest/language) show a compact single-fact form.
  ProfileEditor (Dialog): name/contact/links/baseSummary          ┐ resume MATERIAL, so
  LayoutEditor: reorder/toggle resume sections (settings.layout)  ┘ they live with the Library (§26)

SettingsView (/settings): ApiKeyForm (write-only), ProviderPicker, ModelPicker  ← instance plumbing only

Bespoke: WeightBar, serif Callout, RepeatableList, TagInput, SectionMetaFields.
```
**Rule:** domain components compose primitives; never re-roll a button or dialog. One `EntryEditor` handles all sections via the registry — not one editor per section.

> **Two decisions here are coordinator recommendations pending your final word (2026-07-03), both aligned with the current build so nothing already shipped churns:** (a) **top-bar tabs**, not a sidebar — 3 flat destinations, and the Applications split-view wants the width; (b) **Profile + Layout live with the Library** (resume *material*, not instance plumbing), keeping Settings clean. Flip either in §26 and this tree follows.

---

## 14. Client state & data flow

- **TanStack Query** owns server state. Keys: `['entries']` (optionally `['entries', section]`), `['profile']`, `['settings']`. Mutations invalidate their keys.
- `src/client/api.ts` — typed `fetch`, throws `ApiError { status, code, message }`. 401 → LoginGate; 400 `no_api_key` from `/tailor` → Settings.
- **Tailor** is a `useMutation`; result lives in `TailorView` state (ephemeral — not persisted; saved-tailors deferred §17).
- No global store (add Zustand only if UI state grows). Errors via `sonner` + inline `alert`.

---

## 15. The tailor lifecycle: progress, failure, concurrency, cost

*(Expanded 2026-07-04 — the original section covered only the spinner. A 15–60s model call is a lifecycle, not a loading state.)*

**Progress (MVP: honest, non-streaming).** `TailorProgress`: one animated indicator with rotating honest copy ("Reading the job description…" → "Weighing your experience…" → "Choosing what leads…" → "Composing…"), an elapsed counter, and "usually ~15–30s" framed as an estimate (it's one opaque call — don't fake stage precision). Tailor/Re-tailor disabled while pending. **Upgrade path (not MVP):** stream real pipeline stages via SSE.

**Failure is typed, stored, and actionable.** `genState: 'failed'` alone tells the user nothing. Applications gain `failedReason` (§27):

| `failedReason` | Meaning | UI action offered |
|---|---|---|
| `key_invalid` | provider rejected auth | → Settings |
| `provider_rate_limit` | provider 429 | Retry (with "wait a moment") |
| `provider_error` | provider 5xx/network | Retry |
| `off_contract` | LLM output failed zod | Retry ("the model returned an unusable answer") |
| `fabrication` | §6.3 validation rejected the output | Honest copy: "the model claimed something your Library can't back — nothing was saved." Retry. **This is the product working, not breaking — never dress it as a generic error.** |
| `timeout` | exceeded the hard cap | Retry |
| `interrupted` | server restarted mid-tailor | Retry |
| `no_fixture` | fixture mode, unrecorded JD (§6.1) | dev-facing |

A failed tailor never touches `current` (§9). `failedReason` clears on the next tailor attempt.

**Concurrency & recovery.** One tailor in flight per application: a second `POST /tailor` while `genState='tailoring'` returns **409 `tailor_in_flight`** (guards double-clicks and second tabs). Navigating away is safe — the call completes server-side and persists; the list's `tailoring` badge is the live indicator. No mid-flight cancel in MVP (the tokens are already spent; a cancel that discards a finished result is a footgun). Recovery: on boot, any row stuck at `tailoring` → `failed`/`interrupted` (a restart can't resume an in-flight provider call).

**Timeout:** hard server-side cap **120s** per tailor call → abort, `failed`/`timeout`. No config knob.

**Cost is surfaced, because it's the user's money (BYOK).** `currentMeta` gains `usage: { inputTokens, outputTokens }` from the SDK result; the detail page shows it quietly next to provenance ("tailored with claude-opus-4-8 · 41k in / 2k out"). No dollar conversion (price tables rot); tokens are honest and stable.

---

## 16. Profile

Identity for the header, stored in the `profile` table (§4.2), never sent into the tailor prompt *except* `baseSummary` (which the AI may rework into the generated summary). Edited via `ProfileEditor`, rendered by `ProfileHeader`. Gains `photoUrl?` for the §28.3 photo block (the asset is identity; whether/how it displays is per-application `format` — default hidden).

---

## 17. Cross-cutting settled decisions

- **Entry slug:** prefer author-supplied `id`; else `kebab` of the section + a distinguishing meta field (company/name/school/label) + a few fact words, ≤80 chars, dedupe `-2`.
- **Validation limits (zod/drizzle-zod):** `jobDescription` 1–20000; meta string fields 1–120; `facts` ≤12 × 1–300 (narrative ≥1; label sections exactly 1); `tags` ≤8 × 1–40; `framings` ≤6 × 1–200; import cap 200 entries.
- **Schema sources:** Drizzle → `drizzle-zod` for DB/bodies; hand-written `TailorDecisionZ` passed straight to `generateObject` for the LLM output; `assemble()` builds `TailoredResume` from the decision. No drift.
- **Section registry (§4.3) is the single source** for per-section rephrase/order/group behavior — used by the prompt, `assemble()`'s ordering, and rendering alike.
- **Resume layout** (`settings.layout`): user orders/toggles sections via `LayoutEditor`; the tailor orders *items within* sections. Tailor reordering/omitting whole sections is a possible extension — user-controlled for MVP.
- **JSON import/export** of `Entry[]` — also the fast path to author a real library (write JSON, import).
- **Config (fail-fast):** `LEDE_MASTER_KEY` (required), `LEDE_SESSION_SECRET` (required), `PORT` (8787), `DATA_DIR` (`./data`), `LEDE_AUTH_DISABLED` (false), `LEDE_TAILOR_ENGINE` (`live` | `fixture`; `fixture` by default under `NODE_ENV=test` and for keyless demo, `live` in production). The user's provider key is BYOK (stored encrypted, §8) — not an env var.
- **Path aliases:** `@shared/*` → `src/shared/*` (tsconfig + vite).
- ~~Tailored results ephemeral~~ **Superseded by §27** (2026-07-03): tailored results persist as each application's `current`/`locked` snapshots. (Kept struck-through because this bullet contradicted §27 for two days — the spec's own drift tripwire.)
- **Responsive stance (2026-07-04):** desktop-first — the split resume/reasoning view wants width. Everything must remain *functional and readable* down to ~380px (single column, panels stack; no separate mobile IA, no gestures). Reviewing an application on a phone is in scope; authoring a library on one is not a design target.
- **Accessibility baseline (2026-07-04):** keyboard-complete (every action reachable, visible focus ring — already a token), WCAG AA contrast for all text (§12 tokens are chosen to pass), form fields always labeled (visually or `sr-only`), async states announced (`role="alert"` on errors, `aria-busy` while tailoring). Radix primitives carry the widget semantics; this line makes it a gate, not an accident.

---

## 18. Testing (keyless by default)

`vitest`. The default suite needs **no API key** — the model call is behind `TailorEngine` (§6.1) and tests run `FixtureEngine`.
- **Unit:** `validateNoFabrication`, `assemble` (grouping, order, `rephrase:'none'` coercion), `extractNumbers`, slug gen, encrypt/decrypt round-trip, entry/meta zod (each section variant), section-registry consistency.
- **Pipeline / e2e (keyless):** drive `tailor()` and the HTTP API with `FixtureEngine` over recorded decision fixtures (`test/fixtures/decisions/*.json`); assert the assembled resume's structure, order, coercion, and validation, plus the full flow (auth, entries CRUD, tailor, export).
- **Fixtures** are recorded once from the real model via `scripts/record-fixtures.ts` (needs a key that one time) and committed, so CI replays them keylessly.
- **Model-quality eval (the only key-gated check, opt-in):** `scripts/eval.ts` runs the real `ProviderEngine` over the eval set and asserts the lede flips (§22, §25). Run manually with a key; **not** in the default/CI suite.

No component/snapshot tests for MVP.

---

## 19. Deployment (self-hosted)

Docker (multi-stage build SPA + server → slim runtime) + `docker-compose.yml` (one service, a volume at `DATA_DIR`). Env: `LEDE_MASTER_KEY`, `LEDE_SESSION_SECRET` (required — `openssl rand -base64 32`), `PORT`, `DATA_DIR`, optional `LEDE_AUTH_DISABLED`. Migrations run on boot (Drizzle) so upgrading the image evolves the schema. Backup = copy the SQLite file. README: `docker compose up` → set secrets → first-run password → add your provider key in Settings.

---

## 20. Dependency ledger

**Server:** `fastify @fastify/static @fastify/secure-session better-sqlite3 drizzle-orm ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google zod drizzle-zod` (crypto = Node built-in). `ai` = Vercel AI SDK (multi-provider `generateObject`); dropped `@anthropic-ai/sdk` and `zod-to-json-schema` (the AI SDK covers both).
**Client:** `react react-dom react-router-dom @tanstack/react-query tailwindcss class-variance-authority clsx tailwind-merge lucide-react tailwindcss-animate @radix-ui/*` (via shadcn) `@fontsource/ibm-plex-sans|mono|serif`; **document engine (§28):** `@react-pdf/renderer pdfjs-dist` (+ self-hosted OFL TTFs for the §28.3 font registry).
**Dev:** `vite @vitejs/plugin-react typescript tsx vitest concurrently drizzle-kit postcss autoprefixer @types/*`.

**Deferred, with reason:** multi-user/accounts/hosted auth (single-user self-host); Postgres (single-file SQLite fits self-host); vector DB/embeddings (entries fit in the prompt); global store (TanStack Query covers server state); tRPC (typed fetch is enough); headless-Chromium print service (react-pdf renders deterministic PDFs with no Chromium in the image — §28.0; this supersedes the earlier "browser print, no PDF library" decision, revised 2026-07-04 with evidence); DOCX export + PDF/A (§28.7); JD-by-URL fetch (paste is reliable; fetching arbitrary job boards is scraping-adjacent brittleness the product explicitly rejects — §2); LinkedIn import (no API; scraping violates ToS — §29); cover letters (same Library + judgment machinery, plausible future epic — deferred until the resume loop is polished, not because it doesn't fit); DOCX *input* for §29 (PDF + paste cover the real cases).

---

## 21. File layout

```
lede/
  package.json tsconfig.json tsconfig.server.json vite.config.ts index.html
  tailwind.config.ts postcss.config.js components.json drizzle.config.ts
  Dockerfile docker-compose.yml .env.example README.md
  scripts/ eval.ts record-fixtures.ts     # eval.ts is key-gated; record-fixtures.ts writes test/fixtures
  test/fixtures/decisions/                # recorded TailorDecisions → keyless replay (§18)
  src/
    shared/
      types.ts        # Entry, EntryMeta, Section, Profile, TailoredResume
      sections.ts     # SECTIONS registry (§4.3)
      providers.ts    # PROVIDERS registry: id → label, model options, default (multi-provider)
      schema.ts       # zod (entryInput, entryMetaZ, profileInput, TailorDecisionZ)
    server/
      index.ts config.ts auth.ts crypto.ts seed.ts
      tailor/ engine.ts assemble.ts validate.ts prompt.ts render.ts  # TailorEngine (Provider|Fixture), assemble, validateNoFabrication, SYSTEM_PROMPT, renderLibrary
      db/ index.ts schema.ts migrations/
    client/
      main.tsx App.tsx api.ts
      queries/ useEntries.ts useProfile.ts useSettings.ts useTailor.ts
      components/
        AppShell.tsx NavTabs.tsx LoginGate.tsx
        TailorView.tsx JDInput.tsx TailorProgress.tsx ResultView.tsx
        ResumePage.tsx ReasoningPanel.tsx
        LibraryView.tsx LibraryToolbar.tsx SectionAccordion.tsx EntryCard.tsx
        EntryEditor.tsx SectionMetaFields.tsx ProfileEditor.tsx LayoutEditor.tsx
        SettingsView.tsx ApiKeyForm.tsx ProviderPicker.tsx ModelPicker.tsx
        domain/ WeightBar.tsx Callout.tsx RepeatableList.tsx TagInput.tsx
        ui/     # shadcn
      styles/ tokens.css app.css print.css   # print.css = legacy, deleted by §28.8-A (NOT a PDF export path — §28.0)
```

---

## 22. Phase 0 seed data & the acceptance gate

`src/server/seed.ts` (loaded if `entries` empty on first run; replace via JSON import). All experience entries, all tagged `platform-arch` on purpose — forces selection to discriminate on *facts*, not tags. All **one job** on purpose — a single group, so every flip is observable as the group's leading item (cross-group order is recency-locked and can't flip, §4.3).

```ts
export const SEED_ENTRIES: Entry[] = [
  { id: 'cloudcase-rules-engine', section: 'experience', sortKey: 202101,
    meta: { section: 'experience', company: 'Cloudcase', role: 'Senior → Principal SWE', period: '2021–present' },
    facts: [
      'rules engine ~30k lines of unstructured rules',
      'devs spent ~50% of time navigating the codebase',
      'built a lifecycle framework: schemas, lifecycle mgmt, consistent patterns',
      'onboarding dropped from days to 1 day; bug incidence fell',
    ],
    tags: ['platform-arch', 'delivery'],
    framings: ['built a lifecycle framework that cut onboarding from days to one day'] },
  { id: 'cloudcase-frontend-rewrite', section: 'experience', sortKey: 202501,
    meta: { section: 'experience', company: 'Cloudcase', role: 'Senior → Principal SWE', period: '2021–present' },
    facts: [
      'replaced legacy jQuery with a three-layer React/TypeScript architecture',
      'component library + platform SDK + React app',
      'team now ships all feature work on it',
    ],
    tags: ['platform-arch', 'frontend'] },
  { id: 'cloudcase-platform-sdk', section: 'experience', sortKey: 202503,
    meta: { section: 'experience', company: 'Cloudcase', role: 'Senior → Principal SWE', period: '2021–present' },
    facts: [
      'built a platform SDK exposing the platform programmatically for the first time',
      'adopted across all internal project teams',
      'now the integration path offered to new external clients',
    ],
    tags: ['platform-arch', 'sdk'] },
];
```

**Acceptance test (before building anything else):** run `/api/tailor` against three contrasting JDs; confirm the lede flips correctly *and on facts*. "Leads" is computable: the target entry is its group's leading (lowest-rank) item and its `leadRationale` names a JD signal:
- platform/API productization + external SDK → leads `cloudcase-platform-sdk`.
- tame a legacy codebase + developer velocity/onboarding → leads `cloudcase-rules-engine`.
- frontend platform lead + design systems + React/TS → leads `cloudcase-frontend-rewrite`.

This is the **key-gated quality eval** (`scripts/eval.ts`) — it calls the real model, so it needs a key and is opt-in. Record its outputs once as fixtures so the keyless suite (§18) can replay these same three scenarios and assert the pipeline (assemble/validate/render) without a key. If it doesn't flip sharply, the prompt (§6.2) is wrong and nothing downstream saves it.

---

## 23. Known weaknesses (don't paper over)

- **No-fabrication validation is mechanical only** — catches invented numbers, not verb inflation/overclaim. Eyeball output; don't trust the pass. LLM-checking-LLM is not a fix.
- **Server-side key storage makes the instance a target.** `LEDE_MASTER_KEY` is the crux — if it leaks with the DB, the key leaks. Guard it hardest.
- **Reasoning UI is the scope-creep risk** — timebox.

---

## 24. Build order (de-risk the hard part first)

- **Phase 0** — JD textarea → `/api/tailor` over hardcoded seed entries → print page. No DB/auth. Because Phase 0 *is* the model-quality check, it invokes the real model and so needs a key — supplied via env as a temporary dev bootstrap (the one and only env-key use, before the BYOK Settings UI exists). Pass §22. *This is the whole risk.*
- **Phase 1** — Drizzle + SQLite; entry library editor (experience, project, education, skill) + JSON import/export; profile; layout.
- **Phase 2** — auth gate + BYOK (encrypted storage, validate-on-save, Settings, model picker).
- **Phase 3** — reasoning UI (timebox); remaining sections (award/cert/publication/interest/language/reference) as data + rendering.
- **Phase 4** — render polish; Docker + compose + README.

---

## 25. Success criteria

Two things define success; the rest is table stakes. Structured so that **all but one are verifiable without an API key** (§6.1 engine split, §18 keyless suite).

**North-star (the gut-checks that matter most):**
- Would you actually send the resume Lede produced?
- Can you point to how its output differs from keyword-matching — and is it better?

**Tier 0 — reason to exist (fail either → the product has no point):**
- **Repositioning is sharp and fact-driven.** Measured by an eval set of ~8–10 (JD → expected leading entry) pairs over a fixed library: the correct lede on most, and a flip across contrasting JDs (a flip = the group's leading item changing — cross-group order is recency-locked, so eval targets must share a group, §22), with tag-sharing entries so it's proven to judge *facts* not labels. **Key-gated** (`scripts/eval.ts`, live model); record outputs as fixtures so it's re-runnable.
- **Zero fabrication that ships.** No invented numbers/tools/projects across an audit of ~20 tailors (mechanical validator, **keyless**); verb-inflation rare on manual review.

**Tier 1 — functional MVP (all keyless via `FixtureEngine`):**
- End-to-end flow works on a fresh instance (password → key → entries/import → tailor → reasoning → export), no dead-ends.
- Export is genuinely ATS-safe (text extraction preserves content + reading order).
- The reasoning panel makes the repositioning legible and credible.

**Tier 2 — operational (keyless):**
- Security holds (key encrypted, never returned/logged; no boot without master key; a leaked DB alone exposes nothing usable).
- Self-host works (`docker compose up` + two secrets; backup = copy the file; upgrade runs migrations).
- Latency tolerable (~15–40s) with honest progress; runs on the user's key for pennies.

**Kill criteria:** the lede doesn't change across genuinely different JDs (it's a formatter); it invents or inflates and can't be trusted; its output is indistinguishable from keyword-matching (no differentiator).

**Keyless guarantee:** the default test/CI suite and a full click-through demo need **no API key** — the engine is swappable and the pipeline is deterministic. The only check that needs a key is the live model-quality eval (Tier 0 repositioning), which is opt-in and becomes replayable once recorded as fixtures. Honest caveat: the key verifies the *model*, not the *machinery* — everything else is keyless.

**Spec-level success:** a competent engineer can build the MVP one-shot with no undefined decisions. Remaining gaps to that: full `assemble()`, the exact `renderLibrary` format, complete zod schemas.

---

## 26. Information Architecture (page map · navigation · placement)

*Realizes the component tree in §13. The nav pattern and Profile/Layout placement below are coordinator recommendations (2026-07-03) pending your final confirmation — both align with the current build.*

**Vision.** Lede is a single-user tool with three jobs; each maps to exactly one destination. Destinations are flat and non-nested — there is no hierarchy to model, so navigation is a control surface, not a tree.

**Navigation model (contract).**
- Primary nav is an ordered destination list rendered as **top-bar tabs** (`aria-label="Primary"`). Top-bar, not sidebar: three flat destinations, and the Applications split-view (résumé | reasoning) wants full width. Revisit only if destinations exceed ~5 or gain nesting.
- Destinations, in order: **Applications** (`/applications`, default via `/` redirect) · **Library** (`/library`) · **Settings** (`/settings`). `LoginGate` (§7) wraps all of them.
- Invariants: every destination reachable from the primary nav on every page; active destination reflects the current route; no route exists that isn't a destination or a child of one (no orphan routes); an unknown non-API path resolves through the SPA fallback to a known destination, never a blank/404 shell (§19).

**Page responsibilities & the placement rule** — where does a new UI element go?
- *Persistent per-JD tailoring work* → **Applications** (§27): the JD, its context, and the tailored résumé + reasoning it produces.
- *Persistent résumé material* → **Library**: the Entry corpus across all sections, **plus** résumé-shell material — Profile (identity/contact/`baseSummary`) and Layout (section order/visibility) — because these are résumé content/shaping, not instance config.
- *Instance / operator configuration* → **Settings**: BYOK key, provider, model, password/logout. No résumé content here.

**Library — the information bank (vision).** The Library is an intentionally **over-complete** bank: the user is expected to capture far more than any single résumé holds. More source material gives the tailor more to draw on — especially to **bridge an imperfect JD match**, where the right facts exist but aren't the obvious ones. The corpus is the raw material; a résumé is a per-JD *projection* of it (§1, §27). There is **no separate "master résumé" artifact** — Library + Profile is the single source of truth; applications are projections. "Multiple copies" (§27) means multiple projections, not multiple originals. Scales down cleanly: a targeted user with a small, focused corpus uses the identical select/cut machinery.
- **Corollary (page, not model): findability is the Library's real job at scale.** Browse/filter by section, tag, and free text — tags in their spec-sanctioned grouping/filtering role (§1), **never** selection scoring. These affordances are **progressive**: they scale up with corpus size and never burden a small library (empty/small states stay dead-simple).

**The Applications ↔ Library loop.** The most common real task: mid-tailoring you discover a bridging fact is missing (exactly the bank premise) → jump to Library → add an entry → return to the application → re-tailor. The IA must make this a **loop, not a dead-end** — the application context survives the detour.

**Applications at scale (2026-07-04 — the concrete contract for the line above).** A job search produces 30–100 applications; the grid must stay usable. Same progressive pattern as the Library, same threshold discipline: below ~10 applications, nothing but the grid; above it, a find row appears — **free-text search over company/role**, a **genState filter**, sort fixed at `updatedAt` desc (recency is the only ordering a tailoring record needs). All client-side (the list endpoint already returns lightweight metadata, §9). **No archive, no folders, no manual pinning** — organizing applications by hiring progress is the tracker §2 forbids wearing a different hat; delete exists for records that no longer matter.

**First-run path.** A fresh instance is a set of empty rooms; guide the happy path: set password (§7) → add provider key (Settings, §8) → seed the Library (resume import §29, or add/import entries) → create the first Application → tailor. Empty states point to the next step, not a blank page. **Concretized in §30** (empty-by-default seed policy + the derived getting-started panel).

**Rejected (vision):** sidebar nav (over-structure for 3 flat items; steals Applications-view width); Profile/Layout in Settings (mixes résumé content with operator plumbing); a dedicated Profile destination (a 4th destination for rare-edit config, not yet earned); a hand-authored "master résumé" (the Library already is the source of truth).

---

## 27. Applications (the persistent tailoring entity)

The unit of use. Replaces the stateless "paste a JD" flow (old §6/§9): tailoring now happens *inside* an application, and its output is kept — one tailored résumé per job.

**Domain (new `applications` table, Drizzle; §4.2 conventions).** Snapshots store **full content, never entry-ID references** (see integrity below).
```ts
type Application = {
  id: string;                 // slug/uuid
  company?: string;           // label + optional tailoring context
  role?: string;
  jobDescription: string;     // the JD (required)
  context?: string;           // free-text tailoring context — guides emphasis, NOT a fact source (§6.2)
  current?: TailoredResume;   // last tailor output; OVERWRITTEN on re-tailor (self-contained snapshot)
  locked?: TailoredResume;    // optional immutable "final" snapshot (see below)
  genState: 'untailored' | 'tailoring' | 'tailored' | 'failed';   // GENERATION state — never a hiring state (§2)
  failedReason?: FailedReason; // typed failure taxonomy (§15) — cleared on next tailor
  previous?: TailoredResume;  // ONE-level undo: the `current` displaced by the last re-tailor (self-contained, overwritten each re-tailor)
  currentMeta?: { at: number; provider: ProviderId; model: string;
                  usage?: { inputTokens: number; outputTokens: number } };  // provenance + cost (§15)
  targetPages?: 1 | 2;        // page budget for THIS role (default 1) — §28.1
  format?: DocumentFormat;    // template + design overrides for THIS role (default settings.defaultFormat) — §28.3
  lockedFormat?: DocumentFormat & { paper: 'letter' | 'a4'; targetPages: 1 | 2; resolvedDensity: string };  // frozen with `locked` — §28.3
  createdAt: number; updatedAt: number;
};
```

**Lifecycle.** create (JD + optional company/role/context) → `tailor` runs the pipeline (§6) over the *current* Library + this JD/context, persisting the result as `current` (genState `tailored`) → edit JD/context and **re-tailor** (moves the old `current` to `previous`, writes the new one) → optionally **lock** the final version.

**Undo last re-tailor (concretized 2026-07-04).** Exactly one level: re-tailor copies the displaced `current` into `previous` before overwriting; `POST /api/applications/:id/undo-tailor` swaps them back (the regretted version moves to `previous`, so undo is itself undoable once). Not a history — `previous` is overwritten by every re-tailor, invisible in any list, and exists only behind an "Undo re-tailor" action shown while it differs from `current`.

**Duplicate (2026-07-04).** `POST /api/applications/:id/duplicate` — copies JD/context/company/role into a fresh `untailored` application (never the snapshots; the new JD deserves its own judgment). Covers the real "same role, different company" workflow with one button on the detail page.

**Snapshots: `current` + optional `locked` — no version history (decided, with rationale).** A saved résumé is a point-in-time projection of a *living* Library. Two things follow:
- **Self-contained (integrity invariant).** `current`/`locked` hold the full assembled `TailoredResume`, not references. Editing or deleting a Library entry later can never corrupt or break a saved application.
- **No per-application version history.** Re-tailoring a fixed JD mostly yields model-noise near-duplicates; when the input meaningfully changes it's because the Library grew — in which case the *fresh* version is wanted. A history would accrete low-signal clutter (and drift toward the tracker §2 forbids). Instead: `current` overwrites on re-tailor, and the user may **lock** one version as an immutable `locked` — framed as *locking an artifact* ("this is the final for this job"), **not** a hiring status. The locked snapshot is the one thing both *unreconstructable* (the Library has moved on) and genuinely wanted later (what you actually sent, for interview prep). An optional one-level "undo last re-tailor" covers regret without a real history.

**Provenance & staleness.** `currentMeta` records when `current` was generated and the model/provider used. Surface staleness against the live Library ("tailored from your Library as of <date> — re-tailor to fold in newer entries"), so a stale projection is visible, not silent.

**Context is not facts (contract, §6.2).** `context` shapes selection/emphasis only; every kept item and number still traces to a Library **entry**'s `facts`. `validateNoFabrication` checks against `entries` alone — context is deliberately excluded from grounding. A real fact worth using is **promoted to an entry**, never quoted from loose prose.

**Backup (self-host, §2/§19/§25).** Export/import span **library + profile + applications** (`/api/export`, `/api/import`, §9) — losing a year of tailored applications on a container rebuild is a data-loss surprise a self-hoster shouldn't hit. "Backup = copy the SQLite file" already covers all three (one DB).

**What backup deliberately excludes, and restore semantics (2026-07-04).** The export omits `settings` and `secrets` **by design**: the provider key must never leave the instance in plaintext, and its ciphertext is useless under a different `LEDE_MASTER_KEY` — including it would only create a backup that silently half-works. Consequence, documented in the README's restore checklist: restoring to a fresh instance = set env secrets (§19) → import the backup file → **re-enter the provider key and re-pick provider/model in Settings** (~30 seconds of config, zero data loss). The SQLite-file copy path restores settings/ciphertext too, but only boots usable if `LEDE_MASTER_KEY` is unchanged — say so where the copy path is documented.

**Not a tracker (tripwire, §2).** The only status is `genState` (generation). No applied/interviewing/rejected pipeline, kanban, or reminders — that dilutes the differentiator (repositioning, not tracking) and edges the spirit of "no ATS."

**Acceptance shape (for the oracle when this epic is built).** create → persist → set JD+context → tailor → `current` persists and **survives reload + server restart** (keyless integration + browser) → re-tailor overwrites `current` → lock freezes `locked` immutably (later Library edits don't change it) → deleting a Library entry does **not** alter any saved snapshot (integrity) → a number present only in `context` (not in any entry) still throws fabrication (§6.3).

---

## 28. The document engine: templates, design layer, page fit & PDF

*(Rewritten 2026-07-04 after a comparative study of Reactive Resume v5, OpenResume, FlowCV, Enhancv, resume.io, Novoresume, Teal, JSON Resume themes, and the LaTeX/Typst ecosystems, plus ATS-parser research — Textkernel engineering posts, Greenhouse parse-failure docs. Decisions below were made against that evidence, not defaults.)*

Lede grows a real **document design layer** — a template gallery plus a design panel, in the two-layer shape the whole field converges on: **template = layout identity** (chosen from a gallery, switchable with reflow) and **design panel = bounded overrides on top**. The judgment thesis is untouched: templates and knobs style the *presentation* of a `TailoredResume`; selection/ordering/cutting stay the tailor's (§5/§6), and **the renderer never cuts** (28.4) — a render-side cut would bury a lede with no rationale, breaking §11's promise.

### 28.0 Engine: `@react-pdf/renderer` (the ONLY PDF path — browser printing is rejected)

- The document renders through **react-pdf primitives** — one React component tree per template — into a real PDF, in the browser (preview + download; the server can render the identical document via the same package if a tokenized-download need appears). The **preview is the artifact**: the builder shows the actual PDF via a **pdf.js** canvas.
- **Browser printing is not a PDF-creation mechanism (rejected 2026-07-05).** `window.print()` + `print.css` are not used to make PDFs — not as the primary path, not as an interim, not as a fallback. The user gets a PDF by one route only: react-pdf renders it, the pdf.js preview shows that exact file, and **Download PDF** saves it. The earlier `print.css` DOM pipeline is legacy scheduled for deletion (28.8-A), not a second export path.
- **Why (evidence):** both flagship OSS builders (Reactive Resume v5.1+, OpenResume) converged here — rx-resume after years maintaining a Browserless/Chromium printer sidecar. This buys: no Chromium in the image (≈1 GB + shm/zombie config avoided); deterministic output independent of the user's browser; first-class PDF metadata and clickable `Link`s; embedded, subset fonts with correct ToUnicode (no extraction garbage); and **text draw order we control — ATS extraction order is correct by construction**, which 28.6 turns into a CI invariant.
- **The accepted constraint:** templates are **code** (react-pdf components), not HTML/CSS — which was already our stance (a code-defined registry, not user-authored files).
- Fabrication validation (§6.3) is untouched: it runs on `TailoredResume` data server-side, upstream of any rendering.
- **File hygiene:** downloads are named `<Name> — <Company> — <Role>.pdf` (slugged); PDF title/author set from the profile. No print-dialog roulette.

### 28.1 Page model

- **Paper:** `letter | a4` — one **global setting** (`settings.paper`, default `letter`). Affects the page size and budget math only.
- **Target pages:** `1 | 2` — **per application** (`targetPages`, default `1`). One page is the convention; senior/academic roles legitimately need two. Lives on the application because it depends on the role.
- Formatting never mutates snapshots; re-render is cheap and local.

### 28.2 Templates (gallery, code-defined, ATS-graded)

- A **template registry** (same pattern as §4.3's section registry): each template = a react-pdf Page component + a manifest `{ id, name, description, layout: 'single' | 'sidebar-left' | 'sidebar-right', atsGrade, densityLadder, densityMultipliers }`. Launch with **4–6 templates**: at least two single-column (`strict`) and two sidebar layouts. All templates render every section through **shared section renderers** — they differ in composition (header treatment, sidebar, rules, heading style), never in features (rx-resume's own rule, worth copying).
- **The launch roster (fixed 2026-07-05):** `strict` (single, left header — shipped E7-A), `classic` (single, centered header, hairline rule under section headings), `compact` (single, one-line header — name left / contact right — tighter section treatment), `banner` (single, full-bleed `primary`-tinted header band), `sidebar-left` (shipped E7-A), `sidebar-right` (mirror). The four single-column templates declare `strict`; both sidebars declare `good`. Every declared `strict` grade is **earned via the 28.6 extraction-order invariant in CI**, never asserted.
- **Previews are live mini-renders, never static images** (decided 2026-07-05; supersedes the earlier `previewImage` manifest field): each picker card / gallery tile paints page 1 of a **real react-pdf render of this application's tailored resume** under that template — the same browser-safe render + pdf.js path as the main preview (§28.0's "the preview IS the artifact" extends to thumbnails). Thumbnails render lazily (only when the picker/gallery is visible), one at a time, cached per (templateId, format-minus-templateId, paper, resume). An application with no tailored resume previews a bundled `SAMPLE_RESUME`, visibly badged **"Sample content"** — never passed off as the user's own.
- **A dedicated gallery view:** a full-screen browse surface (dialog/sheet opened from the Design card), one large live preview per template with name, description, ATS badge + caveat; selecting a card sets `format.templateId` only and returns to the application. The inline picker cards keep the same live thumbnails at small scale.
- **ATS grade is a badge, not marketing** (verified per 28.6): `strict` — single column, standard bullets, contact in body flow; `good` — well-structured two-column (modern ML parsers such as Textkernel-class handle ≈90% of column CVs, but **Workday/Taleo still read strictly left-to-right** — that caveat is surfaced in the picker, not hidden). Enabling the photo caps a template's effective grade at `good` (Greenhouse officially lists photos among parse-failure causes).
- Template choice is **per application** (`format.templateId`) — the right look depends on the company; global default in `settings.defaultFormat`.
- **Deliberately rejected:** user-authored templates and arbitrary custom CSS. rx-resume removed raw CSS in v5 in favor of constrained, structured "style rules" — if an escape hatch is ever wanted, that is the model to copy; **deferred**.

### 28.3 The design panel (bounded overrides)

Grouped the way the field consistently groups it (typography → color → page → structure), persisted **per application** as `format`, with instance defaults in `settings.defaultFormat`:

```ts
type DocumentFormat = {
  templateId: string;
  typography: {
    body:    { family: FontId; size: number; lineHeight: number };  // size 9–12pt
    heading: { family: FontId; weight: 400 | 500 | 600 | 700 };
  };
  colors: { primary: string; text: string };   // primary drives headings/rules/links per template
  page:   { marginX: number; marginY: number; sectionGap: number }; // pt, bounded ranges
  photo:  { hidden: boolean; size: number; shape: 'circle' | 'rounded' | 'square' }; // default hidden
  sections: Partial<Record<Section, { columns?: 1 | 2 | 3 }>>;      // e.g. skills in 2 columns
};
```

- **Fonts: a curated, self-hosted registry of ~12 OFL faces** registered via `Font.register` — picked for resume typography plus metric-compatible stand-ins for the Word classics (Arimo→Arial, Tinos→Times New Roman, Carlito→Calibri), IBM Plex among them. Never a 500-font list, never free-form input — font choice is the axis every mainstream builder restricts hardest, deliberately.
- **Colors: two, not three** — `primary` accent + `text` ink. The page background stays paper-white (tinted backgrounds are where both ATS trouble and taste trouble start). Curated palette first, hex input as escape hatch.
- **Photo:** default **hidden**. Enabling shows a regional-norms note (expected in DACH/JP CVs, discouraged US/UK) and downgrades the ATS badge (28.2). The image lives on the profile (§16 gains `photoUrl`); display settings live in `format`.
- **Structure:** section order/visibility remains the **LayoutEditor**'s job (§13/§26 — resume *material* lives with the Library); the design panel adds only per-section `columns`. rx-resume's drag-drop page/column builder is **deferred** — sidebar templates + per-section columns cover the demand at a fraction of the build/QA surface.
- **Locking:** `locked` freezes `lockedFormat` (the resolved `format` + `resolvedDensity` + paper) — "what you actually sent" includes how it was set. `current` re-resolves live.

### 28.4 Fit ladder (auto density — exact, because the renderer paginates)

- react-pdf reports the true page count, so fitting is exact, not estimated: render at the user's chosen format (**comfortable** = exactly as set) → if `pages > targetPages`, re-render at **standard**, then **compact** (template-declared multipliers over type size / line-height / gaps; floor **9.5pt body**) → first fit wins.
- Deterministic: same content + format + paper ⇒ same density ⇒ same bytes. Density is **auto-only** — it is derived, and persisting it would be a knob carrying no information the fit doesn't already have.
- **Overflow:** if `compact` still exceeds the target — render at compact, show the true page count, and offer the two honest actions: *re-tailor to a tighter budget* (28.5) or *allow 2 pages*. Never shrink past the floor; **never cut** (item count in the document is invariant across densities — an oracle check).
- UI: a fit chip ("Fits 1 page · compact") and the real page boundaries visible in the pdf.js preview (they're actual PDF pages).
- Field note: genuine auto-fit is rare — of every tool surveyed only Rezi ships a one-button version; the rest hand users sliders and a page counter. This is a differentiator; keep it central.

### 28.5 Length budget (judgment — the tailor's half)

- The server derives a **content budget** from (paper, targetPages, format, ladder): ≈ lines-per-page × chars-per-line at `standard` density, expressed to the model as approximate bullets/words. Heuristic is fine — the fit ladder absorbs estimation error; the budget's job is to make the model *select to the page*, not hit it exactly.
- **Transport: the budget rides the user message, exactly like per-app `context` (§6.2 / ledger [v3-001]) — `prompt.ts` stays frozen.** No budget ⇒ user message byte-identical to today ⇒ existing fixtures replay ⇒ keyless suite stays green. "Budget measurably changes selection" is a **model-quality claim = key-gated**, recorded honestly like T014.
- Budget-driven cuts land in `cut[]` with rationales — "What got buried" now also explains what the *page* cost, the most editorial sentence in the product.

### 28.6 ATS honesty: badges backed by extraction, not vibes

- **CI invariant:** for `strict` templates, running pdf.js text extraction over the generated PDF yields the profile header and every selected fact **in exactly `TailoredResume` order** — extraction order = content order. "ATS-safe" becomes a regression test, not a claim.
- **"What the ATS sees" view:** a preview tab that runs that same extraction over the user's actual export (OpenResume-style parser round-trip — the most honest mechanism in the field). Doubles as **plain-text export** for pasting into application form fields. Lede shows its work about the model's judgment; this shows its work about the file.

### 28.7 Exports & explicit deferrals

- **PDF** — canonical (28.0). **Plain text** — from 28.6.
- **Deferred, with reason:** **DOCX** (genuinely demanded in Word-first markets and the most reliably parsed format; generate later from the same `TailoredResume` via the `docx` package — same data model, no container deps; a planned follow-up, not a hole) · **PDF/A / tagged-PDF accessibility** (Chromium can't emit PDF/A; Ghostscript pipelines strip structure tags; WeasyPrint would add a Python sidecar — skip until a user asks) · **custom style rules** (28.2) · **drag-drop layout builder** (28.3) · **public share links** (rx has them; wrong shape for a self-hosted single-user instance).

### 28.8 Phasing & acceptance shape (keyless unless noted)

- **A — Engine migration:** react-pdf document model + 2 launch templates (1 `strict`, 1 sidebar) + **the profile header finally on the document** (name/contact/links from §16, replacing the hardcoded placeholder) + pdf.js preview + Download PDF + page model. Oracle: fixture resume renders to PDF under both templates; extracted text contains profile + every selected fact in order; `leadRationale`/`cut[]` strings absent from extraction; paper/targetPages/template changes never mutate snapshots; filename + metadata correct.
- **B — Design panel:** typography/colors/page/photo/section-columns; per-app `format` + `settings.defaultFormat`; `lockedFormat`. Oracle: format round-trips; a locked app renders byte-stable when live defaults change; photo hidden by default; ATS badge downgrades with photo/sidebar.
- **C — Fit + honesty:** density ladder + overflow reporting + extraction view / plain-text export + the 28.6 invariant in CI. Oracle: growing fixture content walks comfortable→compact with item count invariant across densities; overflow reports, never cuts.
- **D — Budget → selection (key-gated):** per 28.5. Oracle: empty budget ⇒ byte-identical user message (fixture-replay guard); with a live key, a 1-page budget over the over-complete seed library produces more `cut[]` than 2-page, each with a rationale.
- **E — Template roster + live gallery (keyless; added 2026-07-05):** per 28.2's roster and live-preview decisions. Oracle: every registry template renders the fixture resume with the profile header and **every** selected item present in extraction (index-increasing order for every `strict`-graded template) and `leadRationale`/`cut[]` absent; item count invariant across all densities for **every** template; in the real browser the picker/gallery paints live thumbnails (two templates' thumbnails differ pixelwise, and changing `colors.primary` visibly repaints — the proof they're renders, not stock images), selecting a template persists across reload; an untailored application's thumbnails carry the "Sample content" badge.

---

## 29. Resume import — seeding the Library from an existing resume

*(Added 2026-07-04.)* The activation wall: before Lede does anything, a new user must hand-author their entire history as entries — the one place every competitor is easier. The fix is the **inverse of tailoring**: extraction. It reuses the product's own vocabulary — a resume is a projection of a Library (§26); import runs the projection backwards, under the same fabrication discipline.

**Flow (review-then-commit — nothing writes directly):**
1. **Input:** paste resume text, or upload a PDF — text extracted **client-side** via pdf.js (already a §28 dependency; the file never leaves the browser). DOCX input deferred (§20).
2. **`POST /api/extract` `{ text }`** → model call (BYOK, `generateObject` with a hand-written `ExtractionZ`) → `{ proposed: ProposedEntry[] }`. Each proposal: `section`, `meta` (per the §4.3 registry), `facts[]`, suggested `tags[]`, `sortKey` guess, and a **`source` quote** — the resume text span it came from.
3. **`ImportReview` UI:** proposals grouped by section, each showing its `source` quote beside the structured entry; the user **edits / accepts / rejects per entry**. Accepted entries flow through the existing `POST /api/entries` path (slugging, validation, dedupe `-2` — §17).

**The fabrication contract, mirrored.** Tailoring's gate is `validateNoFabrication` on the way *out*; import's gate is **human review with the source visible** on the way *in*. The extraction prompt enforces: facts restate the source, numbers appear **verbatim or not at all**, nothing inferred; granularity per §1 (bullet-level entries — a job with 5 accomplishments proposes 5 experience entries). The review UI exists precisely because extraction can't be machine-validated the way assembly can — the user is the validator, so show them the evidence.

**Keyless discipline (§18):** extraction is a live-model feature, so it follows the tailor's pattern exactly — a recorded **extraction fixture** (one real resume text → recorded proposals) drives all tests; "extraction is faithful on arbitrary resumes" is a **key-gated model-quality claim**, recorded honestly like T014.

**Placement (§26):** the Library's empty state leads with "Import your existing resume" (primary CTA) over "Add entry" (secondary); a quieter "Import from resume…" lives in the Library toolbar thereafter. Distinct from JSON Import (§17), which is the machine-to-machine path.

**Not in scope:** LinkedIn import (no API for this; scraping violates ToS — §20); auto-accepting proposals (removes the human gate that makes import trustworthy); re-import merge intelligence (re-running proposes again; slug dedupe prevents duplicates; the user rejects what they already have).

---

## 30. First run & sample data

*(Added 2026-07-04.)* Two decisions that shape a stranger's first ten minutes.

**A fresh instance starts EMPTY.** `seedIfEmpty` stops planting demo entries in real instances: the current seed is the developer's own work history, which every real user would have to recognize as fake and delete — noise dressed as help. The seed corpus moves behind **`LEDE_SEED_DEMO=1`** (default off): dev environments and the e2e/fixture machinery set it explicitly (the recorded decision fixtures hash over the seed corpus — §22/§18 — so the `applications` Playwright project and keyless demos flip it on; CI config change, no test rewrites).

**Getting-started panel, derived not stored.** The empty Applications view (the landing page) renders a four-step panel computed live from instance state — no onboarding flags in the DB, it disappears the moment reality completes it:
1. ~~Set a password~~ (implicitly done — they're logged in)
2. **Add your provider key** → Settings (done when `keySet`)
3. **Put yourself in the Library** → §29 import or manual entry (done when `entries.length > 0`; shows the count)
4. **Create your first application** → the §27 create dialog (done when one exists — at which point the whole panel is gone)

Each step deep-links to where it's completed; the Applications↔Library loop (§26) brings the user back. The first tailor attempt with no key already routes to Settings (§9's `no_api_key`) — the panel exists so that dead-end is never reached.

**Acceptance shape:** fresh boot (no `LEDE_SEED_DEMO`) → `/api/entries` returns `[]`, Library and Applications show their guided empty states, panel shows steps 2–4 pending → set key → panel updates → import/add an entry → panel updates → create + tailor an application → panel gone, never returns. With `LEDE_SEED_DEMO=1`: current seeded behavior, byte-identical fixtures.
