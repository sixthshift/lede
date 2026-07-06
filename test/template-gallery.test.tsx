// @vitest-environment jsdom
// E8-C1 — dedicated template gallery (spec.md §28.2, decided 2026-07-05).
// jsdom cannot paint pdf.js (no real canvas/worker) — that proof lives in the
// applications e2e (expectThumbnailPainted, scoped to the open dialog). This
// file covers the PURE/DOM parts: one card per registry template with the
// same ATS badge/caveat convention TemplatePicker uses, the onChange
// contract (mirrors TemplatePicker's exactly — only templateId changes), and
// readOnly blocking selection.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Profile, TailoredResume } from "@shared/types";
import { DEFAULT_FORMAT } from "../src/shared/format";
import { TEMPLATES } from "../src/client/document/registry";
import { TemplateGallery } from "../src/client/components/TemplateGallery";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function resumeFixture(): TailoredResume {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "SUMMARY_SENTINEL",
    sections: [
      {
        section: "experience",
        groups: [
          {
            heading: "Acme · Engineer · 2020-2023",
            items: [{ entryId: "e1", text: "EXPERIENCE_ITEM_ONE" }],
          },
        ],
      },
    ],
    cut: [],
  };
}

function profileFixture(): Profile {
  return { name: "Jordan Rivera", email: "jordan@example.com", links: [] };
}

function openGallery() {
  fireEvent.click(screen.getByRole("button", { name: "Browse templates" }));
}

describe("TemplateGallery", () => {
  it("lists one card per registry template, each with its name and effectiveAtsGrade badge", () => {
    render(
      <TemplateGallery
        format={DEFAULT_FORMAT}
        onChange={vi.fn()}
        resume={resumeFixture()}
        profile={profileFixture()}
      />,
    );
    openGallery();

    const templateIds = Object.keys(TEMPLATES);
    expect(templateIds.length).toBe(6);

    for (const manifest of Object.values(TEMPLATES)) {
      expect(screen.getByText(manifest.name)).toBeInTheDocument();
    }

    // The sidebar templates are single-column-incapable (§28.2) so they cap
    // at 'good' and carry the Workday/Taleo caveat — same convention as
    // TemplatePicker (test/template-thumbnails.test.tsx doesn't cover this,
    // TemplatePicker's own render does).
    expect(screen.getAllByText("ATS: good").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByText(/strict-order ATS parsers \(Workday\/Taleo\)/).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("with resume=null, every card falls back to sample content and shows the badge", () => {
    render(<TemplateGallery format={DEFAULT_FORMAT} onChange={vi.fn()} resume={null} />);
    openGallery();

    expect(screen.getAllByText("Sample content").length).toBe(6);
  });

  it("with a real resume, no 'Sample content' badge appears", () => {
    render(
      <TemplateGallery
        format={DEFAULT_FORMAT}
        onChange={vi.fn()}
        resume={resumeFixture()}
        profile={profileFixture()}
      />,
    );
    openGallery();

    expect(screen.queryByText("Sample content")).not.toBeInTheDocument();
  });

  it("clicking a card calls onChange with {...format, templateId} — every other field untouched — and closes the gallery", () => {
    const onChange = vi.fn();
    const format = {
      ...DEFAULT_FORMAT,
      colors: { ...DEFAULT_FORMAT.colors, primary: "#14532d" },
      typography: {
        ...DEFAULT_FORMAT.typography,
        body: { ...DEFAULT_FORMAT.typography.body, family: "arimo" as const },
      },
    };
    render(
      <TemplateGallery
        format={format}
        onChange={onChange}
        resume={resumeFixture()}
        profile={profileFixture()}
      />,
    );
    openGallery();

    fireEvent.click(screen.getByRole("button", { name: /^Sidebar Right/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ ...format, templateId: "sidebar-right" });

    // The dialog closes on selection (Radix unmounts DialogContent when closed).
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("readOnly blocks selection: every card button is disabled and onChange is never called", () => {
    const onChange = vi.fn();
    render(
      <TemplateGallery
        format={DEFAULT_FORMAT}
        onChange={onChange}
        readOnly
        resume={resumeFixture()}
        profile={profileFixture()}
      />,
    );
    openGallery();

    const cardButtons = screen.getAllByRole("button", { name: /ATS:/ });
    expect(cardButtons.length).toBe(6);
    for (const button of cardButtons) {
      expect(button).toBeDisabled();
    }

    // Disabled buttons don't fire click handlers even if "clicked".
    fireEvent.click(cardButtons[0]!);
    expect(onChange).not.toHaveBeenCalled();
  });
});
