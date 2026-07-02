# Oracle — Lede

Frozen definition of done, derived from spec.md at intake. Workers cite it; the
coordinator gates against it.

## Locked decisions (never re-litigated)

From spec §0, §2, §4:
- **Selection & ordering are judged from `facts`, never from `tags`.** Never
  score `block.tags ∩ jd.signals` — that is the anti-pattern the whole product
  rejects. Tags are grouping + derived-skills metadata only.
- `bullet` is the only stored unit. `summary` is composed output; `skills` are
  derived from tags of selected blocks. Neither is stored.
- Jobs ordered by recency **server-side** (`startSort` desc), never trusted from
  the model. Bullets reorder only *within* a job; never across job boundaries.
- The LLM returns **structured data, never formatted output**. Layout is
  deterministic React.
- Steps 1–4 (signals→select→lede→compose) are **one** structured LLM call;
  step 5 (no-fabrication validation) is **separate and deterministic** — never
  an LLM grading its own work.

Stack (spec §2.1 — frozen):
- Node ≥ 20, TypeScript, ESM · Fastify 4 · `better-sqlite3` raw SQL (Turso/libSQL
  for hosted, wire-compatible) · `@anthropic-ai/sdk` model **`claude-opus-4-8`** ·
  React 18 + Vite · plain CSS (`app.css` + `print.css`) · `zod`.
- **Do NOT add:** Tailwind, Drizzle, Prisma, tRPC, Redux, any component library.

## Scope tripwire (halt if crossed) — spec §1

- No auth, no multi-tenant, no user accounts.
- No vector DB / RAG / embeddings (~40 blocks go in the prompt whole).
- No Postgres.
- No pixel-perfect PDF engine (browser `print()` stylesheet only).
- No auto-apply, no job scraping, no ATS integration.

## Per-phase acceptance (executable)

### Phase 0 — tailoring proven over hardcoded blocks (spec §10, §12) — THE risk
- [ ] type-check passes (`npm run check` / `tsc --noEmit`)
- [ ] server boots; `GET /api/health` → `{ ok: true }`
- [ ] **behavioral (§10) — REQUIRES ANTHROPIC_API_KEY:** `POST /api/tailor` with
      the seed blocks and each of the 3 contrasting JDs makes the lede flip:
      - "productize the platform/API, external SDK" → `jobs[].bullets[0]` for the
        2025 job leads with **platform-sdk**
      - "tame a large legacy codebase, dev velocity/onboarding" → leads with
        **rules-engine**
      - "frontend platform lead, design systems, React/TS" → leads with
        **frontend-rewrite**
      If the lede does not flip sharply, the **prompt** (§6.3) is wrong — fix the
      prompt, not the code.

### Phase 1 — block library editor + SQLite (spec §3, §5)
- [ ] type-check passes
- [ ] `POST/PUT/DELETE /api/blocks` round-trip; data persists across a server restart
- [ ] `BlockEditor.tsx` can create/edit/delete a block end-to-end

### Phase 2 — reasoning UI (spec §8)
- [ ] `ReasoningPanel` renders `signals`, per-job `leadRationale`, and the `cut[]` list
- [ ] `leadRationale` and `cut[]` do **not** appear in the printed resume DOM (§7)

### Phase 3 — render polish + hosted demo (spec §7, §3.3)
- [ ] `print.css` yields single-column, black-on-white, no tables/images (ATS-safe)
- [ ] DB access isolated behind `src/server/db.ts` so the Turso swap is one file
- [ ] single Fastify process serves built SPA + `/api/*`

## Caps
- Max attempts per ticket: 3
- Thrash threshold: failing acceptance set doesn't shrink across 2 attempts → escalate
- Whole-run token budget: **TBD — set with user before drive**
