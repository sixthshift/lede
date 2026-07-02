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
- Paste a JD → tailored, reordered resume with an explicit rationale for every lead decision.
- An entry library editor (section-aware) with persistence + JSON import/export.
- A reasoning UI surfacing *why* each section leads the way it does.
- Deterministic render to a clean, ATS-safe, single-column document → PDF.
- BYOK: enter/validate/store (encrypted) a provider key (Anthropic, OpenAI, Google, or OpenAI-compatible); pick provider + model.
- A light password gate.
- Docker packaging for self-hosting.

**Section rollout:** the *schema* accommodates all ten sections now (so it's never reworked). Ship the pipeline + editor for **experience, project, education, and skill** first (the sections that move a hiring decision); the rest (award, certification, publication, interest, language, reference) come online as data + rendering, since the engine already handles their shape.

**Out of scope, with the merit reason (§20 expands):** no multi-user/accounts/hosted auth (single-user self-host); no vector DB/RAG (entries fit in the prompt); no Postgres (single-file SQLite is the right self-host fit); no auto-apply/scraping/ATS integration.

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
Export (print)        ── client  window.print() over a print stylesheet
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
| `POST` | `/api/tailor` | `{ jobDescription }` | `TailoredResume` |

`/api/tailor` reads entries + decrypted key + model. No key ⇒ 400 `{ error: 'no_api_key' }` (UI routes to Settings). Map provider errors (generic across providers): auth → "key invalid"; provider rate-limit → 429; other provider failure → 502; zod failure on LLM output → 502 "model returned off-contract"; fixture mode, unrecorded JD → 422 `no_fixture` (§6.1).

---

## 10. Rendering (deterministic, ATS-safe)

- `<ResumePage>` renders a `TailoredResume` into a **single-column** DOM: header (profile), summary, then each `TailoredSection` (registry `label` + groups) in `layout` order, groups rendered per the registry's `groupBy`.
- `print.css` (`@media print`): US-Letter, 0.5–0.75in margins, `#000` on `#fff`, real text, no images/tables/multi-column/borders. System serif/sans (Georgia/Arial), **not** Plex, to avoid print→PDF embedding surprises.
- Export = `window.print()`. No PDF library — reliable + ATS-safe; no server-PDF need for a single-user tool (revisit if that changes).
- `leadRationale` and `cut[]` are **never** on the document — reasoning UI only (§11).

---

## 11. Reasoning UI (the differentiator)

Split view: rendered resume | reasoning. Shows `signals` ("this JD weights X, then Y…"), each group's (each job's) `leadRationale` as a callout on its leading bullet, and a "What got buried" panel from `cut[]`. Simplest legible version (text callouts, not animation). Timebox.

---

## 12. Design system

**Utilitarian.** Restrained, dense, functional; borders over shadows; no ornament for its own sake — a considered tool, not a themed artifact and not a dev-tool costume. One serif voice used sparingly (the editorial nod). App chrome uses the tokens below; the resume document (§10) is exempt and ATS-plain.

- **Type — IBM Plex** (self-hosted via `@fontsource/*`): Plex Sans (UI/body), Plex Mono (IDs, numbers, JSON box — functional only), Plex Serif (the `Lede` wordmark + `leadRationale` callouts only). Scale (rem): .75/.8125/.875/1/1.125/1.375/1.75.
- **Color:** `--ink:#1a1a1a --ink-soft:#52525b --ink-faint:#a1a1aa --bg:#fff --bg-subtle:#fafafa --border:#e4e4e7 --border-strong:#d4d4d8 --accent:#2f5fdd --accent-weak:#eef2fe --success:#15803d --warn:#b45309 --danger:#b91c1c`. No gradients.
- **Spacing** 4/8/12/16/24/32/48; **radius** 4px (6 cards/dialogs); borders first, ≤1 shadow token; inputs 32–36px.
- **shadcn theming:** re-theme on day one — map tokens to shadcn CSS variables, Plex font stack, low radius, `--accent` as primary. Config task, not per-component.

---

## 13. Component inventory

**shadcn/ui for generic primitives** (copied into `components/ui/`, re-themed, owned). **Hand-built domain components** for the parts that are Lede.

From shadcn: `button input textarea label form dialog dropdown-menu tooltip tabs badge card sonner alert select skeleton` (pull Radix + `cva`/`clsx`/`tailwind-merge`/`lucide-react`).

```
AppShell → NavTabs (Tailor | Library | Settings)
Auth: LoginGate

TailorView (/tailor)
  JDInput  TailorProgress(§15)  ResultView(split)
    ResumePage (§10, print target): ProfileHeader, SummarySection,
        SectionBlock (registry-driven: label + groups) → GroupBlock → ItemRow
    ReasoningPanel (never printed): SignalsBar→WeightBar, SectionRationale→Callout, CutList

LibraryView (/library)
  LibraryToolbar (Add · Import · Export)
  SectionAccordion (one per Section, registry label)
    EntryCard (facts preview, Tag chips, edit/delete)
  EntryEditor (Dialog) — SECTION-AWARE: renders the right meta fields per section
      (SectionMetaFields), plus RepeatableList(facts, framings) + TagInput.
      Label sections (skill/interest/language) show a compact single-fact form.
  ProfileEditor (Dialog): name/contact/links/baseSummary
  LayoutEditor: reorder/toggle resume sections (settings.layout)

SettingsView (/settings): ApiKeyForm (write-only), ProviderPicker, ModelPicker

Bespoke: WeightBar, serif Callout, RepeatableList, TagInput, SectionMetaFields.
```
**Rule:** domain components compose primitives; never re-roll a button or dialog. One `EntryEditor` handles all sections via the registry — not one editor per section.

---

## 14. Client state & data flow

- **TanStack Query** owns server state. Keys: `['entries']` (optionally `['entries', section]`), `['profile']`, `['settings']`. Mutations invalidate their keys.
- `src/client/api.ts` — typed `fetch`, throws `ApiError { status, code, message }`. 401 → LoginGate; 400 `no_api_key` from `/tailor` → Settings.
- **Tailor** is a `useMutation`; result lives in `TailorView` state (ephemeral — not persisted; saved-tailors deferred §17).
- No global store (add Zustand only if UI state grows). Errors via `sonner` + inline `alert`.

---

## 15. Async UX & tailor latency

`claude-opus-4-8` at effort `high` realistically takes **~15–40s**. MVP: non-streaming + honest `TailorProgress` — one animated indicator with rotating honest copy ("Reading the job description…" → "Weighing your experience…" → "Choosing what leads…" → "Composing…"), an elapsed counter, and "usually ~15–30s", presented as an estimate (one opaque call). Disable input while pending; on error, inline `alert` + Retry. **Upgrade path (not MVP):** stream real pipeline stages via SSE.

---

## 16. Profile

Identity for the header, stored in the `profile` table (§4.2), never sent into the tailor prompt *except* `baseSummary` (which the AI may rework into the generated summary). Edited via `ProfileEditor`, rendered by `ProfileHeader`.

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
- **Tailored results ephemeral** — not stored; saved-tailors/history deferred (would add a `tailors` table + `/tailor/:id`).

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
**Client:** `react react-dom react-router-dom @tanstack/react-query tailwindcss class-variance-authority clsx tailwind-merge lucide-react tailwindcss-animate @radix-ui/*` (via shadcn) `@fontsource/ibm-plex-sans|mono|serif`.
**Dev:** `vite @vitejs/plugin-react typescript tsx vitest concurrently drizzle-kit postcss autoprefixer @types/*`.

**Deferred, with reason:** multi-user/accounts/hosted auth (single-user self-host); Postgres (single-file SQLite fits self-host); vector DB/embeddings (entries fit in the prompt); global store (TanStack Query covers server state); tRPC (typed fetch is enough); PDF-generation library (browser print is reliable + ATS-safe).

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
      styles/ tokens.css app.css print.css
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
```
