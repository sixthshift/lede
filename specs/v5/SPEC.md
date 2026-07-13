---
status: locked           # locked 2026-07-12 — human go-ahead after red-team (12 findings folded) + de-risk order confirmed
spec_version: 1          # bumped by change orders after lock
---

# Lede v5 — Rail chrome polish

v4 gave the rail's *primary navigation* (`NavTabs`) a designed icon-rail
treatment — consistent 16px icons, hover wash, collapse-aware (icon-only band +
tooltips). But the rail's *other* chrome never got the same pass: the wordmark,
the theme toggle, the logout button, and the collapse toggle. The result reads
as unfinished exactly where v4 declared the shell "final": the bottom cluster
looks mismatched, the collapse button looks stranded, and when the rail
collapses to its icon band the wordmark and bottom cluster clip because they're
not collapse-aware. This campaign extends v4's icon-rail language to the whole
rail so the shell reads as one designed surface at every width.

Origin: human directive 2026-07-12 — *"the logout and the theme dark toggle
looks weird, as well as the collapse button below, and as well when the side
nav is collapsed, it looks bad too."*

## Standing constraints (cited, not restated)

These are permanent policy in the repo's durable docs — v5 inherits, never
re-decides them. See `/workspace/CLAUDE.md` "Standing policies" + "Design
system" and `specs/v4/spec.md` (archive, record only):

- **Visual identity frozen.** Palette, IBM Plex families, 8px radius, shadow
  philosophy, single blue accent (`#2643bd`). `src/client/styles/tokens.css` is
  the single source of color/radius/shadow truth. v5 MAY correct token *values*
  a finding demands, never the identity, never a new/unbounded design axis.
- **No new UI dependency.** Stack unchanged, client-only. `lucide-react`,
  `sonner`, radix primitives already present; anything else is a fork.
- **De-modal, forever** (v3; v4 viewport-scoped exception). Nothing here
  introduces modality.
- **Rail collapse is view-state only** (v3/v4) — localStorage at most, never a
  `settings.layout`/`sectionDisplay` write, no network on toggle.
- **Keyless by default** — build, boot, full suite need no API key (fixtures).

## Already exists (read from reality — `src/client/`, not the v4 archive)

- `App.tsx` — assembles the rail: `RailWordmark` (top), `NavTabs` (below it),
  a flex-1 portal target, `RailBottomCluster` (bottom). The rail itself is
  handed to `WorkspaceShell` which owns the collapse state + the collapse
  toggle in a bordered footer below the rail content.
- `RailWordmark` (App.tsx:19) — `L` box + serif "Lede" text. **Not
  collapse-aware.**
- `RailBottomCluster` (App.tsx:36) — `flex justify-between`: `<ThemeToggle/>`
  and a ghost `Log out` button (`LogOut` icon + "Log out" text). **Not
  collapse-aware.** Both icons lack a size class → render at lucide's default
  24px while every other rail icon is 16px.
- `ThemeToggle` (ThemeToggle.tsx) — ghost `sm` button, bare Moon/Sun icon (no
  label text, no size class). Flips `dark` on `<html>`, persists to
  localStorage.
- `NavTabs` (NavTabs.tsx) — the v4 reference treatment: 16px icons, gap-2.5,
  `--ring-weak` hover wash, active = `bg-accent`. Collapse-aware via
  `useRailCollapsed()`: icon-only (`w-9 justify-center`) + tooltip when
  collapsed.
- `WorkspaceShell` (WorkspaceShell.tsx:326) — the collapse toggle: a `w-full`
  ghost button in a `border-t p-1.5` footer, `PanelLeftClose`/`PanelLeftOpen`
  16px icon, `aria-pressed`, `data-testid="rail-collapse-toggle"`. Rail is
  `w-56` expanded, `w-12` collapsed. `useRailCollapsed()` context is the
  collapse-aware signal any rail content reads.
- Below `lg` (1024px) the rail is replaced by `BottomTabBar` — a separate
  regime, out of scope here (v5 is the desktop rail only unless OQ says
  otherwise).

## Findings (2026-07-12)

- **P1 — bottom cluster mismatched (expanded).** `justify-between` pushes a bare
  theme icon and an icon+text logout button to opposite ends; oversized 24px
  icons; reads as two unrelated controls, not a designed cluster.
- **P2 — collapse toggle stranded.** Full-width ghost button across the rail
  footer looks like empty dead space, not an affordance.
- **P3 — wordmark not collapse-aware.** "Lede" serif text + box clip in the
  48px icon band.
- **P4 — bottom cluster not collapse-aware.** Theme + "Log out" laid out
  horizontally with text clip in the 48px band.

### Audit sweep (2026-07-12, OQ4 "widen")

Mechanical = derivable from locked decisions, defaulted (no fork). Fork = taste.

- **P5 — hover fill = active-nav fill (mechanical).** Ghost `Button`'s hover is
  `bg-accent` (`ui/button.tsx:17`) — the SAME swatch NavTabs uses for the
  *active* tab (`NavTabs.tsx:45`). So hovering theme/logout/collapse reads as
  "selected." NavTabs' own hover is a different language (`--ring-weak` wash).
  → Default: rail footer controls adopt the `--ring-weak` hover, applied
  rail-locally (never mutate the global ghost variant — identity-frozen).
- **P6 — wordmark has no hover feedback (FORK).** `RailWordmark` is an
  interactive `<Link>` (App.tsx:22) with only a focus ring, no hover — the one
  clickable rail element with zero hover affordance. See OQ5.
- **P7 — focus-ring geometry inconsistent (mechanical).** Wordmark + NavTabs use
  `ring-2` with no offset; `Button` adds `ring-offset-2`. → Default: one ring
  footprint across all rail controls.
- **P8 — doubled footer divider + mismatched padding (mechanical).** The footer
  cluster (`border-t p-2`, App.tsx:160) stacks above the collapse toggle's own
  `border-t p-1.5` block (WorkspaceShell:326) → two borders, 8px vs 6px. OQ3
  already removes the toggle from the footer; → Default: single divider, unified
  `p-2` rhythm matching the wordmark/nav sections.
- **P9 — collapsed nav overflows 48px (mechanical).** `w-9` link (36px) inside
  `p-2` nav section (16px) = 52px in the 48px band (NavTabs:43 / App.tsx:156).
  → Default: collapsed-mode nav-section padding shrinks so icons center in the
  band and optically align with the footer icons.
- **P10 — collapsed footer controls have no tooltip (mechanical, given OQ1).**
  OQ1 makes theme/logout icon-only when collapsed; they currently carry only
  `aria-label`, and the collapse toggle uses a bare native `title` vs NavTabs'
  Radix tooltip. → Default: route all collapsed rail controls through the SAME
  Radix tooltip primitive NavTabs uses.
- **P11 — collapse toggle `aria-pressed` not visually distinct (mechanical).**
  Announced to AT but classes identical both states; only the icon glyph swaps
  (WorkspaceShell:331/338). → Default: the glyph swap (open↔close panel icon) IS
  the visual distinction — sufficient for a ghost control; no bg change.
- **P12 — collapse animates width, content pops (FORK).** The `<aside>` animates
  `transition-[width] 200ms` but labels are hard `{collapsed ? null : …}`
  renders — text snaps while the frame slides. See OQ6.

## Locked decisions

- **Extend v4's icon-rail language; don't invent a new one.** The rail chrome
  (wordmark, theme, logout, collapse) adopts the same 16px-icon / consistent-
  spacing / collapse-aware pattern `NavTabs` already uses. `NavTabs.tsx` is the
  reference.
- **Icon size fix is a bare default.** Theme + logout icons become 16px
  (`h-4 w-4`) to match every other rail icon. No fork — it's a consistency bug.
- **No new destinations, no new controls.** v5 restyles the four existing
  chrome elements; it does not add rail items, menus, or settings.
- **No collapse-behavior change.** `w-56`/`w-12`, localStorage persistence, the
  `useRailCollapsed()` contract all stay; v5 only makes the un-adapted chrome
  respond to the signal that already exists.

### Resolved layout (OQ1–OQ3, 2026-07-12)

- **Collapsed rail (48px) = icon-only stack** (OQ1). Wordmark → "L" box only;
  theme + logout → centered 16px icon buttons with hover/focus tooltips, same
  pattern `NavTabs` uses collapsed. Everything stays reachable in the band.
- **Expanded rail (224px) footer = two matching labeled rows** (OQ2). Theme and
  logout each a full-width labeled row ("Dark mode" / "Log out"), evenly sized,
  stacked, grouped as a pair — over the old `justify-between` mismatched cluster
  (asymmetry + 24px icons were the defect).
- **Collapse toggle moves to the rail top, beside the wordmark** (OQ3) —
  footer freed of it. **Default (reconciling OQ3 with the 48px band):** when
  collapsed, the toggle sits directly *below* the "L" box in the top zone (same
  icon rhythm), since "beside" can't fit 48px. Overridable.
- **Icon size = 16px** everywhere in the rail (bare default — the 24px theme +
  logout icons were a consistency bug).
- **Wordmark is a quiet logo** (OQ5/P6) — clickable, but deliberately no hover
  state; over "real nav target" — it's an identity mark, the nav below carries
  wayfinding, and a hover there would compete with the Applications link
  directly beneath it. "No hover" is now intentional, not an oversight.
- **Collapse fades labels with the slide** (OQ6/P12) — labels ease in/out
  (opacity) coordinated with the existing 200ms width transition; under
  `prefers-reduced-motion: reduce` the swap is instant (no fade), matching the
  rail's existing `motion-reduce:transition-none`.

## Out of scope

- The header bar (dissolved in v4 — not revived).
- `BottomTabBar` / below-`lg` regime (unless OQ4 pulls it in).
- New theme options beyond light/dark; theming settings UI.
- Any `settings`/server write from the rail.
- New nav destinations or an overflow/account menu (unless an OQ elects one).

## Phases (de-risk order)

De-risk order: the collapsed-rail **clipping/overflow is the only actual
breakage** (P3/P4/P9) — structural, so it builds and gates first. The
single-language cleanup (P1/P2/P5/P7/P8/P10/P11) is consistency work on top of a
now-correct layout. Motion (P12) is the cosmetic tail. Each phase's checks run
in the `applications` Playwright project (where `design.spec.ts` lives) at
desktop width (≥1024, the rail regime); `bun run build` before the suite (stale
`dist/` caveat). Test IDs already exist: `rail-pane` (with `data-collapsed`),
`rail-collapse-toggle`; the theme/logout buttons are addressable by their
`aria-label`.

### Phase 0 — Collapsed-rail correctness (P3, P4, P9)

**Why first:** clipping/overflow is real breakage, not polish — everything else
assumes a rail that fits its own 48px band.

**Deliverable:** wordmark, theme, logout all consume `useRailCollapsed()` and go
icon-only when collapsed; collapsed nav padding fixed so nothing overflows 48px.

**Done means (executable):**
- At ≥1024px, collapse the rail (`data-collapsed="true"`): `rail-pane`
  `clientWidth === 48`, and **no descendant** of `rail-pane` has
  `scrollWidth > clientWidth` (not just the top-level pane — RT#2). Overflow may
  not be masked with `overflow:hidden` on an inner wrapper; the collapsed rail
  is additionally screenshot-diffed against a committed baseline.
- Wordmark contrast (RT#1): collapsed → the serif "Lede" text node is ABSENT
  **AND** the "L" box element is present and visibly rendered (non-zero bounding
  box); expanded → "Lede" text present. Cheat closed: `display:none`-ing the
  whole wordmark fails the "L present" half.
- Theme + logout contrast: expanded → visible text ("Dark mode"/"Light mode",
  "Log out") present; collapsed → text ABSENT, both buttons still queryable by
  `aria-label` and operable (click fires).
- Centering (RT#3, gates P9): each collapsed rail icon's horizontal center is
  within a small tolerance of `rail-pane`'s center x (≈24px), and the nav icons
  and the footer (theme/logout) icons share that same center x — proves
  "optically aligned," not merely "not overflowing."

### Phase 1 — One rail language (P1, P2, P5, P7, P8, P10, P11)

**Deliverable:** footer = two matching labeled rows (theme / "Log out"), 16px
icons throughout; footer controls use the `--ring-weak` hover (not
`bg-accent`); one focus-ring footprint; a single footer divider on unified `p-2`
rhythm; collapse toggle relocated to the rail top beside the wordmark;
collapsed footer controls carry Radix tooltips.

**Done means (executable):**
- Icon size: every `<svg>` rendered inside `rail-pane` has `width === 16`
  (no 24px). Contrast: pre-change theme/logout svgs are 24 → must become 16.
- Footer layout (RT#4): expanded, theme + logout are two rows that (a) share the
  same left edge x, (b) have equal width ≈ the rail's content width (full-width,
  not short), (c) have equal height, and (d) are vertically adjacent — gap
  between them < one row height. This proves a "grouped pair," excluding both
  `justify-between` (horizontal) and `flex-col justify-between` (rows pushed to
  opposite vertical ends).
- Hover language (RT#8): pin the mechanism to `background-color` — NavTabs' hover
  IS `hover:bg-[var(--ring-weak)]` (a background), so footer controls match the
  SAME property. Hovering a footer control, computed `background-color` equals
  the `--ring-weak` resolved color, NOT `--accent-bg` (the active-nav swatch).
  Contrast: active nav link stays `--accent-bg`; hovered footer control ≠ it.
- Collapse toggle placement (RT#5, RT#6): visual, not DOM-order — the toggle's
  bounding-box top is above the primary nav's top; its width ≤ an icon-button
  size (≤40px), not merely < rail width; **expanded** → the toggle shares the
  wordmark's row (y-overlap with the wordmark box); **collapsed** → the toggle
  is centered directly below the "L" box.
- Focus ring (RT#9, gates P7): focusing each rail control in turn (wordmark,
  each nav link, theme, logout, collapse toggle) yields an identical ring width
  AND offset — no control mixes `ring-offset-2` with a no-offset sibling.
- Divider + rhythm (RT#10, gates P8): exactly one `border-t` between the nav
  section and the footer, and the footer section's padding === the wordmark/nav
  sections' padding (`p-2`).
- Wordmark quiet-logo (RT#11, gates P6/OQ5): the wordmark `<Link>`'s computed
  `background-color` (and text color) are identical hovered vs. not — no hover
  wash. Defends the "deliberately no hover" decision against silent drift.
- Collapse-toggle glyph (RT#12, gates P11): the toggle's icon glyph swaps
  between collapsed/expanded (`PanelLeftOpen` ↔ `PanelLeftClose`) while its
  `background-color` does not change between the two states.
- Tooltips: with the rail collapsed, focusing the theme, logout, and collapse
  controls each surfaces a `role="tooltip"` with the control's name (same Radix
  primitive NavTabs uses; native `title` alone does not satisfy this).

### Phase 2 — Collapse motion (P12)

**Deliverable:** labels fade in/out coordinated with the 200ms width slide;
instant under reduced motion.

**Done means (executable):**
- RT#7 — assert the opacity actually CHANGES, not just that a transition is
  declared. Under `prefers-reduced-motion: no-preference`: a rail label's
  computed opacity is ≈0 when collapsed and ≈1 when expanded, animating over
  ~200ms (mid-transition sample is strictly between 0 and 1). Cheat closed: a
  `transition: opacity 1ms` on an always-opacity-1 label fails the 0↔1 delta.
- Under `prefers-reduced-motion: reduce`: the same 0↔1 change is instantaneous
  (no mid-transition intermediate). (Playwright emulates both media states.)

## Environment & preconditions

- None beyond the standing keyless dev/test setup (`bun install`, Playwright
  projects). No API key, no external service.

## Open questions

*(empty — OQ1–OQ6 resolved 2026-07-12: OQ1 icon-only stack, OQ2 two labeled
rows, OQ3 toggle beside wordmark, OQ4 widen→audit folded in as P5–P12, OQ5
quiet logo, OQ6 fade-with-slide. Audit's mechanical findings defaulted.)*

## Change orders

<!-- Post-lock only. -->
