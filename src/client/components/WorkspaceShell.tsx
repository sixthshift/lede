// WorkspaceShell — foundational three-pane layout primitive (rail | editor |
// preview) for the workspace redesign. Pure layout: no routing, no
// data-fetching, no `useParams` — callers hand it slots via props, so it
// works embedded per-route today and hoisted to wrap the router Outlet
// later without changing shape.
//
// Responsive rule (superseded by v4-T033 below — kept for the historical
// "why not CSS-hidden" rationale, which still holds): at >=1280px
// (Tailwind's `xl`) editor and preview are co-visible; below that they used
// to share a single toggle/drawer regime. v4-T033 splits "below xl" into two
// genuinely different regimes (swap vs. full-width sheet) — see that block
// for the current shape. What's unchanged: every regime is expressed via
// conditional RENDERING, never the native `hidden` attribute or a `hidden`/
// `xl:block` display-utility pair — browsers apply `!important` to
// `[hidden]`, which no author stylesheet can beat, and CSS-hidden markup
// isn't provably ABSENT the way a querySelector needs it to be.
//
// v4-T022: the rail itself collapses (224px <-> a 40-64px icon band), a
// separate axis from the preview drawer above and driven by the same
// view-state-only policy (standing v3 rule: localStorage at most, never a
// server write — no settings.layout/sectionDisplay involved, no network
// request fires on toggle). WorkspaceShell owns this state — it already owns
// the rail's outer chrome and, per the preview toggle above, is the
// established place for shell-level affordances the caller's slot content
// doesn't provide itself — and exposes it via context so nested content
// (NavTabs, portaled in from wherever the caller assembled `rail`) can read
// it without a prop threaded through every intermediate layer. The
// per-surface section zone (a route's own portaled content, e.g.
// ApplicationDetail's "SECTIONS" nav) hides in collapsed mode too, but that
// content lives in a file this ticket doesn't own — it's addressed via its
// existing `aria-label="Sections"` contract rather than a second prop-
// drilling path.
//
// v4-T030 (F301): below `lg` (1024px) the rail regime and the bottom-tab-bar
// regime are mutually exclusive, and the acceptance oracle checks ABSENCE of
// whichever one isn't current via `querySelector === null` — a CSS-hidden
// node still answers a raw querySelector, so both the rail `<aside>` and the
// bottom bar are conditionally RENDERED on `useIsBelowLg()`, never toggled
// with a `lg:hidden`-style utility. That hook falls back to "not below lg"
// when `matchMedia` doesn't exist (jsdom/unit tests) — the desktop-shaped
// rail regime other tests already assert stays the default there.
//
// v4-T033 (F303/F306/F207): the editor/preview pair has THREE viewport
// regimes, not two — each with a genuinely different relationship between
// the panes, so each gets its own conditionally-RENDERED markup rather than
// one shared element reshaped with responsive display utilities (same
// "querySelector-provable absence" bar as the rail/bottom-bar split above):
//   - >=xl (1280): co-visible, no toggle. The preview's width is
//     PROPORTIONAL (a clamped viewport fraction), not a fixed 384px, so a
//     wide screen actually grows the artifact rather than wasting the extra
//     space on the editor alone.
//   - lg..xl (1024-1279): SWAP. A fixed w-96 preview co-existing with a
//     flex-1 editor at this width crushed the editor to a ~43px sliver
//     (pre-T033 regression) — so here the two panes are mutually exclusive:
//     opening the preview un-renders the editor and the preview takes the
//     full main-area width, never the reverse (a genuine pane swap, not an
//     overlay). A slim always-present toggle strip (>=44px square) survives
//     the swap in both directions since it never depends on which pane is
//     showing.
//   - <lg (below 1024): the SAME swap, but the preview becomes a FULL-WIDTH
//     sheet (OQ2's sanctioned below-`lg` exception to the de-modal ban:
//     dismissible + focus-managed, no `aria-modal`, no scrim — there's
//     nothing to scrim, the editor is genuinely gone underneath it). Opening
//     it needs an operable trigger since the swap-regime's toggle strip
//     doesn't fit this narrow a viewport; closing it (Escape or the visible
//     Close control) returns focus to whichever element opened it.
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { PanelRightClose, PanelRightOpen, X, ZoomIn, ZoomOut } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { BottomTabBar } from "./NavTabs";

const BELOW_LG_QUERY = "(max-width: 1023px)";
const BELOW_XL_QUERY = "(max-width: 1279px)";

function useMatchMedia(query: string): boolean {
  const getMatch = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false;
  const [matches, setMatches] = useState(getMatch);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const handleChange = () => setMatches(mql.matches);
    handleChange();
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return matches;
}

/** True below Tailwind's `lg` (1024px) — the compact-nav regime (F301). */
function useIsBelowLg(): boolean {
  return useMatchMedia(BELOW_LG_QUERY);
}

/** True below Tailwind's `xl` (1280px) — the pane-swap regime (F303/T033). */
function useIsBelowXl(): boolean {
  return useMatchMedia(BELOW_XL_QUERY);
}

// >=xl: clamped viewport-relative width so a wide screen actually grows the
// preview instead of leaving it pinned at a fixed pixel width — floored at
// the old fixed width (384px) so nothing narrower than before, ceilinged so
// it never eats the majority of the viewport.
const PREVIEW_PROPORTIONAL_WIDTH_CLASS = "w-[clamp(384px,30vw,640px)]";

// v4-T054 (F507): zoom widens the pane well past the required >=1.5x floor
// (1.6x at every width this scales through, before either side's own ceiling
// kicks in) — a real LAYOUT width, not a `transform: scale` (which would
// leave the editor's own flex-basis untouched and fail the "real reflow"
// oracle). The editor is `flex-1`, so it absorbs the difference automatically
// — no editor-side class needed here for it to shrink.
const PREVIEW_ZOOMED_WIDTH_CLASS = "w-[clamp(608px,48vw,960px)]";

// The bottom tab bar's own fixed height — the content panes' bottom padding
// below `lg` must clear exactly this so the bar (persistent chrome, not
// modality) never covers an interactive control.
const BOTTOM_BAR_HEIGHT_CLASS = "h-14";
const CONTENT_CLEARANCE_CLASS = "pb-14";

// T034 (F305): coarse-pointer tap-target floor, gated to `pointer: coarse`
// (Tailwind 3.4 has no built-in coarse variant; this is an arbitrary-variant
// media query) so mouse/desktop rendering is untouched. The sheet trigger
// and swap toggle below are already `h-11 w-11` (44px) unconditionally and
// don't need this.
const TAP_TARGET_COARSE =
  "[@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]";

// v4-T054 (F507): the >=xl co-visible preview's own zoom toggle + chrome,
// split into its own component purely so the zoom state is LOCAL to a
// subtree that unmounts whenever `preview` goes away (any route without a
// preview surface, e.g. navigating to Library) — that unmount is what makes
// "ephemeral, resets on navigate-away-and-back" fall out for free from plain
// `useState`, with no persistence and no routing awareness added to
// WorkspaceShell itself (this file stays route-agnostic; App.tsx already
// unmounts this pane on any non-document route by handing `preview` as
// `undefined`, per WorkspaceShellProps' existing contract).
function CoVisiblePreviewPane({ children }: { children: ReactNode }) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <aside
      data-testid="preview-pane"
      className={cn(
        zoomed ? PREVIEW_ZOOMED_WIDTH_CLASS : PREVIEW_PROPORTIONAL_WIDTH_CLASS,
        "flex shrink-0 flex-col border-l border-border bg-surface",
      )}
    >
      <div className="flex shrink-0 items-center justify-end border-b border-border p-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={zoomed}
          aria-label={zoomed ? "Zoom out" : "Zoom in"}
          title={zoomed ? "Zoom out" : "Zoom in"}
          data-testid="preview-zoom-toggle"
          className="text-muted-foreground"
          onClick={() => setZoomed((z) => !z)}
        >
          {zoomed ? (
            <ZoomOut aria-hidden className="h-4 w-4" />
          ) : (
            <ZoomIn aria-hidden className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}

export interface WorkspaceShellProps {
  rail: ReactNode;
  editor: ReactNode;
  preview?: ReactNode;
  // v4-T024: an escape hatch for the ONE hoisted caller (App.tsx) that needs
  // the editor pane's actual DOM node to sync scroll position + focus with
  // route changes (F203/F208) — still no routing awareness enters this file
  // itself, it just hands the node out.
  editorPaneRef?: (el: HTMLElement | null) => void;
}

const RAIL_COLLAPSE_STORAGE_KEY = "lede.workspace.railCollapsed";

function readRailCollapsed(): boolean {
  try {
    return window.localStorage.getItem(RAIL_COLLAPSE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

interface RailCollapseContextValue {
  collapsed: boolean;
  toggle: () => void;
}

const RailCollapseContext = createContext<RailCollapseContextValue>({
  collapsed: false,
  toggle: () => {},
});

/** Whether the rail is currently in its icon-only collapsed band. */
export function useRailCollapsed(): boolean {
  return useContext(RailCollapseContext).collapsed;
}

// v5-T003: the collapse TOGGLE action, exposed alongside the boolean above so
// the relocated toggle control (App.tsx's RailWordmark, beside the wordmark)
// can flip state from inside the rail's portaled content — same "no prop
// threaded through every intermediate layer" rationale the boolean already
// established.
export function useToggleRailCollapsed(): () => void {
  return useContext(RailCollapseContext).toggle;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
// Matches the rail `<aside>`'s own width-slide duration exactly — the whole
// point (spec OQ6) is the label fade running IN STEP with that transition,
// not on its own independent clock.
const LABEL_FADE_MS = 200;

/**
 * v5-T004: coordinates a rail label's opacity fade with the 200ms width
 * slide, for every label that used to hard mount/unmount on collapse (nav
 * labels, the wordmark text, the footer row labels). `faded` drives
 * `opacity-0`/`opacity-100` on a MOUNTED label; `hidden` tells the caller
 * when to stop rendering it (`{hidden ? null : <span>…</span>}`) — a plain
 * CSS `display:none` isn't enough here, because Playwright's text-matching
 * (`getByText`/`toHaveText`) walks descendant text nodes regardless of
 * `display`, so a `display:none`-but-still-mounted label would still count
 * as "present" to the very assertions (rail-collapse.spec.ts) this ticket's
 * baseline gate re-runs. The two are deliberately out of phase:
 *
 * - Collapsing: `faded` flips true immediately (fade starts with no delay);
 *   `hidden` only flips true LABEL_FADE_MS later. The label stays mounted
 *   and occupying width for that whole window — it's allowed to (this is
 *   what makes it visible mid-fade at all) — and only unmounts once the
 *   fade has actually finished, never via an overflow-clip (the one thing
 *   T001's own invariant test forbids).
 * - Expanding: `hidden` clears on the SAME tick collapse flips (so the
 *   label remounts immediately), but `faded` only clears one animation
 *   frame later. Flipping both together would give the browser no rendered
 *   "opacity:0" frame to transition FROM (a freshly mounted element has no
 *   prior painted frame) — the fade-in would just be skipped.
 * - Reduced motion: both flip together, instantly, on the same tick as
 *   `collapsed` — no fade, matching the aside's own
 *   `motion-reduce:transition-none`.
 *
 * `useLayoutEffect` (not `useEffect`) throughout so the "start the fade"/
 * "flip both instantly" edges land in the SAME paint as the `collapsed`
 * change, not one frame late.
 */
export function useRailLabelFade(collapsed: boolean): { faded: boolean; hidden: boolean } {
  const reducedMotion = useMatchMedia(REDUCED_MOTION_QUERY);
  const [hidden, setHidden] = useState(collapsed);
  const [faded, setFaded] = useState(collapsed);

  useLayoutEffect(() => {
    if (reducedMotion) {
      setHidden(collapsed);
      setFaded(collapsed);
      return;
    }

    if (collapsed) {
      setFaded(true);
      const timer = setTimeout(() => setHidden(true), LABEL_FADE_MS);
      return () => clearTimeout(timer);
    }

    setHidden(false);
    const raf = requestAnimationFrame(() => setFaded(false));
    return () => cancelAnimationFrame(raf);
  }, [collapsed, reducedMotion]);

  return { faded, hidden };
}

export function WorkspaceShell({ rail, editor, preview, editorPaneRef }: WorkspaceShellProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(readRailCollapsed);
  const isBelowLg = useIsBelowLg();
  const isBelowXl = useIsBelowXl();

  // v4-T033: the below-`lg` sheet's dismissal contract (Escape + a visible
  // Close control) must return focus to the trigger — but the trigger
  // UNMOUNTS when the sheet opens and a FRESH element mounts in its place
  // when the sheet closes (it's conditionally rendered, not hidden), so a
  // ref captured at click-time would point at a detached node. `triggerRef`
  // is instead attached directly to whichever trigger button is currently
  // mounted, and the transition effect below only fires `.focus()` after
  // that new element has actually committed.
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const sheetCloseRef = useRef<HTMLButtonElement | null>(null);
  const previewWasOpenRef = useRef(previewOpen);

  const coVisible = preview != null && !isBelowXl;
  const swapRegime = preview != null && isBelowXl && !isBelowLg;
  const sheetRegime = preview != null && isBelowLg;
  const showEditor = coVisible || !previewOpen;

  // The editor container never unmounts (see the `<main>` comment below) —
  // `inert` is what actually takes it out of tab order/AT when swapped away,
  // applied imperatively (via the DOM property, not a JSX prop) since this
  // project's @types/react only exposes `inert` in its experimental types.
  const editorContainerElRef = useRef<HTMLElement | null>(null);
  const setEditorContainerEl = useCallback(
    (el: HTMLElement | null) => {
      editorContainerElRef.current = el;
      editorPaneRef?.(el);
    },
    [editorPaneRef],
  );
  useEffect(() => {
    if (editorContainerElRef.current) {
      editorContainerElRef.current.inert = !showEditor;
    }
  }, [showEditor]);

  function toggleRailCollapsed() {
    setRailCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        window.localStorage.setItem(RAIL_COLLAPSE_STORAGE_KEY, String(next));
      } catch {
        // Storage unavailable (private mode, quota) — state still flips for
        // this session, it just won't survive a reload.
      }
      return next;
    });
  }

  // Sheet opened: move focus into it (the Close control). Sheet closed:
  // return focus to the (freshly mounted) trigger. Only fires on an actual
  // OPEN/CLOSE transition — never on initial mount, which would otherwise
  // steal focus onto the floating trigger the instant the page loads.
  useEffect(() => {
    const wasOpen = previewWasOpenRef.current;
    previewWasOpenRef.current = previewOpen;
    if (!sheetRegime || wasOpen === previewOpen) return;
    if (previewOpen) {
      sheetCloseRef.current?.focus();
    } else {
      triggerRef.current?.focus();
    }
  }, [sheetRegime, previewOpen]);

  // Escape dismisses the sheet — only listens while it's actually open.
  useEffect(() => {
    if (!sheetRegime || !previewOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sheetRegime, previewOpen]);

  return (
    <div data-testid="workspace-shell" className="flex h-full bg-background text-foreground">
      {isBelowLg ? null : (
        <aside
          data-testid="rail-pane"
          data-collapsed={railCollapsed}
          className={cn(
            "flex shrink-0 flex-col border-r border-border bg-surface",
            "transition-[width] duration-200 ease-in-out motion-reduce:transition-none",
            railCollapsed ? "w-12" : "w-56",
          )}
        >
          {/* The per-surface section zone is portaled-in content this
              ticket's declared files don't own; it publishes a stable
              `aria-label="Sections"` a11y contract we hide by, rather than
              reaching into that file to add a collapse-aware prop. */}
          <style>
            {'[data-testid="rail-pane"][data-collapsed="true"] div:has(> nav[aria-label="Sections"]) { display: none; }' +
              // v5-T003 (P7): every Button-based rail control (theme, logout,
              // the collapse toggle — now relocated to the wordmark row)
              // inherits ui/button.tsx's shared `ring-offset-2`, while the
              // wordmark/nav links (plain <a> tags) never opted into an
              // offset at all (Tailwind's preflight default is 0px) — the
              // two families' focus rings therefore had different
              // footprints. Neutralizing the OFFSET WIDTH here, rail-locally
              // (never touching button.tsx's shared variant, per the
              // tripwire), is what makes every rail control share one ring
              // footprint; the ring itself (width, color) is untouched and
              // stays fully visible.
              '[data-testid="rail-pane"] button:focus-visible { --tw-ring-offset-width: 0px; }'}
          </style>
          <RailCollapseContext.Provider
            value={{ collapsed: railCollapsed, toggle: toggleRailCollapsed }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto">{rail}</div>
          </RailCollapseContext.Provider>
        </aside>
      )}

      {/* v4-T033: the editor pane itself STAYS MOUNTED across the swap — the
          route content living in `editor` (ApplicationDetail) is also the
          component that portals the preview's own content into the preview
          pane's target node (WorkspaceShellSurface, see WorkspaceShellSlots
          .tsx); un-rendering `editor` would kill the very thing supplying
          the preview it's swapping in favor of. So "gone" is proven the
          acceptance oracle's OTHER sanctioned way — a genuine LAYOUT change
          (zero width, not opacity/visibility, via flex-basis/width both
          zeroed) plus the native `inert` attribute (out of tab order AND
          hidden from assistive tech, applied imperatively since this
          project's React/@types/react version predates `inert` as a JSX
          prop) — rather than DOM removal. */}
      <main
        ref={setEditorContainerEl}
        data-testid="editor-pane"
        className={cn(
          "overflow-y-auto",
          isBelowLg && CONTENT_CLEARANCE_CLASS,
          showEditor ? "min-w-0 flex-1" : "w-0 min-w-0 shrink-0 overflow-hidden",
        )}
      >
        {editor}
      </main>

      {/* lg..xl SWAP, open: the preview takes the full main-area width the
          editor just vacated — flex-1, not a fixed drawer width. */}
      {swapRegime && previewOpen ? (
        <aside data-testid="preview-pane" className="min-w-0 flex-1 overflow-y-auto bg-surface">
          {preview}
        </aside>
      ) : null}

      {/* >=xl: always co-visible, proportional width, plus the zoom control
          (v4-T054/F507) — the only viewport regime that gets one; below xl
          the pane-swap (T033) already hands the preview the full width. */}
      {coVisible ? <CoVisiblePreviewPane>{preview}</CoVisiblePreviewPane> : null}

      {/* lg..xl SWAP toggle strip: survives both directions of the swap (it
          never depends on which pane is currently showing), so it's the
          stable affordance that replaces the old dead full-height gutter
          (that gutter co-existed with a flex-1 editor and crushed it to a
          sliver at this width — this strip instead REPLACES the editor
          outright when opened). */}
      {swapRegime ? (
        <div className="flex shrink-0 items-center border-l border-border bg-surface p-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={previewOpen}
            aria-label={previewOpen ? "Hide preview" : "Show preview"}
            title={previewOpen ? "Hide preview" : "Show preview"}
            data-testid="preview-swap-toggle"
            className="h-11 w-11 justify-center p-0"
            onClick={() => setPreviewOpen((open) => !open)}
          >
            {previewOpen ? (
              <PanelRightClose aria-hidden className="h-4 w-4" />
            ) : (
              <PanelRightOpen aria-hidden className="h-4 w-4" />
            )}
          </Button>
        </div>
      ) : null}

      {/* <lg: the operable trigger that opens the sheet (T031 had withheld
          this entirely — the sheet mechanics below are what unblocks it).
          Only rendered while the sheet is closed; unmounts the instant it
          opens, and a fresh instance mounts when it closes again — the
          focus-return effect above targets whatever's currently attached to
          `triggerRef`, not a specific node captured at click-time. */}
      {sheetRegime && !previewOpen ? (
        <button
          ref={triggerRef}
          type="button"
          aria-label="Show preview"
          title="Show preview"
          data-testid="preview-sheet-trigger"
          className="fixed bottom-[4.75rem] right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface shadow-md"
          onClick={() => setPreviewOpen(true)}
        >
          <PanelRightOpen aria-hidden className="h-5 w-5" />
        </button>
      ) : null}

      {/* <lg: the full-width sheet itself — OQ2's sanctioned below-`lg`
          exception to the de-modal ban. No `aria-modal`, no scrim (nothing
          underneath to scrim — the editor is swapped out, not covered);
          dismissible via Escape (effect above) AND this visible Close
          control; focus-managed both directions (effect above). Still
          clears the bottom tab bar's height since that persistent chrome
          stays visible below `lg` regardless of sheet state. */}
      {sheetRegime && previewOpen ? (
        <div
          data-testid="preview-sheet"
          role="dialog"
          aria-label="Preview"
          className={cn("fixed inset-0 z-30 flex flex-col bg-surface", CONTENT_CLEARANCE_CLASS)}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border p-2">
            <span className="text-sm font-medium text-foreground">Preview</span>
            <Button
              ref={sheetCloseRef}
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Close preview"
              data-testid="preview-sheet-close"
              onClick={() => setPreviewOpen(false)}
              className={TAP_TARGET_COARSE}
            >
              <X aria-hidden className="mr-1 h-4 w-4" />
              Close
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{preview}</div>
        </div>
      ) : null}

      {/* F301: the rail's replacement below `lg` — persistent chrome (always
          present, blocks nothing, no scrim/aria-modal), not a drawer. Fixed
          to the viewport so it survives the editor pane's own scrolling;
          `BOTTOM_BAR_HEIGHT_CLASS` is the exact height the content panes'
          `CONTENT_CLEARANCE_CLASS` padding clears above. */}
      {isBelowLg ? <BottomTabBar heightClassName={BOTTOM_BAR_HEIGHT_CLASS} /> : null}
    </div>
  );
}
