// E9-F0c acceptance: the engine core renders the two sidebar presets
// (spec.md §31.6 F0/F1 seam — columns/headerPosition/sidebarWidthPct wired
// through the ONE engine). Patterned on test/engine-single-column.test.ts
// (extraction/geometry/never-cut/off-diagonal helpers) — same oracle shape,
// now proven over the two-column composition. ZERO imports of
// ../src/client/document/registry or ../src/client/document/templates.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Profile, TailoredResume } from "@shared/types";
import { migrateFormat, type DocumentFormatV2 } from "@shared/format-v2";
import { documentFormatZ } from "@shared/schema";
import { DEFAULT_FORMAT } from "@shared/format";
import { extractPdfText } from "../src/client/document/extractText";
import {
  DENSITY_LADDER,
  fitEngineToPages,
  renderEngineToBuffer,
  toLegacyFormat,
} from "../src/client/document/engine";
import { PRESETS } from "../src/client/document/presets";

const SIDEBAR_PRESET_IDS = ["sidebar-left", "sidebar-right"] as const;
const LETTER_WIDTH_PT = 612;

function profileFixture(): Profile {
  return {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    links: [{ type: "github", label: "github.com/jordan", url: "https://github.com/jordan" }],
  };
}

// Sidebar-routed sections (skill/language/interest/certification per
// migrateFormat's SIDEBAR_SECTIONS) and main-routed sections (everything
// else), each with distinct markers so extraction/geometry assertions can
// tell which column a piece of text came from.
function resumeFixture(): TailoredResume {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "SUMMARY_TEXT: a track record of shipping backend systems.",
    sections: [
      {
        section: "skill",
        groups: [
          {
            heading: "Core",
            items: [
              { entryId: "s1", text: "SKILL_ITEM_ONE" },
              { entryId: "s2", text: "SKILL_ITEM_TWO" },
            ],
          },
        ],
      },
      {
        section: "certification",
        groups: [{ heading: undefined, items: [{ entryId: "c1", text: "CERT_ITEM_ONE" }] }],
      },
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
    cut: [{ entryId: "cut1", reason: "SENTINEL_CUT_ONE" }],
  };
}

function allItemTexts(resume: TailoredResume): string[] {
  return resume.sections.flatMap((section) =>
    section.groups.flatMap((group) => group.items.map((i) => i.text)),
  );
}

// Same shape at every item count, growing only the experience group — a
// main-column section for both sidebar presets — so the density ladder is
// REAL, not vacuous (mirrors engine-single-column.test.ts's fixture).
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

function meanX(item: TextGeometry): number {
  return item.x + item.width / 2;
}

describe.each(SIDEBAR_PRESET_IDS)("%s preset — extraction (through the engine)", (presetId) => {
  it("contains profile header + every selected item.text; leadRationale/cut absent", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();
    const buffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: PRESETS[presetId],
    });
    const text = (await extractPdfText(buffer)).join(" ");

    expect(text).toContain(profile.name);
    expect(text).toContain(profile.email);
    expect(text).toContain("SUMMARY_TEXT");
    for (const marker of allItemTexts(resume)) {
      expect(text).toContain(marker);
    }
    expect(text).not.toContain("SENTINEL_RATIONALE_PROJECT");
    expect(text).not.toContain("SENTINEL_RATIONALE_EXPERIENCE");
    expect(text).not.toContain("SENTINEL_CUT_ONE");
  });
});

describe("GEOMETRY CONTRASTS — sidebar mean-x, through the engine", () => {
  it("sidebar-left: sidebar-section mean-x < main-section mean-x", async () => {
    const buffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile: profileFixture(),
      paper: "letter",
      format: PRESETS["sidebar-left"],
    });
    const geo = await page1Geometry(buffer);
    const sidebarItem = geo.items.find((i) => i.str === "SKILL_ITEM_ONE");
    const mainItem = geo.items.find((i) => i.str === "EXPERIENCE_ITEM_ONE");
    if (!sidebarItem || !mainItem) throw new Error("expected text items not found");
    expect(meanX(sidebarItem)).toBeLessThan(meanX(mainItem));
  });

  it("sidebar-right: the inequality FLIPS", async () => {
    const buffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile: profileFixture(),
      paper: "letter",
      format: PRESETS["sidebar-right"],
    });
    const geo = await page1Geometry(buffer);
    const sidebarItem = geo.items.find((i) => i.str === "SKILL_ITEM_ONE");
    const mainItem = geo.items.find((i) => i.str === "EXPERIENCE_ITEM_ONE");
    if (!sidebarItem || !mainItem) throw new Error("expected text items not found");
    expect(meanX(sidebarItem)).toBeGreaterThan(meanX(mainItem));
  });
});

describe("sidebarWidthPct — real geometry, not a no-op field", () => {
  it("sidebar-left preset at 25 vs 40: the main-column boundary moves right by ~0.15 * content-width", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();
    const base = PRESETS["sidebar-left"];
    const contentWidthPt = LETTER_WIDTH_PT - 2 * toLegacyFormat(base).page.marginX;
    const expectedDelta = 0.15 * contentWidthPt;
    const tolerance = expectedDelta * 0.25;

    const narrow: DocumentFormatV2 = { ...base, layout: { ...base.layout, sidebarWidthPct: 25 } };
    const wide: DocumentFormatV2 = { ...base, layout: { ...base.layout, sidebarWidthPct: 40 } };

    const narrowBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: narrow,
    });
    const wideBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: wide,
    });
    const narrowGeo = await page1Geometry(narrowBuffer);
    const wideGeo = await page1Geometry(wideBuffer);

    const narrowMain = narrowGeo.items.find((i) => i.str === "EXPERIENCE_ITEM_ONE");
    const wideMain = wideGeo.items.find((i) => i.str === "EXPERIENCE_ITEM_ONE");
    if (!narrowMain || !wideMain) throw new Error("main-column item not found");

    const delta = wideMain.x - narrowMain.x;
    expect(delta).toBeGreaterThan(0); // wider sidebar pushes main column right
    expect(Math.abs(delta - expectedDelta)).toBeLessThanOrEqual(tolerance);
  });
});

describe("NEVER-CUT across the density ladder — sidebar presets, through the engine", () => {
  describe.each(SIDEBAR_PRESET_IDS)("%s preset", (presetId) => {
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

  it("density is REAL, not vacuous: fitEngineToPages resolves 'compact', and compact page count < comfortable (sidebar-left preset)", async () => {
    const profile = profileFixture();
    const format = PRESETS["sidebar-left"];
    const large = growingResumeFixture(13);

    const result = await fitEngineToPages({
      resume: large,
      profile,
      paper: "letter",
      format,
      targetPages: 1,
    });
    expect(result.density).toBe("compact");
    expect(result.fits).toBe(true);

    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
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
    const comfortablePages = (
      await getDocument({ data: new Uint8Array(comfortableBuffer) }).promise
    ).numPages;
    const compactPages = (await getDocument({ data: new Uint8Array(compactBuffer) }).promise)
      .numPages;
    expect(compactPages).toBeLessThan(comfortablePages);
  });
});

describe("presets.ts — sidebar presets deep-equal { ...migrateFormat(their v1 default), presetId }", () => {
  it.each(SIDEBAR_PRESET_IDS)("%s", (id) => {
    const v1Default = { ...DEFAULT_FORMAT, templateId: id };
    const expected = { ...migrateFormat(v1Default), presetId: id };
    expect(PRESETS[id]).toEqual(expected);
  });
});

describe("MIX composition — does not crash, renders all content (not pixel-graded this ticket)", () => {
  it("columns:'mix' over a sidebar-shaped format renders every item and the profile header", async () => {
    const profile = profileFixture();
    const resume = resumeFixture();
    const base = PRESETS["sidebar-left"];
    const format: DocumentFormatV2 = { ...base, layout: { ...base.layout, columns: "mix" } };
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const text = (await extractPdfText(buffer)).join(" ");
    expect(text).toContain(profile.name);
    for (const marker of allItemTexts(resume)) {
      expect(text).toContain(marker);
    }
  });
});

describe("pre-E9 fixtures parse under today's v1 schema (§31.6 F0c escaped-gap capture)", () => {
  const fixturesDir = path.join(process.cwd(), "test/fixtures/pre-e9-formats");
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));

  const lockedFormatZ = z.object({
    format: documentFormatZ,
    resolvedDensity: z.enum(["comfortable", "standard", "compact"]),
    paper: z.enum(["letter", "a4"]),
  });

  it("the fixture set includes the six template defaults + lockedFormat + settings.defaultFormat + non-empty-sections + non-default-photo", () => {
    expect(files.sort()).toEqual(
      [
        "strict.json",
        "classic.json",
        "compact.json",
        "banner.json",
        "sidebar-left.json",
        "sidebar-right.json",
        "locked-format.json",
        "settings-default-format.json",
        "non-empty-sections.json",
        "non-default-photo.json",
      ].sort(),
    );
  });

  it.each(files)("%s parses under the current v1 schema", (file) => {
    const raw = JSON.parse(readFileSync(path.join(fixturesDir, file), "utf8"));
    if (file === "locked-format.json") {
      expect(() => lockedFormatZ.parse(raw)).not.toThrow();
    } else {
      expect(() => documentFormatZ.parse(raw)).not.toThrow();
    }
  });

  it("non-empty-sections fixture actually has a non-empty sections map", () => {
    const raw = JSON.parse(readFileSync(path.join(fixturesDir, "non-empty-sections.json"), "utf8"));
    expect(Object.keys(documentFormatZ.parse(raw).sections).length).toBeGreaterThan(0);
  });

  it("non-default-photo fixture is shown, square, and size !== 64", () => {
    const raw = JSON.parse(readFileSync(path.join(fixturesDir, "non-default-photo.json"), "utf8"));
    const parsed = documentFormatZ.parse(raw);
    expect(parsed.photo.hidden).toBe(false);
    expect(parsed.photo.shape).toBe("square");
    expect(parsed.photo.size).not.toBe(64);
  });
});
