# Oracle — Lede (v2)

Definition of done, derived from `spec.md` (rewritten 2026-07-01 23:59 — the
provider-agnostic / BYOK / auth / Drizzle spec). Supersedes v1
(`*.superseded-v1.md`, built against the earlier Anthropic-only, no-auth spec).
Workers cite this; the coordinator gates against it.

Frozen = never *silently* changed. Mechanical fixes (wrong command/port/path) →
coordinator edits + ledger entry. Any change to *what counts as done* → escalate.

## Locked decisions (never re-litigated)

Core principle (§1) — the reason the product exists:
- **Selection & ordering are judged from `facts`, never from `tags`.** Never
  score `entry.tags ∩ jd.signals` — a closed tag vocabulary *is* keyword-matching,
  the thing Lede rejects. Tags are grouping/filtering metadata only. Scoring on
  tags = you rebuilt Teal = failed ticket.

Pipeline shape (§5, §6):
- The model returns **judgment only** — a flat `TailorDecision` (signals, select/
  cut, `rank`, composed `text`, per-group `leadRationale`, summary). The **server
  assembles** all structure (grouping, group order, section order) deterministically
  in `assemble()`. The model never controls structure.
- Steps 1–4 (signals→select→lede→compose) are **one** structured LLM call
  (`generateObject`); step 5 (`validateNoFabrication`) is **separate and
  deterministic**. Never an LLM grading its own work (§6.3, §23).
- **The engine is swappable** (`TailorEngine`, §6.1): `FixtureEngine` (keyless,
  replays recorded decisions) is the default for test/CI/demo; `ProviderEngine`
  (live) is production. `tailor()` = engine → `assemble` → `validate`, all
  engine-agnostic. **A provider key is needed ONLY for the live model call**
  (Phase 0 eval, `scripts/eval.ts`, `scripts/record-fixtures.ts`). Everything
  else — build, boot, test, demo — is keyless.
- Ordering: recency/manual sections server-sorted by `sortKey` (never trusted from
  the model); the model orders only **`rank` within a group** (which bullet leads).
  Section registry (§4.3) is the single source of rephrase/order/group behavior.

Stack (§3.1, §20 — frozen):
- Node ≥ 20, TypeScript, ESM · Fastify 4 · SQLite `better-sqlite3` (single file, WAL)
  + **Drizzle** (`drizzle-orm` + `drizzle-kit`, migrations on boot) · **Vercel AI
  SDK** (`ai` + `@ai-sdk/anthropic|openai|google`) `generateObject` · React 18 +
  Vite · **shadcn/ui + Tailwind** (re-themed to §12 tokens) · TanStack Query ·
  `react-router-dom` · `zod` + `drizzle-zod` · Node `crypto` (AES-256-GCM + scrypt)
  + `@fastify/secure-session`.
- Default provider/model: **Anthropic `claude-opus-4-8`**; user picks provider+model
  in Settings (BYOK, their tokens).
- **Dropped:** `@anthropic-ai/sdk`, `zod-to-json-schema` (AI SDK covers both).
- Secrets isolated table: apiKey **encrypted** (AES-256-GCM, reversible); password
  **hashed** (scrypt, one-way). Singletons via `id=1` + `CHECK (id=1)`.
- Config fail-fast: `LEDE_MASTER_KEY` + `LEDE_SESSION_SECRET` **required to boot**
  (§8, §17, §19). Provider key is BYOK (encrypted in DB), not an env var — except
  the Phase 0 dev bootstrap (§24). `PORT` default **8787** (§17).

**Toolchain (coordinator decision 2026-07-02, ledger [v2-002]):** **Bun as
package-manager + runner** (`bun install`, `bun run`, `bunx`) — matches the
existing container (bun.lock, Bun devcontainer). This is a *mechanical* deviation
from spec §20's `tsx`-in-dev-deps; every **architectural** lock above (Fastify not
Bun.serve, provider-agnostic AI SDK, Drizzle, better-sqlite3, etc.) is unchanged.
Production Docker uses a Bun runtime image (deviation from §19 "node slim"; noted).

## Scope tripwire (halt if crossed) — §2, §20

- No multi-user / accounts / hosted auth (single-user **password gate** only).
- No vector DB / RAG / embeddings (all entries fit in the prompt).
- No Postgres (single-file SQLite is the self-host fit).
- No auto-apply / job scraping / ATS integration.
- No PDF-generation library (browser `window.print()` only).
- No **LLM-checks-LLM** fabrication pass (§6.3, §23).
- No **tag-based scoring** (`entry.tags ∩ jd.signals`) — the core anti-pattern (§1).
- No global store (Zustand) / tRPC unless explicitly justified later.

## Baseline gate (every ticket, no exceptions) — bun toolchain

- [ ] type-check: `bun run check` (`tsc --noEmit`) → exit 0
- [ ] build (once buildable — from T001 on): `bun run build` → exit 0
- [ ] lint: **none configured** (spec mandates none) — skip
- [ ] full test suite (keyless, `FixtureEngine`): `bun run test` (`vitest run`) → all pass
- [ ] new behavior ships with new tests, green under the above (exempt: pure
      scaffold/config tickets — must say so)

### Cross-cutting invariants — checked EVERY ticket, ALL phases (red-team meta-gap)

These are the kill criteria (§25). They live in the baseline, not one phase, so a
later phase can't silently regress them:

- [ ] **No tag-scoring** (§1 — the core anti-pattern). Grep guard: no code
      intersects/overlaps/sorts/scores `entry.tags` against JD/signals anywhere in
      `tailor/`, `assemble.ts`, `engine.ts`, or client ordering. Plus the keyless
      **structure-ignores-tags** test (two libraries identical except `tags` →
      identical assembled order/selection given the same decision).
- [ ] **No LLM-checks-LLM** in fabrication validation (§6.3, §23): no second
      `generate*` call inside `validate.ts`.
- [ ] **From E2 on — key never leaks:** the sentinel scan (stored key value absent
      from every response body, all logs, and the whole `DATA_DIR` in plaintext).
- [ ] **From E2 on — boot refuses** (process-level) without `LEDE_MASTER_KEY` /
      `LEDE_SESSION_SECRET`; no auto-generated master key.

**Honesty note (do not paper over):** the lede-flip claim rests on the KEY-GATED
eval (T014) being *genuinely run*. The keyless suite (T015) replays FROZEN
recorded decisions — it proves the machinery, and **cannot detect a fabricated
fixture or a live model that stopped flipping**. Therefore: any ticket that edits
`prompt.ts` or `SEED_ENTRIES` MUST re-run T014 and re-record fixtures (T013), and
the ledger must state the eval was actually run — never assumed.

## Per-phase acceptance (executable — on the MERGED tree)

### Phase 0 — prove the tailoring (§6, §22, §24) — **THE risk**
- [ ] `bun run check` passes; `bun run build` succeeds
- [ ] server boots; `GET /api/health` → `{ ok: true }`
- [ ] **keyless pipeline** (`bun run test`): `assemble` (grouping/order/`rephrase:'none'`
      coercion), `validateNoFabrication` (throws on injected fake number; passes clean),
      and `tailor()` end-to-end via `FixtureEngine` over the 3 recorded §22 decisions
      all pass.
- [ ] **KEY-GATED behavioral oracle** (`scripts/eval.ts`, live model via the
      Google bootstrap key `GOOGLE_GENERATIVE_AI_API_KEY`): POST the 3 contrasting
      §22 JDs over `SEED_ENTRIES`; the lede **flips on facts** — each target entry
      is its group's **lowest-`rank`** item **and** its `leadRationale` names a JD
      signal:
      - platform/API productization + external SDK → leads **cloudcase-platform-sdk**
      - tame legacy codebase + dev velocity/onboarding → leads **cloudcase-rules-engine**
      - frontend platform lead + design systems + React/TS → leads **cloudcase-frontend-rewrite**
      Script exits 0 iff all three flip correctly, each target the **strict unique**
      lowest rank and the three leads **mutually distinct**. **If it doesn't flip
      sharply, the prompt (§6.2) is wrong — fix the prompt, not the code.**
- [ ] **Tag-shuffle control** (Finding B): the eval re-run over `tagShuffle(
      SEED_ENTRIES)` produces the SAME flip. Permuting tags changing the lede =
      tag-scoring → Phase 0 FAILS. This control (not T014 alone) earns the
      facts-not-tags claim, since the seed's secondary tags map 1:1 to targets.
- [ ] **Fixture provenance gate** (Finding A): `record-fixtures` (T013) and `eval`
      (T014) share ONE decide/flip-predicate/hash path (T016); a fresh live eval
      reproduces the committed fixtures' `(leading id, rank order, kept ids)` for
      all 3 JDs — hand-authored fixtures won't survive it. Record outputs as
      fixtures so the keyless suite (T015) replays these same 3 scenarios.

### Phase 1 — Drizzle + entry library + profile + layout (§4, §9, §24)
- [ ] `bun run check` + `bun run test` pass
- [ ] migrations run on boot; `/api/entries` CRUD round-trips and **persists across
      a server restart** (keyless integration test)
- [ ] `POST /api/entries/import` + export round-trip an `Entry[]`
- [ ] LibraryView (experience/project/education/skill) can create/edit/delete an
      entry end-to-end via the section-aware `EntryEditor`
- [ ] `/api/profile` GET/PUT round-trip; `settings.layout` ordering respected by render

### Phase 2 — auth gate + BYOK (§7, §8, §24)
- [ ] first-run set password → login issues session; guarded `/api/*` return 401
      without a valid session (keyless test)
- [ ] app **refuses to boot** without `LEDE_MASTER_KEY`; encrypt/decrypt round-trip test passes
- [ ] `PUT /api/settings/key` stores **ciphertext** (validates key first); `GET
      /api/settings` returns `{ keySet, provider, model, ... }` — **never the key**;
      key never logged (test asserts absence)
- [ ] `/api/tailor` with no stored key → 400 `{ error: 'no_api_key' }`

### Phase 3 — reasoning UI + remaining sections (§10, §11, §24)
- [ ] `ReasoningPanel` renders `signals`, per-group `leadRationale`, and the `cut[]` list
- [ ] `leadRationale` and `cut[]` do **not** appear in the printed resume DOM (§10)
- [ ] award/certification/publication/interest/language/reference render from data

### Phase 4 — render polish + Docker (§10, §12, §19, §24)
- [ ] `print.css` yields single-column, `#000` on `#fff`, no tables/images/multi-column (ATS-safe)
- [ ] §12 tokens + shadcn theming applied (Plex fonts self-hosted)
- [ ] `docker compose up` builds and boots with `LEDE_MASTER_KEY` + `LEDE_SESSION_SECRET`;
      `GET /api/health` → ok; README documents first-run (password → key → tailor)

## Caps
Live in `backlog.json` (`caps`): maxAttempts 3 · thrash 2 · chunk 6/invocation.
Snapshotted in the ledger run header.
