// E9-F2e acceptance: entries.* (§31.2, EntriesV2 — src/shared/format-v2.ts)
// renders through sections.tsx's per-entry header composition. Same
// contrast/geometry oracle as test/engine-single-column.test.ts's
// page1Geometry (x/y/fontSize per text item) and
// test/document-format-render.test.ts's CONTRAST/DATE-FORMAT distinct-bytes
// idiom — ported here rather than imported, same reasoning those files give
// for keeping their own copies of shared physical helpers.
import { describe, expect, it } from "vitest";
import type { Profile, TailoredResume } from "@shared/types";
import { DEFAULT_FORMAT_V2, type DocumentFormatV2, type EntryFontStyle } from "@shared/format-v2";
import { renderResumeToBuffer } from "../src/client/document/renderResume";
import { extractPdfText } from "../src/client/document/extractText";

function profileFixture(): Profile {
  return {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    links: [],
  };
}

// One experience group carrying every headingParts field (title/subtitle/
// date/location) plus 2 items — the never-cut invariant below asserts both
// markers survive every entries.* axis value tested.
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
            items: [
              { entryId: "e1", text: "ITEMONE" },
              { entryId: "e2", text: "ITEMTWO" },
            ],
          },
        ],
      },
    ],
    cut: [],
  };
}

// A group with no headingParts at all — the pre-E9-F2d shape, still valid
// (§31.1 back-compat: this ticket must not stop rendering it).
function bareHeadingResume(): TailoredResume {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "",
    sections: [
      {
        section: "experience",
        groups: [
          {
            heading: "RAWHEADINGFALLBACK",
            items: [
              { entryId: "e1", text: "ITEMONE" },
              { entryId: "e2", text: "ITEMTWO" },
            ],
          },
        ],
      },
    ],
    cut: [],
  };
}

const FORMATTED_DATE = "06/15/2021"; // "2021-06-15" through the default MM/DD/YYYY preset

async function loadPdf(buffer: Buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return getDocument({ data: new Uint8Array(buffer) }).promise;
}

type TextGeometry = { str: string; x: number; y: number };

async function page1Geometry(buffer: Buffer): Promise<TextGeometry[]> {
  const doc = await loadPdf(buffer);
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items
    .filter((item): item is typeof item & { str: string; transform: number[] } => "str" in item)
    .map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5] }));
}

function findItem(items: TextGeometry[], needle: string): TextGeometry {
  const match = items.find((item) => item.str.includes(needle));
  if (!match) throw new Error(`text "${needle}" not found in extracted geometry`);
  return match;
}

async function extractJoinedText(buffer: Buffer): Promise<string> {
  return (await extractPdfText(buffer)).join(" ");
}

function withEntries(overrides: Partial<DocumentFormatV2["entries"]>): DocumentFormatV2 {
  return { ...DEFAULT_FORMAT_V2, entries: { ...DEFAULT_FORMAT_V2.entries, ...overrides } };
}

describe("entries.* renders measurably distinct output (§31.2 EntriesV2, E9-F2e)", () => {
  it("BACK-COMPAT: a group with no headingParts still renders via the raw `heading` fallback", async () => {
    const buffer = await renderResumeToBuffer({
      resume: bareHeadingResume(),
      profile: profileFixture(),
    });
    const text = await extractJoinedText(buffer);
    expect(text).toContain("RAWHEADINGFALLBACK");
    expect(text).toContain("ITEMONE");
    expect(text).toContain("ITEMTWO");
  });

  it("dateLocationPlacement right|left|split moves the date's measured x-position (never-cut across all 3)", async () => {
    const profile = profileFixture();
    const resume = structuredResume();
    const xs: Record<string, number> = {};
    for (const placement of ["right", "left", "split"] as const) {
      const format = withEntries({ dateLocationPlacement: placement });
      const buffer = await renderResumeToBuffer({ resume, profile, format });
      const geometry = await page1Geometry(buffer);
      xs[placement] = findItem(geometry, FORMATTED_DATE).x;

      const text = await extractJoinedText(buffer);
      expect(text).toContain("ITEMONE"); // never-cut (§28.4/§31)
      expect(text).toContain("ITEMTWO");
    }
    expect(new Set(Object.values(xs)).size).toBe(3);
  });

  it("dateLocationOrder date-first|location-first swaps extraction order (never-cut across both)", async () => {
    const profile = profileFixture();
    const resume = structuredResume();

    const dateFirstText = await extractJoinedText(
      await renderResumeToBuffer({
        resume,
        profile,
        format: withEntries({ dateLocationOrder: "date-first" }),
      }),
    );
    expect(dateFirstText).toContain("ITEMONE");
    expect(dateFirstText).toContain("ITEMTWO");
    expect(dateFirstText.indexOf(FORMATTED_DATE)).toBeLessThan(
      dateFirstText.indexOf("ENTRYLOCATION"),
    );

    const locationFirstText = await extractJoinedText(
      await renderResumeToBuffer({
        resume,
        profile,
        format: withEntries({ dateLocationOrder: "location-first" }),
      }),
    );
    expect(locationFirstText).toContain("ITEMONE");
    expect(locationFirstText).toContain("ITEMTWO");
    expect(locationFirstText.indexOf("ENTRYLOCATION")).toBeLessThan(
      locationFirstText.indexOf(FORMATTED_DATE),
    );
  });

  it("subtitlePlacement same-line|below changes the subtitle's measured geometry (never-cut across both)", async () => {
    const profile = profileFixture();
    const resume = structuredResume();

    const sameLineBuffer = await renderResumeToBuffer({
      resume,
      profile,
      format: withEntries({ subtitlePlacement: "same-line" }),
    });
    const belowBuffer = await renderResumeToBuffer({
      resume,
      profile,
      format: withEntries({ subtitlePlacement: "below" }),
    });

    const sameLineSubtitle = findItem(await page1Geometry(sameLineBuffer), "ENTRYSUBTITLE");
    const belowSubtitle = findItem(await page1Geometry(belowBuffer), "ENTRYSUBTITLE");
    expect(sameLineSubtitle.y).not.toBe(belowSubtitle.y);

    for (const buffer of [sameLineBuffer, belowBuffer]) {
      const text = await extractJoinedText(buffer);
      expect(text).toContain("ITEMONE");
      expect(text).toContain("ITEMTWO");
    }
  });

  it("listStyle bullet|hyphen changes the extracted bullet glyph (never-cut across both)", async () => {
    const profile = profileFixture();
    const resume = structuredResume();

    const bulletBuffer = await renderResumeToBuffer({
      resume,
      profile,
      format: withEntries({ listStyle: "bullet" }),
    });
    const hyphenBuffer = await renderResumeToBuffer({
      resume,
      profile,
      format: withEntries({ listStyle: "hyphen" }),
    });

    const bulletGeometry = await page1Geometry(bulletBuffer);
    const hyphenGeometry = await page1Geometry(hyphenBuffer);
    expect(bulletGeometry.some((item) => item.str === "•")).toBe(true);
    expect(hyphenGeometry.some((item) => item.str === "-")).toBe(true);
    expect(hyphenGeometry.some((item) => item.str === "•")).toBe(false);

    for (const buffer of [bulletBuffer, hyphenBuffer]) {
      const text = await extractJoinedText(buffer);
      expect(text).toContain("ITEMONE");
      expect(text).toContain("ITEMTWO");
    }
  });

  it.each([
    ["subtitleFontStyle", "bold"] as const,
    ["subtitleFontStyle", "italic"] as const,
    ["dateFontStyle", "bold"] as const,
    ["dateFontStyle", "italic"] as const,
    ["locationFontStyle", "bold"] as const,
    ["locationFontStyle", "italic"] as const,
  ])("CONTRAST: %s=%s produces different PDF bytes than the normal default (never-cut)", async (axis:
    | "subtitleFontStyle"
    | "dateFontStyle"
    | "locationFontStyle", value: EntryFontStyle) => {
    const profile = profileFixture();
    const resume = structuredResume();

    const defaultBuffer = await renderResumeToBuffer({
      resume,
      profile,
      format: DEFAULT_FORMAT_V2,
    });
    const styledBuffer = await renderResumeToBuffer({
      resume,
      profile,
      format: withEntries({ [axis]: value }),
    });

    expect(Buffer.compare(defaultBuffer, styledBuffer)).not.toBe(0);

    const text = await extractJoinedText(styledBuffer);
    expect(text).toContain("ITEMONE");
    expect(text).toContain("ITEMTWO");
  });

  it("bodyIndent moves the item body's measured x-position, not the bullet's (never-cut across both)", async () => {
    const profile = profileFixture();
    const resume = structuredResume();

    const plainBuffer = await renderResumeToBuffer({
      resume,
      profile,
      format: withEntries({ bodyIndent: false }),
    });
    const indentedBuffer = await renderResumeToBuffer({
      resume,
      profile,
      format: withEntries({ bodyIndent: true }),
    });

    const plainGeometry = await page1Geometry(plainBuffer);
    const indentedGeometry = await page1Geometry(indentedBuffer);

    const plainBody = findItem(plainGeometry, "ITEMONE");
    const indentedBody = findItem(indentedGeometry, "ITEMONE");
    expect(indentedBody.x).toBeGreaterThan(plainBody.x);

    const plainBullet = plainGeometry.find((item) => item.str === "•");
    const indentedBullet = indentedGeometry.find((item) => item.str === "•");
    expect(plainBullet).toBeDefined();
    expect(indentedBullet).toBeDefined();
    expect(indentedBullet?.x).toBe(plainBullet?.x);

    for (const buffer of [plainBuffer, indentedBuffer]) {
      const text = await extractJoinedText(buffer);
      expect(text).toContain("ITEMONE");
      expect(text).toContain("ITEMTWO");
    }
  });

  it("structure full-width|columns changes the title's measured geometry (never-cut across both)", async () => {
    const profile = profileFixture();
    const resume = structuredResume();

    const fullWidthBuffer = await renderResumeToBuffer({
      resume,
      profile,
      format: withEntries({ structure: "full-width" }),
    });
    const columnsBuffer = await renderResumeToBuffer({
      resume,
      profile,
      format: withEntries({ structure: "columns" }),
    });

    const fullWidthTitle = findItem(await page1Geometry(fullWidthBuffer), "ENTRYTITLE");
    const columnsTitle = findItem(await page1Geometry(columnsBuffer), "ENTRYTITLE");
    expect(columnsTitle.x).toBeGreaterThan(fullWidthTitle.x);

    for (const buffer of [fullWidthBuffer, columnsBuffer]) {
      const text = await extractJoinedText(buffer);
      expect(text).toContain("ITEMONE");
      expect(text).toContain("ITEMTWO");
    }
  });
});
