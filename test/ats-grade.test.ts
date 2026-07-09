// E9-F5a: pure atsGrade(format) + atsGradeCauses(format), keyed only on the
// format's own axes (oracle.md Phase 8 [v3-038]'s shipped ATS classification
// table). effectiveAtsGrade(manifest, format) delegates to atsGrade — its
// own regression coverage lives in document-format-render.test.ts /
// document-templates.test.ts (both stay green, unmodified by this ticket).
import { describe, expect, it } from "vitest";
import { DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import { atsGrade, atsGradeCauses, PRESET_MANIFESTS } from "../src/client/document/registry";
import { PRESETS, PRESET_IDS } from "../src/client/document/presets";

// A strict baseline: DEFAULT_FORMAT_V2 already satisfies every strict-grade
// condition (single column/top header, hidden photo, no heading icons,
// single-mode colors over a non-full-page/border area).
const STRICT_BASELINE: DocumentFormatV2 = DEFAULT_FORMAT_V2;

describe("atsGrade — grade-neutral axes (stay 'strict')", () => {
  it("colors.border (any size/sides) does not affect grade", () => {
    const format: DocumentFormatV2 = {
      ...STRICT_BASELINE,
      colors: {
        ...STRICT_BASELINE.colors,
        border: { size: "l", sides: { top: true, right: true, bottom: true, left: true } },
      },
    };
    expect(atsGrade(format)).toBe("strict");
  });

  it("sectionDisplay levelDisplay 'dots' does not affect grade", () => {
    const format: DocumentFormatV2 = {
      ...STRICT_BASELINE,
      sectionDisplay: {
        ...STRICT_BASELINE.sectionDisplay,
        skillsLanguages: {
          ...STRICT_BASELINE.sectionDisplay.skillsLanguages,
          levelDisplay: "dots",
        },
      },
    };
    expect(atsGrade(format)).toBe("strict");
  });

  it("sectionDisplay levelDisplay 'bar' does not affect grade", () => {
    const format: DocumentFormatV2 = {
      ...STRICT_BASELINE,
      sectionDisplay: {
        ...STRICT_BASELINE.sectionDisplay,
        skillsLanguages: { ...STRICT_BASELINE.sectionDisplay.skillsLanguages, levelDisplay: "bar" },
      },
    };
    expect(atsGrade(format)).toBe("strict");
  });

  it("contact icon style does not affect grade", () => {
    const format: DocumentFormatV2 = {
      ...STRICT_BASELINE,
      header: { ...STRICT_BASELINE.header, contactIconStyle: "circle-filled" },
    };
    expect(atsGrade(format)).toBe("strict");
  });

  it("footer content does not affect grade", () => {
    const format: DocumentFormatV2 = {
      ...STRICT_BASELINE,
      footer: { pageNumbers: true, email: true, name: true, customText: "Confidential" },
    };
    expect(atsGrade(format)).toBe("strict");
  });
});

describe("atsGrade — downgrading axes (flip to 'good')", () => {
  it("layout.columns 'two' downgrades", () => {
    const format: DocumentFormatV2 = {
      ...STRICT_BASELINE,
      layout: { ...STRICT_BASELINE.layout, columns: "two" },
    };
    expect(atsGrade(format)).toBe("good");
  });

  it("layout.columns 'mix' downgrades", () => {
    const format: DocumentFormatV2 = {
      ...STRICT_BASELINE,
      layout: { ...STRICT_BASELINE.layout, columns: "mix" },
    };
    expect(atsGrade(format)).toBe("good");
  });

  it("layout.headerPosition 'left' downgrades", () => {
    const format: DocumentFormatV2 = {
      ...STRICT_BASELINE,
      layout: { ...STRICT_BASELINE.layout, headerPosition: "left" },
    };
    expect(atsGrade(format)).toBe("good");
  });

  it("layout.headerPosition 'right' downgrades", () => {
    const format: DocumentFormatV2 = {
      ...STRICT_BASELINE,
      layout: { ...STRICT_BASELINE.layout, headerPosition: "right" },
    };
    expect(atsGrade(format)).toBe("good");
  });

  it("photo.hidden === false downgrades", () => {
    const format: DocumentFormatV2 = {
      ...STRICT_BASELINE,
      photo: { ...STRICT_BASELINE.photo, hidden: false },
    };
    expect(atsGrade(format)).toBe("good");
  });

  it("headings.icons 'outline' downgrades", () => {
    const format: DocumentFormatV2 = {
      ...STRICT_BASELINE,
      headings: { ...STRICT_BASELINE.headings, icons: "outline" },
    };
    expect(atsGrade(format)).toBe("good");
  });

  it("headings.icons 'filled' downgrades", () => {
    const format: DocumentFormatV2 = {
      ...STRICT_BASELINE,
      headings: { ...STRICT_BASELINE.headings, icons: "filled" },
    };
    expect(atsGrade(format)).toBe("good");
  });

  it("a full-page dark background (multi mode) downgrades", () => {
    const format: DocumentFormatV2 = {
      ...STRICT_BASELINE,
      colors: {
        ...STRICT_BASELINE.colors,
        area: "full-page",
        mode: "multi",
        background: "#0f172a",
      },
    };
    expect(atsGrade(format)).toBe("good");
  });

  it("single-mode colors over a dark background hex stays 'strict' (page renders white regardless)", () => {
    const format: DocumentFormatV2 = {
      ...STRICT_BASELINE,
      colors: {
        ...STRICT_BASELINE.colors,
        area: "full-page",
        mode: "single",
        background: "#0f172a",
      },
    };
    expect(atsGrade(format)).toBe("strict");
  });

  it("a header accent band (colors.area 'header', single mode) does NOT downgrade — the banner preset's own composition", () => {
    const format: DocumentFormatV2 = {
      ...STRICT_BASELINE,
      colors: { ...STRICT_BASELINE.colors, area: "header" },
    };
    expect(atsGrade(format)).toBe("strict");
  });
});

describe("atsGrade — ground-truth anchor: every shipped preset's badge matches its tested grade", () => {
  for (const id of PRESET_IDS) {
    it(`${id}`, () => {
      expect(atsGrade(PRESETS[id])).toBe(PRESET_MANIFESTS[id].atsGrade);
    });
  }
});

describe("atsGradeCauses", () => {
  it("returns [] for a strict format", () => {
    expect(atsGradeCauses(STRICT_BASELINE)).toEqual([]);
  });

  it("returns a non-empty list exactly when grade is 'good'", () => {
    for (const id of PRESET_IDS) {
      const causes = atsGradeCauses(PRESETS[id]);
      const grade = atsGrade(PRESETS[id]);
      expect(causes.length > 0).toBe(grade === "good");
    }
  });

  it("each downgrading axis produces a distinct, non-empty cause string", () => {
    const columnsCauses = atsGradeCauses({
      ...STRICT_BASELINE,
      layout: { ...STRICT_BASELINE.layout, columns: "two" },
    });
    const headerPositionCauses = atsGradeCauses({
      ...STRICT_BASELINE,
      layout: { ...STRICT_BASELINE.layout, headerPosition: "left" },
    });
    const photoCauses = atsGradeCauses({
      ...STRICT_BASELINE,
      photo: { ...STRICT_BASELINE.photo, hidden: false },
    });
    const iconCauses = atsGradeCauses({
      ...STRICT_BASELINE,
      headings: { ...STRICT_BASELINE.headings, icons: "outline" },
    });
    const backgroundCauses = atsGradeCauses({
      ...STRICT_BASELINE,
      colors: {
        ...STRICT_BASELINE.colors,
        area: "full-page",
        mode: "multi",
        background: "#0f172a",
      },
    });

    for (const causes of [
      columnsCauses,
      headerPositionCauses,
      photoCauses,
      iconCauses,
      backgroundCauses,
    ]) {
      expect(causes.length).toBe(1);
      expect(causes[0].length).toBeGreaterThan(0);
    }

    const allCauses = [
      columnsCauses[0],
      headerPositionCauses[0],
      photoCauses[0],
      iconCauses[0],
      backgroundCauses[0],
    ];
    expect(new Set(allCauses).size).toBe(allCauses.length);
  });

  it("sidebar presets (two-column) carry a distinct cause from the layout axis", () => {
    expect(atsGradeCauses(PRESETS["sidebar-left"])).toEqual(
      atsGradeCauses(PRESETS["sidebar-right"]),
    );
    expect(atsGradeCauses(PRESETS["sidebar-left"]).length).toBeGreaterThan(0);
  });
});
