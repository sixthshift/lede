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
  type AccentPlacementV2,
  type DocumentFormatV2,
  type HeaderV2,
  type HeadingsV2,
  type LinksV2,
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
// Letter page dimensions in points (test/engine-two-column.test.ts's own
// copy of the same physical width constant) — paper is pinned to "letter"
// throughout this file's renderEngineToBuffer calls.
const LETTER_WIDTH_PT = 612;
const LETTER_HEIGHT_PT = 792;

// `fontSize` is item.transform[0] — for this engine's unrotated horizontal
// text, pdf.js's text-content transform matrix is exactly
// [fontSizePt, 0, 0, fontSizePt, x, y] (verified against a real render at
// authoring time: a Text styled fontSize:14 extracts transform[0] === 14),
// so it's the rendered point size itself, not a derived proxy. `fontName` is
// pdf.js's own internal resource name for the embedded font program a run
// used — fonts.ts (E9-F2a) registers a SEPARATE font program per weight for
// every family, so two runs in the SAME family but different fontWeight
// resolve to different embedded programs and therefore different fontNames
// (E9-F3c's titleWeight-independence test below uses this to prove the
// title's weight changed without the name's).
type TextGeometry = {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontName: string;
};

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
      (
        item,
      ): item is typeof item & {
        str: string;
        transform: number[];
        width: number;
        fontName: string;
      } => "str" in item,
    )
    .map((item) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      fontSize: item.transform[0],
      fontName: item.fontName,
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

// A View's `borderColor` (no `backgroundColor`) paints via a STROKE, not a
// fill — @react-pdf/render's border path calls ctx.strokeColor, never
// ctx.fillColor (verified in @react-pdf/render/lib/index.js at authoring
// time) — so an outline-only element class (e.g. linkIcon, border-only
// contact-icon shapes) needs this sibling extractor; page1FillColors alone
// would never see it.
async function page1StrokeColors(buffer: Buffer): Promise<string[]> {
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(1);
  const opList = await page.getOperatorList();
  const strokes: string[] = [];
  for (let i = 0; i < opList.fnArray.length; i++) {
    if (opList.fnArray[i] === OPS.setStrokeRGBColor) strokes.push(opList.argsArray[i][0]);
  }
  return strokes;
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

describe("colors.area 'full-page' + colors.mode — generalized auto-contrast ink (E9-F3a)", () => {
  const DARK_BACKGROUND = "#0f172a"; // DesignPanel's own curated swatch set

  it("mode 'multi': a dark full-page background paints the page AND flips ink document-wide; extraction text/order untouched", async () => {
    const profile = profileFixture();
    const format: DocumentFormatV2 = {
      ...PRESETS.strict,
      colors: {
        ...PRESETS.strict.colors,
        area: "full-page",
        mode: "multi",
        background: DARK_BACKGROUND,
      },
    };
    const buffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile,
      paper: "letter",
      format,
    });

    const fills = await page1FillColors(buffer);
    expect(fills).toContain(DARK_BACKGROUND);
    expect(expectedInk(DARK_BACKGROUND)).toBe("#ffffff");
    expect(fills).toContain(expectedInk(DARK_BACKGROUND));

    // colors paint only — content/order stays exactly what the un-colored
    // strict preset produces.
    const text = (await extractPdfText(buffer)).join(" ");
    expect(text).toContain(profile.name);
    let lastIdx = -1;
    for (const marker of ORDERED_MARKERS) {
      const idx = text.indexOf(marker);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it("mode 'single': the page stays WHITE even with a dark colors.background set — a painted page background is a multi-mode-only feature (spec.md:1014,:1093 'single mode over white')", async () => {
    const profile = profileFixture();
    const format: DocumentFormatV2 = {
      ...PRESETS.strict,
      colors: {
        ...PRESETS.strict.colors,
        area: "full-page",
        mode: "single",
        background: DARK_BACKGROUND,
      },
    };
    const buffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile,
      paper: "letter",
      format,
    });

    // The authored dark background is NOT painted, and its would-be contrast
    // ink is NOT applied — single mode is accent over black-on-white.
    const fills = await page1FillColors(buffer);
    expect(fills).not.toContain(DARK_BACKGROUND);
    expect(fills).not.toContain(expectedInk(DARK_BACKGROUND));
    expect(fills).toContain(format.colors.text);
  });
});

// page1FillColors (above) only reports WHICH colors got filled, not the
// filled rects' geometry — border needs geometry too (size changes a rect's
// thickness, not its color). Same op-stream read, one more field kept: the
// bounding box (pdf.js's constructPath argsArray[2], already exercised by
// page1Geometry's transform reads above) of every rect immediately preceded
// by a setFillRGBColor matching `hexColor`.
async function page1FillRects(
  buffer: Buffer,
  hexColor: string,
): Promise<Array<{ minX: number; minY: number; maxX: number; maxY: number }>> {
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(1);
  const opList = await page.getOperatorList();
  const rects: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];
  let currentFill: string | null = null;
  for (let i = 0; i < opList.fnArray.length; i++) {
    if (opList.fnArray[i] === OPS.setFillRGBColor) currentFill = opList.argsArray[i][0];
    if (opList.fnArray[i] === OPS.constructPath && currentFill === hexColor) {
      const [minX, minY, maxX, maxY] = opList.argsArray[i][2];
      rects.push({ minX, minY, maxX, maxY });
      currentFill = null; // one rect consumes one fill color; don't double-count the next path
    }
  }
  return rects;
}

// colors.accent already tints OTHER same-colored fills sections.tsx draws
// (heading underlines/rules/accent bars, §31.2 headings.*) — none of those
// span a full page edge, so filtering page1FillRects down to rects that span
// (nearly) the ENTIRE page width or height isolates the page-frame rects
// specifically, independent of whatever heading/accent decoration a given
// preset/format also happens to paint in the same color.
function isFrameRect(rect: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  const spansWidth = rect.minX <= 1 && rect.maxX >= LETTER_WIDTH_PT - 1;
  const spansHeight = rect.minY <= 1 && rect.maxY >= LETTER_HEIGHT_PT - 1;
  return spansWidth || spansHeight;
}

async function page1BorderFrameRects(buffer: Buffer, hexColor: string) {
  return (await page1FillRects(buffer, hexColor)).filter(isFrameRect);
}

describe("colors.border — page frame (E9-F3b, §31.2)", () => {
  const NO_BORDER = {
    size: "s" as const,
    sides: { top: false, right: false, bottom: false, left: false },
  };

  it("no side enabled: no accent-colored rect is painted", async () => {
    const profile = profileFixture();
    const format: DocumentFormatV2 = {
      ...PRESETS.strict,
      colors: { ...PRESETS.strict.colors, border: NO_BORDER },
    };
    const buffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile,
      paper: "letter",
      format,
    });
    const rects = await page1BorderFrameRects(buffer, format.colors.accent);
    expect(rects).toHaveLength(0);
  });

  it("top side enabled: exactly one full-width accent rect pinned to the page's top edge", async () => {
    const profile = profileFixture();
    const format: DocumentFormatV2 = {
      ...PRESETS.strict,
      colors: {
        ...PRESETS.strict.colors,
        border: { size: "s", sides: { top: true, right: false, bottom: false, left: false } },
      },
    };
    const buffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile,
      paper: "letter",
      format,
    });
    const rects = await page1BorderFrameRects(buffer, format.colors.accent);
    expect(rects).toHaveLength(1);
    expect(rects[0].minX).toBe(0);
    expect(rects[0].minY).toBe(0);
    expect(rects[0].maxX).toBeCloseTo(LETTER_WIDTH_PT, 0);
  });

  it("adding a side changes the measured fill count: 1 side -> 2 sides -> 4 sides", async () => {
    const profile = profileFixture();
    const bufferFor = async (sides: {
      top: boolean;
      right: boolean;
      bottom: boolean;
      left: boolean;
    }) => {
      const format: DocumentFormatV2 = {
        ...PRESETS.strict,
        colors: { ...PRESETS.strict.colors, border: { size: "m", sides } },
      };
      return {
        format,
        buffer: await renderEngineToBuffer({
          resume: resumeFixture(),
          profile,
          paper: "letter",
          format,
        }),
      };
    };
    const one = await bufferFor({ top: true, right: false, bottom: false, left: false });
    const two = await bufferFor({ top: true, right: false, bottom: false, left: true });
    const four = await bufferFor({ top: true, right: true, bottom: true, left: true });

    expect((await page1BorderFrameRects(one.buffer, one.format.colors.accent)).length).toBe(1);
    expect((await page1BorderFrameRects(two.buffer, two.format.colors.accent)).length).toBe(2);
    expect((await page1BorderFrameRects(four.buffer, four.format.colors.accent)).length).toBe(4);
  });

  it("size 's' vs 'l' (same single side): a wider size measurably thickens the rect", async () => {
    const profile = profileFixture();
    const sides = { top: true, right: false, bottom: false, left: false };
    const thin: DocumentFormatV2 = {
      ...PRESETS.strict,
      colors: { ...PRESETS.strict.colors, border: { size: "s", sides } },
    };
    const thick: DocumentFormatV2 = {
      ...PRESETS.strict,
      colors: { ...PRESETS.strict.colors, border: { size: "l", sides } },
    };
    const thinBuffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile,
      paper: "letter",
      format: thin,
    });
    const thickBuffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile,
      paper: "letter",
      format: thick,
    });
    const thinRect = (await page1BorderFrameRects(thinBuffer, thin.colors.accent))[0];
    const thickRect = (await page1BorderFrameRects(thickBuffer, thick.colors.accent))[0];
    const thinThickness = thinRect.maxY - thinRect.minY;
    const thickThickness = thickRect.maxY - thickRect.minY;
    expect(thickThickness).toBeGreaterThan(thinThickness);
  });

  // [v3-038] (intake decision, ledger): border was PROMOTED to ATS-neutral
  // because a frame this shape (no Text content) leaves extraction order
  // intact. THE promoted-row test: a full 4-side, max-size border must not
  // perturb pdf.js text extraction relative to the no-border render — same
  // markers, same index-increasing order, same absent sentinels.
  it("EXTRACTION-ORDER INVARIANT: full 4-side max-size ('l') border is index-increasing and content-identical to the no-border render", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();
    const noBorderFormat: DocumentFormatV2 = {
      ...PRESETS.strict,
      colors: { ...PRESETS.strict.colors, border: NO_BORDER },
    };
    const borderedFormat: DocumentFormatV2 = {
      ...PRESETS.strict,
      colors: {
        ...PRESETS.strict.colors,
        border: { size: "l", sides: { top: true, right: true, bottom: true, left: true } },
      },
    };

    const noBorderBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: noBorderFormat,
    });
    const borderedBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: borderedFormat,
    });

    const noBorderText = (await extractPdfText(noBorderBuffer)).join(" ");
    const borderedText = (await extractPdfText(borderedBuffer)).join(" ");

    // content-identical
    expect(borderedText).toBe(noBorderText);

    // index-increasing, both renders
    for (const text of [noBorderText, borderedText]) {
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
    }

    // the border rects themselves are present in the bordered render (i.e.
    // this is genuinely a 4-side render, not a no-op)
    const rects = await page1BorderFrameRects(borderedBuffer, borderedFormat.colors.accent);
    expect(rects).toHaveLength(4);
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
    name: "header.titleWeight",
    values: ["normal", "bold"],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      header: { ...DEFAULT_FORMAT_V2.header, titleWeight: v as never },
    }),
  },
  {
    name: "links.underline",
    values: [false, true],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      links: { ...DEFAULT_FORMAT_V2.links, underline: v as never },
    }),
  },
  {
    name: "links.accentColor",
    values: [false, true],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      links: { ...DEFAULT_FORMAT_V2.links, accentColor: v as never },
    }),
  },
  {
    name: "links.icon",
    values: [false, true],
    apply: (v) => ({
      ...DEFAULT_FORMAT_V2,
      links: { ...DEFAULT_FORMAT_V2.links, icon: v as never },
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

// E9-F2b: typeScale's 4 offsets (§31.2) are now wired (legacyAdapt.ts's
// typeScaleSizes, consumed by sections.tsx's buildStyles) — each must render
// a MEASURABLY LARGER font size (not just different bytes) at its bounds'
// high end than its low end. `marker` is the exact rendered string whose
// extracted `fontSize` (page1Geometry's transform[0], the real pt size —
// see its own comment) the offset controls.
type TypeScaleCase = {
  axis: "nameOffset" | "titleOffset" | "sectionHeadingOffset" | "entryHeaderOffset";
  min: number;
  max: number;
  marker: string;
};

const TYPE_SCALE_CASES: TypeScaleCase[] = [
  { axis: "nameOffset", min: 4, max: 12, marker: "Jordan Rivera" },
  // profile.headline — previously never rendered in the PDF at all
  // (format-v2.ts's baseFromV1 comment: "no distinct 'title' text rendered
  // today"); this ticket gives it ProfileHeader's new `title` render seam.
  { axis: "titleOffset", min: 0, max: 4, marker: "SENTINEL_HEADLINE" },
  // sections.tsx's sectionLabel renders with textTransform:'uppercase' baked
  // into the extracted text itself (verified at authoring time), so the
  // marker is the section's SCREAMING-CASE label (@shared/sections.ts).
  { axis: "sectionHeadingOffset", min: 0, max: 3, marker: "PROJECTS" },
  { axis: "entryHeaderOffset", min: 0, max: 2, marker: "cloudcase-platform-sdk" },
];

describe("typeScale offsets — measurable size increase (E9-F2b, §31.2)", () => {
  it.each(
    TYPE_SCALE_CASES,
  )("$axis: max bound renders a strictly larger $marker than min bound", async ({
    axis,
    min,
    max,
    marker,
  }) => {
    const profile: Profile = { ...profileFixture(), headline: "SENTINEL_HEADLINE" };
    const resume = resumeFixture();
    const lowFormat: DocumentFormatV2 = {
      ...DEFAULT_FORMAT_V2,
      typeScale: { ...DEFAULT_FORMAT_V2.typeScale, [axis]: min },
    };
    const highFormat: DocumentFormatV2 = {
      ...DEFAULT_FORMAT_V2,
      typeScale: { ...DEFAULT_FORMAT_V2.typeScale, [axis]: max },
    };

    const lowBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: lowFormat,
    });
    const highBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: highFormat,
    });
    expect(Buffer.compare(lowBuffer, highBuffer)).not.toBe(0);

    const lowSize = (await page1Geometry(lowBuffer)).items.find((item) =>
      item.str.includes(marker),
    )?.fontSize;
    const highSize = (await page1Geometry(highBuffer)).items.find((item) =>
      item.str.includes(marker),
    )?.fontSize;
    expect(lowSize).toBeDefined();
    expect(highSize).toBeDefined();
    expect(highSize as number).toBeGreaterThan(lowSize as number);

    // matches the ticket's exact contract: role size = bodySize + offset.
    const bodySize = DEFAULT_FORMAT_V2.typeScale.bodySize;
    expect(lowSize).toBeCloseTo(bodySize + min, 5);
    expect(highSize).toBeCloseTo(bodySize + max, 5);
  });
});

// E9-F2b: spacing's axes (lineHeight, elementSpacing, marginsMm.{x,y}) were
// already wired (legacyAdapt.ts:69,72-81) before this ticket — this only
// ADDS the distinctness/geometry proof the ticket calls for, same oracle as
// the typeScale cases above (real measured geometry, not just distinct
// bytes).
describe("spacing axes — measurable geometry change (E9-F2b, §31.2)", () => {
  it("lineHeight: a taller line height increases the y-gap between two wrapped summary lines", async () => {
    const profile = profileFixture();
    // Long enough, at DEFAULT_FORMAT_V2's page width/body size, to wrap onto
    // (at least) two lines regardless of lineHeight — lineHeight changes the
    // gap BETWEEN lines, never the wrap point itself.
    const resume: TailoredResume = {
      ...resumeFixture(),
      summary:
        "A very long summary sentence written specifically so that it wraps across multiple lines on the page regardless of the exact font metrics in play here today.",
    };
    const lowFormat: DocumentFormatV2 = {
      ...DEFAULT_FORMAT_V2,
      spacing: { ...DEFAULT_FORMAT_V2.spacing, lineHeight: 1.15 },
    };
    const highFormat: DocumentFormatV2 = {
      ...DEFAULT_FORMAT_V2,
      spacing: { ...DEFAULT_FORMAT_V2.spacing, lineHeight: 1.5 },
    };

    async function summaryLineGap(format: DocumentFormatV2): Promise<number> {
      const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
      const { items } = await page1Geometry(buffer);
      // Each wrapped line of the summary is its own text-content item (one
      // run of unstyled Text per visual line) — anchor on each line's own
      // substring rather than "top 2 y's on the page" (which would just as
      // easily pick up the name/contact-line rows above the summary).
      const line1 = items.find((item) => item.str.includes("wraps across multiple lines"));
      const line2 = items.find((item) => item.str.includes("font metrics in play here today"));
      expect(line1).toBeDefined();
      expect(line2).toBeDefined();
      return (line1 as TextGeometry).y - (line2 as TextGeometry).y;
    }

    const lowGap = await summaryLineGap(lowFormat);
    const highGap = await summaryLineGap(highFormat);
    expect(highGap).toBeGreaterThan(lowGap);
  });

  it("elementSpacing: a wider section gap pushes the first section label further down the page", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();

    async function firstSectionLabelY(elementSpacing: number): Promise<number> {
      const format: DocumentFormatV2 = {
        ...DEFAULT_FORMAT_V2,
        spacing: { ...DEFAULT_FORMAT_V2.spacing, elementSpacing },
      };
      const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
      const { items } = await page1Geometry(buffer);
      const label = items.find((item) => item.str === "PROJECTS");
      expect(label).toBeDefined();
      return (label as TextGeometry).y;
    }

    const lowY = await firstSectionLabelY(0);
    const highY = await firstSectionLabelY(4);
    // pdf y grows upward from the page bottom — pushed further DOWN the
    // page means a SMALLER y.
    expect(highY).toBeLessThan(lowY);
  });

  it("marginsMm.x: a wider side margin shifts the name's x-offset to the right", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();

    async function nameX(x: number): Promise<number> {
      const format: DocumentFormatV2 = {
        ...DEFAULT_FORMAT_V2,
        spacing: {
          ...DEFAULT_FORMAT_V2.spacing,
          marginsMm: { ...DEFAULT_FORMAT_V2.spacing.marginsMm, x },
        },
      };
      const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
      const { items } = await page1Geometry(buffer);
      const name = items.find((item) => item.str === "Jordan Rivera");
      expect(name).toBeDefined();
      return (name as TextGeometry).x;
    }

    const narrowX = await nameX(10);
    const wideX = await nameX(28);
    expect(wideX).toBeGreaterThan(narrowX);
  });

  it("marginsMm.y: a taller top margin shifts the name further down the page (smaller y)", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();

    async function nameY(y: number): Promise<number> {
      const format: DocumentFormatV2 = {
        ...DEFAULT_FORMAT_V2,
        spacing: {
          ...DEFAULT_FORMAT_V2.spacing,
          marginsMm: { ...DEFAULT_FORMAT_V2.spacing.marginsMm, y },
        },
      };
      const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
      const { items } = await page1Geometry(buffer);
      const name = items.find((item) => item.str === "Jordan Rivera");
      expect(name).toBeDefined();
      return (name as TextGeometry).y;
    }

    const shortY = await nameY(10);
    const tallY = await nameY(28);
    expect(tallY).toBeLessThan(shortY);
  });
});

// E9-F3c: header.{detailsArrangement,separator,contactIconStyle,
// titlePosition,titleWeight} + links.{underline,accentColor,icon} — real
// geometry/byte proofs, same oracle as the axis groups above (the
// unhandled-axis smoke test only proves these render without throwing).
describe("header — detailsArrangement/separator/contactIconStyle (E9-F3c, §31.2)", () => {
  it("detailsArrangement: 'wrapped' drops the links row below the contact-fields row; 'stacked'/'single-row' share one row", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();

    async function contactAndLinkY(detailsArrangement: "stacked" | "single-row" | "wrapped") {
      const format: DocumentFormatV2 = {
        ...DEFAULT_FORMAT_V2,
        header: { ...DEFAULT_FORMAT_V2.header, detailsArrangement },
      };
      const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
      const { items } = await page1Geometry(buffer);
      const email = items.find((item) => item.str.includes(profile.email as string));
      const link = items.find((item) => item.str.includes(profile.links[0].label));
      expect(email).toBeDefined();
      expect(link).toBeDefined();
      return { emailY: (email as TextGeometry).y, linkY: (link as TextGeometry).y };
    }

    const stacked = await contactAndLinkY("stacked");
    const singleRow = await contactAndLinkY("single-row");
    const wrapped = await contactAndLinkY("wrapped");

    expect(stacked.emailY).toBeCloseTo(stacked.linkY, 5);
    expect(singleRow.emailY).toBeCloseTo(singleRow.linkY, 5);
    // pdf y grows upward from the page bottom — a link pushed to its OWN
    // line below the contact fields has a SMALLER y.
    expect(wrapped.linkY).toBeLessThan(wrapped.emailY);

    const stackedBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: {
        ...DEFAULT_FORMAT_V2,
        header: { ...DEFAULT_FORMAT_V2.header, detailsArrangement: "stacked" },
      },
    });
    const singleRowBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: {
        ...DEFAULT_FORMAT_V2,
        header: { ...DEFAULT_FORMAT_V2.header, detailsArrangement: "single-row" },
      },
    });
    const wrappedBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: {
        ...DEFAULT_FORMAT_V2,
        header: { ...DEFAULT_FORMAT_V2.header, detailsArrangement: "wrapped" },
      },
    });
    expect(Buffer.compare(stackedBuffer, singleRowBuffer)).not.toBe(0);
    expect(Buffer.compare(stackedBuffer, wrappedBuffer)).not.toBe(0);
    expect(Buffer.compare(singleRowBuffer, wrappedBuffer)).not.toBe(0);
  });

  it("separator: bullet/bar/icon are pairwise-distinct bytes, and bullet/bar's own glyph shows up in extraction text", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();

    async function render(separator: "icon" | "bullet" | "bar") {
      const format: DocumentFormatV2 = {
        ...DEFAULT_FORMAT_V2,
        header: { ...DEFAULT_FORMAT_V2.header, separator },
      };
      return renderEngineToBuffer({ resume, profile, paper: "letter", format });
    }

    const bulletBuffer = await render("bullet");
    const barBuffer = await render("bar");
    const iconBuffer = await render("icon");

    expect(Buffer.compare(bulletBuffer, barBuffer)).not.toBe(0);
    expect(Buffer.compare(bulletBuffer, iconBuffer)).not.toBe(0);
    expect(Buffer.compare(barBuffer, iconBuffer)).not.toBe(0);

    // "•" also shows up regardless of header.separator — it's
    // entries.listStyle's default bullet glyph on every item, a DIFFERENT
    // element class (sections.tsx's BULLET_GLYPHS) — so bullet-vs-icon is
    // proven on "|" alone (bar's own glyph, never used elsewhere on this
    // page) rather than "•".
    const barText = (await extractPdfText(barBuffer)).join(" ");
    const iconText = (await extractPdfText(iconBuffer)).join(" ");
    expect(barText).toContain("|");
    expect(iconText).not.toContain("|");
  });

  it("contactIconStyle: all 7 values (incl. 'none-frame') are pairwise-distinct bytes", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();
    const buffers = await Promise.all(
      CONTACT_ICON_STYLES.map((contactIconStyle) => {
        const format: DocumentFormatV2 = {
          ...DEFAULT_FORMAT_V2,
          header: { ...DEFAULT_FORMAT_V2.header, contactIconStyle },
        };
        return renderEngineToBuffer({ resume, profile, paper: "letter", format });
      }),
    );
    for (let i = 0; i < buffers.length; i++) {
      for (let j = i + 1; j < buffers.length; j++) {
        expect(Buffer.compare(buffers[i], buffers[j])).not.toBe(0);
      }
    }
  });
});

describe("header — titlePosition/titleWeight (E9-F3c, §31.2)", () => {
  it("titlePosition: 'same-line' shares the name's row (title starts to its right); 'below' drops it to its own, lower line", async () => {
    const profile: Profile = { ...profileFixture(), headline: "SENTINEL_HEADLINE" };
    const resume = resumeFixture();

    async function nameAndTitleGeometry(titlePosition: "same-line" | "below") {
      const format: DocumentFormatV2 = {
        ...DEFAULT_FORMAT_V2,
        header: { ...DEFAULT_FORMAT_V2.header, titlePosition },
      };
      const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
      const { items } = await page1Geometry(buffer);
      const name = items.find((item) => item.str === "Jordan Rivera");
      const title = items.find((item) => item.str.includes("SENTINEL_HEADLINE"));
      expect(name).toBeDefined();
      expect(title).toBeDefined();
      return {
        nameY: (name as TextGeometry).y,
        titleY: (title as TextGeometry).y,
        nameX: (name as TextGeometry).x,
        titleX: (title as TextGeometry).x,
      };
    }

    const sameLine = await nameAndTitleGeometry("same-line");
    const below = await nameAndTitleGeometry("below");

    // Baseline-aligned same-size-neighbors would share an exact y, but name
    // and title render at DIFFERENT font sizes — react-pdf's `alignItems:
    // "baseline"` approximates the shared baseline off each run's own font
    // metrics, so the two y's land within a few points of each other
    // (verified against a real render at authoring time) rather than
    // exactly equal. That's still tiny next to 'below''s real, much larger
    // line-break gap (asserted below), so the two arrangements stay
    // unambiguously distinct.
    expect(Math.abs(sameLine.nameY - sameLine.titleY)).toBeLessThan(5);
    expect(sameLine.titleX).toBeGreaterThan(sameLine.nameX);
    // pdf y grows upward from the page bottom — the title's own, LOWER line
    // has a SMALLER y than the name's, by more than same-line's baseline
    // wiggle above.
    expect(below.nameY - below.titleY).toBeGreaterThan(5);
  });

  it("titleWeight: independent of nameWeight — the title's embedded font matches the name's only when both weights agree", async () => {
    const profile: Profile = { ...profileFixture(), headline: "SENTINEL_HEADLINE" };
    const resume = resumeFixture();

    // Comparing name/title fontName WITHIN one render (rather than across
    // two separate renders) — pdf.js's fontName is a per-document resource
    // key, not a stable identity across documents: embedding one extra bold
    // face (or not) shifts every later resource's key, so name's OWN
    // fontName can differ between two otherwise-identical documents even
    // though nameWeight never changed. Within a single document, though,
    // two runs share a fontName iff they resolved to the SAME embedded font
    // program — exactly what "independent of nameWeight" needs to prove.
    async function nameTitleFontsMatch(titleWeight: "normal" | "bold"): Promise<boolean> {
      const format: DocumentFormatV2 = {
        ...DEFAULT_FORMAT_V2,
        header: { ...DEFAULT_FORMAT_V2.header, nameWeight: "normal", titleWeight },
      };
      const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
      const { items } = await page1Geometry(buffer);
      const name = items.find((item) => item.str === "Jordan Rivera");
      const title = items.find((item) => item.str.includes("SENTINEL_HEADLINE"));
      expect(name).toBeDefined();
      expect(title).toBeDefined();
      return (name as TextGeometry).fontName === (title as TextGeometry).fontName;
    }

    // nameWeight pinned to 'normal' throughout: titleWeight 'normal' (same
    // weight as the name) shares the name's font program; titleWeight
    // 'bold' (independent of the still-'normal' nameWeight) does not.
    expect(await nameTitleFontsMatch("normal")).toBe(true);
    expect(await nameTitleFontsMatch("bold")).toBe(false);
  });

  it("titleWeight: changes the rendered bytes", async () => {
    const profile: Profile = { ...profileFixture(), headline: "SENTINEL_HEADLINE" };
    const resume = resumeFixture();

    async function render(titleWeight: "normal" | "bold") {
      const format: DocumentFormatV2 = {
        ...DEFAULT_FORMAT_V2,
        header: { ...DEFAULT_FORMAT_V2.header, titleWeight },
      };
      return renderEngineToBuffer({ resume, profile, paper: "letter", format });
    }

    const normalBuffer = await render("normal");
    const boldBuffer = await render("bold");
    expect(Buffer.compare(normalBuffer, boldBuffer)).not.toBe(0);
  });
});

describe("links — underline/accentColor/icon (E9-F3c, §31.2)", () => {
  it("underline: toggling changes bytes (a real textDecoration, not a no-op)", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();

    async function render(underline: boolean) {
      const format: DocumentFormatV2 = {
        ...DEFAULT_FORMAT_V2,
        links: { ...DEFAULT_FORMAT_V2.links, underline },
      };
      return renderEngineToBuffer({ resume, profile, paper: "letter", format });
    }

    const offBuffer = await render(false);
    const onBuffer = await render(true);
    expect(Buffer.compare(offBuffer, onBuffer)).not.toBe(0);
  });

  it("accentColor: true fills the link with colors.accent; false uses colors.text instead", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();

    async function linkFillsAccentPresent(accentColor: boolean): Promise<boolean> {
      const format: DocumentFormatV2 = {
        ...DEFAULT_FORMAT_V2,
        colors: { ...DEFAULT_FORMAT_V2.colors, accent: "#ff00ff", text: "#111111" },
        // headings.style 'plain' drops section headings' OWN colors.primary
        // fill (sections.tsx's headingColor) — the only other page-1 user of
        // colors.accent as a TEXT fill — so "#ff00ff" showing up in the fill
        // list is unambiguously the link's.
        headings: { ...DEFAULT_FORMAT_V2.headings, style: "plain" },
        links: { ...DEFAULT_FORMAT_V2.links, accentColor },
      };
      const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
      const fills = await page1FillColors(buffer);
      return fills.includes("#ff00ff");
    }

    expect(await linkFillsAccentPresent(true)).toBe(true);
    expect(await linkFillsAccentPresent(false)).toBe(false);
  });

  it("icon: toggling changes bytes (adds a glyph View) without changing the extracted link label", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();

    async function render(icon: boolean) {
      const format: DocumentFormatV2 = {
        ...DEFAULT_FORMAT_V2,
        links: { ...DEFAULT_FORMAT_V2.links, icon },
      };
      return renderEngineToBuffer({ resume, profile, paper: "letter", format });
    }

    const offBuffer = await render(false);
    const onBuffer = await render(true);
    expect(Buffer.compare(offBuffer, onBuffer)).not.toBe(0);

    const onText = (await extractPdfText(onBuffer)).join(" ");
    expect(onText).toContain(profile.links[0].label);
  });
});

describe("header + links — extraction text is untouched by styling (E9-F3c, §31.2)", () => {
  it("contact fields + link label survive every header/links axis set to a non-default value", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();
    const format: DocumentFormatV2 = {
      ...DEFAULT_FORMAT_V2,
      header: {
        ...DEFAULT_FORMAT_V2.header,
        detailsArrangement: "wrapped",
        separator: "icon",
        contactIconStyle: "circle-filled",
        titlePosition: "same-line",
        titleWeight: "bold",
      },
      links: { underline: true, accentColor: false, icon: true },
    };
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const text = (await extractPdfText(buffer)).join(" ");
    expect(text).toContain(profile.email as string);
    expect(text).toContain(profile.phone as string);
    expect(text).toContain(profile.location as string);
    expect(text).toContain(profile.links[0].label);
  });
});

describe("colors.accentPlacement — 8 of the 9 gates, each its own element class (E9-F3d, §31.2)", () => {
  // levelIndicators is EXCLUDED here — its element (skills/languages level
  // display) doesn't exist yet (E9-F4); sections.tsx's resolveAccentPlacement
  // comment notes it as a documented no-op until that ticket lands.
  const ALL_ACCENT_OFF: AccentPlacementV2 = {
    name: false,
    title: false,
    headings: false,
    headingRules: false,
    headerIcons: false,
    levelIndicators: false,
    dates: false,
    entrySubtitles: false,
    linkIcons: false,
  };
  const ACCENT_HEX = "#ff00ff";
  const TEXT_HEX = "#111111";

  // One experience group carrying every headingParts field (engine-entries.
  // test.ts's own fixture, ported — this file's resumeFixture() groups have
  // no headingParts, so dates/entrySubtitles need one that does).
  function structuredResume(): TailoredResume {
    return {
      signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
      summary: "",
      sections: [
        {
          section: "experience",
          groups: [
            {
              heading: "RAWHEADINGFALLBACK",
              headingParts: {
                title: "ENTRYTITLE",
                subtitle: "ENTRYSUBTITLE",
                date: "2021-06-15",
                location: "ENTRYLOCATION",
              },
              items: [{ entryId: "e1", text: "ITEMONE" }],
            },
          ],
        },
      ],
      cut: [],
    };
  }

  // `headings`/`header`/`links` are the ONE non-color override needed to
  // make that element class paint anything at all (e.g. no link icon is
  // drawn unless links.icon is on) — held IDENTICAL across a case's on/off
  // render pair, so the flag under test is the only input difference
  // between them. links.accentColor is pinned false in every case
  // (regardless of override) since it independently colors the link TEXT
  // element class (E9-F3c, untouched by this ticket) — left at its
  // DEFAULT_FORMAT_V2 default of true, profileFixture()'s link would paint
  // colors.accent no matter which of these 9 flags is under test,
  // contaminating every other case's fill-color check. `stroke` marks the
  // two element classes whose color is a View border (drawn via
  // ctx.strokeColor by @react-pdf/render, never ctx.fillColor) rather than a
  // fill/Text run — see page1StrokeColors above.
  const CASES: {
    flag: keyof AccentPlacementV2;
    headings?: Partial<HeadingsV2>;
    header?: Partial<HeaderV2>;
    links?: Partial<LinksV2>;
    profile?: Profile;
    resume?: TailoredResume;
    stroke?: boolean;
  }[] = [
    { flag: "name" },
    { flag: "title", profile: { ...profileFixture(), headline: "SENTINEL_HEADLINE" } },
    { flag: "headings" },
    {
      // headingRules' decoration under the default 'underline' style is a
      // border (a stroke) — 'accent-bar' swaps it for headingAccentBar's
      // backgroundColor (a fill), so this flag is testable with the same
      // page1FillColors extractor every other case (but linkIcons) uses.
      flag: "headingRules",
      headings: { style: "accent-bar" },
    },
    {
      // contactIconStyle's default is 'none-frame' (no icon at all) — a
      // '*-filled' shape paints a backgroundColor (a fill).
      flag: "headerIcons",
      header: { contactIconStyle: "circle-filled" },
    },
    { flag: "dates", resume: structuredResume() },
    { flag: "entrySubtitles", resume: structuredResume() },
    {
      // links.icon's default is false (no icon View at all); linkIcon has no
      // backgroundColor, only a borderColor — a stroke.
      flag: "linkIcons",
      links: { icon: true },
      stroke: true,
    },
  ];

  describe.each(CASES)("$flag", ({ flag, headings, header, links, profile, resume, stroke }) => {
    it("gates colors.accent vs colors.text on ONLY its own element class; extraction text is unchanged either way", async () => {
      const useProfile = profile ?? profileFixture();
      const useResume = resume ?? resumeFixture();

      async function render(value: boolean): Promise<Buffer> {
        const format: DocumentFormatV2 = {
          ...DEFAULT_FORMAT_V2,
          headings: { ...DEFAULT_FORMAT_V2.headings, ...headings },
          header: { ...DEFAULT_FORMAT_V2.header, ...header },
          links: { ...DEFAULT_FORMAT_V2.links, accentColor: false, ...links },
          colors: {
            ...DEFAULT_FORMAT_V2.colors,
            accent: ACCENT_HEX,
            text: TEXT_HEX,
            accentPlacement: { ...ALL_ACCENT_OFF, [flag]: value },
          },
        };
        return renderEngineToBuffer({
          resume: useResume,
          profile: useProfile,
          paper: "letter",
          format,
        });
      }

      const offBuffer = await render(false);
      const onBuffer = await render(true);
      expect(Buffer.compare(offBuffer, onBuffer)).not.toBe(0);

      const colorsOf = stroke ? page1StrokeColors : page1FillColors;
      const offColors = await colorsOf(offBuffer);
      const onColors = await colorsOf(onBuffer);
      expect(offColors).not.toContain(ACCENT_HEX);
      expect(onColors).toContain(ACCENT_HEX);

      const offText = (await extractPdfText(offBuffer)).join(" ");
      const onText = (await extractPdfText(onBuffer)).join(" ");
      expect(onText).toBe(offText);
    });
  });
});

// footer.{pageNumbers,email,name,customText} (§31.2, E9-F3e) — a real
// react-pdf fixed footer (engine/document.tsx's renderFooter), never present
// in the flow content SectionBlock/ProfileHeader render, so its own
// extractor reads a single page's text directly (extractPdfText's own
// per-page walk, keeping page boundaries this time instead of flattening
// them — see extractText.ts's own loop this mirrors).
async function pageText(buffer: Buffer, pageNumber: number): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .filter((item): item is { str: string } => "str" in item)
    .map((item) => item.str)
    .join(" ");
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("footer — pageNumbers/email/name/customText (E9-F3e, §31.2)", () => {
  it("no page-number marker when the whole footer is off (DEFAULT_FORMAT_V2's own default)", async () => {
    const profile = profileFixture();
    const buffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile,
      paper: "letter",
      format: DEFAULT_FORMAT_V2,
    });
    const text = await pageText(buffer, 1);
    expect(text).not.toContain("1 / ");
  });

  it("email/name each add ONE extra occurrence over the header's own when enabled (profile.name/email already render in the header, independent of the footer)", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();

    async function render(footer: Partial<DocumentFormatV2["footer"]>) {
      const format: DocumentFormatV2 = {
        ...DEFAULT_FORMAT_V2,
        footer: { ...DEFAULT_FORMAT_V2.footer, ...footer },
      };
      const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
      return pageText(buffer, 1);
    }

    const baseline = await render({});
    const emailOn = await render({ email: true });
    const nameOn = await render({ name: true });

    expect(countOccurrences(emailOn, profile.email)).toBe(
      countOccurrences(baseline, profile.email) + 1,
    );
    expect(countOccurrences(nameOn, profile.name)).toBe(
      countOccurrences(baseline, profile.name) + 1,
    );
  });

  it("customText renders verbatim when set, and is absent when empty (no toggle needed — presence IS the flag)", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();
    const CUSTOM_TEXT = "SENTINEL_FOOTER_CUSTOM_TEXT";

    async function render(customText: string) {
      const format: DocumentFormatV2 = {
        ...DEFAULT_FORMAT_V2,
        footer: { ...DEFAULT_FORMAT_V2.footer, customText },
      };
      const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
      return pageText(buffer, 1);
    }

    expect(await render(CUSTOM_TEXT)).toContain(CUSTOM_TEXT);
    expect(await render("")).not.toContain(CUSTOM_TEXT);
  });

  it("PAGINATES: pageNumbers reads N / totalPages, with N incrementing per physical page on a genuinely multi-page fixture", async () => {
    const profile = profileFixture();
    // Same growing fixture the NEVER-CUT describe block above calibrates
    // against comfortable density's strict-preset 2-page result.
    const resume = growingResumeFixture(24);
    const format: DocumentFormatV2 = {
      ...PRESETS.strict,
      footer: { ...PRESETS.strict.footer, pageNumbers: true },
    };
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const totalPages = (await getDocument({ data: new Uint8Array(buffer) }).promise).numPages;
    expect(totalPages).toBeGreaterThan(1);

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      const text = await pageText(buffer, pageNumber);
      expect(text).toContain(`${pageNumber} / ${totalPages}`);
    }
  });

  it("NEVER-CUT: item count is identical with the footer fully on vs off", async () => {
    const profile = profileFixture();
    const resume = growingResumeFixture(24);
    const expectedItems = resume.sections[0].groups[0].items.map((item) => item.text);

    async function itemsPresent(footerOn: boolean): Promise<string[]> {
      const format: DocumentFormatV2 = {
        ...PRESETS.strict,
        footer: footerOn
          ? { pageNumbers: true, email: true, name: true, customText: "Confidential" }
          : PRESETS.strict.footer,
      };
      const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
      const text = (await extractPdfText(buffer)).join(" ");
      return expectedItems.filter((marker) => text.includes(marker));
    }

    const withFooter = await itemsPresent(true);
    const withoutFooter = await itemsPresent(false);
    expect(withFooter).toEqual(expectedItems);
    expect(withoutFooter).toEqual(expectedItems);
  });
});
