// The channel a leaf route uses to deliver its rail/preview CONTENT into the
// single, hoisted WorkspaceShell (App.tsx, v3-T050). WorkspaceShell itself
// stays a pure layout primitive with no routing awareness — App.tsx owns the
// persistent rail-pane/preview-pane DOM nodes and exposes them here as
// portal targets, so a route's render can hand content into a container it
// doesn't itself mount, without that container (or the route swapping in and
// out of it) ever remounting the shell around it.
//
// `hoisted` distinguishes "no provider above me at all" (a component
// rendered standalone in a unit test) from "provider present, but its target
// refs haven't attached yet" (a real first render inside App.tsx, one commit
// before the ref callbacks fire) — WorkspaceShellSurface uses it to fall
// back to rendering its own embedded WorkspaceShell when there's truly no
// hoisted shell to portal into, exactly as every view did before this
// ticket. That keeps existing component-level tests (ApplicationDetail,
// LibraryView, etc. rendered on their own, with no App.tsx/Provider above
// them) working unchanged — the CONTENT that used to live in an
// always-present preview pane still renders, just wrapped in its own
// shell instance rather than portaled into a shared one.
import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { WorkspaceShell, type WorkspaceShellProps } from "./WorkspaceShell";

interface WorkspaceShellSlotTargets {
  hoisted: boolean;
  railTarget: HTMLElement | null;
  previewTarget: HTMLElement | null;
}

export const WorkspaceShellSlotsContext = createContext<WorkspaceShellSlotTargets>({
  hoisted: false,
  railTarget: null,
  previewTarget: null,
});

/**
 * A leaf route's single entry point: portals `rail`/`preview` into the
 * persistent shell when one is hoisted above it (the real app, App.tsx),
 * or renders its own embedded WorkspaceShell when there isn't one (a
 * component under test, rendered standalone) — either way `editor` is this
 * call's return value's actual body, never itself wrapped in a pane.
 */
export function WorkspaceShellSurface({ rail, editor, preview }: WorkspaceShellProps) {
  const { hoisted, railTarget, previewTarget } = useContext(WorkspaceShellSlotsContext);

  if (!hoisted) {
    return <WorkspaceShell rail={rail} editor={editor} preview={preview} />;
  }

  return (
    <>
      {railTarget ? createPortal(rail, railTarget) : null}
      {preview && previewTarget ? createPortal(preview, previewTarget) : null}
      {editor}
    </>
  );
}
