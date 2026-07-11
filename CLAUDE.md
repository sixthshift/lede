# Lede

Self-hosted resume-tailoring tool: an AI decides which of your experience **leads** for a specific role. Repositioning judgment, not keyword-matching — that judgment is the product; everything else is CRUD around it.

v1 campaign (spec + ailoop drive, E1–E9) is complete and archived at `specs/v1/`. v2 (cover letters + authored capture: letters, editable drafts, voice sources) is complete and archived at `specs/v2/`. v3 (workspace redesign: persistent three-pane shell, de-modaled flows, card dashboard) is complete and archived at `specs/v3/`. Archives are records, not sources. New feature work gets a fresh spec via `/aispec`; don't amend an archive.

## Commands

- `bun install` — deps (bun is the package manager; runtime is Node/tsx)
- `bun run check` — typecheck (client + server tsconfigs)
- `bun run build` / `bun run lint` (biome) / `bunx vitest run`
- `bunx playwright test` — e2e; projects: `chromium`, `auth`, `applications`, `docker`. **`design.spec.ts` lives in the `applications` project** — `--project=chromium` finds no tests.
- `bun run test:docker` — docker image e2e; slow, run at milestone/release gates, not per-change
- `bun run dev:api` + `bun run dev:web` — dev servers (vite proxies `/api`)

Environment quirks (documented, recurring):
- Playwright projects each boot their own webServer on ports derived from `PORT` (8787–8789) — **never run suites concurrently**; full-suite runs can flake on `@fontsource` fetches (retry absorbs it; isolated re-run confirms).
- A stale `dist/` can fail `design.spec.ts` with fitToPages fetch errors — `bun run build` first.
- Agent worktrees are unreliable here: they branch stale and their in-worktree builds hit font-path ENOENTs. Prefer single-agent-on-main for build tasks.

## Architecture (pointers, not prose)

Single Fastify service + Vite React SPA, one container. `src/shared/` is the contract layer:
- `sections.ts` — the section registry: single source of per-section rephrase/order/group behavior (prompt, assemble, render all read it)
- `format-v2.ts` — the one parameterized document engine's axes; templates are presets over it, not code
- `schema.ts` — zod contracts incl. `TailorDecisionZ` (the LLM output contract)
- `providers.ts` — BYOK provider registry (Anthropic/OpenAI/Google/OpenAI-compatible via Vercel AI SDK)

The tailor pipeline (`src/server/tailor/`) is engine-split: `ProviderEngine` (live, needs a key) vs `FixtureEngine` (recorded decisions) behind one `TailorEngine` interface — the model call is the *only* key-dependent step.

## Standing policies (never re-litigate; tests enforce most)

- **Facts, not tags.** Selection/ordering is judged from entry `facts`. Scoring `tags ∩ jd.signals` rebuilds Teal — tag-scoring (and level-scoring) is a failed change. Tags group and filter only.
- **The fact-lock.** Every kept claim and every number traces to an entry's `facts`. Application `context` guides emphasis but is never a fact source; `validateNoFabrication` grounds against entries alone. No LLM-checks-LLM validation pass.
- **The model returns judgment only** (flat `TailorDecision`); the server assembles all structure deterministically.
- **PDFs only via react-pdf** (`@react-pdf/renderer`); the pdf.js preview IS the artifact. Browser printing (`window.print()`/print CSS) is rejected — not a fallback, not an interim.
- **The renderer never cuts** — density ladder scales, item count is invariant. `leadRationale`/`cut[]` never appear on the document (extraction-gated).
- **ATS grades are earned, not asserted** — extraction-order CI invariants back every `strict` claim.
- **Bounded design axes only, forever** — enums, bounded ranges, curated lists. No raw CSS/HTML, no font upload, no image backgrounds (rejected, stronger than deferred).
- **Not a tracker.** Applications carry generation state only — never hiring states (applied/interviewing/…), kanban, or reminders.
- **Keyless by default.** Build, boot, full test suite, and demo need no API key (fixtures). Only live model-quality evals are key-gated, and they're opt-in.
- **Secrets discipline.** BYOK key AES-encrypted under `LEDE_MASTER_KEY`, write-only API, never logged/exported; export/import deliberately excludes `settings`/`secrets`.
- **No scraping** — no auto-apply, JD-by-URL, or LinkedIn import.
- Snapshots (`current`/`locked`) are self-contained copies — Library edits never mutate them.
- **De-modal, forever** (v3; bounded exception v4). The ban is on *modality*, not the ARIA role: no user action produces `aria-modal="true"`, a backdrop/overlay covering >50% of the viewport, or removal of the underlying surface from tab order/interactivity. Non-modal `role="dialog"` panels are correct ARIA. Destructive confirms are inline two-step, never `window.confirm`. **Below `lg` (1024px), full-width sheets are sanctioned** where co-visibility is physically impossible — dismissible + focus-managed; at ≥`lg` the ban stays absolute (no scrims, no lightboxes). Persistent chrome (bottom tab bar) and non-blocking transient toasts are not modality. (Cohesion e2e enforces both regimes.)
- **Rail collapse is view-state only** (v3) — client-side persistence at most; it never writes `settings.layout` or `sectionDisplay`.

## Design system

Soft product surface: gray canvas, white raised cards, layered shadows, 8px radius, tinted status pills, one blue accent (`#2643bd`), IBM Plex (Sans UI / Mono metadata / Serif wordmark+callouts only). Tokens in `src/client/styles/tokens.css`. The resume document is exempt — its typography belongs to the chosen format.

## Known residuals (carried from v1 close)

- `api.ts` `SettingsResponse` type is narrower than the server reality (`queries.ts` casts around it for `presets`)
- `drizzle/meta/0005_snapshot.json` was generator-emitted while the SQL was hand-simplified — next `drizzle-kit generate` may see a phantom diff (harmless at runtime)
- DesignPanel heading-weight control dual-writes (cosmetic); faux-italic for fonts without true italics
