// @vitest-environment jsdom
// WorkspaceShell (v3 T010) — the three-pane layout primitive. RED-TEAM focus:
//  - the two required testids show up regardless of what's plugged into the
//    slots.
//  - the optional preview slot truly degrades: omit it, get no preview-pane
//    element at all (never an empty third column).
//  - the below-1280 drawer toggle is a real button (getByRole) and toggling
//    it is a genuine DOM-level effect (class-driven display, not merely an
//    aria-state flip) — closed by default (Tailwind's `hidden` utility
//    present, `block` absent), open after one click (and back on a second).
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { WorkspaceShell } from "../src/client/components/WorkspaceShell";

afterEach(cleanup);

describe("WorkspaceShell", () => {
  it("renders the rail, editor, and preview slots with the required testids", () => {
    render(
      <WorkspaceShell
        rail={<div>rail content</div>}
        editor={<div>editor content</div>}
        preview={<div>preview content</div>}
      />,
    );

    expect(screen.getByTestId("workspace-shell")).toBeInTheDocument();
    expect(screen.getByTestId("editor-pane")).toBeInTheDocument();
    expect(screen.getByText("rail content")).toBeInTheDocument();
    expect(screen.getByText("editor content")).toBeInTheDocument();
    expect(screen.getByTestId("preview-pane")).toBeInTheDocument();
    expect(screen.getByText("preview content")).toBeInTheDocument();
  });

  it("degrades cleanly with no preview slot: no preview-pane element renders", () => {
    render(<WorkspaceShell rail={<div>rail</div>} editor={<div>editor</div>} />);

    expect(screen.getByTestId("workspace-shell")).toBeInTheDocument();
    expect(screen.getByTestId("editor-pane")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-pane")).not.toBeInTheDocument();
    // no dangling toggle either — nothing to show/hide without a preview.
    expect(screen.queryByRole("button", { name: /preview/i })).not.toBeInTheDocument();
  });

  it("the drawer toggle is a real button, and toggling it flips the preview's DOM state", () => {
    render(
      <WorkspaceShell
        rail={<div>rail</div>}
        editor={<div>editor</div>}
        preview={<div>preview content</div>}
      />,
    );

    const toggle = screen.getByRole("button", { name: /show preview/i });
    const previewPane = screen.getByTestId("preview-pane");

    // Closed by default (below-1280 drawer state): a real class-driven
    // display:none, not just an aria attribute.
    expect(previewPane).toHaveClass("hidden");
    expect(previewPane).not.toHaveClass("block");
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    const reopened = screen.getByTestId("preview-pane");
    expect(reopened).toHaveClass("block");
    expect(reopened).not.toHaveClass("hidden");
    expect(screen.getByRole("button", { name: /hide preview/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    // and back closed on a second click — the effect is a real toggle, not
    // one-directional.
    fireEvent.click(screen.getByRole("button", { name: /hide preview/i }));
    const reclosed = screen.getByTestId("preview-pane");
    expect(reclosed).toHaveClass("hidden");
    expect(reclosed).not.toHaveClass("block");
  });

  it("preview pane always carries the xl:block override so it co-shows at >=1280 regardless of drawer state", () => {
    render(
      <WorkspaceShell
        rail={<div>rail</div>}
        editor={<div>editor</div>}
        preview={<div>preview content</div>}
      />,
    );

    // jsdom can't evaluate the media query itself (validated by a real-
    // viewport e2e instead) — this asserts the class that carries that
    // behavior is present regardless of the toggle's current state.
    expect(screen.getByTestId("preview-pane")).toHaveClass("xl:block");
  });
});
