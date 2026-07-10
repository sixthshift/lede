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
import { type ReactNode, useState } from "react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";

export interface WorkspaceShellProps {
  rail: ReactNode;
  editor: ReactNode;
  preview?: ReactNode;
}

export function WorkspaceShell({ rail, editor, preview }: WorkspaceShellProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div data-testid="workspace-shell" className="flex h-full bg-background text-foreground">
      <aside
        data-testid="rail-pane"
        className="w-56 shrink-0 overflow-y-auto border-r border-border bg-surface"
      >
        {rail}
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
