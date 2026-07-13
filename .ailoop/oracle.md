# Oracle — Lede v5 (Rail chrome polish)

**Contract:** `SPEC.md` · spec_version 1 · sha256 `4b70505a8b611fca05d341ca3d0de343b72359e47a3050e4124f12af1283adb2`
<!-- Resume recomputes the hash and refuses to dispatch on a mismatch. -->
<!-- Prior campaigns v1–v4 archived under specs/. This is v5, a fresh spec. -->

The definition of done. Workers cite it; the coordinator gates against it.

## Environment adaptation (mechanical, intake — ledgered)

This project's `CLAUDE.md` **contraindicates ailoop's default worktree fan-out**:
"Agent worktrees are unreliable here: they branch stale and their in-worktree
builds hit font-path ENOENTs. Prefer single-agent-on-main for build tasks." It
also forbids running Playwright suites concurrently (each boots a webServer on
ports 8787–8789). Since v5 is also inherently serial (every ticket touches
`src/client/App.tsx`), fan-out yields nothing.

**Adaptation:** builders are dispatched **single-agent, serially, on the main
working tree** (no `isolation: 'worktree'`). Per ticket the coordinator:
1. captures `baseSha = git rev-parse HEAD` before dispatch;
2. the builder edits only its declared `files`, runs baseline + acceptance,
   reports;
3. the coordinator **independently re-verifies** on the same tree: re-runs
   baseline + acceptance, computes scope via `git diff --name-only HEAD` (working
   tree vs the pre-dispatch commit), reads the diff for gaming;
4. on accept, **commits** the ticket (the commit is the merge — mainline moves
   forward one ticket at a time); on reject, `git checkout -- .` / `git clean`
   the ticket's files and re-dispatch with the `attempts` log.
Interruption leaves uncommitted changes on main; resume reconciles via
`git status` (re-verify or discard). This replaces the branch/worktree
reconcile path in SKILL.md's Resume section for this project only.

## Locked decisions (never re-litigated — cite in every worker prompt)

From `SPEC.md` "Standing constraints" + "Locked decisions" and the repo's
`CLAUDE.md`:

- **Visual identity frozen.** Palette, IBM Plex families, 8px radius, shadow
  philosophy, single blue accent `#2643bd`. `src/client/styles/tokens.css` is
  the single source of color/radius/shadow truth. May correct a token *value* a
  finding demands; never the identity, never a new/unbounded design axis.
- **No new UI dependency.** Stack unchanged, client-only. `lucide-react`,
  `sonner`, radix primitives already present. Anything else is a fork → escalate.
- **De-modal, forever** (v3; v4 viewport exception). Nothing here adds modality.
- **Rail collapse is view-state only.** localStorage at most; never a
  `settings.layout`/`sectionDisplay` write, no network request on toggle. The
  existing `useRailCollapsed()` context is the collapse signal.
- **Extend v4's icon-rail language; don't invent one.** `NavTabs.tsx` is the
  reference (16px icons, `--ring-weak` hover wash, `bg-accent` active, collapsed
  = icon-only + Radix tooltip).
- **Keyless.** Build, boot, full suite need no API key (fixtures).

### Resolved layout (SPEC OQ1–OQ6 — the design contract)

- Collapsed rail (48px) = icon-only stack: wordmark → "L" box only; theme +
  logout → centered 16px icon buttons + hover/focus Radix tooltips.
- Expanded rail (224px) footer = two matching labeled rows ("Dark mode"/"Light
  mode", "Log out"), evenly sized, stacked, grouped (not `justify-between`).
- Collapse toggle → rail top, beside the wordmark; when collapsed, centered
  directly below the "L" box. Removed from the footer.
- Icon size = 16px everywhere in the rail.
- Wordmark = quiet logo: clickable, deliberately NO hover state.
- Collapse = labels fade (opacity) with the 200ms width slide; instant under
  `prefers-reduced-motion: reduce`.

## Scope tripwire (halt if crossed)

From `SPEC.md` "Out of scope":
- Reviving the header bar (dissolved in v4).
- `BottomTabBar` / the below-`lg` regime (v5 is the desktop rail only).
- New theme options beyond light/dark; any theming settings UI.
- Any `settings`/server write from the rail (collapse stays localStorage-only).
- New nav destinations or an account/overflow menu.
- Mutating `src/client/styles/tokens.css` identity, or the shared
  `components/ui/button.tsx` ghost variant globally (rail hover fixes are
  applied **rail-locally**, never by changing the app-wide variant).

## Baseline gate (every ticket, no exceptions)

Run by the builder (may scope the e2e step to affected specs) AND
authoritatively re-run **in full** by the coordinator:

- [ ] type-check: `bun run check` → exit 0
- [ ] build: `bun run build` → exit 0  *(required before e2e — stale `dist/`
      breaks design specs per CLAUDE.md)*
- [ ] lint: `bun run lint` → exit 0
- [ ] unit tests: `bunx vitest run` → all pass
- [ ] e2e regression (docker excluded — milestone-only per CLAUDE.md):
      `bunx playwright test --project=chromium --project=auth --project=applications`
      → all pass. **Never run concurrently with another suite.**
- [ ] new behavior ships with new tests (Playwright, `applications` project),
      green under the above.

Note: rail specs live in the **`applications`** project. Test files
`rail-collapse.spec.ts`, `rail-design.spec.ts`, `motion.spec.ts` are already in
that project's `testMatch` — append v5 assertions to them; **no
`playwright.config.ts` edit needed** (avoids a shared-file touch). Login helper:
`test/e2e/helpers/workspace.ts` (`login`, `createApplication`); the
`applications` server password is `"correct horse battery staple e2e
applications"` (must match `rail-design.spec.ts` exactly — single server secret).

## Per-phase acceptance (executable, on the merged/committed tree)

### Phase 0 — Collapsed-rail correctness (T001)
At ≥1024px, collapse the rail (`[data-testid="rail-pane"][data-collapsed="true"]`):
- [ ] The rail collapses to the icon band: **poll** `rail-pane` boundingBox width
      until the 200ms width transition settles, then assert it is in `[40,64]`
      (the established v4-T022 band; exact `clientWidth===48` was wrong in letter
      — border-box makes clientWidth≈47, and a single post-flip read races the
      CSS transition → **mechanical amendment 2026-07-13, ledger [0010]**). AFTER
      the width settles: **no descendant** has `scrollWidth > clientWidth`, and no
      descendant clips overflow (hidden/clip/scroll on either axis) to mask it.
- [ ] Wordmark: collapsed → serif "Lede" text ABSENT **and** the "L" box present
      + visible (non-zero box); expanded → "Lede" present.
- [ ] Theme + logout: collapsed → visible text absent, both still queryable by
      `aria-label` + operable (click fires); focusing each surfaces a
      `role="tooltip"` with its name (Radix, not native `title`).
- [ ] Each collapsed rail icon's horizontal center ≈ `rail-pane` center (≈24px);
      nav icons and footer icons share that center x.

### Phase 1 — One rail language (T002, T003)
- [ ] Every `<svg>` inside `rail-pane` has `width === 16` (no 24px).
- [ ] Expanded footer: theme + logout are two rows sharing a left edge x, equal
      width ≈ rail content width, equal height, vertically adjacent (gap < row
      height) — a grouped pair, not `justify-between` (horizontal) nor
      `flex-col justify-between` (split to opposite ends).
- [ ] Hover language: hovering a footer control, computed `background-color` ===
      the `--ring-weak` resolved color, ≠ `--accent-bg` (active-nav swatch);
      active nav link stays `--accent-bg`.
- [ ] Collapse toggle: bounding-box top above the primary nav's top; width ≤ an
      icon-button size (≤40px), not merely < rail width; expanded → shares the
      wordmark's row (y-overlap); collapsed → centered directly below the "L" box.
- [ ] Focus ring: each rail control (wordmark, each nav link, theme, logout,
      collapse toggle) yields identical ring width AND offset — no mixed
      `ring-offset`.
- [ ] Exactly one `border-t` between the nav section and the footer; footer
      padding === the wordmark/nav sections' padding (`p-2`).
- [ ] Wordmark `<Link>` computed `background-color` + text color identical
      hovered vs not (quiet logo — no hover wash).
- [ ] Collapse toggle glyph swaps between states (`PanelLeftOpen` ↔
      `PanelLeftClose`); its `background-color` unchanged between states.

### Phase 2 — Collapse motion (T004)
- [ ] `prefers-reduced-motion: no-preference`: a rail label's computed opacity is
      ≈0 collapsed and ≈1 expanded, mid-transition strictly between 0 and 1 over
      ~200ms (a `transition: opacity 1ms` on an always-opacity-1 label must FAIL).
- [ ] `prefers-reduced-motion: reduce`: the same 0↔1 change is instantaneous (no
      intermediate). Playwright emulates both media states.

## Coverage map (spec → delivery)

| Spec finding | One line | Delivered by |
|---|---|---|
| P1 | expanded cluster mismatched | T002 |
| P2 | collapse toggle stranded/full-width | T003 |
| P3 | wordmark not collapse-aware | T001 |
| P4 | bottom cluster not collapse-aware | T001 |
| P5 | hover fill = active-nav fill | T002 |
| P6/OQ5 | wordmark quiet logo (no hover) | T002 (asserted) |
| P7 | focus-ring geometry inconsistent | T003 |
| P8 | doubled footer divider + padding | T003 |
| P9 | collapsed nav overflows 48px | T001 |
| P10 | collapsed controls need Radix tooltips | T001 (theme/logout), T003 (toggle) |
| P11 | toggle aria-pressed glyph distinction | T003 |
| P12/OQ6 | collapse label motion | T004 |
| Icon size 16px | consistency fix | T002 |

## Caps

`backlog.json`: maxAttempts 3 · thrash 2 · chunk 20 dispatches/invocation.
