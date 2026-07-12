import { useState } from "react";
import { Outlet, useLocation, Link } from "react-router-dom";
import { LogOut } from "lucide-react";

import { useAuthLogout } from "./hooks/queries";
import { LoginGate } from "./components/LoginGate";
import { NavTabs } from "./components/NavTabs";
import { ThemeToggle } from "./components/ThemeToggle";
import { Button } from "./components/ui/button";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { WorkspaceShellSlotsContext } from "./components/WorkspaceShellSlots";

// v4-T020 (single-chrome merge, OQ1): the header bar (AppShell) is gone — the
// wordmark moves to the rail's top anchor, theme toggle + logout move to its
// bottom cluster (a collapse toggle joins them in T022). AppShell used to own
// the `h-screen` frame; that ownership moves here since it dissolved into
// this shell.
function RailWordmark() {
  return (
    <Link
      to="/applications"
      className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden
        className="flex h-6 w-6 items-center justify-center rounded-md bg-primary pb-0.5 font-serif text-md font-medium leading-none text-primary-foreground"
      >
        L
      </span>
      <span className="font-serif text-md font-medium tracking-tight">Lede</span>
    </Link>
  );
}

function RailBottomCluster() {
  const logout = useAuthLogout();

  return (
    <div className="flex items-center justify-between gap-1">
      <ThemeToggle />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => logout.mutate()}
      >
        <LogOut aria-hidden />
        Log out
      </Button>
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
export function App() {
  const location = useLocation();
  const hasPreview = /^\/applications\/[^/]+$/.test(location.pathname);

  const [railTarget, setRailTarget] = useState<HTMLDivElement | null>(null);
  const [previewTarget, setPreviewTarget] = useState<HTMLDivElement | null>(null);

  const rail = (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border p-2">
        <RailWordmark />
      </div>
      <div className="shrink-0 border-b border-border p-2">
        <NavTabs />
      </div>
      <div ref={setRailTarget} className="min-h-0 flex-1 overflow-y-auto" />
      <div className="shrink-0 border-t border-border p-2">
        <RailBottomCluster />
      </div>
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
          />
        </WorkspaceShellSlotsContext.Provider>
      </div>
    </LoginGate>
  );
}
