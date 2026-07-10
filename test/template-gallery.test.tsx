// @vitest-environment jsdom
// E8-C1 — dedicated template gallery (spec.md §28.2/§31, decided
// 2026-07-05). jsdom cannot paint pdf.js (no real canvas/worker) — that
// proof lives in the applications e2e (expectThumbnailPainted, scoped to the
// open dialog). This file covers the PURE/DOM parts: one card per registry
// preset with the same ATS badge/caveat convention TemplatePicker uses, the
// onChange contract (mirrors TemplatePicker's exactly — applyPreset), and
// readOnly blocking selection.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { Profile, TailoredResume } from "@shared/types";
import type { UserPreset } from "@shared/schema";
import { DEFAULT_FORMAT_V2 } from "../src/shared/format-v2";
import { atsGrade, atsGradeCauses, PRESET_MANIFESTS } from "../src/client/document/registry";
import { applyPreset, PRESET_IDS } from "../src/client/document/presets";
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
  it("lists one card per registry preset, each with its name and effectiveAtsGrade badge", () => {
    render(
      <TemplateGallery
        format={DEFAULT_FORMAT_V2}
        onChange={vi.fn()}
        resume={resumeFixture()}
        profile={profileFixture()}
      />,
    );
    openGallery();

    const presetIds = Object.keys(PRESET_MANIFESTS);
    expect(presetIds.length).toBe(PRESET_IDS.length); // registry and preset roster never drift apart

    for (const manifest of Object.values(PRESET_MANIFESTS)) {
      expect(screen.getByText(manifest.name)).toBeInTheDocument();
    }

    // The sidebar presets are single-column-incapable (§28.2) so they cap
    // at 'good' and carry the Workday/Taleo caveat — same convention as
    // TemplatePicker (test/template-thumbnails.test.tsx doesn't cover this,
    // TemplatePicker's own render does).
    expect(screen.getAllByText("ATS: good").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByText(/strict-order ATS parsers \(Workday\/Taleo\)/).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("with resume=null, every card falls back to sample content and shows the badge", () => {
    render(<TemplateGallery format={DEFAULT_FORMAT_V2} onChange={vi.fn()} resume={null} />);
    openGallery();

    expect(screen.getAllByText("Sample content").length).toBe(Object.keys(PRESET_MANIFESTS).length);
  });

  it("with a real resume, no 'Sample content' badge appears", () => {
    render(
      <TemplateGallery
        format={DEFAULT_FORMAT_V2}
        onChange={vi.fn()}
        resume={resumeFixture()}
        profile={profileFixture()}
      />,
    );
    openGallery();

    expect(screen.queryByText("Sample content")).not.toBeInTheDocument();
  });

  it("clicking a card calls onChange with applyPreset(format, presetId) and closes the gallery", () => {
    const onChange = vi.fn();
    const format = {
      ...DEFAULT_FORMAT_V2,
      colors: { ...DEFAULT_FORMAT_V2.colors, accent: "#14532d" },
      fonts: { ...DEFAULT_FORMAT_V2.fonts, body: "arimo" as const },
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
    expect(onChange).toHaveBeenCalledWith(applyPreset(format, "sidebar-right"));

    // The dialog closes on selection (Radix unmounts DialogContent when closed).
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a 'good' card lists atsGradeCauses per-cause reasons; a 'strict' card shows none (E9-F5c)", () => {
    render(
      <TemplateGallery
        format={DEFAULT_FORMAT_V2}
        onChange={vi.fn()}
        resume={resumeFixture()}
        profile={profileFixture()}
      />,
    );
    openGallery();

    const sidebarRightCard = screen.getByText("Sidebar Right").closest("button") as HTMLElement;
    const expectedCauses = atsGradeCauses(applyPreset(DEFAULT_FORMAT_V2, "sidebar-right"));
    expect(expectedCauses.length).toBeGreaterThan(0);
    for (const cause of expectedCauses) {
      expect(within(sidebarRightCard).getByText(cause)).toBeInTheDocument();
    }

    const strictCard = screen.getByText("Strict").closest("button") as HTMLElement;
    for (const cause of expectedCauses) {
      expect(within(strictCard).queryByText(cause)).not.toBeInTheDocument();
    }
  });

  it("readOnly blocks selection: every card button is disabled and onChange is never called", () => {
    const onChange = vi.fn();
    render(
      <TemplateGallery
        format={DEFAULT_FORMAT_V2}
        onChange={onChange}
        readOnly
        resume={resumeFixture()}
        profile={profileFixture()}
      />,
    );
    openGallery();

    const cardButtons = screen.getAllByRole("button", { name: /ATS:/ });
    expect(cardButtons.length).toBe(Object.keys(PRESET_MANIFESTS).length);
    for (const button of cardButtons) {
      expect(button).toBeDisabled();
    }

    // Disabled buttons don't fire click handlers even if "clicked".
    fireEvent.click(cardButtons[0]!);
    expect(onChange).not.toHaveBeenCalled();
  });

  // E9-F5d — saved presets (settings.presets) render as their own section,
  // distinct from the built-in roster above: a full format snapshot, not a
  // composition delta, so selecting one applies it directly (no applyPreset).
  describe("saved presets (E9-F5d)", () => {
    function savedPreset(overrides: Partial<UserPreset> = {}): UserPreset {
      return {
        id: "user-preset-1",
        name: "My Strict Look",
        format: DEFAULT_FORMAT_V2,
        ...overrides,
      };
    }

    it("with no saved presets, no 'Your saved presets' section renders", () => {
      render(
        <TemplateGallery
          format={DEFAULT_FORMAT_V2}
          onChange={vi.fn()}
          resume={resumeFixture()}
          profile={profileFixture()}
          savedPresets={[]}
        />,
      );
      openGallery();

      expect(screen.queryByText("Your saved presets")).not.toBeInTheDocument();
    });

    it("renders a user preset by name with its atsGrade badge when savedPresets is non-empty", () => {
      const goodFormat = applyPreset(DEFAULT_FORMAT_V2, "sidebar-right");
      expect(atsGrade(goodFormat)).toBe("good"); // sanity: this is the 'good' case, not 'strict'
      const preset = savedPreset({ name: "My Sidebar", format: goodFormat });

      render(
        <TemplateGallery
          format={DEFAULT_FORMAT_V2}
          onChange={vi.fn()}
          resume={resumeFixture()}
          profile={profileFixture()}
          savedPresets={[preset]}
        />,
      );
      openGallery();

      expect(screen.getByText("Your saved presets")).toBeInTheDocument();
      expect(screen.getByText("My Sidebar")).toBeInTheDocument();
      const card = screen.getByText("My Sidebar").closest("button") as HTMLElement;
      expect(within(card).getByText("ATS: good")).toBeInTheDocument();
      for (const cause of atsGradeCauses(goodFormat)) {
        expect(within(card).getByText(cause)).toBeInTheDocument();
      }
    });

    it("a 'strict' saved preset shows no per-cause caveat list", () => {
      const preset = savedPreset({ name: "My Strict Look", format: DEFAULT_FORMAT_V2 });
      render(
        <TemplateGallery
          format={DEFAULT_FORMAT_V2}
          onChange={vi.fn()}
          resume={resumeFixture()}
          profile={profileFixture()}
          savedPresets={[preset]}
        />,
      );
      openGallery();

      const card = screen.getByText("My Strict Look").closest("button") as HTMLElement;
      expect(within(card).getByText("ATS: strict")).toBeInTheDocument();
      expect(
        within(card).queryByText(/strict-order ATS parsers \(Workday\/Taleo\)/),
      ).not.toBeInTheDocument();
    });

    it("selecting a saved preset calls onChange with its stored format DIRECTLY (not applyPreset) and closes the gallery", () => {
      const onChange = vi.fn();
      const currentFormat = {
        ...DEFAULT_FORMAT_V2,
        colors: { ...DEFAULT_FORMAT_V2.colors, accent: "#14532d" },
      };
      const presetFormat = applyPreset(DEFAULT_FORMAT_V2, "sidebar-right");
      const preset = savedPreset({ name: "My Sidebar", format: presetFormat });

      render(
        <TemplateGallery
          format={currentFormat}
          onChange={onChange}
          resume={resumeFixture()}
          profile={profileFixture()}
          savedPresets={[preset]}
        />,
      );
      openGallery();

      fireEvent.click(screen.getByText("My Sidebar").closest("button") as HTMLElement);

      expect(onChange).toHaveBeenCalledTimes(1);
      // The exact stored snapshot, unchanged by `currentFormat` — never
      // applyPreset(currentFormat, ...), which would have carried over
      // currentFormat's own accent color instead.
      expect(onChange).toHaveBeenCalledWith(presetFormat);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("readOnly disables saved-preset cards too", () => {
      const onChange = vi.fn();
      const preset = savedPreset();
      render(
        <TemplateGallery
          format={DEFAULT_FORMAT_V2}
          onChange={onChange}
          readOnly
          resume={resumeFixture()}
          profile={profileFixture()}
          savedPresets={[preset]}
        />,
      );
      openGallery();

      const card = screen.getByText("My Strict Look").closest("button") as HTMLElement;
      expect(card).toBeDisabled();
      fireEvent.click(card);
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
