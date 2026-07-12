// WorkspaceShell — foundational three-pane layout primitive (rail | editor |
// preview) for the workspace redesign. Pure layout: no routing, no
// data-fetching, no `useParams` — callers hand it slots via props, so it
// works embedded per-route today and hoisted to wrap the router Outlet
// later without changing shape.
//
// Responsive rule: at >=1280px (Tailwind's `xl`) editor and preview are
// always co-visible — no toggle involved. Below that, preview collapses to
// a drawer the caller opens/closes with a labeled toggle button. Both
// states are expressed as plain Tailwind display utilities (`hidden` /
// `xl:block`), never the native `hidden` attribute — browsers apply
// `!important` to `[hidden]`, which no author stylesheet (including a
// later `xl:` override) can beat. Same-specificity utility classes don't
// have that problem: Tailwind emits responsive variants after the base
// utilities, so `xl:block` wins once the viewport matches, regardless of
// the toggle state.
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
import { type ReactNode, createContext, useContext, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";

export interface WorkspaceShellProps {
  rail: ReactNode;
  editor: ReactNode;
  preview?: ReactNode;
}

const RAIL_COLLAPSE_STORAGE_KEY = "lede.workspace.railCollapsed";

function readRailCollapsed(): boolean {
  try {
    return window.localStorage.getItem(RAIL_COLLAPSE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

const RailCollapseContext = createContext(false);

/** Whether the rail is currently in its icon-only collapsed band. */
export function useRailCollapsed(): boolean {
  return useContext(RailCollapseContext);
}

export function WorkspaceShell({ rail, editor, preview }: WorkspaceShellProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(readRailCollapsed);

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

  return (
    <div data-testid="workspace-shell" className="flex h-full bg-background text-foreground">
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
          {
            '[data-testid="rail-pane"][data-collapsed="true"] div:has(> nav[aria-label="Sections"]) { display: none; }'
          }
        </style>
        <RailCollapseContext.Provider value={railCollapsed}>
          <div className="min-h-0 flex-1 overflow-y-auto">{rail}</div>
        </RailCollapseContext.Provider>
        <div className="flex shrink-0 justify-center border-t border-border p-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={railCollapsed}
            aria-label={railCollapsed ? "Expand rail" : "Collapse rail"}
            title={railCollapsed ? "Expand rail" : "Collapse rail"}
            data-testid="rail-collapse-toggle"
            className="w-full justify-center text-muted-foreground"
            onClick={toggleRailCollapsed}
          >
            {railCollapsed ? (
              <PanelLeftOpen aria-hidden className="h-4 w-4" />
            ) : (
              <PanelLeftClose aria-hidden className="h-4 w-4" />
            )}
          </Button>
        </div>
      </aside>

      <main data-testid="editor-pane" className="min-w-0 flex-1 overflow-y-auto">
        {editor}
      </main>

      {preview ? (
        <>
          <div className="flex shrink-0 items-start border-l border-border bg-surface p-2 xl:hidden">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={previewOpen}
              onClick={() => setPreviewOpen((open) => !open)}
            >
              {previewOpen ? "Hide preview" : "Show preview"}
            </Button>
          </div>
          <aside
            data-testid="preview-pane"
            className={cn(
              "w-96 shrink-0 overflow-y-auto border-l border-border bg-surface",
              "xl:block",
              previewOpen ? "block" : "hidden",
            )}
          >
            {preview}
          </aside>
        </>
      ) : null}
    </div>
  );
}
