---
status: locked           # locked 2026-07-11 — human go-ahead after red-team pass (25 findings landed) + de-risk order confirmed
spec_version: 1          # bumped by change orders after lock
---

# Lede v4 — Polish & Refinement (finish the workspace)

v3 built the right bones — persistent three-pane shell, de-modaled flows, card
dashboard, zero layout shift — but the workspace doesn't *feel* finished: the
rail reads as unstyled links rather than a designed nav, the app has no mobile
strategy at all (phone width is structurally broken, tablet borderline), every
successful action is silent, layout changes pop at 0ms, and a fine-tooth-comb
audit surfaced ~60 concrete defects from real bugs (ATS text running 8,050px
off-screen) to missing craft (no icons, no collapse, no scroll-spy). This
campaign is that comb: fix what's broken, give the shell its final form
(icon rail, collapsible, single visual language), make the app responsive to
the agreed target, and add the feedback/motion layer that makes it read as a
finished product.

Origin: human directive 2026-07-11 — *"i like this ui look and feel, but theres
a level of refinement that is needed… it doesnt feel complete yet. go through
this with a finetooth comb… i know that there hasnt been much thought to
mobile mode. things like icon style rails, collapsible side bar, etc. you need
to keep looking its more than just the things that i have listed."* Raw
material: five parallel audit agents (mobile/responsive, navigation/shell,
visual+dark-mode, interaction-states/a11y, content-surfaces) drove the live
production build and produced the findings inventory below — every finding
screenshot-evidenced and DOM-measured at audit time (evidence was
session-ephemeral; the inventory is self-contained).

Human decisions already made at intake:
- **All tiers ride one spec** — including the mechanical bug fixes. (Over:
  fix bugs now, spec the rest.)
- **Mobile scope: tablet solid, phone usable** — full pane arbitration at
  768–1279, phone gets a working stacked/sheet layout for reviewing and
  tweaking, NOT phone-first authoring parity. (Over: tablet-only, and over
  full phone parity.)

## Standing constraints (cited, not restated)

`/workspace/CLAUDE.md` binds every ticket. Load-bearing here:

- **§ Design system** — the soft-surface identity and `tokens.css` as the
  single source of color/radius/shadow truth. v4 *composes with* the tokens.
  Unlike v3, v4 MAY touch token *values* where a finding demands it
  (contrast fixes, a missing `--ring-weak`) — but never adds a new visual
  axis, never changes the identity (palette hues, type families, radius
  base, shadow philosophy stay).
- **§ Standing policies** — **De-modal, forever** (promoted from v3; see
  OQ2 for the one place this campaign probes its edge); **rail collapse is
  view-state only**; bounded axes; not-a-tracker; PDFs only via react-pdf;
  keyless by default.
- **v1/v2/v3 behavior is product surface** — tailoring, letters, editing,
  voice, lock, design axes, fit ladder, de-modaled flows, persistent shell:
  preserved, never regressed. The v3 cohesion contracts (same-DOM-node shell
  persistence, app-wide modality sweep, co-visibility) stay green throughout.

## Already exists (read from reality, not the v3 archive)

- **Shell**: `WorkspaceShell` (`rail | editor | preview`, `w-56` rail, `w-96`
  preview, below-`xl` preview drawer with a toggle strip) hoisted above the
  router `Outlet` in `App.tsx`; per-route rail/preview content portals in via
  `WorkspaceShellSlots`. Header (`AppShell`) carries wordmark + theme toggle +
  logout only. `NavTabs` renders the global trio vertically in the rail
  (**uncommitted working-tree fix from 2026-07-11** — stacks `flex-col`; commit
  it with or before Phase 0).
- **Surfaces**: card dashboard `/applications` (`ApplicationCard`), detail
  three-pane `/applications/:id` (`ApplicationDetail` + `DocumentPreview` /
  `LetterPreview` / `AtsView`, Resume/Letter in-pane tabs), `/library`
  (`LibraryView`, `EntryCard`), `/settings` (`SettingsView`).
- **De-modal panels**: `NewApplication` (anchored popover), `EntryEditor` /
  `ProfileEditor` / `LayoutEditor` (docked `fixed right-6 top-6 z-20`),
  `TemplateGallery` (anchored `absolute right-0 w-[42rem]`).
- **Primitives**: shadcn-ish `ui/` set reading tokens; `ui/sonner.tsx` exists
  but **no `<Toaster>` is mounted and zero `toast()` calls**; `ui/dialog.tsx`
  has `animate-in` motion the panels lack; lucide-react is a dependency
  (header uses `LogOut`).
- **Regression net**: vitest ~1056 + playwright projects `chromium`, `auth`,
  `applications` (holds `cohesion.spec.ts` with the v3 persistence/modality/
  co-visibility contracts, 32 tests), `docker`; `test/e2e/helpers/` page-object
  layer (v3 Phase 0) — all surface work goes through it.

## Findings inventory (audit 2026-07-11, five agents; the raw material)

IDs are stable references for phases/tickets. Severity: **B** broken /
**U** clearly-unpolished / **R** refinement.

### F1xx — broken (bugs)

- **F101 (B)** ATS view (`AtsView.tsx:104`): `<pre class="ats-view__text">`
  has no CSS rule anywhere (orphan class) → UA `white-space: pre`, measured
  scrollWidth 8,050px in a 351px pane; content past ~40 chars unreachable and
  the pane drags sideways. Two agents independently.
- **F102 (B)** Template gallery (`TemplateGallery.tsx:105`): `absolute
  right-0 w-[42rem]` overflows its clipping ancestor — opens 49px under the
  left rail, title and first tile column cut. Two agents independently.
- **F103 (B)** Docked panels open half-buried under the header:
  `fixed right-6 top-6 z-20` vs header `z-40` — panel title + close button
  sliced, close hit-area partially blocked (`EntryEditor.tsx:212`,
  `ProfileEditor.tsx:205`, `LayoutEditor.tsx:95`). Three agents independently.
- **F104 (B)** Form-field focus ring is Tailwind default blue, not the
  accent: `focus-visible:ring-ring/25` never resolves because
  `ring: "var(--accent)"` (`tailwind.config.ts:16`) carries no
  `<alpha-value>` → `rgba(59,130,246,.5)` in both themes; buttons use plain
  `ring-ring` and are correct — two focus languages, one off-palette
  (`ui/input.tsx:13`, `ui/textarea.tsx:12`, `ui/select.tsx:18`).
- **F105 (B)** Tailor failure is silent at the moment it happens: 422 →
  pixel-identical screen; "Failed" badge appears only after an unrelated
  refetch. `useTailorApplication` has no `onError`, invalidates only
  `onSuccess`; `ApplicationDetail` never reads `isError`
  (`queries/useApplications.ts:88`, `ApplicationDetail.tsx:442`).
- **F106 (B)** Library entry Delete fires with zero confirmation —
  irreversible, one click (`LibraryView.tsx:205`, `EntryCard.tsx:35`);
  dashboard cards already have the armed two-step pattern to reuse
  (`ApplicationCard.tsx:172-188`).
- **F107 (B)** Dashboard card action row overflows the card and overlaps the
  neighbor at 768–1024 (258px of buttons in a 240px card, `justify-end`
  spills left; `ApplicationCard.tsx:151`); footer stamp breaks mid-date at
  1280 and sibling cards' footers disagree (`ApplicationCard.tsx:133-142`).
- **F108 (B)** Login: raw `invalid_credentials` shown on wrong password
  (`LoginGate.tsx`); "First time here? This sets your password." microcopy
  renders unconditionally — false and confusing on a returning-user instance;
  password form lacks the hidden username field browsers/password managers
  expect.
- **F109 (B)** WCAG: `weight-bar__label` 2.56:1 light / 4.23:1 dark
  (`app.css:141-147`, same color on `.reasoning-panel__rationale-source`);
  success pill 4.47:1 light (`--success` on `--success-soft`,
  `tokens.css:21-22`). Native checkboxes render UA-blue (`accent-color`
  unset) in both themes.
- **F110 (B)** Dark mode: card hover elevation invisible (`hover:shadow-md`
  is the only cue; black-on-near-black doesn't register;
  `ApplicationCard.tsx:109`).

### F2xx — shell & navigation

- **F201 (U)** Global nav reads as unstyled links: no icons, no zoning, hover
  `#fafafa`-on-white near-imperceptible; active pill is the only designed
  moment (`NavTabs.tsx`).
- **F202 (U)** Section nav has no active state and no scroll-spy — clicking
  scrolls but nothing highlights, no `aria-current`; the rail can't answer
  "where am I" (`ApplicationDetail.tsx:390-419`).
- **F203 (U)** Editor scroll position lost on browser back (custom scroll
  container defeats native restoration; measured 5464→0).
- **F204 (R)** "Applications" appears twice 30px apart on detail (active nav
  pill + "← Applications" back-link, same destination).
- **F205 (R)** Surface-title conventions disagree (Library/Settings title in
  rail, dashboard title in editor pane); two nav systems (route links vs
  scroll buttons) typographically identical; the rail is a mostly-empty white
  column on 3 of 4 surfaces with a stray border floating over the void.
- **F206 (R)** Header carries 3 items in 57×1280px — not earning its row; on
  detail that's 57px stolen from the artifact. (→ decided: OQ1 in Locked decisions.)
- **F207 (R)** No rail collapse affordance; below-`xl` preview toggle lives
  in a dead full-height gutter strip; wide screens give all growth to the
  editor, none to the preview (1512: rail 224 / editor 904 / preview 384).
- **F208 (R)** No focus move on route navigation (focus stays on the clicked
  link; section-nav clicks DO move focus — route level should match). Two
  nested `<main>` landmarks on every page (AppShell + WorkspaceShell);
  heading order skips H1→H3.
- **F209 (R)** Section-row split-buttons ambiguous (label scrolls, chevron
  collapses, no seam); chevron direction only legible after clicking.

### F3xx — mobile & responsive (target: tablet solid, phone usable)

- **F301 (B)** Fixed 224px rail at every width: at 375 it's 60% of the
  viewport; Library/Settings render one-word-per-line; clipped content is
  unreachable (no scroll to it).
- **F302 (B)** Detail at 375: editor pane 29px wide; opening preview renders
  it at x=341–725 on a 375 screen — off-viewport, editing blind.
- **F303 (U)** Tablet (768) "Show preview" crushes the editor to a 43px
  sliver of clipped glyph fragments instead of swapping panes.
- **F304 (U)** NewApplication popover anchors off-screen at 375 (anchored
  `absolute right-0 w-[28rem]` to a clipped-layout button).
- **F305 (R)** Tap targets uniformly 32px (below the 44px coarse-pointer
  guideline); EntryEditor keeps two-up field pairs at 375 (~110px inputs);
  detail action bar wraps to an uneven two-row block at 768.
- **F306 (R)** Preview fixed `w-96` at every width — the direct cause of
  F303; needs min/max proportional width.

### F4xx — feedback, motion, states

- **F401 (U)** No success feedback anywhere: no Toaster mounted, zero toasts;
  Job-details Save changes nothing visible; Settings auto-save silent;
  profile save just closes the panel.
- **F402 (U)** No busy state on PDF/plain-text export from detail — no
  pending flag at all, double-click renders twice
  (`ApplicationDetail.tsx:445-462`); card download disables silently with no
  label change; no spinner primitive exists client-wide.
- **F403 (U)** Panels pop at 0ms (`animation: none` measured) while
  `ui/dialog.tsx` and selects have `animate-in` — inconsistent motion
  language. Section collapse is an instant unmount (only the chevron
  animates). Zero `motion-reduce:` handling repo-wide.
- **F404 (R)** Select triggers: `cursor: pointer` but no hover feedback, no
  transition (every button variant has both).
- **F405 (R)** Letter-tab empty preview is bare text ("Nothing to preview
  yet.") while the resume side gets the designed dashed card + CTA; the
  resume empty-state CTA wraps leaving a floating "→" on its own line.
- **F406 (R)** Escape doesn't disarm the card's "Confirm delete"; duplicate
  gives no locating feedback (new card appears unhighlighted at list end);
  NewApplication required-field error renders detached below the wrong field
  with no red border/focus; card focus ring follows `rounded-t-xl` (square
  bottom corners mid-card).

### F5xx — surface craft

- **F501 (U)** Letter draft editing lives in the 384px preview rail below the
  letter page: ~90px fixed textareas clip mid-word, scrolling to Paragraph 2
  scrolls the letter out of view — you edit blind; per-paragraph full-width
  Remove/Insert button pairs outweigh the content (`LetterPreview.tsx:117-145`).
  (→ decided: OQ5 in Locked decisions.)
- **F502 (U)** Library affordance inversion: entries listed but editing takes
  select-in-dropdown → "Edit selected" (3 clicks, dropdown labels entries by
  first fact) while destructive Delete is inline (1 click); rows have no
  identity line (company/role/period never shown; `LibraryView.tsx:167`,
  `EntryCard.tsx`). (→ decided: OQ4 in Locked decisions.)
- **F503 (R)** Kicker/heading double-labeling on every detail section
  ("JOB DETAILS" mono kicker + "Job details" card title + the rail's third
  repeat).
- **F504 (R)** Detail action strip ungrouped, primary in slot 2, consequential
  "Lock final" styled identically to harmless "Plain text"; "Use as a voice
  source" appears twice with identical labels and different targets
  (resume vs letter; `ApplicationDetail.tsx:486,566`).
- **F505 (R)** Design section permanently expanded ≈5,400px of a 6,080px
  editor scroll; only Job details is collapsible — accordion model
  inconsistent, rail chevrons imply a collapse they don't perform. The Design
  card also duplicates the template gallery (same 10 templates inline AND in
  the popover).
- **F506 (R)** Settings: "Default document format" is one 3,153px monolith
  card beside two ~200px peers; cards left-anchored with ~640px dead space at
  1512.
- **F507 (R)** No zoom affordance on the ~350px page render — the artifact is
  only inspectable by downloading. Re-render drops the page frame (bare
  "Rendering preview…" text, layout jump). (→ decided: OQ6 in Locked decisions.)
- **F508 (R)** Panel craft: whole-panel scroll clips title on autofocus and
  submit at max-height (needs sticky header/pinned footer); close affordance
  is a chevron (reads "collapse") vs X elsewhere; long facts clip in
  single-line inputs; "Sort key (YYYYMM or YYYYMMDD)" is a raw format string
  as a label. New-application popover has no scrim and covers cards
  ambiguously (→ decided: OQ7 in Locked decisions).
- **F509 (R)** Metadata typography split (Mono kickers vs Sans "Updated…"
  / "3 of 3"); template preset cards are the one shadowless card surface and
  their thumbnails clip 37px; toolbar mixes three affordance levels
  (`LibraryToolbar.tsx`); action row mixes outline buttons with bare red
  Delete text; disabled Download PDF occupies space pre-tailor.

Audit passes worth keeping (do not regress): radii 100% on-scale, serif
confined to wordmark+callouts, one accent, uniform pills, tight type scale,
consistent card grid rhythm, brand-colored focus rings on buttons/links,
keyboard-operable panels (focus-in on open, Escape closes, focus restores),
labeled inputs, designed skeletons on list/detail loads, dark palette clean
except F109/F110.

## Locked decisions

<!-- Loud defaults (override any). Genuine forks live in Open Questions. -->

- **Stack unchanged; client-only.** No new UI framework, router, state lib,
  or CSS-in-JS. A needed server change is a fork, never a silent add.
- **Single-chrome merge** (OQ1, human 2026-07-11): the header is DELETED.
  Wordmark moves to the rail top; theme toggle + logout pin to the rail's
  bottom cluster (with the collapse toggle). Over keep-with-contextual-work
  and keep-as-is — the header wasn't earning its 57px and the merge gives
  the rail its missing top/bottom anchors. Consequences owned by Phase 1:
  `AppShell` dissolves into the shell; the docked panels' `top-6` reference
  frame changes (F103's fix must land against the FINAL chrome); `auth`/
  `docker` specs that drive header controls migrate via helpers.
- **De-modal ban: viewport-scoped exception** (OQ2, human 2026-07-11):
  below `lg`, **full-width sheets** are permitted where physical
  co-visibility is impossible (the preview layer, the docked panels at phone
  width) — the ban's spirit is co-visibility, not ceremony. At ≥`lg` the ban
  stays ABSOLUTE: no scrims, no lightboxes, no dimming (the desktop-scrim
  option was rejected). Sheets used below `lg` must be dismissible (Escape +
  a visible close affordance) and focus-managed like the panels. The
  Phase-5 modality sweep asserts BOTH regimes. CLAUDE.md's standing policy
  gains this bounded exception at lock (recorded as v4's).
- **Modality-sweep taxonomy** (red-team #14 — what the sweep counts):
  *modality* = `aria-modal="true"`, a scrim/backdrop, an overlay covering
  >50% of the viewport that blocks interaction with what's beneath, or
  removal of the underlying surface from tab order. Explicitly NOT modality:
  persistent chrome (the bottom tab bar — always present, blocks nothing,
  needs no dismissal), and transient toasts (no scrim, pointer-events inert
  outside the toast, auto-dismissing). Sanctioned below-`lg` overlays are
  SHEETS ONLY — anything else that trips the definition fails the sweep at
  any width.
- **Breakpoints pinned in pixels** (red-team #12): `sm` = 640, `lg` = 1024,
  `xl` = 1280 (Tailwind min-width semantics). At exactly 1024 the ≥`lg`
  regime applies; at exactly 1280 the ≥`xl` regime applies. The 1024–1279
  band (rail visible, pane-swap active, absolute de-modal) is a first-class
  regime and appears in the sweep widths.
- **Compact nav: bottom tab bar** (OQ3, human 2026-07-11): below `lg`
  (tablet portrait AND phone — red-team #24), global nav is a fixed bottom
  bar with the three destinations (icon + label, ≥44px targets); the rail is
  hidden entirely below `lg` and its per-surface section content folds into
  the editor surface (must remain reachable there — gated at 768 and 375).
  Over hamburger-drawer (extra tap, hides wayfinding) and the 48px icon
  strip (eats 13% of a 375px viewport). The drawer pattern is NOT used for
  nav; the OQ2 exception covers sheets for panels/preview only.
- **Compact chrome** (red-team #4): below `lg` the rail's utility cluster
  (theme toggle + logout) re-homes to a session cluster at the top of the
  Settings surface — reachable via the Settings tab; gated at 375. The
  login page (outside the shell) gets its own standalone mini-chrome:
  wordmark + theme toggle above the card at every width — it never inherits
  shell chrome and must not lose these when the header dies.
- **Letter editing re-homed** (OQ5, human 2026-07-11): paragraph draft
  editing moves into the Cover-letter section of the wide editor pane,
  joining Regenerate/Undo; the preview pane becomes view-only for letters
  exactly as it is for resumes. Over fix-in-place — the preview rail can't
  host an editor and its subject at once (F501). The v2 behavioral
  contracts (paragraph edit round-trip, undo, blank-letter, part-edit)
  migrate to the new home unchanged.
- **Icons: lucide-react** (already a dependency). Global nav gets icon+label
  rows (suggested: `Files` / `BookOpen` / `Settings2` — exact glyphs are
  builder's choice within lucide, sized 16px, consistent stroke).
- **Collapsible rail** (human-requested): expanded 224px ↔ collapsed
  icon-only 40–64px (builder picks within the band — red-team #22); toggle
  lives in the rail (bottom cluster); state in `localStorage` (standing
  view-state-only policy). Collapsed mode shows icon-only global nav with
  tooltips; per-surface section nav hides when collapsed.
- **Rail zoning**: global nav zone (icon+label) / surface-context zone /
  section zone under a mono-caps micro-label (e.g. "SECTIONS" — same style as
  the editor kickers). The "← Applications" back-link row is DELETED — the
  active global-nav item is the up-level affordance (F204).
- **One title convention**: surface titles live in the editor pane header on
  every surface; the rail never repeats the active surface's name (F205).
- **Scroll-spy — active-section rule pinned** (F202; red-team #5): active =
  the LAST section whose top edge has crossed a line 30% down from the
  viewport top; when the editor is scrolled to bottom, the final section is
  active regardless (the short-last-section escape). Exactly one section
  carries `aria-current="true"` + the same accent-pill treatment as the
  global nav — one visual language for "current". Surfaces with <2 sections
  render no section zone (no vacuous spy). Whole section row navigates;
  collapse moves to the editor's section headers only (F209).
- **Scroll restoration**: `editor-pane` scrollTop stored per `location.key`,
  restored on POP (F203).
- **Route-level focus management**: on pathname change, focus the editor
  pane's h1 (`tabindex="-1"`); inner `<main>` demoted to a `div`/`region` so
  exactly one main landmark exists; heading levels made sequential (F208).
- **Feedback layer**: mount sonner's `<Toaster>` once in `App`; success
  toasts on create/duplicate/delete/save/import/export; mutation FAILURES get
  inline errors beside their trigger (the existing `flagVoice` pattern), not
  toasts — errors must be co-located, successes may be transient. Tailor
  failure (F105) surfaces inline next to the Tailor button + invalidates on
  settled.
- **Busy pattern**: shared disabled + label-swap ("Preparing…") for exports
  and other non-instant mutations; double-fire guarded by the pending flag
  (F402). No global spinner framework.
- **Motion language**: the panels adopt `ui/dialog.tsx`'s existing
  `animate-in fade zoom`; section collapse animates via grid-rows; every
  structural animation has a duration in **[100ms, 300ms]** (pinned band,
  red-team #22) and a `motion-reduce:` variant (F403). Selects get
  `hover:bg-muted transition-colors` (F404).
- **Token-level fixes** (F104/F109/F110): ring alpha plumbing fixed via an
  explicit `--ring-weak` token (or RGB-triple accent) so `ring-ring/25`
  semantics are expressible; `--success` darkened to ≥4.5:1 on its soft tint;
  weight-bar/rationale labels move to `--ink-soft`; `accent-color:
  var(--accent)` on `:root`; dark card hover adds `hover:border-border-strong`
  alongside the shadow.
- **Tablet arbitration** (F303): below `xl`, preview open ⇒ editor hidden
  (pane swap), never a coexisting sliver; the toggle-strip gutter is replaced
  by a slim tab affordance or an action-bar toggle.
- **Phone layout** (F301/F302, scope per intake decision): bottom tab bar
  for global nav (OQ3), rail hidden, detail stacks vertically; preview is a
  full-width sheet layer (sanctioned by OQ2's exception); NewApplication is
  the same inline panel (OQ7) rendered full-width below `sm`.
- **Touch targets — audited set enumerated** (F305; red-team #6): under
  375×812 + `(pointer: coarse)` emulation, ≥44px on the short axis for:
  bottom-tab-bar items; every control exercised in the four gated phone
  flows (create application, tailor-failure error affordance, entry edit via
  Library, letter view + preview sheet open/close); dashboard card actions;
  the detail action strip; panel submit/close controls. EXCLUDED: inline
  prose links, options inside open listboxes, per-paragraph icon actions
  inside dense editors (they'd distort the visual identity; they remain
  mouse-reachable and keyboard-operable). EntryEditor fields single-column
  below `sm`.
- **Test-count ratchet** (red-team #25): vitest and playwright per-project
  test counts recorded at intake are monotonically non-decreasing at every
  phase gate; any decrease requires an itemized change-order note before the
  gate can pass.
- **Preview width**: proportional with clamps at ≥`xl` (e.g.
  `minmax(384px, ~40%)`) so wide screens grow the artifact (F207/F306).
- **Card fixes** (F107/F406/F509): action row wraps (`flex-wrap`); stamp
  `whitespace-nowrap`; Download PDF hidden (not disabled) until a document
  exists; Delete de-emphasized to match siblings until hover; armed confirm
  disarms on Escape; focus ring uses the full card radius; duplicate scrolls
  the new card into view with a brief highlight.
- **Kicker dedup** (F503): mono kickers stay (they're the scroll-spy
  landmarks); duplicate in-card headings go.
- **Action strip** (F504): primary (Re-tailor) first; exports grouped right
  (Download PDF + Plain text as a split/grouped control); "Use as a voice
  source" labels disambiguated ("Use resume…", "Use letter…"); Lock final
  visually distinguished as consequential.
- **Accordion consistency** (F505; defaults pinned per red-team #8): all
  three sections default EXPANDED (current behavior); Design's INTERNAL
  control groups default collapsed — that is what retires the 5,400px
  scroll, never a collapsed-by-default section. Per-section collapse state
  is view-state (localStorage at most, standing policy). The inline template
  grid and the gallery popover consolidate to ONE presentation in the Design
  section — **sequence pinned (red-team #7): Phase 0 repositions the popover
  in-bounds (temporary), Phase 4 deletes it and RE-TARGETS the F102
  assertion onto the surviving presentation** ("exactly one template-choice
  presentation, fully within the editor pane") — re-homed, not deleted.
- **Settings** (F506): format monolith splits into grouped sub-cards sharing
  the one rail entry; the column centers.
- **Library** (F502): entry rows get an identity line ("Role · Company ·
  Period"); **per-row Edit button beside Delete** (OQ4, human 2026-07-11 —
  over row-click-to-edit and over keeping the dropdown; the
  dropdown+"Edit selected" pair is DELETED); Import/Export become outline
  buttons or an overflow menu; count anchors to the filter control.
- **Preview zoom: expand-in-place, ≥`xl` only** (OQ6, human 2026-07-11;
  scoped per red-team #18): a control temporarily grows the preview pane
  (editor shrinks but keeps ≥240px width) so the page renders ≥1.5× its
  normal in-pane width, still side-by-side; toggling restores. Below `xl`
  the control doesn't render (the pane-swap already gives the preview the
  full width). No overlay. Zoom state is EPHEMERAL — not persisted anywhere
  (not even localStorage); a fresh load is always un-zoomed. Over in-pane
  zoom+pan (fiddly) and over cutting.
- **NewApplication: inline panel in the page flow** (OQ7, human 2026-07-11):
  the form inserts above the card grid, pushing cards down — nothing floats,
  nothing covered; phone renders the same panel full-width. Over
  takeover-the-dashboard. The anchored popover dies.
- **Login first-run detection: public state endpoint** (OQ8, human
  2026-07-11): add `GET /api/auth/state` → `{ setup: boolean }` (no auth
  required, no secrets in the payload — a boolean only). This is v4's ONE
  named backend exception (recorded in Out of scope); the login form shows
  first-run microcopy iff `setup === false`. Over client-side inference
  (only knowable after first submit) and over dropping the copy (first-run
  users deserve the hint).
- **Panel craft** (F508): sticky panel header + pinned footer with scrolling
  body; X close icon; facts become auto-grow textareas; "Sort key" label
  reworded ("Sort date — newest first").
- **Empty states** (F405): letter preview empty state gets the same dashed
  card + CTA treatment as resume; CTA arrow no-wrap.
- **Login** (F108): error codes map to human copy; the first-run microcopy
  renders only when setup is actually pending (client asks the existing
  auth surface — if that requires a trivial "is a password set" read, that is
  a named fork, see OQ8); hidden username field added for password managers.
- **ATS view** (F101): `white-space: pre-wrap` + mono sizing landed in
  `app.css` under the currently-orphan class.
- **Baseline green, defined once** (inherited pattern): `bun run check` +
  `bun run build` + `bun run lint` + full `bunx vitest run` + playwright
  `chromium`, `auth`, `applications` non-concurrently; docker e2e at the
  final gate only. The v3 cohesion contracts stay green at every phase.
- **Test migration discipline** (inherited): behavioral guarantees invariant;
  assertions re-homed, never deleted; helpers layer (`test/e2e/helpers/`) is
  the only place selectors change.

## Out of scope

<!-- Tripwire list — ailoop halts if a build crosses it. -->

- **Phone-first authoring parity** — rejected at intake. Phone is
  review/tweak-usable; complex editors (layout, design axes) may remain
  desktop-shaped at 375 as long as they're reachable and don't break layout.
- **Visual identity changes** — palette hues, type families, radius base,
  shadow philosophy, or any new/unbounded design axis. (Token *value*
  corrections for contrast/plumbing are in scope; identity is not.)
- **Native app / PWA / offline** — none of it.
- **New backend features** — server stays untouched, with exactly ONE named
  exception: `GET /api/auth/state` → `{ setup: boolean }` (OQ8, human-
  sanctioned; public, boolean-only, no secrets). Anything beyond it is a
  tripwire.
- **Tracker features** — standing.
- **Document-rendering engine changes** — react-pdf engine, `format-v2`,
  fit ladder, extraction invariants untouched. Preview *chrome* (zoom, frame,
  loading treatment) is in scope; the rendered document is not.
- **Re-litigating v3 decisions** — three-pane, de-modal, hybrid editing,
  section-rail model are settled; v4 refines their execution.
- **New third-party UI dependencies** beyond what's installed (lucide,
  sonner, radix primitives already present).

## Phases (de-risk order)

<!-- Riskiest first, with one human-flagged exception to confirm at lock:
     Phase 0 is the bug-fix pass — mechanically low-risk but it corrects the
     measuring instruments (focus tokens, z-order, contrast) that every later
     phase's gates look at, and several fixes live in files later phases
     rewrite (fix-then-rewrite is deliberate: each fix lands with a test that
     survives the rewrite). -->

### Phase 0 — Broken things (F1xx)

**Why first:** every item is user-visible brokenness with no design decision
attached; several correct the primitives later gates measure with (focus
ring, z-order, contrast); all are testable now against the existing suite.

**Deliverable:** F101–F110 fixed. Two of them are staged deliberately:
F103 lands CHROME-AGNOSTIC and re-gates in Phase 1 (red-team #1); F102's
Phase-0 fix is a temporary reposition that Phase 4 re-targets (red-team #7,
see Locked decisions).

**Done means (executable, sketch — ailoop mechanizes):**
- F101: ATS text wraps — scrollWidth ≤ clientWidth on the ATS container with
  the seeded fixture; contrast: a 500-char unbroken token still wraps.
- F102: gallery fully within the editor pane (boundingBox ⊆ pane box) at
  1280×720.
- F103 (chrome-agnostic): with any docked panel open, its title AND close
  control are fully within the viewport and hit-testable via
  elementFromPoint (no other element wins the point) — no reference to the
  header, so the assertion survives Phase 1's chrome merge, where it
  RE-RUNS unchanged as part of that gate.
- F104: focused input/textarea/select ring computes to the resolved
  `--ring-weak`/accent value with alpha > 0 AND ring width > 0 in BOTH
  themes (not merely "not Tailwind blue" — a missing ring must fail;
  red-team #20).
- F105: tailor over an unmatched JD (fixture engine 422) renders a visible
  inline error near the Tailor button without navigation; badge reflects
  failure on the same screen.
- F106: entry delete is two-step (first activation arms, second deletes;
  blur/Escape disarms); server round-trip asserted.
- F107: at 768 and 1024 no card action extends outside its card's box; stamp
  renders on one line.
- F108: wrong password ⇒ human copy (no `_` code pattern on screen);
  first-run microcopy contrast via `GET /api/auth/state` (OQ8): with
  `setup:false` the hint renders, with `setup:true` it does not (drive both
  states — the auth playwright project boots a fresh DB, the applications
  project reuses one); hidden username field present; the new endpoint
  answers WITHOUT a session and leaks nothing but the boolean.
- F109/F110: computed contrast of the named pairs ≥4.5:1 in both themes;
  checkbox accent-color is the token accent; dark card hover border computes
  to the resolved `--border-strong` and differs from the rest-state border
  (red-team #21).
- Baseline green.

### Phase 1 — Shell final form (F2xx; riskiest product phase)

**Why first among product phases:** the chrome/rail restructure (OQ1 + icon
rail + zoning + collapse) touches every surface and every e2e that drives
navigation; mobile (Phase 2) reshapes THIS shell, so it must exist first. If
the v3 persistence/modality contracts can't stay green through the
restructure, that's the campaign's core risk — retire it immediately.

**Deliverable:** icon+label zoned rail, collapsible (localStorage), scroll-spy
section nav with active states, scroll restoration, route focus management,
single main landmark, title convention unified, back-link removed, chrome per
OQ1's answer.

**Done means (executable, sketch):**
- **Chrome merge is asserted, not assumed** (red-team #3): no header bar
  element in the DOM on any shell surface; the wordmark renders inside the
  rail; the rail's theme toggle is OPERABLE (activation flips the root
  theme class and a sampled computed background actually changes); the
  rail's logout is OPERABLE (activation lands on the login screen). The
  login page renders its standalone wordmark + theme toggle (Locked:
  compact chrome — red-team #4).
- **Rail is designed, not just wired** (F201/F204/F205; red-team #9): each
  global nav item contains an `svg` icon; hover state computes to the
  designated token and differs from rest (both asserted — imperceptible
  hover was the original finding); the mono-caps section-zone label renders
  on surfaces with a section group; the string "← Applications" appears
  nowhere on detail; on all four surfaces the editor pane's h1 is the
  surface title and the rail contains no duplicate of that title.
- Collapse toggle: rail width transitions between expanded and the 40–64px
  icon band; icon-only mode shows all three global items operable
  (activation navigates); state survives reload (localStorage) but never a
  server write (network-zero on toggle — v3 pattern).
- Scroll-spy contrast (rule per Locked decisions; red-team #5): on detail
  (seeded fixture, 3 sections, precondition `scrollHeight > clientHeight +
  500` asserted) scroll so section S dominates ⇒ S's rail item (and only
  S's) carries `aria-current`; scroll to bottom ⇒ the FINAL section's item
  is active (the short-last-section arm); the marker provably moved.
- Scroll restoration contrast: scroll editor to Y ≥ 1000 (same seeded
  fixture guarantees the scroll room), navigate away, browser back ⇒
  scrollTop within ±24px of Y; forward-nav to a fresh route ⇒ top.
- Focus: after rail navigation, `document.activeElement` is the new surface's
  h1; exactly one `<main>` in the landmark dump; heading levels sequential
  per surface.
- v3 cohesion contracts re-run green on the new tree (same-DOM-node
  persistence, modality sweep, co-visibility) — **plus one docker e2e run at
  this gate** (red-team #16): the chrome merge is the change most likely to
  break the docker smoke, so it verifies here, not four phases later.
- Baseline green; helpers updated, assertions re-homed not deleted.

### Phase 2 — Responsive: tablet solid, phone usable (F3xx)

**Deliverable:** pane arbitration below `xl` (swap, never sliver), bottom
tab bar below `lg` with the rail hidden (OQ3), phone-stacked detail,
NewApplication as the inline panel (OQ7 — desktop AND its full-width
below-`sm` rendering land together here), 44px coarse-pointer targets
(audited set per Locked decisions), proportional preview width.

**Done means (executable, sketch):**
- At 768×1024 with preview open: editor pane is NOT rendered/visible (swap
  asserted), preview canvas ≥60% viewport width, paints non-uniform pixels;
  toggle returns the editor. Section navigation is reachable in the editor
  surface at 768 (the rail is gone below `lg` — red-team #24).
- At 375×812 AND 768×1024 on all four surfaces: global nav is the fixed
  bottom tab bar — three items, icon + label, each ≥44px, activation
  navigates (red-team #2: the drawer pattern must NOT appear); the bar
  covers no interactive content (content area's bottom padding clears it).
- At 375×812 on all four surfaces: `document.documentElement.scrollWidth ===
  375` AND no descendant outside the whitelisted intentional scroll
  containers has `scrollWidth > clientWidth + 1` (red-team #13 — the inner
  clip wrapper cheat); every audited flow (create, tailor-fail error, entry
  edit, letter view + preview sheet) completes with no control rendered
  off-viewport or losing elementFromPoint.
- At 375, the theme toggle and logout are reachable and operable via the
  Settings surface (Locked: compact chrome — red-team #4).
- NewApplication (desktop arm, red-team #11): at 1280, opening the form
  displaces the first card row downward (boundingBox y-delta > 0) and
  covers no card (elementFromPoint on card corners); no floating/anchored
  variant exists in the DOM; below `sm` the same panel renders full-width.
- Coarse-pointer emulation (375×812 + `pointer: coarse`): every control in
  the enumerated audited set measures ≥44px on its short axis.
- ≥1280: v3 co-visibility contracts green (regression guard). Proportional
  preview asserted (red-team #10): at 1512×900 the preview pane is WIDER
  than 384px and within its clamp; at 1280 it is ≥384px.
- Horizontal-overflow + modality spot-sweep at the regime edges: 1023 and
  1024 behave as their respective regimes (bottom bar at 1023, rail at
  1024 — red-team #12).
- Baseline green.

### Phase 3 — Feedback & motion layer (F4xx)

**Deliverable:** Toaster mounted; success toasts on the named mutations;
inline failure surfacing (tailor already done in Phase 0 — extend the pattern
to duplicate/delete/download); busy label-swap on exports; panel/section
motion per the locked language; `motion-reduce` variants; select hover; empty
letter state; the F406 detail set.

**Done means (executable, sketch):**
- Toast coverage is ENUMERATED, not sampled (red-team #15): every named
  success mutation — create, duplicate, delete, profile save, entry save,
  layout save, import, export — fires exactly one toast that auto-dismisses
  (all fixture-drivable). Failure contrast on ≥2 of them (fixture 422 /
  invalid import): NO success toast; an inline error renders near the
  trigger instead.
- Export busy: during a slowed PDF render (CDP throttle or a test hook),
  the control is disabled with swapped label; double-activation produces ONE
  download event.
- Motion: on the animated set (panels, section collapse), computed
  animation/transition duration ∈ [100ms, 300ms] (a 1ms token-pop fails —
  red-team #22); with `prefers-reduced-motion: reduce` emulated, computed
  animation IS none.
- Letter empty state: structural parity with the resume empty card
  (dashed card + CTA present).
- Baseline green.

### Phase 4 — Surface craft (F5xx)

**Deliverable:** letter editing re-homed (per OQ5), library editing pattern
(per OQ4) + identity lines + toolbar, kicker dedup, action-strip regroup,
accordion consistency + gallery consolidation, settings split + centering,
preview zoom (per OQ6/OQ2), panel craft set, metadata typography
unification.

**Done means (executable, sketch):**
- Letter editing (pinned per red-team #17): at 1280×720, while a paragraph
  textarea HAS FOCUS, ≥50% of the letter page canvas's bounding box is
  within the viewport (the F501 kill-shot — partial-sliver passes are the
  original failure mode); paragraph edit round-trips to the rendered letter
  (pixel-diff + plain-text sentinel, v3 pattern); v2 contracts (undo,
  blank-letter, part-edit) green in the new home.
- Library: per-row Edit opens the entry's editor in ONE activation with that
  entry's data loaded (contrast: two different rows load different data);
  the dropdown+"Edit selected" pair is gone from the DOM; identity line
  asserts company/role/period rendered per row; delete stays two-step.
- Detail sections: all three sections collapsible, DEFAULT EXPANDED (Locked;
  red-team #8); collapse is view-state (network-zero, preview
  pixel-identical — v3 H2 pattern); exactly ONE template-choice presentation
  exists on the surface, fully within the editor pane (the re-targeted F102
  assertion — red-team #7); Phase-1 scroll-spy/restoration tests re-run
  green with their scroll-room precondition still satisfied on the
  default-expanded surface.
- Settings: no card exceeds 1,200px rendered height (hard bound — red-team
  #22); every section still round-trips (v3 Phase-4 enumeration re-run).
- Zoom (expand-in-place, ≥`xl` only per Locked): at 1280, activating the
  control renders the page canvas ≥1.5× its prior width while the editor
  pane remains visible at ≥240px width and zero modality appears; toggling
  restores the prior widths; state is ephemeral (fresh load ⇒ normal
  widths); below `xl` the control is absent.
- Craft set has teeth (red-team #19): no detail card heading duplicates its
  kicker text (case-insensitive compare); "Use resume as a voice source"
  and "Use letter as a voice source" both present and distinct; the action
  strip's FIRST control is the primary (Re-tailor); every docked panel's
  close control has accessible name "Close" (an X, not a chevron); panel
  header boundingBox is stable while the panel body scrolls (sticky
  header); the literal string "Sort key (YYYYMM" appears nowhere.
- Baseline green.

### Phase 5 — Cohesion re-sweep + final gate

**Deliverable:** the v3 cohesion suite extended with v4's new invariants
(rail collapse, scroll-spy, scroll restoration, sheet modality below `lg`,
bottom-bar/toast non-modality per the pinned taxonomy), run app-wide on the
final tree.

**Done means (executable):** full playwright (3 projects, non-concurrent) +
`bun run test:docker` green; app-wide modality sweep green under the pinned
taxonomy at 375, 768, 1024, AND 1280 (sheets sanctioned below `lg` only;
zero modality at ≥1024; bottom bar and toasts classified as non-modal
chrome — red-team #14/#23); no horizontal overflow on any surface at
375/768/1023/1024/1280/1512; scroll restoration re-verified on the final
tree (red-team #8); test-count ratchet satisfied campaign-wide.

## Environment & preconditions

- Existing toolchain only (bun + tsx + vitest + playwright + docker). No API
  key (keyless fixture suite covers all flows the gates drive).
- Playwright projects non-concurrent; `bun run build` before the
  `applications` project (stale-dist failure mode).
- The uncommitted 2026-07-11 NavTabs vertical fix + this spec's CLAUDE.md
  promotions must be committed before intake (ailoop verifies a clean tree).

## Open questions

<!-- Riskiest phase deepest. Two exits only: answered by the human, or the
     feature cut. A default never resolves one of these. -->

_None — all forks answered 2026-07-11 (OQ1–OQ8 → Locked decisions)._

## Change orders

<!-- Post-lock only. -->
