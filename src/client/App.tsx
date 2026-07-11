import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { LoginGate } from "./components/LoginGate";
import { NavTabs } from "./components/NavTabs";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { WorkspaceShellSlotsContext } from "./components/WorkspaceShellSlots";

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
        <NavTabs />
      </div>
      <div ref={setRailTarget} className="min-h-0 flex-1" />
    </div>
  );

  return (
    <LoginGate>
      <AppShell>
        <WorkspaceShellSlotsContext.Provider
          value={{ hoisted: true, railTarget, previewTarget: hasPreview ? previewTarget : null }}
        >
          <WorkspaceShell
            rail={rail}
            editor={<Outlet />}
            preview={hasPreview ? <div ref={setPreviewTarget} className="h-full" /> : undefined}
          />
        </WorkspaceShellSlotsContext.Provider>
      </AppShell>
    </LoginGate>
  );
}
