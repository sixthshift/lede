// E9-F4b acceptance: sectionDisplay.{skillsLanguages,interests} — the render
// axes format-v2.ts already defined/migrated/validated but the engine
// ignored (toLegacyFormat emitted no sectionDisplay config at all; every
// skill/language/interest section rendered as one hardcoded 'rows' look).
// Patterned on test/engine-single-column.test.ts (op-list extractors,
// Buffer.compare pairwise-distinctness idiom, the `colors.accentPlacement`
// CASES shape) — ported again here rather than shared, same reasoning as
// that file's own sibling files: this doesn't need to import a private
// helper from the engine. ZERO imports of ../src/client/document/registry or
// ../src/client/document/templates.
import { describe, expect, it } from "vitest";
import type { Profile, TailoredItem, TailoredResume } from "@shared/types";
import {
  DEFAULT_FORMAT_V2,
  type DocumentFormatV2,
  type InterestsDisplayV2,
  type SkillsLanguagesDisplayV2,
} from "@shared/format-v2";
import { extractPdfText } from "../src/client/document/extractText";
import { DENSITY_LADDER, renderEngineToBuffer } from "../src/client/document/engine";

function profileFixture(): Profile {
  return {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    links: [],
  };
}

// §31.4: meta.level (1–5) is CONTENT. The assemble()->TailoredItem pipeline
// (src/server/tailor/assemble.ts) doesn't carry it onto TailoredItem yet —
// outside this ticket's declared files — so, exactly like every other
// not-yet-fully-wired axis this codebase threads as an "extra property"
// (legacyAdapt.ts's format extras), a level rides along on the item object
// itself. Omitted `level` is exactly today's unleveled item.
function leveledItem(entryId: string, text: string, level?: number): TailoredItem {
  return (level === undefined ? { entryId, text } : { entryId, text, level }) as TailoredItem;
}

function skillsResume(items: TailoredItem[]): TailoredResume {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "",
    sections: [{ section: "skill", groups: [{ heading: undefined, items }] }],
    cut: [],
  };
}

function languagesResume(items: TailoredItem[]): TailoredResume {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "",
    sections: [{ section: "language", groups: [{ heading: undefined, items }] }],
    cut: [],
  };
}

function interestsResume(items: TailoredItem[]): TailoredResume {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "",
    sections: [{ section: "interest", groups: [{ heading: undefined, items }] }],
    cut: [],
  };
}

function formatWithSkillsLanguages(overrides: Partial<SkillsLanguagesDisplayV2>): DocumentFormatV2 {
  return {
    ...DEFAULT_FORMAT_V2,
    sectionDisplay: {
      ...DEFAULT_FORMAT_V2.sectionDisplay,
      skillsLanguages: { ...DEFAULT_FORMAT_V2.sectionDisplay.skillsLanguages, ...overrides },
    },
  };
}

function formatWithInterests(overrides: Partial<InterestsDisplayV2>): DocumentFormatV2 {
  return {
    ...DEFAULT_FORMAT_V2,
    sectionDisplay: {
      ...DEFAULT_FORMAT_V2.sectionDisplay,
      interests: { ...DEFAULT_FORMAT_V2.sectionDisplay.interests, ...overrides },
    },
  };
}

type TextGeometry = { str: string; x: number; y: number; width: number };

async function page1Geometry(buffer: Buffer): Promise<TextGeometry[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items
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
}

// setFillRGBColor's single arg IS the hex string in this pdf.js build (no
// float-triplet decoding needed) — verified against a real render at
// authoring time, same as engine-single-column.test.ts's own copy.
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

// entries.listStyle's default bullet glyph (sections.tsx's BULLET_GLYPHS) —
// every ItemRow-based layout (rows/grid/level) draws one per item; the
// chip-based layouts (compact/bubble) draw none at all (ChipItemRow has no
// bullet Text). Its x-position is this file's column-count oracle: a grid
// item's own width-percent math (ItemRow's `width`) puts its bullet at a
// DIFFERENT x per column, so counting distinct bullet x-positions is exactly
// "how many columns actually rendered".
const BULLET_GLYPH = "•";

function bulletXPositions(geometry: TextGeometry[]): Set<number> {
  return new Set(geometry.filter((g) => g.str === BULLET_GLYPH).map((g) => Math.round(g.x)));
}

describe("sectionDisplay.skillsLanguages.layout 'grid' — gridColumns is a REAL column count", () => {
  const profile = profileFixture();
  const items = Array.from({ length: 8 }, (_, i) => leveledItem(`s${i}`, `SKILL_ITEM_${i}`));
  const resume = skillsResume(items);

  it.each([
    1, 2, 3, 4,
  ])("gridColumns=%i yields exactly that many distinct item x-positions", async (gridColumns) => {
    const format = formatWithSkillsLanguages({ layout: "grid", gridColumns });
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const geometry = await page1Geometry(buffer);
    expect(bulletXPositions(geometry).size).toBe(gridColumns);
  });
});

describe("sectionDisplay.skillsLanguages — the language section shares the SAME config as skill (§31.4)", () => {
  it("layout 'grid' at gridColumns=3 columns the language section exactly like skill does", async () => {
    const profile = profileFixture();
    const items = Array.from({ length: 6 }, (_, i) => leveledItem(`l${i}`, `LANGUAGE_ITEM_${i}`));
    const resume = languagesResume(items);
    const format = formatWithSkillsLanguages({ layout: "grid", gridColumns: 3 });
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const geometry = await page1Geometry(buffer);
    expect(bulletXPositions(geometry).size).toBe(3);
    const text = (await extractPdfText(buffer)).join(" ");
    for (const item of items) expect(text).toContain(item.text);
  });
});

describe("sectionDisplay.interests.layout 'grid' — gridColumns is a REAL column count (interests' own axis)", () => {
  const profile = profileFixture();
  const items = Array.from({ length: 8 }, (_, i) => ({ entryId: `i${i}`, text: `INTEREST_${i}` }));
  const resume = interestsResume(items);

  it.each([
    1, 2, 3, 4,
  ])("gridColumns=%i yields exactly that many distinct item x-positions", async (gridColumns) => {
    const format = formatWithInterests({ layout: "grid", gridColumns });
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const geometry = await page1Geometry(buffer);
    expect(bulletXPositions(geometry).size).toBe(gridColumns);
  });
});

describe("sectionDisplay.skillsLanguages.layout — grid/rows/compact/bubble/level, each measurably distinct", () => {
  const profile = profileFixture();
  // A mixed leveled/unleveled fixture (§31.4): grid/rows/compact/bubble never
  // read an item's level at all, so reusing this ONE fixture across all 5
  // layouts isolates `layout` as the only real input difference — same
  // "identical fixture, only the flag under test changes" discipline as
  // engine-single-column.test.ts's accentPlacement CASES.
  const items = [
    leveledItem("s1", "SKILL_ALPHA", 3),
    leveledItem("s2", "SKILL_BETA"),
    leveledItem("s3", "SKILL_GAMMA", 5),
    leveledItem("s4", "SKILL_DELTA"),
  ];
  const resume = skillsResume(items);
  const LAYOUT_CASES: { name: string; overrides: Partial<SkillsLanguagesDisplayV2> }[] = [
    { name: "grid", overrides: { layout: "grid", gridColumns: 2 } },
    { name: "rows", overrides: { layout: "rows" } },
    { name: "compact", overrides: { layout: "compact" } },
    { name: "bubble", overrides: { layout: "bubble" } },
    { name: "level", overrides: { layout: "level" } },
  ];

  it("all 5 layouts are pairwise-distinct bytes", async () => {
    const buffers = await Promise.all(
      LAYOUT_CASES.map(({ overrides }) =>
        renderEngineToBuffer({
          resume,
          profile,
          paper: "letter",
          format: formatWithSkillsLanguages(overrides),
        }),
      ),
    );
    for (let i = 0; i < buffers.length; i++) {
      for (let j = i + 1; j < buffers.length; j++) {
        expect(Buffer.compare(buffers[i], buffers[j])).not.toBe(0);
      }
    }
  });

  it("every layout still renders every item's text (never-cut)", async () => {
    for (const { overrides } of LAYOUT_CASES) {
      const buffer = await renderEngineToBuffer({
        resume,
        profile,
        paper: "letter",
        format: formatWithSkillsLanguages(overrides),
      });
      const text = (await extractPdfText(buffer)).join(" ");
      for (const item of items) expect(text).toContain(item.text);
    }
  });

  it("compact draws no bullet glyph at all; bubble draws no bullet but DOES stroke a pill border compact never does", async () => {
    const compactBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWithSkillsLanguages({ layout: "compact" }),
    });
    const bubbleBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWithSkillsLanguages({ layout: "bubble" }),
    });
    const rowsBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWithSkillsLanguages({ layout: "rows" }),
    });

    const compactGeometry = await page1Geometry(compactBuffer);
    const bubbleGeometry = await page1Geometry(bubbleBuffer);
    const rowsGeometry = await page1Geometry(rowsBuffer);
    expect(bulletXPositions(rowsGeometry).size).toBeGreaterThan(0);
    expect(compactGeometry.some((g) => g.str === BULLET_GLYPH)).toBe(false);
    expect(bubbleGeometry.some((g) => g.str === BULLET_GLYPH)).toBe(false);

    const compactStrokes = await page1StrokeColors(compactBuffer);
    const bubbleStrokes = await page1StrokeColors(bubbleBuffer);
    const rowsStrokes = await page1StrokeColors(rowsBuffer);
    // The pill border is the ONE stroke bubble's layout adds beyond whatever
    // the header/heading chrome already strokes identically in every case —
    // so the count strictly increases only for bubble.
    expect(bubbleStrokes.length).toBeGreaterThan(rowsStrokes.length);
    expect(compactStrokes.length).toBe(rowsStrokes.length);
  });
});

describe("sectionDisplay.interests.layout — grid/rows/compact/bubble, each renders every item (no 'level' value exists for interests)", () => {
  const profile = profileFixture();
  const items = [
    { entryId: "i1", text: "INTEREST_ONE" },
    { entryId: "i2", text: "INTEREST_TWO" },
    { entryId: "i3", text: "INTEREST_THREE" },
  ];
  const resume = interestsResume(items);

  it.each(["grid", "rows", "compact", "bubble"] as const)("layout=%s", async (layout) => {
    const format = formatWithInterests(layout === "grid" ? { layout, gridColumns: 2 } : { layout });
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const text = (await extractPdfText(buffer)).join(" ");
    for (const item of items) expect(text).toContain(item.text);
  });

  it("grid/rows/compact/bubble are pairwise-distinct bytes", async () => {
    const configs: Partial<InterestsDisplayV2>[] = [
      { layout: "grid", gridColumns: 2 },
      { layout: "rows" },
      { layout: "compact" },
      { layout: "bubble" },
    ];
    const buffers = await Promise.all(
      configs.map((overrides) =>
        renderEngineToBuffer({
          resume,
          profile,
          paper: "letter",
          format: formatWithInterests(overrides),
        }),
      ),
    );
    for (let i = 0; i < buffers.length; i++) {
      for (let j = i + 1; j < buffers.length; j++) {
        expect(Buffer.compare(buffers[i], buffers[j])).not.toBe(0);
      }
    }
  });
});

describe("sectionDisplay.skillsLanguages.levelDisplay — text/dots/bar", () => {
  const profile = profileFixture();
  const leveledResume = skillsResume([leveledItem("s1", "SKILL_ONE", 3)]);
  const unleveledResume = skillsResume([leveledItem("s2", "SKILL_TWO")]);

  it("text renders levelLabels[level-1] as real extraction text", async () => {
    const format = formatWithSkillsLanguages({ layout: "level", levelDisplay: "text" });
    const buffer = await renderEngineToBuffer({
      resume: leveledResume,
      profile,
      paper: "letter",
      format,
    });
    const text = (await extractPdfText(buffer)).join(" ");
    expect(text).toContain(DEFAULT_FORMAT_V2.sectionDisplay.skillsLanguages.levelLabels[2]);
  });

  it("dots/bar draw MORE than the level-less baseline but add NO extraction text", async () => {
    const baselineFormat = formatWithSkillsLanguages({ layout: "level", levelDisplay: "dots" });
    const baselineBuffer = await renderEngineToBuffer({
      resume: unleveledResume,
      profile,
      paper: "letter",
      format: baselineFormat,
    });
    const baselineFills = await page1FillColors(baselineBuffer);

    for (const levelDisplay of ["dots", "bar"] as const) {
      const format = formatWithSkillsLanguages({ layout: "level", levelDisplay });
      const buffer = await renderEngineToBuffer({
        resume: leveledResume,
        profile,
        paper: "letter",
        format,
      });
      const fills = await page1FillColors(buffer);
      expect(fills.length).toBeGreaterThan(baselineFills.length);

      const text = (await extractPdfText(buffer)).join(" ");
      for (const label of DEFAULT_FORMAT_V2.sectionDisplay.skillsLanguages.levelLabels) {
        expect(text).not.toContain(label);
      }
    }
  });

  it("text/dots/bar are pairwise-distinct bytes for the SAME leveled item", async () => {
    const buffers = await Promise.all(
      (["text", "dots", "bar"] as const).map((levelDisplay) =>
        renderEngineToBuffer({
          resume: leveledResume,
          profile,
          paper: "letter",
          format: formatWithSkillsLanguages({ layout: "level", levelDisplay }),
        }),
      ),
    );
    for (let i = 0; i < buffers.length; i++) {
      for (let j = i + 1; j < buffers.length; j++) {
        expect(Buffer.compare(buffers[i], buffers[j])).not.toBe(0);
      }
    }
  });
});

describe("sectionDisplay.skillsLanguages.layout 'level' — unleveled entries fall back to 'rows', never an invented level", () => {
  const profile = profileFixture();

  it("a level-less item in 'level' layout renders IDENTICALLY to that same item under 'rows' (geometry, fills, strokes, and extraction text — @react-pdf/renderer's own PDF byte stream isn't deterministic even for two renders of the identical format, so content is the real oracle here, not Buffer.compare)", async () => {
    const resume = skillsResume([leveledItem("s1", "SKILL_UNLEVELED")]);
    const levelBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWithSkillsLanguages({ layout: "level", levelDisplay: "dots" }),
    });
    const rowsBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWithSkillsLanguages({ layout: "rows" }),
    });
    expect(await page1Geometry(levelBuffer)).toEqual(await page1Geometry(rowsBuffer));
    expect(await page1FillColors(levelBuffer)).toEqual(await page1FillColors(rowsBuffer));
    expect(await page1StrokeColors(levelBuffer)).toEqual(await page1StrokeColors(rowsBuffer));
    expect(await extractPdfText(levelBuffer)).toEqual(await extractPdfText(rowsBuffer));
  });

  it("a mixed leveled/unleveled fixture renders each item per its OWN level presence — extraction order stays index-increasing", async () => {
    const items = [
      leveledItem("s1", "SKILL_LEVELED_ONE", 2),
      leveledItem("s2", "SKILL_UNLEVELED_ONE"),
      leveledItem("s3", "SKILL_LEVELED_TWO", 4),
      leveledItem("s4", "SKILL_UNLEVELED_TWO"),
    ];
    const resume = skillsResume(items);
    const format = formatWithSkillsLanguages({ layout: "level", levelDisplay: "text" });
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const text = await extractPdfText(buffer);
    const labels = DEFAULT_FORMAT_V2.sectionDisplay.skillsLanguages.levelLabels;

    const joined = text.join(" ");
    expect(joined).toContain("SKILL_LEVELED_ONE");
    expect(joined).toContain(labels[1]); // level 2
    expect(joined).toContain("SKILL_LEVELED_TWO");
    expect(joined).toContain(labels[3]); // level 4
    expect(joined).toContain("SKILL_UNLEVELED_ONE");
    expect(joined).toContain("SKILL_UNLEVELED_TWO");
    // Neither unleveled item's row grew a label of ITS OWN — the ONLY label
    // occurrences in the whole extraction are the 2 leveled items' own.
    const labelOccurrences = text.filter((str) => labels.includes(str)).length;
    expect(labelOccurrences).toBe(2);

    // Order stays index-increasing: each item's own marker appears before
    // the next item's, and (for a leveled item) its label appears
    // immediately after its own marker, never after a LATER item's.
    const indexOf = (needle: string) => text.findIndex((str) => str.includes(needle));
    const oneIdx = indexOf("SKILL_LEVELED_ONE");
    const label2Idx = text.indexOf(labels[1]);
    const unleveledOneIdx = indexOf("SKILL_UNLEVELED_ONE");
    const twoIdx = indexOf("SKILL_LEVELED_TWO");
    const label4Idx = text.indexOf(labels[3]);
    const unleveledTwoIdx = indexOf("SKILL_UNLEVELED_TWO");
    expect(oneIdx).toBeLessThan(label2Idx);
    expect(label2Idx).toBeLessThan(unleveledOneIdx);
    expect(unleveledOneIdx).toBeLessThan(twoIdx);
    expect(twoIdx).toBeLessThan(label4Idx);
    expect(label4Idx).toBeLessThan(unleveledTwoIdx);
  });
});

describe("colors.accentPlacement.levelIndicators — the accent gate, from an all-off baseline", () => {
  const profile = profileFixture();
  const resume = skillsResume([leveledItem("s1", "SKILL_ONE", 4)]);
  const ACCENT_HEX = "#ff00ff";
  const TEXT_HEX = "#111111";
  // Every OTHER accentPlacement flag off (same "isolate the one flag under
  // test" discipline as engine-single-column.test.ts's ALL_ACCENT_OFF) —
  // DEFAULT_FORMAT_V2's own accentPlacement defaults headings/headingRules
  // to true, which would paint ACCENT_HEX on the section heading regardless
  // of levelIndicators and contaminate the "false ⇒ no accent" half of this
  // assertion.
  const ALL_ACCENT_OFF = {
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

  function formatWith(levelIndicators: boolean, levelDisplay: "dots" | "bar" | "text") {
    return {
      ...DEFAULT_FORMAT_V2,
      sectionDisplay: {
        ...DEFAULT_FORMAT_V2.sectionDisplay,
        skillsLanguages: {
          ...DEFAULT_FORMAT_V2.sectionDisplay.skillsLanguages,
          layout: "level" as const,
          levelDisplay,
        },
      },
      colors: {
        ...DEFAULT_FORMAT_V2.colors,
        accent: ACCENT_HEX,
        text: TEXT_HEX,
        accentPlacement: { ...ALL_ACCENT_OFF, levelIndicators },
      },
    };
  }

  it.each([
    "dots",
    "bar",
    "text",
  ] as const)("levelDisplay=%s: false paints colors.text, true paints colors.accent, extraction text unchanged", async (levelDisplay) => {
    const offBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWith(false, levelDisplay),
    });
    const onBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWith(true, levelDisplay),
    });
    expect(Buffer.compare(offBuffer, onBuffer)).not.toBe(0);

    const offFills = await page1FillColors(offBuffer);
    const onFills = await page1FillColors(onBuffer);
    expect(offFills).not.toContain(ACCENT_HEX);
    expect(onFills).toContain(ACCENT_HEX);

    const offText = (await extractPdfText(offBuffer)).join(" ");
    const onText = (await extractPdfText(onBuffer)).join(" ");
    expect(onText).toBe(offText);
  });
});

// EXTRACTION-NEUTRALITY (ledger v3-038: "level display ANY = neutral").
// dots/bar are pure Views — @react-pdf/render never emits a Text run for a
// View, so pdf.js's text-content walk can't see them no matter how many
// filled/unfilled segments they draw; 'text' is the one levelDisplay that
// legitimately adds a Text run (the renamable label). All three keep
// extraction ORDER index-increasing — the indicator is always ItemRow's
// LAST child, appended after that same item's own text, never reordering
// anything before or after it.
describe("EXTRACTION-NEUTRALITY — dots/bar add ZERO extraction text; text legitimately does; order stays index-increasing", () => {
  const profile = profileFixture();
  const items = [
    leveledItem("s1", "SKILL_ONE", 1),
    leveledItem("s2", "SKILL_TWO", 3),
    leveledItem("s3", "SKILL_THREE", 5),
  ];
  const resume = skillsResume(items);
  const labels = DEFAULT_FORMAT_V2.sectionDisplay.skillsLanguages.levelLabels;

  function renderWith(levelDisplay: "dots" | "bar" | "text") {
    return renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWithSkillsLanguages({ layout: "level", levelDisplay }),
    });
  }

  it("dots and bar extract the SAME text, in the SAME order, as a no-level baseline", async () => {
    const noLevelResume = skillsResume(
      items.map((item) => ({ ...item, level: undefined }) as TailoredItem),
    );
    const baselineBuffer = await renderEngineToBuffer({
      resume: noLevelResume,
      profile,
      paper: "letter",
      format: formatWithSkillsLanguages({ layout: "rows" }),
    });
    const baselineText = await extractPdfText(baselineBuffer);

    for (const levelDisplay of ["dots", "bar"] as const) {
      const buffer = await renderWith(levelDisplay);
      const text = await extractPdfText(buffer);
      expect(text).toEqual(baselineText);
    }
  });

  it("text mode legitimately adds each item's own label, and extraction order stays index-increasing", async () => {
    const buffer = await renderWith("text");
    const text = await extractPdfText(buffer);
    const oneIdx = text.findIndex((str) => str.includes("SKILL_ONE"));
    const label1Idx = text.indexOf(labels[0]);
    const twoIdx = text.findIndex((str) => str.includes("SKILL_TWO"));
    const label3Idx = text.indexOf(labels[2]);
    const threeIdx = text.findIndex((str) => str.includes("SKILL_THREE"));
    const label5Idx = text.indexOf(labels[4]);
    expect([oneIdx, label1Idx, twoIdx, label3Idx, threeIdx, label5Idx].every((i) => i >= 0)).toBe(
      true,
    );
    expect(oneIdx).toBeLessThan(label1Idx);
    expect(label1Idx).toBeLessThan(twoIdx);
    expect(twoIdx).toBeLessThan(label3Idx);
    expect(label3Idx).toBeLessThan(threeIdx);
    expect(threeIdx).toBeLessThan(label5Idx);
  });
});

describe("NEVER-CUT — item count is invariant across the density ladder, for every skillsLanguages layout", () => {
  const profile = profileFixture();
  const items = Array.from({ length: 16 }, (_, i) =>
    leveledItem(`s${i}`, `SKILL_DENSITY_${i}`, (i % 5) + 1),
  );
  const resume = skillsResume(items);

  it.each([
    { layout: "grid" as const, gridColumns: 3 },
    { layout: "rows" as const },
    { layout: "compact" as const },
    { layout: "bubble" as const },
    { layout: "level" as const },
  ])("layout=$layout keeps every item at comfortable, standard, AND compact density", async (overrides) => {
    const format = formatWithSkillsLanguages(overrides);
    for (const density of DENSITY_LADDER) {
      const buffer = await renderEngineToBuffer({
        resume,
        profile,
        paper: "letter",
        format,
        density,
      });
      const text = (await extractPdfText(buffer)).join(" ");
      for (const item of items) expect(text).toContain(item.text);
    }
  });
});
