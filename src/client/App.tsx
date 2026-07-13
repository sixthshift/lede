import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigationType, Link } from "react-router-dom";
import { LogOut } from "lucide-react";

import { useAuthLogout } from "./hooks/queries";
import { LoginGate } from "./components/LoginGate";
import { cn } from "./lib/utils";
import { NavTabs } from "./components/NavTabs";
import { ThemeToggle } from "./components/ThemeToggle";
import { Button } from "./components/ui/button";
import { Toaster } from "./components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { useRailCollapsed, WorkspaceShell } from "./components/WorkspaceShell";
import { WorkspaceShellSlotsContext } from "./components/WorkspaceShellSlots";

// v4-T020 (single-chrome merge, OQ1): the header bar (AppShell) is gone — the
// wordmark moves to the rail's top anchor, theme toggle + logout move to its
// bottom cluster (a collapse toggle joins them in T022). AppShell used to own
// the `h-screen` frame; that ownership moves here since it dissolved into
// this shell.
//
// v5-T001: this zone owns its own outer chrome (border + padding), not
// App()'s `rail` JSX — App() renders above WorkspaceShell's
// RailCollapseContext.Provider, so a className computed inline there can
// never react to collapse. As its own function component, React only calls
// it once reached inside the provider, so `useRailCollapsed()` here resolves
// correctly. Collapsed: the "Lede" text node is removed outright (not
// CSS-hidden) and the link picks up `aria-label="Lede"` so its accessible
// name survives losing that text; the "L" box stays, unconditionally, as the
// one thing collapsed mode still shows.
function RailWordmark() {
  const collapsed = useRailCollapsed();

  return (
    <div className={cn("shrink-0 border-b border-border", collapsed ? "p-1.5" : "p-2")}>
      <Link
        to="/applications"
        aria-label={collapsed ? "Lede" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          collapsed && "justify-center",
        )}
      >
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-md bg-primary pb-0.5 font-serif text-md font-medium leading-none text-primary-foreground"
        >
          L
        </span>
        {collapsed ? null : (
          <span className="font-serif text-md font-medium tracking-tight">Lede</span>
        )}
      </Link>
    </div>
  );
}

// v5-T001: same collapse-aware chrome pattern as RailWordmark above.
// Collapsed: theme + logout become centered, icon-only, vertically stacked
// controls, each named via `aria-label` and surfaced via the SAME Radix
// Tooltip primitive NavTabs' collapsed band already uses (one shared
// TooltipProvider for the pair, side="right").
//
// v5-T002 (expanded only): theme + logout are a matched PAIR, not a
// mismatched `justify-between` split — same full-width row shape, same
// hover language. `hover:bg-[var(--ring-weak)]` is applied per-control
// (rail-local), not by editing the shared ghost variant (button.tsx), since
// that variant's `hover:bg-accent` is the SAME token NavTabs paints the
// ACTIVE tab with — painting it on hover here would read as "selected".
// twMerge (`cn`) resolves the conflict because this class is appended after
// the variant's own classes, so it — not `hover:bg-accent` — wins.
function RailBottomCluster() {
  const logout = useAuthLogout();
  const collapsed = useRailCollapsed();

  const logoutButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label="Log out"
      className={cn(
        "text-muted-foreground hover:bg-[var(--ring-weak)]",
        collapsed ? "w-9 justify-center px-0" : "w-full justify-start gap-2.5 px-3",
      )}
      onClick={() => logout.mutate()}
    >
      <LogOut aria-hidden className="h-4 w-4" />
      {collapsed ? null : "Log out"}
    </Button>
  );

  return (
    <div className={cn("shrink-0 border-t border-border", collapsed ? "p-1.5" : "p-2")}>
      {collapsed ? (
        <TooltipProvider delayDuration={200}>
          <div className="flex flex-col items-center gap-1">
            <ThemeToggle />
            <Tooltip>
              <TooltipTrigger asChild>{logoutButton}</TooltipTrigger>
              <TooltipContent side="right">Log out</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      ) : (
        <div className="flex flex-col gap-1">
          <ThemeToggle />
          {logoutButton}
        </div>
      )}
    </div>
  );
}

// v3-T050: WorkspaceShell is hoisted here, above the router's <Outlet/> — ONE
// persistent instance for every content route (the dashboard, an
// application's detail, Library, Settings all qualify as shell surfaces now),
// so `[data-testid="workspace-shell"]` is the SAME DOM node across
// client-side navigation instead of remounting per view. A leaf route still
// owns its own rail/preview CONTENT (section nav, the document preview) — it
// delivers that content into this shell via portals (RailSlot/PreviewSlot,
// WorkspaceShellSlots.tsx) rather than rendering WorkspaceShell itself; only
// its "editor" body renders through the Outlet directly.
//
// The global nav (NavTabs) lives here, once, ABOVE whatever per-route rail
// content portals in below it — it's the >=1 functional rail item every
// surface gets for free, including the dashboard (which contributes no rail
// content of its own — spec.md Phase 5/M2).
//
// Only /applications/:id is a document surface — the ONLY route the preview
// pane exists for at all. Every other route degrades to no preview-pane
// element (never an empty one): `hasPreview` gates whether WorkspaceShell
// even mounts the pane, so `previewTarget` only ever resolves for that route.

// v4-T024 (F203/F208): the browser's native scroll restoration can't see
// past the editor pane's OWN scroll container (WorkspaceShell's `<main>`
// never moves the window's scrollTop), so it's re-implemented here, keyed by
// `location.key` rather than pathname — React Router mints a fresh key per
// history entry, even two visits to the same path, which is exactly the
// granularity "restore THIS visit's scroll, not any visit to this route"
// needs. A POP (back/forward) restores what was last recorded for the
// incoming key; anything else (a fresh PUSH) starts at the top, matching how
// native scroll restoration treats new vs. revisited entries.
//
// The same effect carries route-level focus (F208): the incoming surface's
// `<h1>` is found generically (its container is the one persistent
// editor-pane node — every surface's title lives there, one-title
// convention) rather than threaded down per-route, so it works for every
// shell surface without each one wiring it up itself. Content that loads
// asynchronously (a query still in flight when the route swaps in) hasn't
// rendered its `<h1>` yet on the first pass — a MutationObserver picks it up
// the moment it appears instead of silently leaving focus stranded.
function useRouteScrollAndFocus(editorPaneRef: React.RefObject<HTMLElement | null>) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const scrollPositions = useRef(new Map<string, number>());

  // biome-ignore lint/correctness/useExhaustiveDependencies: editorPaneRef is a stable ref object (attached to the persistent editor-pane node during the same commit this effect follows) — its `.current` is already populated by the time this runs, not a reactive trigger of its own.
  useEffect(() => {
    const container = editorPaneRef.current;
    if (!container) return;

    container.scrollTop =
      navigationType === "POP" ? (scrollPositions.current.get(location.key) ?? 0) : 0;

    function focusHeading(pane: HTMLElement): boolean {
      const heading = pane.querySelector<HTMLElement>("h1");
      if (!heading) return false;
      heading.setAttribute("tabindex", "-1");
      // preventScroll: a plain .focus() call snaps the container back to
      // wherever the h1 sits (the top) — which would silently undo the
      // scroll restoration two lines up on every POP.
      heading.focus({ preventScroll: true });
      return true;
    }

    let observer: MutationObserver | null = null;
    if (!focusHeading(container)) {
      observer = new MutationObserver(() => {
        if (focusHeading(container)) observer?.disconnect();
      });
      observer.observe(container, { childList: true, subtree: true });
    }

    function recordScroll(pane: HTMLElement) {
      scrollPositions.current.set(location.key, pane.scrollTop);
    }
    const handleScroll = () => recordScroll(container);
    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      observer?.disconnect();
    };
  }, [location.key, navigationType]);
}

export function App() {
  const location = useLocation();
  const hasPreview = /^\/applications\/[^/]+$/.test(location.pathname);

  const [railTarget, setRailTarget] = useState<HTMLDivElement | null>(null);
  const [previewTarget, setPreviewTarget] = useState<HTMLDivElement | null>(null);
  const editorPaneRef = useRef<HTMLElement | null>(null);
  const setEditorPaneRef = useCallback((el: HTMLElement | null) => {
    editorPaneRef.current = el;
  }, []);
  useRouteScrollAndFocus(editorPaneRef);

  const rail = (
    <div className="flex h-full flex-col">
      <RailWordmark />
      <NavTabs />
      <div ref={setRailTarget} className="min-h-0 flex-1 overflow-y-auto" />
      <RailBottomCluster />
    </div>
  );

  return (
    <LoginGate>
      <div className="h-screen overflow-hidden bg-background text-foreground">
        <WorkspaceShellSlotsContext.Provider
          value={{ hoisted: true, railTarget, previewTarget: hasPreview ? previewTarget : null }}
        >
          <WorkspaceShell
            rail={rail}
            editor={<Outlet />}
            preview={hasPreview ? <div ref={setPreviewTarget} className="h-full" /> : undefined}
            editorPaneRef={setEditorPaneRef}
          />
        </WorkspaceShellSlotsContext.Provider>
        {/* T040/F401: the single app-wide feedback surface. Non-modal chrome
            by sonner's own defaults (no scrim, pointer-events inert outside
            each toast, auto-dismiss) — mounted once here so every mutation's
            success toast shares one region, and left unconfigured for
            blocking (no `duration: Infinity`), keeping the v3 modality sweep
            green. FAILURES never come here — they render inline beside their
            trigger (the flagVoice pattern). */}
        <Toaster />
      </div>
    </LoginGate>
  );
}
