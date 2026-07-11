# Oracle — Lede v4 (Polish & Refinement)

**Contract:** `SPEC.md` · spec_version 1 · sha256 `e4254fc54d7999972b20ed8210ff28cbd21bbca8a64e5f06e65242d1aaf5881b`
<!-- Resume recomputes the hash and refuses to dispatch on mismatch. -->
<!-- Prior campaigns: v1, v2, v3 archived under specs/. This is v4, a fresh spec. -->

The definition of done. Workers cite it; the coordinator gates against it.

## Locked decisions (never re-litigated — cite these in every worker prompt)

- **Stack unchanged; client-only.** No new UI framework, router, state lib, or
  CSS-in-JS. No new third-party UI dependency beyond what's installed
  (lucide-react, sonner, radix primitives already present). A needed server
  change is a fork, never a silent add.
- **Visual identity frozen.** Palette hues, type families (IBM Plex), radius
  base, shadow philosophy stay. No new/unbounded design axis. v4 MAY correct
  token *values* where a finding demands it (contrast fixes, a `--ring-weak`
  token) — but never the identity. `src/client/styles/tokens.css` is the single
  source of color/radius/shadow truth.
- **De-modal, forever — with the v4 viewport-scoped exception (OQ2).** Below
  `lg` (1024px), full-width **sheets** are permitted where physical
  co-visibility is impossible (preview layer, docked panels at phone width):
  dismissible (Escape + visible close) and focus-managed. At ≥`lg` the ban is
  ABSOLUTE — no scrims, no lightboxes, no dimming, no `aria-modal`, no overlay
  >50% viewport that blocks what's beneath, no removal of the underlying
  surface from tab order. Destructive confirms are inline two-step, never
  `window.confirm`.
- **Modality-sweep taxonomy (red-team #14).** Modality = `aria-modal="true"`, a
  scrim/backdrop, an overlay covering >50% viewport that blocks interaction
  beneath, OR removal of the underlying surface from tab order. NOT modality:
  persistent chrome (the bottom tab bar — always present, blocks nothing) and
  transient toasts (no scrim, pointer-events inert outside the toast,
  auto-dismissing). Sanctioned below-`lg` overlays are SHEETS ONLY.
- **Breakpoints pinned (red-team #12):** `sm`=640, `lg`=1024, `xl`=1280
  (Tailwind min-width). At exactly 1024 the ≥`lg` regime applies; at exactly
  1280 the ≥`xl` regime applies. 1024–1279 is a first-class regime (rail
  visible, pane-swap active, absolute de-modal).
- **Single-chrome merge (OQ1).** The header (`AppShell`) is DELETED. Wordmark
  moves to the rail top; theme toggle + logout + collapse toggle pin to the
  rail's bottom cluster. Login page gets standalone mini-chrome (wordmark +
  theme toggle at every width) — never inherits shell chrome.
- **Compact nav: bottom tab bar (OQ3).** Below `lg` (tablet portrait AND
  phone), global nav is a fixed bottom bar with the three destinations (icon +
  label, ≥44px targets); rail hidden below `lg`, its per-surface section
  content folds into the editor surface (must stay reachable). NOT a
  hamburger-drawer. Below `lg` the rail's utility cluster (theme + logout)
  re-homes to a session cluster atop the Settings surface.
- **Collapsible rail (view-state only).** Expanded 224px ↔ collapsed icon-only
  40–64px band (builder picks). Toggle in the rail bottom cluster; state in
  `localStorage` ONLY — never a server write, never `settings.layout`/
  `sectionDisplay`. Collapsed: icon-only nav with tooltips; section nav hidden.
- **Rail zoning:** global nav (icon+label) / surface-context / section zone
  under a mono-caps micro-label ("SECTIONS"). The "← Applications" back-link is
  DELETED — the active global-nav item is the up-level affordance.
- **One title convention:** surface titles live in the editor pane header on
  every surface; the rail never repeats the active surface's name.
- **Icons: lucide-react** (already a dep), 16px, consistent stroke.
- **Letter editing re-homed (OQ5).** Paragraph draft editing moves into the
  Cover-letter section of the wide editor pane (joins Regenerate/Undo); the
  preview pane becomes view-only for letters, exactly as for resumes. v2
  behavioral contracts (paragraph edit round-trip, undo, blank-letter,
  part-edit) migrate unchanged to the new home.
- **NewApplication: inline panel in the page flow (OQ7).** Form inserts above
  the card grid, pushing cards down — nothing floats, nothing covered. Phone
  renders the same panel full-width below `sm`. The anchored popover dies.
- **Preview zoom: expand-in-place, ≥`xl` only (OQ6).** A control grows the
  preview pane (editor shrinks but keeps ≥240px width) so the page renders
  ≥1.5× normal in-pane width, still side-by-side. No overlay. State EPHEMERAL —
  never persisted (not even localStorage); fresh load is always un-zoomed.
  Below `xl` the control does not render.
- **Login first-run: public state endpoint (OQ8).** Add `GET /api/auth/state`
  → `{ setup: boolean }`, no auth required, boolean only, no secrets. Login
  microcopy renders iff `setup === false`. This is v4's ONE named backend
  exception.
- **All v1/v2/v3 behavior preserved.** Tailoring, letters, editing, voice,
  lock, design axes, fit ladder, de-modaled flows, persistent shell — never
  regressed. The v3 cohesion contracts (same-DOM-node shell persistence,
  app-wide modality sweep, co-visibility) stay green throughout.
- **Feedback layer.** Mount sonner's `<Toaster>` once in `App`. Success toasts
  on create/duplicate/delete/save/import/export; mutation FAILURES get inline
  errors beside their trigger (the `flagVoice` pattern), NOT toasts.
- **Motion language.** Panels adopt `ui/dialog.tsx`'s `animate-in fade zoom`;
  section collapse animates via grid-rows; every structural animation duration
  ∈ **[100ms, 300ms]** with a `motion-reduce:` variant. Selects get
  `hover:bg-muted transition-colors`.
- **Test-count ratchet (red-team #25).** vitest + playwright per-project counts
  recorded at intake are monotonically non-decreasing at every phase gate. Any
  decrease requires an itemized change-order note before the gate passes.
- **Test migration discipline (inherited).** Behavioral guarantees invariant;
  assertions re-homed, never deleted; `test/e2e/helpers/` is the only place
  selectors change.

## Intake baseline counts (the ratchet floor — never decrease without a change-order)

- vitest: **1056** passing
- playwright `chromium`: **20**
- playwright `auth`: **1**
- playwright `applications`: **32** (holds `cohesion.spec.ts`, the v3 contracts)
- playwright `docker`: **1**

## Scope tripwire (halt if crossed)

- **Phone-first authoring parity** — rejected. Phone is review/tweak-usable;
  complex editors (layout, design axes) may stay desktop-shaped at 375 as long
  as they're reachable and don't break layout.
- **Visual identity changes** — palette hues, type families, radius base,
  shadow philosophy, any new/unbounded axis. (Token *value* corrections for
  contrast/plumbing are in scope; identity is not.)
- **Native app / PWA / offline.**
- **New backend features** — server untouched, with EXACTLY ONE named
  exception: `GET /api/auth/state` → `{ setup: boolean }` (OQ8; public,
  boolean-only, no secrets). Anything beyond it is a tripwire.
- **Tracker features** — standing.
- **Document-rendering engine changes** — react-pdf engine, `format-v2`, fit
  ladder, extraction invariants untouched. Preview *chrome* (zoom, frame,
  loading treatment) is in scope; the rendered document is not.
- **Re-litigating v3 decisions** — three-pane, de-modal, hybrid editing,
  section-rail model are settled; v4 refines their execution.
- **New third-party UI dependencies** beyond lucide/sonner/radix.

## Baseline gate (every ticket, no exceptions — "Baseline green", defined ONCE)

Every ticket must pass ALL of these regardless of what it touched (regression
guard). The independent verifier always runs the FULL set (never scoped); the
builder may scope only the full-suite step to affected tests.

- [ ] type-check: `bun run check` → exit 0
- [ ] build: `bun run build` → exit 0
- [ ] lint: `bun run lint` → exit 0
- [ ] full vitest: `bunx vitest run` → all pass (intake floor: 1056)
- [ ] playwright projects **`chromium`, `auth`, `applications`** run
      **NON-CONCURRENTLY** → all pass. `bun run build` BEFORE the
      `applications` project (stale-dist failure mode). A phase naming one
      project is emphasis, never a narrowing.
- [ ] new behavior ships with new tests, green under the above (exempt only
      pure scaffold/config, stated in the ticket)

Docker e2e (`bun run test:docker`) runs at the **Phase 1 chrome-merge gate**
(red-team #16) and the **Phase 5 final gate**. Not per-ticket.

**Environment adaptation (mechanical, intake 2026-07-11).** This repo's
worktree constraints (CLAUDE.md + spec §Environment) shape HOW the baseline
runs — not WHAT counts as done:
- A fresh git worktree has NO `node_modules`. Every worker/verifier's FIRST step
  in its worktree is `ln -s /workspace/node_modules node_modules` (verified: with
  it, `bun run check` + `bun run build` exit 0 in a worktree; without it they
  ENOENT — the "font-path ENOENT" symptom CLAUDE.md warns of).
- Playwright projects bind fixed ports 8787–8789 and MUST NOT run concurrently.
  Therefore dispatch is **SERIAL single-ticket** (one Agent in a worktree at a
  time), and the coordinator self-verifies — NOT the parallel build→verify
  fan-out (concurrent playwright would collide). File-disjoint batching still
  informs order; it does not authorize concurrency here.
- `bun run build` before the `applications` playwright project (stale-dist).
- **Test-registration allowlist (mechanical, from T012).** `playwright.config.ts`
  uses an EXPLICIT regex `testMatch` per project, so a NEW e2e spec file must be
  registered there to run. A `playwright.config.ts` edit that ONLY adds a new
  spec name to an existing project's `testMatch` alternation (no change to
  projects, servers, ports, or other config) is IN SCOPE for any ticket that
  adds that spec — treated like the manifest allowlist. The verifier confirms
  the diff is registration-only. Every ticket adding a new e2e spec should
  declare `playwright.config.ts` (or reuse an already-registered spec file).
- **Font-flake tolerance (mechanical, confirmed at intake).** The full vitest
  run flakes on `@fontsource` fetch timing under concurrency — verified on the
  untouched main tree: `fit-ui.test.tsx` / `ats-view.test.tsx` (fit-ladder
  measurement tests) can fail in the full run but pass 4/4 in isolation. Per
  CLAUDE.md ("retry absorbs it; isolated re-run confirms"). Protocol: a
  full-suite failure is a real regression ONLY if it still fails on an
  ISOLATED re-run of that file. A failure that passes in isolation is a flake,
  not a baseline-red. The ground-truth baseline is 1055–1056 passing (the flaky
  1–4 float). New behavior must still add real passing tests on top.
- **Worktree staleness (mechanical, confirmed).** The Agent tool's
  `isolation: 'worktree'` forks from a STALE base (observed: 234 commits behind
  on T010). The worker's first duty is to reset its branch to the given
  `baseSha` (current main tip) before building. The coordinator's scope check
  uses `baseSha` = the captured main HEAD, and MUST confirm the branch is a
  descendant of it (else the diff base is wrong and the ticket is re-dispatched).

**The v3 cohesion contracts (`applications` project, `cohesion.spec.ts`) stay
green at EVERY phase gate.**

## Verification protocols (the independent re-verify applies these)

HOW the re-verify bites, applied to every ticket without repeating in each
acceptance field. The independent verifier — not the builder's self-report —
runs them:

- **Full baseline, always** — verifier runs the complete suite even where the
  builder scoped it.
- **Scope check** — `git diff --name-only <baseSha>..<branch>` ⊆ declared
  `files` ∪ manifest allowlist. Any undeclared touch FAILS the ticket.
- **Gaming read** — read the diff: was acceptance met by implementing intent,
  or by hardcoding/weakening/deleting a test/special-casing? Suspicion → the
  coordinator judges against spec intent.
- **Ratchet** — verifier captures `--list` counts; any per-project decrease
  vs. the intake floor (or the prior phase gate) fails absent a change-order.
- **DOM-measurement checks are contrast checks, not existence checks** — a
  missing ring/marker/state must FAIL, not pass by absence (red-team #20/#21).

### Anti-gaming protocols (intake red-team of the seeded acceptance, 2026-07-11)

Cross-cutting cheats the fan-out found. These apply to EVERY ticket whose
acceptance touches the pattern — the independent verifier enforces them without
each ticket restating them:

- **Per-theme resolution, not a shared literal.** Any token/contrast/ring check
  resolves the token FOR THE ACTIVE THEME and asserts in BOTH light and dark on
  the REAL rendered instances (not one sampled node, not a test-only stand-in).
  A light-only hardcode that breaks dark must FAIL. (T010, T011, T017-dark)
- **Geometry/behavior, not tag-name or class-presence.** "No header" =
  no full-width fixed bar outside the rail (measured), not "no `<header>` tag".
  "Hover differs" / "select hover" / "highlight" = a COMPUTED-STYLE DELTA vs
  rest-state, not the presence of a class or a 1-LSB color nudge; assert the
  exact resolved token value where one is named. "Contains an svg" = nonzero
  rendered bbox. (T020, T021, T043, T045)
- **Gone = removed, not hidden.** "Popover/drawer/dropdown gone", "control
  absent below xl", "no floating variant" = `querySelector(...) === null` over
  the FULL DOM (and out of tab order), NOT `toBeHidden()`/`display:none`/
  off-canvas. A hidden-but-present node FAILS. (T030, T032, T041, T051, T054)
- **Swap/collapse = real layout change, not opacity/transform.** A pane that is
  "hidden" must have zero layout width AND be out of tab order (not `opacity:0`/
  `visibility:hidden` still occupying width/intercepting clicks); a "collapsed"
  rail must shift the main content's left offset (not clip an inner div);
  "≥1.5× zoom" must change the editor pane's real layout width (rules out
  `transform:scale`, verified via `elementFromPoint`). (T022, T033, T054)
- **No-clip, no-scale overflow.** "No horizontal overflow" is not satisfiable by
  wrapping content in non-scrollable `overflow:hidden|clip` (its scrollWidth
  equals clientWidth while it clips) nor by a root `transform:scale`/`zoom`.
  Assert every seeded control is reachable via `elementFromPoint`/visible bbox,
  and flag any non-whitelisted ancestor with `overflow:hidden|clip`. The
  overflow whitelist is FROZEN — any addition is a flagged change, not silent.
  (T031, T034, T060)
- **Network-zero = all bodies, all time.** "Network-zero on toggle" holds the
  interception window several seconds past the click, asserts a zero
  request-COUNT delta, and inspects ALL request bodies for a settings-shaped
  payload (not a URL/field-name filter a renamed field dodges). (T022, T041)
- **44px = functional, excluded-set snapshotted.** Tap-target size is verified by
  a functional tap at the box extremities that fires the action (not a padded
  non-interactive wrapper's bbox); the EXCLUDED set is asserted against its
  pre-change dimensions (a blanket `min-height:44px` that bumps excluded items
  to 40px still regresses them). (T034)
- **Toast/badge = counted transition, per-item.** "Exactly one toast" = the
  toast-root child count transitions 0→1→0 matched by message, asserted for
  EACH named mutation individually (not one shared loop that no-ops on a missing
  one); a failure fixture keeps toast count at 0 AND a real server error
  occurred. (T040)
- **Ratchet = per-file expect() non-decrease, per phase gate.** The raw
  test-count floor is necessary but not sufficient — tautology padding
  (`expect(true)`) games it. The verifier also asserts no per-file `expect(`
  count decreased vs the pre-change file, and records the ratchet at EACH phase
  gate (not just the final number) so under-testing new behavior is visible.
  Migrated contracts (v2/v3) are diffed for `expect()` count AND content, not
  just pass/fail. (T050, T060, T061)
- **Test-only tickets = pure assertions.** T060/T061 scope check is paths ⊆
  test/**, AND the verifier reads the diff for runtime-behavior injection
  (CSS overrides, pre-seeded window globals, monkeypatching) that papers over an
  unfixed behavior — such a diff fails even though its path is compliant.
- **Slow suites are re-run, not trusted.** The docker e2e (P1 gate, P5 gate) is
  independently EXECUTED by the verifier with fresh logs — never accepted on the
  builder's report.

## Per-phase oracle (executable checks on the MERGED tree)

Ticket-local `acceptance` is necessary but per-phase drain runs THESE on the
merged tree before the phase closes. Written as playwright/vitest assertions in
the appropriate spec file, driven through the `test/e2e/helpers/` layer.

### Phase 0 — Broken things (F1xx)
- **F101** ATS: with the seeded fixture, `scrollWidth ≤ clientWidth` on the ATS
  text container; a 500-char unbroken token still wraps (`white-space:
  pre-wrap`).
- **F102** template gallery: boundingBox ⊆ editor-pane box at 1280×720
  (temporary reposition; re-targeted in Phase 4).
- **F103** (chrome-agnostic): with any docked panel open, its title AND close
  control are fully within the viewport and hit-testable via `elementFromPoint`
  (no other element wins the point). No reference to the header — survives
  Phase 1's merge and RE-RUNS there unchanged.
- **F104** focused input/textarea/select ring computes to the resolved
  `--ring-weak`/accent value with alpha > 0 AND ring width > 0 in BOTH themes
  (a missing ring FAILS — red-team #20).
- **F105** tailor over an unmatched JD (fixture engine 422) renders a visible
  inline error near the Tailor button without navigation; badge reflects
  failure on the same screen.
- **F106** entry delete is two-step (first activation arms, second deletes;
  blur/Escape disarms); server round-trip asserted.
- **F107** at 768 AND 1024 no card action extends outside its card's box; stamp
  renders on one line.
- **F108** wrong password ⇒ human copy (no `_`-code pattern on screen);
  first-run microcopy via `GET /api/auth/state`: `setup:false` ⇒ hint renders,
  `setup:true` ⇒ it does not (drive both — `auth` project boots fresh DB,
  `applications` reuses one); hidden username field present; the endpoint
  answers WITHOUT a session and leaks nothing but the boolean.
- **F109/F110** computed contrast of the named pairs ≥4.5:1 in both themes;
  checkbox `accent-color` is the token accent; dark card hover border computes
  to the resolved `--border-strong` and differs from the rest-state border
  (red-team #21).
- Baseline green.

### Phase 1 — Shell final form (F2xx)
- **Chrome merge asserted (red-team #3):** no header bar element in the DOM on
  any shell surface; wordmark renders inside the rail; the rail's theme toggle
  is OPERABLE (activation flips the root theme class AND a sampled computed
  background changes); the rail's logout is OPERABLE (lands on login). Login
  page renders its standalone wordmark + theme toggle (red-team #4).
- **Rail designed (F201/F204/F205; red-team #9):** each global nav item
  contains an `svg`; hover computes to the designated token and DIFFERS from
  rest (both asserted); the mono-caps section-zone label renders on surfaces
  with a section group; "← Applications" appears nowhere on detail; on all four
  surfaces the editor pane's h1 is the surface title and the rail contains no
  duplicate of it.
- **Collapse:** rail width transitions between expanded and the 40–64px band;
  icon-only mode shows all three global items operable (navigate); state
  survives reload (localStorage) but never a server write (network-zero on
  toggle).
- **Scroll-spy (red-team #5):** on detail (seeded fixture, 3 sections,
  precondition `scrollHeight > clientHeight + 500` asserted) scroll so section
  S dominates ⇒ S's rail item (and only S's) carries `aria-current`; scroll to
  bottom ⇒ the FINAL section's item is active (short-last-section arm); the
  marker provably moved.
- **Scroll restoration:** scroll editor to Y ≥ 1000, navigate away, browser
  back ⇒ scrollTop within ±24px of Y; forward-nav to a fresh route ⇒ top.
- **Focus:** after rail navigation, `document.activeElement` is the new
  surface's h1; exactly one `<main>` in the landmark dump; heading levels
  sequential per surface.
- v3 cohesion contracts green on the new tree **+ one docker e2e run at this
  gate** (red-team #16).
- Baseline green; helpers updated, assertions re-homed not deleted.

### Phase 2 — Responsive (F3xx): tablet solid, phone usable
- At 768×1024 with preview open: editor pane NOT visible (swap asserted),
  preview canvas ≥60% viewport width, paints non-uniform pixels; toggle returns
  the editor. Section nav reachable in the editor surface at 768 (red-team #24).
- At 375×812 AND 768×1024 on all four surfaces: global nav is the fixed bottom
  tab bar — three items, icon+label, each ≥44px, activation navigates (red-team
  #2: no drawer pattern); the bar covers no interactive content.
- At 375×812 on all four surfaces: `document.documentElement.scrollWidth ===
  375` AND no descendant outside whitelisted scroll containers has `scrollWidth
  > clientWidth + 1` (red-team #13); every audited flow (create, tailor-fail
  error, entry edit, letter view + preview sheet) completes with no control
  off-viewport or losing `elementFromPoint`.
- At 375: theme toggle + logout reachable/operable via the Settings surface
  (red-team #4).
- NewApplication (desktop arm, red-team #11): at 1280, opening the form
  displaces the first card row downward (boundingBox y-delta > 0) and covers no
  card; no floating/anchored variant in the DOM; below `sm` the same panel
  renders full-width.
- Coarse-pointer (375×812 + `pointer: coarse`): every control in the enumerated
  audited set measures ≥44px on its short axis.
- ≥1280: v3 co-visibility contracts green. Proportional preview (red-team #10):
  at 1512×900 the preview pane is WIDER than 384px and within its clamp; at
  1280 it is ≥384px.
- Regime edges: 1023 and 1024 behave as their respective regimes (bottom bar at
  1023, rail at 1024).
- Baseline green.

### Phase 3 — Feedback & motion (F4xx)
- Toast coverage ENUMERATED (red-team #15): every named success mutation —
  create, duplicate, delete, profile save, entry save, layout save, import,
  export — fires exactly one auto-dismissing toast. Failure contrast on ≥2
  (fixture 422 / invalid import): NO success toast; inline error near the
  trigger.
- Export busy: during a slowed PDF render (CDP throttle / test hook), the
  control is disabled with swapped label; double-activation → ONE download.
- Motion: on the animated set (panels, section collapse), computed
  animation/transition duration ∈ [100ms, 300ms] (a 1ms token-pop FAILS —
  red-team #22); with `prefers-reduced-motion: reduce`, computed animation IS
  none.
- Letter empty state: structural parity with the resume empty card (dashed card
  + CTA present).
- Baseline green.

### Phase 4 — Surface craft (F5xx)
- Letter editing (red-team #17): at 1280×720, while a paragraph textarea HAS
  FOCUS, ≥50% of the letter page canvas's bounding box is within the viewport;
  paragraph edit round-trips to the rendered letter (pixel-diff + plain-text
  sentinel); v2 contracts (undo, blank-letter, part-edit) green in the new home.
- Library: per-row Edit opens the entry's editor in ONE activation with that
  entry's data loaded (contrast: two rows load different data); the
  dropdown+"Edit selected" pair is gone from the DOM; identity line asserts
  company/role/period per row; delete stays two-step.
- Detail sections: all three collapsible, DEFAULT EXPANDED (red-team #8);
  collapse is view-state (network-zero, preview pixel-identical); exactly ONE
  template-choice presentation exists on the surface, fully within the editor
  pane (the re-targeted F102 assertion — red-team #7); Phase-1
  scroll-spy/restoration tests re-run green with scroll-room precondition still
  satisfied.
- Settings: no card exceeds 1,200px rendered height (red-team #22); every
  section still round-trips.
- Zoom (≥`xl` only): at 1280, activating the control renders the page canvas
  ≥1.5× its prior width while the editor pane stays visible at ≥240px and zero
  modality appears; toggling restores; state ephemeral (fresh load ⇒ normal);
  below `xl` the control is absent.
- Craft (red-team #19): no detail card heading duplicates its kicker text
  (case-insensitive); "Use resume as a voice source" and "Use letter as a voice
  source" both present and distinct; the action strip's FIRST control is the
  primary (Re-tailor); every docked panel's close control has accessible name
  "Close" (an X, not a chevron); panel header boundingBox stable while body
  scrolls (sticky header); "Sort key (YYYYMM" appears nowhere.
- Baseline green.

### Phase 5 — Cohesion re-sweep + final gate
- Full playwright (3 projects, non-concurrent) + `bun run test:docker` green.
- App-wide modality sweep green under the pinned taxonomy at 375, 768, 1024,
  AND 1280 (sheets sanctioned below `lg` only; zero modality at ≥1024; bottom
  bar and toasts classified as non-modal chrome — red-team #14/#23).
- No horizontal overflow on any surface at 375/768/1023/1024/1280/1512.
- Scroll restoration re-verified on the final tree.
- Test-count ratchet satisfied campaign-wide.

## Coverage map (spec requirement → ticket / check)

Every finding maps to a ticket; every phase gate maps to the per-phase oracle
above. Updated as tickets decompose.

| Finding | Ticket(s) |
|---|---|
| F101 ATS wrap | T012 |
| F102 gallery reposition (temp) → re-target | T013 (P0), T041 (P4 delete+re-target) |
| F103 docked panel z-order (chrome-agnostic) | T014 (P0), re-gated in T02x (P1) |
| F104 focus ring token | T010 |
| F105 tailor failure inline | T015 |
| F106 entry delete two-step | T016 |
| F107 card overflow/stamp | T017 |
| F108 login copy + hidden username | T018 |
| F109 contrast (labels/pill/checkbox) | T011 |
| F110 dark card hover | T017 |
| F201 rail nav styled/icons/hover | T021 |
| F202 scroll-spy | T023 |
| F203 scroll restoration | T024 |
| F204 back-link removed | T021 |
| F205 title convention / rail zoning | T021 |
| F206 header merge (OQ1) | T020 |
| F207 rail collapse / preview growth | T022 (collapse), T033 (preview width) |
| F208 route focus / single main / headings | T024 |
| F209 section-row split-button clarity | T023 |
| F301 fixed rail at all widths | T030 |
| F302 detail off-viewport at 375 | T030, T031 |
| F303 tablet pane arbitration | T033 |
| F304 NewApplication popover off-screen | T032 |
| F305 tap targets / single-column fields | T034 |
| F306 preview fixed width | T033 |
| F401 no success feedback (Toaster + toasts) | T040 |
| F402 export busy state | T042 |
| F403 panel/section motion + motion-reduce | T043 |
| F404 select hover | T043 |
| F405 letter empty state | T044 |
| F406 card detail set (Escape disarm, dup highlight, error border, focus ring) | T045 |
| F501 letter editing re-homed (OQ5) | T050 |
| F502 library editing pattern (OQ4) + identity line + toolbar | T051 |
| F503 kicker dedup | T052 |
| F504 action-strip regroup | T052 |
| F505 accordion consistency + gallery consolidation | T041 |
| F506 settings split + centering | T053 |
| F507 preview zoom + frame (OQ6) | T054 |
| F508 panel craft (sticky/pinned/X/textarea/label) | T055 |
| F509 metadata typography unification | T052 |
| Phase 5 cohesion re-sweep | T060, T061 |

Deferred/cut: none. All findings mapped.
