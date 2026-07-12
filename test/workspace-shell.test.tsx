// @vitest-environment jsdom
// WorkspaceShell (v3 T010; regime split v4-T033) — the three-pane layout
// primitive. jsdom has no `window.matchMedia`, so both `useIsBelowLg`/
// `useIsBelowXl` fall back to "not below" (their documented default) — every
// render in this file lands in the >=xl CO-VISIBLE regime, the one regime
// with no toggle at all. The swap/sheet regimes (which DO need a real
// `matchMedia`-driven viewport) are covered by test/e2e/pane-arbitration.spec.ts
// instead. RED-TEAM focus here:
//  - the two required testids show up regardless of what's plugged into the
//    slots.
//  - the optional preview slot truly degrades: omit it, get no preview-pane
//    element at all (never an empty third column).
//  - in the default (co-visible) regime, the preview pane is always
//    present/visible with no toggle button at all — proportional width, not
//    a fixed one.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

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

  it("co-visible regime (jsdom's matchMedia-less default): no toggle exists at all, and the preview pane is always visible", () => {
    render(
      <WorkspaceShell
        rail={<div>rail</div>}
        editor={<div>editor</div>}
        preview={<div>preview content</div>}
      />,
    );

    // No toggle in this regime — co-visible means co-visible, unconditionally.
    expect(screen.queryByRole("button", { name: /preview/i })).not.toBeInTheDocument();

    const previewPane = screen.getByTestId("preview-pane");
    expect(previewPane).toBeVisible();
    expect(screen.getByText("preview content")).toBeInTheDocument();

    // The editor stays mounted and visible alongside it — this regime never
    // swaps the two.
    expect(screen.getByTestId("editor-pane")).toBeVisible();
    expect(screen.getByText("editor")).toBeInTheDocument();
  });

  it("preview pane carries the proportional (clamped) width class, not the old fixed 384px, in the co-visible regime", () => {
    render(
      <WorkspaceShell
        rail={<div>rail</div>}
        editor={<div>editor</div>}
        preview={<div>preview content</div>}
      />,
    );

    // jsdom can't lay out `clamp()` itself (validated at real viewport widths
    // by test/e2e/pane-arbitration.spec.ts) — this asserts the class that
    // carries the proportional behavior is present, and that the old fixed
    // `w-96` is gone.
    const previewPane = screen.getByTestId("preview-pane");
    expect(previewPane).toHaveClass("w-[clamp(384px,40vw,640px)]");
    expect(previewPane).not.toHaveClass("w-96");
  });
});
