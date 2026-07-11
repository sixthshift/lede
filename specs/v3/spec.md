---
status: locked           # locked 2026-07-10 — human go-ahead after red-team pass (26 findings landed)
spec_version: 3          # bumped by change orders after lock
---

# Lede v3 — Workspace Redesign (UI/UX language & flow)

Lede works, but its shell is naïve: three flat pages (`/applications`,
`/library`, `/settings`), content that just stacks downward, and every action —
new application, entry editor, layout, profile, templates — thrown into a
**modal**. This epic replaces that with a **sophisticated product workspace**
in the FlowCV mold: a persistent shell with **section-rail navigation**,
**inline / side-panel editing** in place of modals, a **live document preview
always co-visible with its controls**, and a **real dashboard** entry surface.

This is a **composition-and-flow** redesign, not a re-skin. The visual identity
is frozen (see Standing constraints): same palette, type, radius, shadows —
what changes is *layout, navigation, and interaction*, not color or font. And
it is not a rebuild: every existing behavior (tailoring, letters, editing,
voice, lock, design axes, fit ladder) is preserved and stays green through the
drive.

Origin: human braindump 2026-07-10 — *"redesign the applications page, actually
all of the ui/ux design language and flow… it's very simple and
straightforward and naive… I want more sophistication… take inspiration from
FlowCV's UI/UX."* Disposition confirmed: **new contract** after the finished v2
build (archived `specs/v2/`). Acceptance anchor confirmed: **structural /
behavioral contracts, machine-gated** (no human taste-sign-off phase).

## Standing constraints (cited, not restated)

`/workspace/CLAUDE.md` binds every ticket. The load-bearing ones for a UI
redesign:

- **§ Design system** — soft product surface: gray canvas, white raised cards,
  layered shadows, 8px radius, tinted status pills, one blue accent
  (`#2643bd`), IBM Plex (Sans UI / Mono metadata / Serif wordmark+callouts).
  Tokens in `src/client/styles/tokens.css` are the **single source of truth**;
  the redesign **composes with these tokens, never edits the palette/type or
  adds a new visual axis.** The resume/letter document is exempt — its
  typography belongs to the chosen format.
- **§ Standing policies** — **Bounded design axes only, forever** (no raw
  CSS/HTML, no font upload, no image backgrounds); **Not a tracker**
  (applications carry generation state only — never hiring states, kanban, or
  reminders); **PDFs only via react-pdf, the pdf.js preview IS the artifact**
  (no browser printing); **keyless by default**; single-tenant self-hosted.
- **v2 (letters/voice/editing) is shipped and archived** (`specs/v2/`) — its
  behaviors are product surface this redesign re-houses, never regresses.

## Already exists (read from the code, not prose)

- **Shell & routes** (`src/client/main.tsx`): left-nav `App` shell over
  `/applications` (`ApplicationsView`, a vertical list), `/applications/:id`
  (`ApplicationDetail` — tailor / generate-letter / undo / lock / inline
  per-part edit / voice flag / motivation), `/applications/:id/design`
  (`DesignView` — bounded format/typography panel + preview), `/library`
  (`LibraryView` — entry CRUD), `/settings` (`SettingsView`).
- **Modals today** (the thing to kill): `NewApplication`, `EntryEditor`,
  `LayoutEditor`, `ProfileEditor`, `TemplateGallery` (all `role="dialog"`).
- **Previews** — `DocumentPreview` (resume, `.document-preview canvas`) and
  `LetterPreview` (`[data-testid="letter-preview"] canvas`), both pdf.js over
  react-pdf; the fit ladder (`fitToPages`) scales density.
- **Design tokens** (`src/client/styles/tokens.css`), Tailwind config derived
  from `--radius`; React + react-router-dom + @tanstack/react-query; shadcn-ish
  components reading the tokens.
- **Server contract** — unchanged by this epic: the REST routes and data model
  v1+v2 built stay as-is (this is a client redesign).
- **Regression net** — vitest (~1049 tests) + playwright projects
  (`chromium`, `auth`, `applications` [holds `applications.spec.ts` +
  `design.spec.ts`], `docker`) + `library-crud.spec.ts`. **These e2e tests
  assert today's selectors, modal flows, and layout — the redesign migrates
  them surface-by-surface (behavioral guarantees invariant, selectors/flow
  updated).** The blast radius also includes `auth.spec.ts` (the login shell)
  and unit tests over shell components (`fit-ui.test.tsx`, DesignPanel/
  DesignView tests) — same in-ticket migration rule.

## Locked decisions

<!-- Loud defaults (override any). Genuine forks live in Open Questions. -->

- **Visual identity frozen.** No palette / type / radius / shadow changes; no
  new design axis. Redesign = layout + navigation + interaction only, composed
  from the existing tokens (CLAUDE.md § Design system). *(Standing constraint.)*
- **Stack unchanged.** React SPA + react-router-dom + @tanstack/react-query +
  Tailwind/tokens + the existing component set. **No new UI framework, no new
  state/router library, no CSS-in-JS.** A new small headless primitive (e.g. a
  resizable-pane or focus-trap util) is allowed only if a fork demands it.
- **Client-only.** Server routes and the data model are untouched. If a new
  flow genuinely needs an endpoint, that is a fork (Open Questions), never a
  silent add.
- **All v2/v1 behavior preserved.** Tailoring, letter generate/undo/lock,
  per-part inline editing, voice flag/delete, motivation, bounded design axes,
  fit ladder, plain-text export, snapshots — behavioral guarantees are
  **invariant**; only presentation and flow change. A regressed behavior fails
  the ticket.
- **Modals → inline / persistent panels** is the core move — and the ban is on
  **modality, not the ARIA role** (red-team C1/H6): on a redesigned surface, no
  user action produces `aria-modal="true"`, a backdrop, an overlay covering
  >50% of the viewport, or anything that removes the underlying surface from
  the tab order / interactivity. A **non-modal** `role="dialog"` panel is
  correct ARIA and explicitly permitted — stripping roles to pass a gate is
  the cheat this wording exists to kill. Every "no dialog" e2e asserts the
  modality checks (aria-modal count 0, underlying content still
  `toBeInViewport()` and clickable), with `role=dialog` counts only as a
  supplementary signal where genuinely applicable. *(Interaction target,
  confirmed.)*
- **Live preview co-visible** with its controls on any document surface, **at
  ≥1280px** (below: the drawer mode) — no navigating away to see the result.
  **The preview pane shows ONE document at a time** (resume/letter switchable
  in-pane, FlowCV-style); whichever is active is what co-visibility is
  asserted against, each in turn. *(Interaction target, confirmed; red-team
  M1/L1.)*
- **Section-rail navigation** and a **card dashboard** entry surface are in
  scope. *(Interaction targets, confirmed.)*
- **Layout primitive: three-pane** — section rail | editor panel | live
  document preview, all persistent (OQ1). Over two-pane and
  collapsible-preview: it's the most co-visible, which is the epic's thesis;
  the narrower preview column is absorbed by the existing fit ladder.
- **Edit mechanism: hybrid** (OQ2) — text edits happen **in-place** where they
  render (generalizing today's resume/letter inline editing); **structured &
  creation flows** (new application, entry editor, layout, profile, templates)
  load into the **persistent context panel** (the rail/editor region), never a
  modal. Over a single-panel-for-everything: it keeps the direct text editing
  that already works and gives only the complex forms a panel.
- **Section rail: navigate + collapse** (OQ3) — the rail jumps/scrolls and
  shows/hides sections; **section ordering stays the design panel's**
  (`sectionDisplay.order`) so there is no second source of truth. Reorder-in-rail
  was rejected to avoid moving an existing bounded control.
- **Design folds into the workspace** (OQ5) — the bounded format/typography
  panel becomes a panel within the co-visible workspace and the separate
  `/applications/:id/design` route is **dropped** (`design.spec.ts` adapts).
  Over keeping a distinct view: a "navigate away to see the result" step is
  exactly what the redesign removes.
- **Rail collapse is editor view-state ONLY.** Collapsing a section in the rail
  folds its editor region — it never mutates `settings.layout` (tailoring
  input) or `sectionDisplay` (document display), both of which keep their
  existing homes. Wiring rail-collapse to either would silently change the
  document; the same single-source-of-truth rationale as OQ3's ordering answer.
  Client-side persistence of collapse state at most.
- **Destructive confirmations are inline** (two-step button or an inline
  confirm row) — required because modal interruptions are banned on redesigned
  surfaces and `window.confirm` is not an acceptable substitute.
- **Stale `/applications/:id/design` deep links redirect** to
  `/applications/:id` (the workspace that now hosts the design panel) — never
  a 404 or the generic `/applications` fallback.
- **Non-document surfaces degrade the shell.** Dashboard, Library, and
  Settings use the shell's rail + content composition; the preview pane is
  document-surface-only. No forced empty third pane.
- **Viewport target: 1280px** (OQ6) — three-pane co-visibility is contracted
  at ≥1280×720 (the playwright default, no config churn); **below 1280 the
  preview collapses to a toggleable tab/drawer** — one click away, never
  co-visible. Both modes get an e2e. Over 1440-strict and 1024-aggressive.
- **Dashboard card content** (OQ4a): company + role, resume gen-state pill,
  letter-state pill when a letter exists, locked badge, last-updated. No
  thumbnail (rejected: per-card pdf.js render cost on the list).
- **Dashboard quick actions** (OQ4b): **open workspace** (primary),
  **duplicate**, **delete** (inline two-step confirm; `DELETE
  /api/applications/:id` exists), **download PDF(s)** (client-side react-pdf
  render; enabled only when the document exists). All client-only — verified
  against existing routes.
- **react-pdf preview stays the artifact.** The document engine, `format-v2`
  axes, and fit ladder are not touched by the redesign.
- **Test strategy: up-front abstraction phase** (OQ7, human override of the
  in-ticket default) — Phase 0 refactors the e2e suite onto a helper /
  page-object layer over the **current** UI (pure test refactor, zero app
  changes), so every later surface migration edits the abstraction, not
  scattered selectors. Over per-phase in-ticket migration: less churn across
  the five surface phases beat the upfront cost. The invariant stands: **the
  full suite is green at every ticket** — behavioral guarantees never take a
  dark period. **No-deletion rule, all phases** (red-team M6): assertions over
  a removed component are re-homed onto its successor, never deleted; a
  phase's vitest test count may not decrease without an itemized justification
  in the ticket.
- **"Baseline green", defined ONCE** (red-team H3/H4) — every phase's gate
  means exactly: `bun run check` + `NODE_OPTIONS=--max-old-space-size=1024 bun
  run build` + `bun run lint` + full `bunx vitest run` + playwright projects
  **`chromium` (runs `library-crud.spec.ts`), `auth`, `applications`** run
  non-concurrently. Docker e2e (`bun run test:docker`) at the Phase 5 final
  gate only. A phase naming one project is emphasis, never a narrowing.
- **Duplicate = the existing route's semantics, unchanged** (red-team H7) —
  the dashboard's duplicate action calls the v1 duplicate endpoint as-is;
  this spec does not redefine what a duplicate copies. Verified server-side
  (fresh GET returns n+1 including the new id), mirroring the delete check.
- **Panel/rail details** (red-team M2/L3/L6, loud defaults): rail collapse
  state persists in `localStorage` only — never a server write. On
  non-document surfaces the rail carries that surface's section navigation
  (Settings: its settings sections; Library: its entry groups; the dashboard
  needs none — shell shows global nav only). `TemplateGallery` lands in the
  workspace's design/context panel (templates are format presets — they
  belong beside the design controls).
- **Accessibility preserved.** Interactive affordances keep roles/labels
  (`getByRole`/`getByLabel` remain usable); inline panels are focus-managed and
  keyboard-dismissible. *(Convention.)*

## Out of scope

<!-- Tripwire list — ailoop halts if a build crosses it. -->

- **Any visual-identity change** — palette, typography, radius, shadow system,
  or a new/unbounded design axis. Bounded axes forever (CLAUDE.md).
- **Tracker features riding in on the "dashboard"** — hiring/application status
  (applied/interviewing/offer/…), kanban columns, reminders, pipeline, or any
  state that isn't *generation* state + document metadata. The dashboard
  surfaces generation state only.
- **Document-rendering changes** — the react-pdf engine, `format-v2` axes,
  fit ladder, extraction invariants. (Recompose the controls around them, don't
  touch them.)
- **Backend/data-model changes** — new tables, columns, or altered route
  contracts (client redesign only; a needed endpoint is a fork).
- **Browser printing / `window.print` / print CSS** — already rejected,
  standing.
- **A native/mobile app or a new responsive framework** beyond the agreed
  target viewport behavior (OQ6).
- **Regressing any v1/v2 behavior.**

## Phases (de-risk order)

<!-- Riskiest first — with one human-chosen exception: Phase 0 is a mechanical
     ENABLER (test abstraction, OQ7 override) that precedes the riskiest
     product phase because every later phase edits tests through it. -->

### Phase 0 — E2E abstraction layer (enabler; app untouched)

**Why first:** human-chosen (OQ7): every later phase migrates its surface's
tests; doing that against scattered raw selectors five times costs more than
one up-front refactor onto a helper/page-object layer. Mechanical, not risky —
the risk-retiring phase is Phase 1, and this makes its test migration cheap.

**Deliverable:** a page-object/helper layer under `test/e2e/helpers/` that the
existing specs (`applications`, `design`, `library-crud`, `auth`) consume for
selectors, flows (login, create-application, tailor, generate-letter), and
canvas/pixel captures — over the **current** UI.

**Done means (executable):**
- **Scope (mechanical):** `git diff --name-only <phase-start-sha>..HEAD` ⊆
  {`test/**`, `playwright.config.ts`} — the config is allowlisted for helper
  path wiring only; zero `src/` changes. A single `src/` touch fails the phase.
- Baseline green (as defined in Locked decisions).
- **The suite is provably not weakened** (red-team C2 — this phase's output is
  the measuring instrument for every later phase):
  - `bunx playwright test --list` output captured before and after — the diff
    of test titles is EMPTY (no test deleted/renamed away);
  - the total `expect(`-call-site count across `test/**` does not decrease;
  - **mutation probe (the contrast check):** with a known behavior temporarily
    broken (e.g. the preview canvas hidden via a test-only injection), the
    migrated suite FAILS on the corresponding assertion — proving the helpers
    still bite — then the injection is removed and the suite is green again.
    The probe run's output is committed as evidence, not left as a claim.

### Phase 1 — The workspace shell + the application editing surface (riskiest)

**Why first among product phases:** the whole epic rests on one unproven thing — that "sophisticated
workspace: co-visible live preview + inline editing + section rail" can be
expressed as machine-checkable contracts **while every v2 behavior on that
surface still passes.** The application-detail surface is the densest
(tailor/letter/edit/voice/lock/design), so proving the new layout primitive
there retires the core risk; if the primitive or its contracts are wrong,
everything downstream would inherit the mistake.

**Deliverable:** the persistent **three-pane** workspace shell (section rail |
editor | live preview) and `/applications/:id` rebuilt inside it — inline text
editing + the format/typography panel folded in (OQ5, `/design` route dropped)
+ co-visible preview, replacing the modal/stacked detail page and the separate
design view. Migrated `applications.spec.ts` + `design.spec.ts`.

**Done means (executable):** baseline green (Locked-decisions definition — all
three playwright projects, not only `applications`) **plus**:
- **Co-visibility (contrast):** on `/applications/:id` at 1280×720 (the
  playwright default), `[data-testid="editor-pane"]` AND the ACTIVE document's
  preview canvas (one at a time, resume/letter switched in-pane — assert each
  in turn) are BOTH `toBeInViewport({ ratio: 0.9 })` simultaneously; the
  preview canvas `boundingBox().width >= 320` and paints non-uniform pixels
  (no 1px-sliver pass). **Modality checks** (per the locked ban): zero
  `aria-modal="true"`, no backdrop/overlay covering >50% of the viewport, and
  the underlying surface stays clickable throughout — scoped to this surface
  (the create-application flow on the list page stays modal until Phase 2;
  app-wide is Phase 5's gate). Contrast with today: the old flow required a
  separate `/design` route or a modal to change/see things.
- **Below-1280 mode:** at 1024×720, the preview collapses to a toggleable
  tab/drawer — asserted: not co-visible, then one activation shows the canvas
  with non-uniform pixel data (>1 distinct color via readback — a helper
  primitive from Phase 0).
- **Inline edit reaches the document:** edit a resume item to a distinctive
  sentinel string via the inline affordance — modality checks hold throughout
  — then assert the preview canvas pixel-diffs AND the plain-text export
  contains the sentinel (the un-gameable half). Same for a letter paragraph
  (letter preview canvas + letter prose).
- **Section-rail nav (positive + contrast, red-team C3):** scroll so section
  S's editor region is NOT in viewport; activate S in the rail ⇒ S's region
  heading is `toBeInViewport()` (or `document.activeElement` is inside S's
  region) — AND the URL is unchanged AND the preview canvas is the same DOM
  node (expando marker set via `page.evaluate` before the click survives).
  Contrast: a full navigation would remount it.
- **Rail collapse gates its lock (red-team H2):** collapse section S in the
  rail ⇒ S's editor region is hidden, the preview canvas is pixel-identical
  before/after, and fresh GETs show `settings.layout` and the application's
  `sectionDisplay`/format byte-identical — collapse touched nothing but view
  state.
- **`/design` redirect (red-team H2):** `goto /applications/:id/design` ⇒ URL
  becomes `/applications/:id` with the workspace shell visible — never a 404
  or the generic fallback.
- **Behavior preserved:** the migrated `applications.spec.ts` still asserts
  tailor→preview, generate-letter→preview+download, per-part edit persist
  across reload, undo, **locked ⇒ every edit affordance disabled + route 409**,
  voice flag (incl. on locked), motivation persist, typography→preview
  pixel-diff — all green on the new surface.

### Phase 2 — De-modal the remaining flows

**Deliverable:** convert `NewApplication`, `EntryEditor`, `LayoutEditor`,
`ProfileEditor`, `TemplateGallery` from modals to inline / persistent-panel
surfaces (the locked hybrid mechanism: structured/creation flows load the
context panel), each inside the workspace shell.

**Done means (executable):** baseline green + per flow (all five — an e2e is
**migrated if one exists, else written in this phase**; a flow with no test is
not "vacuously migrated", red-team M3): the action opens an inline/panel
surface passing the **modality checks** (zero `aria-modal`, no >50% overlay,
underlying surface clickable); the create/edit **round-trips server-side**
(visible after reload); and **focus is managed concretely** (red-team M4): on
open, `document.activeElement` is inside the panel; Escape closes it AND
returns focus to the invoking control (asserted via activeElement).

### Phase 3 — Dashboard entry surface

**Deliverable:** `/applications` list → a card dashboard (locked card content
+ quick actions — see Locked decisions).

**Done means (executable):** baseline green **plus**:
- **Pills track state (contrast, red-team C4):** drive two applications into
  DIFFERENT states (one untailored, one tailored via the fixture engine) —
  their cards' resume pills differ and each matches its server state; pill
  text ∈ {untailored, tailoring, tailored, failed} (the letter pill mirrors
  the same enum off `letterGenState`); the locked badge appears on a locked
  app and NOT on an unlocked one; the letter pill appears iff a letter exists.
- **Quick actions, server-verified:** open routes to the workspace; duplicate
  ⇒ fresh GET returns n+1 applications including the new id (existing route
  semantics, unchanged); delete (inline two-step confirm — modality checks
  hold) ⇒ fresh GET shows it gone; download fires a real download event whose
  file is non-empty and begins with `%PDF`. Download/delete disabled states
  match document existence.
- **Not-a-tracker as an ALLOWLIST (red-team H8):** a card's DOM contains
  exactly: company, role, gen-state pill(s), optional locked badge,
  last-updated, and the four quick-action controls — asserted via an
  interactive-element count per card === expected. (The "no kanban/reminders/
  hiring status" blocklist stays a coordinator tripwire in prose — absence of
  a concept can't be mechanized.)

### Phase 4 — Library & Settings in the new language

**Deliverable:** `/library` and `/settings` rebuilt inside the workspace shell
(rail + content composition — no forced preview pane) with inline editing (no
modals), consistent with Phases 1/2.

**Done means (executable):** baseline green + `library-crud.spec.ts` migrated
and green (entry CRUD round-trips server-side via inline editing, modality
checks hold); **every settings section that exists today** round-trips and
survives reload (enumerated in the ticket from the live `SettingsView`, not
sampled — red-team M5); both surfaces render inside the shell (the shared
`[data-testid="workspace-shell"]` selector, same one Phase 5 asserts) and
**no preview-pane element is rendered** on `/library` or `/settings` (the
degrade lock, gated).

### Phase 5 — Cohesion sweep (cross-cutting contracts)

**Deliverable:** uniform interaction language across every route.

**Done means (executable):** baseline green + cross-cutting e2e:
- **The shell is genuinely persistent (red-team L4):** `[data-testid=
  "workspace-shell"]` is present on `/applications`, `/applications/:id`,
  `/library`, `/settings` — AND it is the SAME DOM node across a client-side
  navigation between two of those routes (expando marker survives), which is
  the actual "persistent" claim, not element existence. The rail contains ≥1
  functional item per surface whose activation does something observable
  (red-team M2).
- **App-wide modality sweep:** across every redesigned flow, zero
  `aria-modal="true"` and no >50% overlay — the C1 checks, globally.
- The live preview is co-visible on every document surface (the Phase 1
  assertions, re-run on the final tree).
- **Final gate:** the full playwright suite (all three projects,
  non-concurrent) + `bun run test:docker` green.

## Environment & preconditions

- Existing toolchain only (bun + tsx + vitest + playwright + docker) — no new
  services, no new runtime.
- **No API key needed** — this is a UI redesign; the keyless fixture suite
  covers it. (The v2 key-gated evals are untouched and not re-run.)
- Playwright projects must run **non-concurrently** (documented port/font
  constraint); `bun run build` before the `applications` project (stale `dist/`
  fails it).

## Open questions

<!-- Riskiest phase deepest. Two exits only: answered by the human, or the
     feature cut. A default never resolves one of these. -->

_None — all forks answered 2026-07-10 (OQ1–OQ7 → Locked decisions)._

## Change orders

<!-- Post-lock only. -->

### CO-1 (2026-07-10, spec_version 2) — dashboard list projection

**Fork surfaced by ailoop at Phase 3 (T030), human-approved.** The mandated
dashboard card content (OQ4a: locked badge + letter-state pill when a letter
exists) requires per-app `locked` and `letterGenState`, which `GET
/api/applications` did not project (`LIST_COLUMNS` returned `genState` +
metadata only). The "client-only / no altered route contract" constraint could
not deliver OQ4a as written.

**Resolution:** `GET /api/applications` `LIST_COLUMNS` is extended with two
**additive, read-only** fields — `letterGenState` and a derived `locked`
boolean (`locked IS NOT NULL`) — projecting columns that **already exist** on
the row. No new table/column, no data-model change, non-breaking (existing
consumers ignore the extra fields). The out-of-scope "altered route contracts"
tripwire carries this one **named, bounded exception**; the ban on new
tables/columns, hiring-status fields, and heavy snapshots in the list payload
stands. `ApplicationSummary` widens to include the two fields.

### CO-2 (2026-07-10, spec_version 3) — duplicate endpoint

**Fork surfaced by ailoop at Phase 3 (T031), human-approved.** OQ4b's dashboard
"duplicate" quick action was specified as "calls the v1 duplicate endpoint
as-is" and "does not redefine what a duplicate copies" — but **no duplicate
endpoint exists** (no duplicate/copy/clone route; `POST /api/applications`
accepts create-inputs only). The premise was false, so no "existing semantics"
could be preserved.

**Resolution:** add `POST /api/applications/:id/duplicate` — a server endpoint
that **deep-copies the full application row** into a new id (company/role/jd/
context + the `current`/`locked` tailored snapshots + letter + format +
gen/letter state), returning `201 { id }`. This is the faithful reading of
"duplicate this application" (an editable clone). It is a **new endpoint** (a
larger fork than CO-1) but adds no table/column and no hiring-status; the
dashboard's duplicate action calls it and is verified server-side (a fresh
`GET /api/applications` returns n+1 including the new id). The out-of-scope
"backend changes" tripwire carries this as a second named exception.
