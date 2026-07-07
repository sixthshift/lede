// E9-F0b acceptance: the engine core renders the four single-column presets
// (spec.md §31.6 F0, THE risk). Patterned on
// test/document-extraction-invariant.test.ts (extraction-order invariant)
// and test/document-templates.test.ts (geometry contrasts, banner tint) —
// same oracle, now proven THROUGH THE ONE ENGINE rather than six code
// templates. ZERO imports of ../src/client/document/registry or
// ../src/client/document/templates (the engine composes; sections render).
import { describe, expect, it } from "vitest";
import type { Profile, TailoredResume } from "@shared/types";
import {
  BODY_FONT_IDS,
  CONTACT_ICON_STYLES,
  DATE_FORMATS,
  DEFAULT_FORMAT_V2,
  HEADING_STYLES,
  migrateFormat,
  NAME_DISPLAY_FONT_IDS,
  type DocumentFormatV2,
} from "@shared/format-v2";
import { DEFAULT_FORMAT } from "@shared/format";
import { extractPdfText } from "../src/client/document/extractText";
import {
  DENSITY_LADDER,
  fitEngineToPages,
  renderEngineToBuffer,
} from "../src/client/document/engine";
import { PRESET_IDS, PRESETS, SINGLE_COLUMN_PRESET_IDS } from "../src/client/document/presets";

function profileFixture(): Profile {
  return {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    links: [{ type: "github", label: "github.com/jordan", url: "https://github.com/jordan" }],
  };
}

function resumeFixture(): TailoredResume {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "SUMMARY_TEXT: a track record of shipping backend systems.",
    sections: [
      {
        section: "project",
        groups: [
          {
            heading: "cloudcase-platform-sdk",
            leadRationale: "SENTINEL_RATIONALE_PROJECT",
            items: [
              { entryId: "p1", text: "PROJECT_ITEM_ONE" },
              { entryId: "p2", text: "PROJECT_ITEM_TWO" },
            ],
          },
        ],
      },
      {
        section: "experience",
        groups: [
          {
            heading: "Acme · Engineer · 2020-2023",
            leadRationale: "SENTINEL_RATIONALE_EXPERIENCE",
            items: [
              { entryId: "e1", text: "EXPERIENCE_ITEM_ONE" },
              { entryId: "e2", text: "EXPERIENCE_ITEM_TWO" },
            ],
          },
        ],
      },
    ],
    cut: [
      { entryId: "c1", reason: "SENTINEL_CUT_ONE" },
      { entryId: "c2", reason: "SENTINEL_CUT_TWO" },
    ],
  };
}

// Same shape at every item count — only the number of experience bullets
// grows (fit.test.ts's pattern) — so the density ladder is REAL, not vacuous:
// 24 items pushes strict/classic/compact/banner from 2 pages at comfortable
// down to 1 at compact (calibrated empirically against this exact fixture).
function growingResumeFixture(itemCount: number): TailoredResume {
  const filler =
    "Shipped and scaled backend systems handling millions of requests per day reliably.";
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "A track record of shipping backend systems at scale across multiple companies.",
    sections: [
      {
        section: "experience",
        groups: [
          {
            heading: "Acme · Engineer · 2020-2023",
            items: Array.from({ length: itemCount }, (_, i) => ({
              entryId: `e${i}`,
              text: `ITEM_${i} ${filler}`,
            })),
          },
        ],
      },
    ],
    cut: [],
  };
}

const ORDERED_MARKERS = [
  "PROJECT_ITEM_ONE",
  "PROJECT_ITEM_TWO",
  "EXPERIENCE_ITEM_ONE",
  "EXPERIENCE_ITEM_TWO",
];
const SENTINELS = [
  "SENTINEL_RATIONALE_PROJECT",
  "SENTINEL_RATIONALE_EXPERIENCE",
  "SENTINEL_CUT_ONE",
  "SENTINEL_CUT_TWO",
];

type TextGeometry = { str: string; x: number; y: number; width: number };

async function page1Geometry(
  buffer: Buffer,
): Promise<{ items: TextGeometry[]; pageWidth: number }> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const pageWidth = page.view[2] - page.view[0];
  const items = content.items
    .filter(
      (item): item is typeof item & { str: string; transform: number[]; width: number } =>
        "str" in item,
    )
    .map((item) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
    }));
  return { items, pageWidth };
}

// setFillRGBColor's single arg IS the hex string in this pdf.js build (no
// float-triplet decoding needed) — verified against a real render at
// authoring time.
async function page1FillColors(buffer: Buffer): Promise<string[]> {
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(1);
  const opList = await page.getOperatorList();
  const fills: string[] = [];
  for (let i = 0; i < opList.fnArray.length; i++) {
    if (opList.fnArray[i] === OPS.setFillRGBColor) fills.push(opList.argsArray[i][0]);
  }
  return fills;
}

// Mirrors engine/document.tsx's contrastInk — ported again, assertion-only,
// so this test doesn't need to import a private helper.
function expectedInk(hex: string): string {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}

describe.each(
  SINGLE_COLUMN_PRESET_IDS,
)("%s preset — extraction (through the engine)", (presetId) => {
  it("contains profile header + every item.text in exact content order; leadRationale/cut absent", async () => {
    const profile = profileFixture();
    const buffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile,
      paper: "letter",
      format: PRESETS[presetId],
    });
    const text = (await extractPdfText(buffer)).join(" ");

    expect(text).toContain(profile.name);
    expect(text).toContain(profile.email);
    expect(text).toContain("SUMMARY_TEXT");

    let lastIdx = -1;
    for (const marker of ORDERED_MARKERS) {
      const idx = text.indexOf(marker);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }

    for (const sentinel of SENTINELS) {
      expect(text).not.toContain(sentinel);
    }
  });
});

describe("GEOMETRY CONTRASTS — through the engine, not six templates", () => {
  it("classic-preset name mean-x ≈ page center; strict-preset name is left-anchored", async () => {
    const profile = profileFixture();
    const strictBuffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile,
      paper: "letter",
      format: PRESETS.strict,
    });
    const classicBuffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile,
      paper: "letter",
      format: PRESETS.classic,
    });

    const strict = await page1Geometry(strictBuffer);
    const classic = await page1Geometry(classicBuffer);
    const strictName = strict.items.find((item) => item.str === profile.name);
    const classicName = classic.items.find((item) => item.str === profile.name);
    if (!strictName || !classicName) throw new Error("profile name text item not found");

    const strictMeanX = strictName.x + strictName.width / 2;
    const classicMeanX = classicName.x + classicName.width / 2;
    const midline = strict.pageWidth / 2;
    const tolerance = strict.pageWidth * 0.15;

    expect(strictMeanX).toBeLessThan(strict.pageWidth / 3);
    expect(Math.abs(classicMeanX - midline)).toBeLessThanOrEqual(tolerance);
  });

  it("compact-preset name and first contact fragment share a header line; strict's do not", async () => {
    const profile = profileFixture();
    const LINE_HEIGHT_GAP_PT = 10;

    const strictBuffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile,
      paper: "letter",
      format: PRESETS.strict,
    });
    const strictGeo = await page1Geometry(strictBuffer);
    const strictName = strictGeo.items.find((item) => item.str === profile.name);
    const strictEmail = strictGeo.items.find((item) => item.str === profile.email);
    if (!strictName || !strictEmail) throw new Error("header text items not found");
    expect(Math.abs(strictName.y - strictEmail.y)).toBeGreaterThan(LINE_HEIGHT_GAP_PT);

    const compactBuffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile,
      paper: "letter",
      format: PRESETS.compact,
    });
    const compactGeo = await page1Geometry(compactBuffer);
    const compactName = compactGeo.items.find((item) => item.str === profile.name);
    const compactEmail = compactGeo.items.find((item) => item.str === profile.email);
    if (!compactName || !compactEmail) throw new Error("header text items not found");
    expect(Math.abs(compactName.y - compactEmail.y)).toBeLessThanOrEqual(LINE_HEIGHT_GAP_PT);
  });

  it("banner-preset render paints a header band with the format's accent + auto-contrast ink", async () => {
    const format = PRESETS.banner;
    const buffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile: profileFixture(),
      paper: "letter",
      format,
    });
    const fills = await page1FillColors(buffer);
    expect(fills).toContain(format.colors.accent);
    expect(fills).toContain(expectedInk(format.colors.accent));
  });
});

describe("NEVER-CUT across the density ladder — through the engine", () => {
  describe.each(SINGLE_COLUMN_PRESET_IDS)("%s preset", (presetId) => {
    it("item count is invariant at comfortable, standard, AND compact on a growing fixture", async () => {
      const profile = profileFixture();
      const resume = growingResumeFixture(24);
      const format = PRESETS[presetId];
      const expectedItems = resume.sections[0].groups[0].items.map((item) => item.text);

      for (const density of DENSITY_LADDER) {
        const buffer = await renderEngineToBuffer({
          resume,
          profile,
          paper: "letter",
          format,
          density,
        });
        const text = (await extractPdfText(buffer)).join(" ");
        for (const marker of expectedItems) {
          expect(text).toContain(marker);
        }
      }
    });
  });

  it("density is REAL, not vacuous: fitEngineToPages resolves 'compact' for the large fixture, and compact page count < comfortable page count (strict preset)", async () => {
    const profile = profileFixture();
    const format = PRESETS.strict;
    const large = growingResumeFixture(24);

    const result = await fitEngineToPages({
      resume: large,
      profile,
      paper: "letter",
      format,
      targetPages: 1,
    });
    expect(result.density).toBe("compact");
    expect(result.fits).toBe(true);

    const comfortableBuffer = await renderEngineToBuffer({
      resume: large,
      profile,
      paper: "letter",
      format,
      density: "comfortable",
    });
    const compactBuffer = await renderEngineToBuffer({
      resume: large,
      profile,
      paper: "letter",
      format,
      density: "compact",
    });
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const comfortablePages = (
      await getDocument({ data: new Uint8Array(comfortableBuffer) }).promise
    ).numPages;
    const compactPages = (await getDocument({ data: new Uint8Array(compactBuffer) }).promise)
      .numPages;
    expect(compactPages).toBeLessThan(comfortablePages);
  });
});

describe("OFF-DIAGONAL composition — a combination none of the six retired templates produced", () => {
  it("strict preset with ONLY colors.area flipped to 'header': band paint present, name still left-anchored, extraction order still index-increasing", async () => {
    const profile = profileFixture();
    const format: DocumentFormatV2 = {
      ...PRESETS.strict,
      colors: { ...PRESETS.strict.colors, area: "header" },
    };
    const buffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile,
      paper: "letter",
      format,
    });

    const fills = await page1FillColors(buffer);
    expect(fills).toContain(format.colors.accent);
    expect(fills).toContain(expectedInk(format.colors.accent));

    const geo = await page1Geometry(buffer);
    const name = geo.items.find((item) => item.str === profile.name);
    if (!name) throw new Error("profile name text item not found");
    const meanX = name.x + name.width / 2;
    expect(meanX).toBeLessThan(geo.pageWidth / 3);

    const text = (await extractPdfText(buffer)).join(" ");
    let lastIdx = -1;
    for (const marker of ORDERED_MARKERS) {
      const idx = text.indexOf(marker);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });
});

describe("presets.ts (§31.1: retired templates reborn as presets, not hand-authored forks)", () => {
  it("six configs exist", () => {
    expect([...PRESET_IDS].sort()).toEqual(
      ["banner", "classic", "compact", "sidebar-left", "sidebar-right", "strict"].sort(),
    );
    expect(Object.keys(PRESETS).sort()).toEqual([...PRESET_IDS].sort());
  });

  it.each(PRESET_IDS)("%s deep-equals { ...migrateFormat(its v1 default), presetId }", (id) => {
    const v1Default = { ...DEFAULT_FORMAT, templateId: id };
    const expected = { ...migrateFormat(v1Default), presetId: id };
    expect(PRESETS[id]).toEqual(expected);
  });

  it("carries no render functions — every preset value is JSON-serializable data", () => {
    for (const id of PRESET_IDS) {
      const preset = PRESETS[id];
      expect(() => JSON.stringify(preset)).not.toThrow();
      expect(JSON.parse(JSON.stringify(preset))).toEqual(preset);
    }
  });
});

// §31.2: "a build that ships a subset of an axis's values is incomplete" —
// this proves every value at least renders, never that it's visually wired
// (engine/document.tsx's entry comment states which axes are/aren't wired
// this ticket).
type AxisCase = {
  name: string;
  values: readonly unknown[];
  apply: (v: unknown) => DocumentFormatV2;
};

const AXIS_CASES: AxisCase[] = [
  {
    name: "document.pageFormat",
    values: ["a4", "letter"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      document: { ...DEFAULT_FORMAT_V2.document, pageFormat: v as never },
    }),
  },
  {
    name: "document.dateFormat",
    values: DATE_FORMATS,
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      document: { ...DEFAULT_FORMAT_V2.document, dateFormat: v as never },
    }),
  },
  {
    name: "layout.columns",
    values: ["one", "two", "mix"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      layout: { ...DEFAULT_FORMAT_V2.layout, columns: v as never },
    }),
  },
  {
    name: "layout.headerPosition",
    values: ["top", "left", "right"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      layout: { ...DEFAULT_FORMAT_V2.layout, headerPosition: v as never },
    }),
  },
  {
    name: "entries.structure",
    values: ["full-width", "columns"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      entries: { ...DEFAULT_FORMAT_V2.entries, structure: v as never },
    }),
  },
  {
    name: "entries.dateLocationPlacement",
    values: ["right", "left", "split"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      entries: { ...DEFAULT_FORMAT_V2.entries, dateLocationPlacement: v as never },
    }),
  },
  {
    name: "entries.dateLocationOrder",
    values: ["date-first", "location-first"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      entries: { ...DEFAULT_FORMAT_V2.entries, dateLocationOrder: v as never },
    }),
  },
  {
    name: "entries.subtitlePlacement",
    values: ["same-line", "below"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      entries: { ...DEFAULT_FORMAT_V2.entries, subtitlePlacement: v as never },
    }),
  },
  {
    name: "entries.listStyle",
    values: ["bullet", "hyphen"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      entries: { ...DEFAULT_FORMAT_V2.entries, listStyle: v as never },
    }),
  },
  {
    name: "entries.subtitleFontStyle",
    values: ["normal", "bold", "italic"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      entries: { ...DEFAULT_FORMAT_V2.entries, subtitleFontStyle: v as never },
    }),
  },
  {
    name: "headings.style",
    values: HEADING_STYLES,
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      headings: { ...DEFAULT_FORMAT_V2.headings, style: v as never },
    }),
  },
  {
    name: "headings.capitalization",
    values: ["capitalize", "uppercase"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      headings: { ...DEFAULT_FORMAT_V2.headings, capitalization: v as never },
    }),
  },
  {
    name: "headings.icons",
    values: ["none", "outline", "filled"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      headings: { ...DEFAULT_FORMAT_V2.headings, icons: v as never },
    }),
  },
  {
    name: "fonts.body",
    values: BODY_FONT_IDS,
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      fonts: { ...DEFAULT_FORMAT_V2.fonts, body: v as never },
    }),
  },
  {
    name: "fonts.name",
    values: ["same-as-body", ...NAME_DISPLAY_FONT_IDS],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      fonts: { ...DEFAULT_FORMAT_V2.fonts, name: v as never },
    }),
  },
  {
    name: "colors.area",
    values: ["full-page", "header", "border"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      colors: { ...DEFAULT_FORMAT_V2.colors, area: v as never },
    }),
  },
  {
    name: "colors.mode",
    values: ["single", "multi"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      colors: { ...DEFAULT_FORMAT_V2.colors, mode: v as never },
    }),
  },
  {
    name: "colors.border.size",
    values: ["s", "m", "l"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      colors: {
        ...DEFAULT_FORMAT_V2.colors,
        border: { ...DEFAULT_FORMAT_V2.colors.border, size: v as never },
      },
    }),
  },
  {
    name: "header.alignment",
    values: ["left", "center"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      header: { ...DEFAULT_FORMAT_V2.header, alignment: v as never },
    }),
  },
  {
    name: "header.detailsArrangement",
    values: ["stacked", "single-row", "wrapped"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      header: { ...DEFAULT_FORMAT_V2.header, detailsArrangement: v as never },
    }),
  },
  {
    name: "header.separator",
    values: ["icon", "bullet", "bar"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      header: { ...DEFAULT_FORMAT_V2.header, separator: v as never },
    }),
  },
  {
    name: "header.contactIconStyle",
    values: CONTACT_ICON_STYLES,
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      header: { ...DEFAULT_FORMAT_V2.header, contactIconStyle: v as never },
    }),
  },
  {
    name: "header.nameWeight",
    values: ["normal", "bold"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      header: { ...DEFAULT_FORMAT_V2.header, nameWeight: v as never },
    }),
  },
  {
    name: "header.titlePosition",
    values: ["same-line", "below"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      header: { ...DEFAULT_FORMAT_V2.header, titlePosition: v as never },
    }),
  },
  {
    name: "photo.shape",
    values: ["circle", "rounded", "square"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      photo: { ...DEFAULT_FORMAT_V2.photo, shape: v as never },
    }),
  },
  {
    name: "sectionDisplay.skillsLanguages.layout",
    values: ["grid", "rows", "compact", "bubble", "level"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      sectionDisplay: {
        ...DEFAULT_FORMAT_V2.sectionDisplay,
        skillsLanguages: {
          ...DEFAULT_FORMAT_V2.sectionDisplay.skillsLanguages,
          layout: v as never,
        },
      },
    }),
  },
  {
    name: "sectionDisplay.skillsLanguages.levelDisplay",
    values: ["text", "dots", "bar"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      sectionDisplay: {
        ...DEFAULT_FORMAT_V2.sectionDisplay,
        skillsLanguages: {
          ...DEFAULT_FORMAT_V2.sectionDisplay.skillsLanguages,
          levelDisplay: v as never,
        },
      },
    }),
  },
  {
    name: "sectionDisplay.interests.layout",
    values: ["grid", "rows", "compact", "bubble"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      sectionDisplay: {
        ...DEFAULT_FORMAT_V2.sectionDisplay,
        interests: { ...DEFAULT_FORMAT_V2.sectionDisplay.interests, layout: v as never },
      },
    }),
  },
  {
    name: "sectionDisplay.experience.order",
    values: ["title-first", "employer-first"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      sectionDisplay: {
        ...DEFAULT_FORMAT_V2.sectionDisplay,
        experience: { ...DEFAULT_FORMAT_V2.sectionDisplay.experience, order: v as never },
      },
    }),
  },
  {
    name: "sectionDisplay.education.order",
    values: ["degree-first", "school-first"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      sectionDisplay: {
        ...DEFAULT_FORMAT_V2.sectionDisplay,
        education: { ...DEFAULT_FORMAT_V2.sectionDisplay.education, order: v as never },
      },
    }),
  },
];

describe.each(AXIS_CASES)("unhandled-axis smoke — $name", ({ apply, values }) => {
  it("every value renders a nonempty PDF buffer over DEFAULT_FORMAT_V2 without throwing", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();
    for (const value of values) {
      const format = apply(value);
      const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});
