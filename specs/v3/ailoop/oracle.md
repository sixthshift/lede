# Oracle — Lede v3 (Workspace Redesign)

**Contract:** `SPEC.md` · spec_version 3 · sha256 `f777936bf63f0ce4fa3e4e5fbbc8e883325c1b82a0e233824cc7a7fe52942b70`
<!-- Resume recomputes the hash and refuses to dispatch on mismatch. -->
<!-- v3 = CO-2 (human-approved fork, 2026-07-10): duplicate endpoint. v2 = CO-1: dashboard list projection. See scope tripwire exceptions + SPEC.md Change orders. -->
<!-- Prior: v1 a9e1ee51…, v2 5953ddab… -->


The definition of done. Workers cite it; the coordinator gates against it.

## Locked decisions (never re-litigated — cite these in every worker prompt)

- **Visual identity frozen.** No palette / type / radius / shadow changes; no new design axis. Redesign = layout + navigation + interaction only, composed from existing tokens in `src/client/styles/tokens.css` (the single source of truth). Never edit the palette/type or add a visual axis.
- **Stack unchanged.** React SPA + react-router-dom + @tanstack/react-query + Tailwind/tokens + the existing component set. **No new UI framework, no new state/router library, no CSS-in-JS.** A small headless primitive (resizable-pane / focus-trap util) is allowed only if a fork demands it.
- **Client-only.** Server routes and the data model are untouched. A needed endpoint is a fork (escalate), never a silent add.
- **All v1/v2 behavior preserved.** Tailoring, letter generate/undo/lock, per-part inline editing, voice flag/delete, motivation, bounded design axes, fit ladder, plain-text export, snapshots — behavioral guarantees invariant; only presentation & flow change. A regressed behavior fails the ticket.
- **Modals → inline / persistent panels** is the core move. The ban is on **modality, not the ARIA role**: on a redesigned surface no user action produces `aria-modal="true"`, a backdrop, an overlay covering >50% of the viewport, or anything removing the underlying surface from the tab order / interactivity. A **non-modal** `role="dialog"` panel is permitted. Every "no dialog" e2e asserts the modality checks (aria-modal count 0; underlying content still `toBeInViewport()` and clickable); `role=dialog` counts are supplementary only.
- **Live preview co-visible** with its controls on any document surface **at ≥1280px** (below: drawer mode). Preview pane shows **ONE document at a time** (resume/letter switchable in-pane); co-visibility asserted against whichever is active, each in turn.
- **Layout primitive: three-pane** — section rail | editor panel | live document preview, all persistent.
- **Edit mechanism: hybrid** — text edits happen **in-place** where they render; **structured & creation flows** (new application, entry editor, layout, profile, templates) load into the **persistent context panel**, never a modal.
- **Section rail: navigate + collapse** — jumps/scrolls, shows/hides sections; **ordering stays the design panel's** (`sectionDisplay.order`). No reorder-in-rail.
- **Design folds into the workspace** — the format/typography panel becomes a panel in the co-visible workspace; the separate `/applications/:id/design` route is **dropped**.
- **Rail collapse is editor view-state ONLY** — folds the editor region; never mutates `settings.layout` or `sectionDisplay`. Collapse state persists in `localStorage` only, never a server write.
- **Destructive confirmations are inline** (two-step button or inline confirm row). No `window.confirm`, no modal.
- **Stale `/applications/:id/design` deep links redirect** to `/applications/:id` — never 404 or the generic `/applications` fallback.
- **Non-document surfaces degrade the shell** — Dashboard, Library, Settings use rail + content; the preview pane is document-surface-only. No forced empty third pane.
- **Viewport target: 1280px** — three-pane co-visibility contracted at ≥1280×720 (playwright default); below 1280 the preview collapses to a toggleable tab/drawer (one click away). Both modes get an e2e.
- **Dashboard card content:** company + role, resume gen-state pill, letter-state pill when a letter exists, locked badge, last-updated. **No thumbnail.**
- **Dashboard quick actions:** open workspace (primary), duplicate, delete (inline two-step confirm), download PDF(s) (client-side react-pdf; enabled only when the document exists). All client-only against existing routes.
- **react-pdf preview stays the artifact.** Document engine, `format-v2` axes, fit ladder untouched.
- **Test strategy: up-front abstraction phase (Phase 0)** refactors the e2e suite onto a helper/page-object layer over the **current** UI (zero app changes). Later phases edit the abstraction, not scattered selectors. Full suite green at **every ticket** — no dark period. **No-deletion rule (all phases):** assertions over a removed component are re-homed onto its successor, never deleted; a phase's vitest test count may not decrease without an itemized justification in the ticket.
- **Duplicate = existing route semantics, unchanged.** Dashboard duplicate calls the v1 duplicate endpoint as-is.
- **Accessibility preserved.** Interactive affordances keep roles/labels (`getByRole`/`getByLabel` usable); inline panels are focus-managed and keyboard-dismissible.

## Scope tripwire (halt if crossed)

- Any visual-identity change — palette, typography, radius, shadow system, or a new/unbounded design axis.
- Tracker features riding in on the dashboard — hiring/application status (applied/interviewing/offer/…), kanban, reminders, pipeline, any state that isn't *generation* state + document metadata.
- Document-rendering changes — react-pdf engine, `format-v2` axes, fit ladder, extraction invariants.
- Backend/data-model changes — new tables, columns, altered route contracts (a needed endpoint is a fork → escalate). **EXCEPTION (CO-1, human-approved 2026-07-10):** `GET /api/applications` `LIST_COLUMNS` may add `letterGenState` + a derived `locked` boolean (`locked IS NOT NULL`) — additive, read-only projection of EXISTING columns, for T030's dashboard (OQ4a). ONLY sanctioned route change; new tables/columns, hiring-status fields, and heavy list snapshots remain banned. **EXCEPTION 2 (CO-2, human-approved 2026-07-10):** add `POST /api/applications/:id/duplicate` — deep-copies the full application row (inputs + current/locked snapshots + letter + format + gen/letter state) to a new id, returns 201 {id}, for T031's dashboard duplicate action. New endpoint only; no new table/column/hiring-status.
- Browser printing / `window.print` / print CSS.
- A native/mobile app or a new responsive framework beyond the agreed viewport behavior.
- Regressing any v1/v2 behavior.

## Baseline gate (every ticket, no exceptions — "Baseline green", defined ONCE)

Every ticket must pass ALL of these regardless of what it touched (regression guard). Independent verifier always runs the FULL set (never scoped):

- [ ] type-check: `bun run check` → exit 0
- [ ] build: `NODE_OPTIONS=--max-old-space-size=1024 bun run build` → exit 0
- [ ] lint: `bun run lint` → exit 0
- [ ] full vitest: `bunx vitest run` → all pass (intake baseline: 1049 passing)
- [ ] playwright projects **`chromium` (runs `library-crud.spec.ts`), `auth`, `applications`** run **non-concurrently** → all pass. (A phase naming one project is emphasis, never a narrowing.)
- [ ] new behavior ships with new tests, green under the above (exempt only pure scaffold/config, stated in the ticket)

Docker e2e (`bun run test:docker`) runs at the **Phase 5 final gate only**.

## Verification protocols (the independent re-verify applies these — sharpened at intake red-team)

These are HOW the re-verify bites; they apply to every ticket in the class named, without repeating them in each acceptance field. The independent verifier — not the builder's self-report — runs them.

### A. Test-migration protocol (any ticket that edits `test/**`: T001–T003, T011–T014, T024, T030–T032, T040, T041, T050–T052)
The `--list`-diff + `expect(`-count guards are STRUCTURAL and cannot catch "same count, weaker assertion." The verifier additionally:
- **Captures `--list` itself** at `<baseSha>` (clean checkout) and diffs against HEAD — never trusts the builder's captured before/after. Title set identical except genuinely-ADDED tests.
- **No weakening-by-skip:** greps the diff for newly-added `test.skip(`, `test.fixme(`, `.only(`, `test.slow(` on any previously-active test ⇒ fails the ticket.
- **`expect(` count over non-comment lines only**, and **tautological expects are banned** (`expect(true)`, `expect(1).toBe(1)`, `expect(x).toBeDefined()` used as padding) — they don't count and their introduction is a red flag to read the diff.
- **Load-bearing literals survive verbatim** — grep the diff; these must NOT be removed or loosened: `409` (locked-route status), the voice-flag-while-locked assertion, each per-axis locked-disable assertion, `%PDF` (download), the fixture-engine contrast. A `toBe(409)` becoming `.not.toBeOK()` or vanishing fails the ticket.
- **`playwright.config.ts`** (where allowlisted): `projects`/`testMatch`/`grep`/`testIgnore` byte-identical EXCEPT additive `testMatch` for a genuinely-new spec file. No filter that drops or narrows existing test discovery.

### B. Modality-check protocol (every "de-modal"/panel/co-visibility ticket)
"No modal" is asserted by BEHAVIOR, never by the absence of a role (stripping `role=dialog` to pass is the cheat this kills):
- `page.locator('[aria-modal="true"]').count() === 0` **and** no single element's bounding box covers >50% of the viewport (a backdrop/overlay).
- **Underlying surface truly interactive:** perform a real `page.click()` (NO `force:true`) on a specific underlying control while the panel/drawer is open, and assert its side effect (focus move / state change / navigation). Playwright's actionability check fails if the control is occluded — that is the point.
- **Asserted in the live state, not just at rest:** for inline editing, assert modality WHILE the editor is focused/mid-edit; for the <1280 drawer, assert modality in the drawer-OPEN state too.
- `role="dialog"` counts are supplementary only.

### C. Co-visibility protocol (document surfaces)
Beyond `toBeInViewport({ratio:0.9})` on both editor-pane and the active canvas:
- **Occlusion guard:** `page.evaluate` `document.elementFromPoint(cx,cy)` at each pane's bounding-box center resolves to that pane or a descendant (nothing stacked on top). Geometric in-viewport ≠ visually unobstructed.
- Canvas `boundingBox().width >= 320` AND non-uniform pixels (>1 distinct color via readback) — kills the 1px-sliver / blank-canvas pass. **Caveat (record, don't over-claim):** this proves PAINTEDNESS, not content-correctness; content-correctness is proved only by the sentinel→plain-text-export half in T014. Never grade a co-visibility check as if it proves the right document rendered.

### D. Locked / disabled protocol
- `toBeDisabled()` on the control itself — NOT a CSS `pointer-events:none`/opacity wrapper.
- A forced interaction attempt fires NO PUT and produces no state change (assert via network + preview-unchanged).

### E. "No server write" protocol (T013 rail collapse, and any view-state-only feature)
The lock is "localStorage only, never a server write" — assert it DIRECTLY, not by inferring from a field diff: intercept requests during the action and assert **zero** PUT/PATCH/POST to the application/settings route fires; separately confirm the localStorage write happened. (A byte-identical two-field diff still permits a same-value server write and misses mutations to other fields.)

**Environment quirks (must honor):** playwright projects each boot their own webServer on ports 8787–8789 — **never run suites concurrently**. **[amended T001]** `reuseExistingServer: !CI` is TRUE here, so a live `bun run dev:api`/`dev:web` (or a stray prior server) on 8787–8789 gets REUSED by playwright — and the dev server has auth ENABLED, so `library-crud`/auth-disabled specs then hit the login gate and fail wholesale (symptom: `"Add entry"` not found, page shows the password gate). **Before running the playwright baseline, ensure NO dev server / stray tsx/vite process holds 8787–8789** (check listeners; the failure is not a code defect). **[known flake]** `test/fit-ui.test.tsx` (`ApplicationDetail fit wiring §28.4`) intermittently fails under full-suite vitest load (react-pdf usePDF settle timing); it PASSES 4/4 on isolated `bunx vitest run test/fit-ui.test.tsx`. A lone fit-ui failure in a full vitest run → confirm via isolated re-run, don't treat as a regression. Run `bun run build` before the `applications` project (stale `dist/` fails `design.spec.ts` with font-fetch errors). Font `@fontsource` fetches can flake on full-suite runs (retry absorbs; isolated re-run confirms). Agent worktrees branch stale + hit font-path ENOENTs on in-worktree builds — see the drift note under Caps.

## Per-phase acceptance (executable — verified on the MERGED tree)

### Phase 0 — E2E abstraction layer (enabler; app untouched)
- [ ] **Scope (mechanical):** `git diff --name-only <phase-start-sha>..HEAD` ⊆ {`test/**`, `playwright.config.ts`}. Zero `src/` changes — a single `src/` touch fails the phase.
- [ ] Baseline green.
- [ ] **Suite provably not weakened (the measuring instrument for later phases):**
  - `bunx playwright test --list` title diff before/after is EMPTY (no test deleted/renamed away).
  - total `expect(` call-site count across `test/**` does not decrease.
  - **mutation probe:** with a known behavior temporarily broken (e.g. preview canvas hidden via a test-only injection), the migrated suite FAILS on the corresponding assertion; injection removed ⇒ suite green again. Probe output committed as evidence.

### Phase 1 — Workspace shell + application editing surface (riskiest)
Baseline green (all three playwright projects) **plus**:
- [ ] **Co-visibility (contrast):** on `/applications/:id` at 1280×720, `[data-testid="editor-pane"]` AND the ACTIVE document's preview canvas (resume/letter switched in-pane, assert each in turn) BOTH `toBeInViewport({ ratio: 0.9 })` simultaneously; preview canvas `boundingBox().width >= 320` and paints non-uniform pixels (no 1px sliver). **Modality checks** scoped to this surface: zero `aria-modal="true"`, no >50% overlay, underlying surface stays clickable. (Create-application on the list page stays modal until Phase 2.)
- [ ] **Below-1280 mode:** at 1024×720 the preview collapses to a toggleable tab/drawer — not co-visible, then one activation shows the canvas with non-uniform pixel data (>1 distinct color via readback).
- [ ] **Inline edit reaches the document:** edit a resume item to a sentinel via the inline affordance (modality checks hold) ⇒ preview canvas pixel-diffs AND plain-text export contains the sentinel. Same for a letter paragraph (letter canvas + letter prose).
- [ ] **Section-rail nav (positive + contrast):** scroll so section S's editor region is out of viewport; activate S in the rail ⇒ S's heading `toBeInViewport()` (or `document.activeElement` inside S's region) AND URL unchanged AND the preview canvas is the SAME DOM node (expando marker set before the click survives).
- [ ] **Rail collapse gates its lock:** collapse S ⇒ S's editor region hidden, preview canvas pixel-identical before/after, fresh GETs show `settings.layout` and `sectionDisplay`/format byte-identical.
- [ ] **`/design` redirect:** `goto /applications/:id/design` ⇒ URL becomes `/applications/:id` with the workspace shell visible — never 404 or generic fallback.
- [ ] **Behavior preserved (migrated `applications.spec.ts`):** tailor→preview, generate-letter→preview+download, per-part edit persist across reload, undo, **locked ⇒ every edit affordance disabled + route 409**, voice flag (incl. on locked), motivation persist, typography→preview pixel-diff — all green on the new surface.

### Phase 2 — De-modal the remaining flows
Baseline green + per flow (all five: `NewApplication`, `EntryEditor`, `LayoutEditor`, `ProfileEditor`, `TemplateGallery` — e2e migrated if one exists, else written; no vacuous migration):
- [ ] action opens an inline/panel surface passing the **modality checks** (zero `aria-modal`, no >50% overlay, underlying surface clickable).
- [ ] create/edit **round-trips server-side** (visible after reload).
- [ ] **focus managed concretely:** on open `document.activeElement` is inside the panel; Escape closes it AND returns focus to the invoking control (asserted via activeElement).

### Phase 3 — Dashboard entry surface
Baseline green **plus**:
- [ ] **Pills track state (contrast):** two apps in DIFFERENT states (one untailored, one tailored via fixture engine) — cards' resume pills differ and each matches server state; pill text ∈ {untailored, tailoring, tailored, failed} (letter pill mirrors the same enum off `letterGenState`); locked badge on a locked app, NOT on unlocked; letter pill iff a letter exists.
- [ ] **Quick actions, server-verified:** open routes to workspace; duplicate ⇒ fresh GET returns n+1 including the new id; delete (inline two-step confirm, modality checks hold) ⇒ fresh GET shows it gone; download fires a real download event whose file is non-empty and begins with `%PDF`; download/delete disabled states match document existence.
- [ ] **Not-a-tracker ALLOWLIST:** a card's DOM contains exactly: company, role, gen-state pill(s), optional locked badge, last-updated, and the four quick-action controls — asserted via interactive-element count per card === expected.

### Phase 4 — Library & Settings in the new language
Baseline green + :
- [ ] `library-crud.spec.ts` migrated & green (entry CRUD round-trips server-side via inline editing, modality checks hold).
- [ ] **every settings section that exists today** (enumerated in the ticket from the live `SettingsView`, not sampled) round-trips and survives reload.
- [ ] both surfaces render inside the shell (shared `[data-testid="workspace-shell"]`) AND **no preview-pane element** is rendered on `/library` or `/settings` (degrade lock).

### Phase 5 — Cohesion sweep (cross-cutting)
Baseline green + :
- [ ] **Shell genuinely persistent:** `[data-testid="workspace-shell"]` present on `/applications`, `/applications/:id`, `/library`, `/settings` AND it is the SAME DOM node across a client-side navigation between two routes (expando marker survives). Rail contains ≥1 functional item per surface whose activation does something observable.
- [ ] **App-wide modality sweep:** across every redesigned flow, zero `aria-modal="true"` and no >50% overlay.
- [ ] Live preview co-visible on every document surface (Phase 1 assertions re-run on the final tree).
- [ ] **Final gate:** full playwright suite (all three projects, non-concurrent) + `bun run test:docker` green.

## Coverage map (spec → delivery)

| Spec § | Requirement (one line) | Delivered by |
|---|---|---|
| Phase 0 | E2E page-object/helper layer over current UI; suite not weakened; mutation probe | T001, T002, T003 |
| Phase 1 | Three-pane workspace shell primitive (rail\|editor\|preview) | T010 |
| Phase 1 | `/applications/:id` rebuilt inside shell; inline edit + design panel folded; co-visible preview | T011, T012, T013 |
| Phase 1 | Below-1280 drawer mode | T012 |
| Phase 1 | Section-rail nav + collapse (view-state only) | T013 |
| Phase 1 | `/design` route dropped + redirect; `design.spec.ts` adapted | T014 |
| Phase 1 | Migrated `applications.spec.ts` (all v2 behaviors on new surface) | T011 (folded — no separate T015 needed; helper layer T002) |
| Phase 2 | De-modal NewApplication | T020 |
| Phase 2 | De-modal EntryEditor | T021 |
| Phase 2 | De-modal LayoutEditor | T022 |
| Phase 2 | De-modal ProfileEditor | T023 |
| Phase 2 | De-modal TemplateGallery (into design/context panel) | T024 |
| Phase 3 | Card dashboard (content + pills) | T030 |
| Phase 3 | Quick actions (open/duplicate/delete/download), server-verified | T031 |
| Phase 3 | Not-a-tracker allowlist assertion | T032 |
| Phase 4 | Library inside shell, inline CRUD; `library-crud.spec.ts` migrated | T040 |
| Phase 4 | Settings inside shell; all sections round-trip; no preview pane | T041 |
| Phase 5 | Shell persistence (same DOM node across nav) + rail functional | T050 |
| Phase 5 | App-wide modality sweep + co-visibility re-run | T051 |
| Phase 5 | Final gate incl. docker e2e | T052 |

<!-- Phase 1 ticket split (T010–T015) is coarse and will be refined once T010 lands and teaches the shell's shape. -->

## Caps

`backlog.json` `caps`: maxAttempts 3 · thrash 2 · chunk 20 dispatches/invocation.

**Drift note — worktree isolation:** CLAUDE.md warns agent worktrees here branch stale and hit `@fontsource` font-path ENOENTs on in-worktree builds, and recommends single-agent-on-main for build tasks. ailoop mandates worktree isolation for the scope check + parallelism. Resolution: dispatch **serially, one ticket at a time** where files overlap (most of this epic touches shared shell files), use worktrees for the scope-check diff base, and if in-worktree builds hit font ENOENTs, the independent re-verify runs the build on the merged mainline tree (the authoritative integration gate) rather than trusting the in-worktree build. Ledger any font-fetch flake + isolated re-run confirmation.
