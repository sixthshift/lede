// E9-F2c: headings.{style,capitalization,icons} (§31.2) — this ticket's own
// test file, per the ticket's harness contract. Follows the E8-A1 contrast
// pattern (test/document-templates.test.ts, test/document-format-render.test.ts):
// Buffer.compare(...).not.toBe(0) for "did this axis change anything at
// all", plus pdf.js extraction (extractPdfText, ./src/client/document/
// extractText.ts) for "did it change WHAT text renders, not just its look".
import { describe, expect, it } from "vitest";
import type { Profile, TailoredResume } from "@shared/types";
import { DEFAULT_FORMAT_V2, HEADING_STYLES, type DocumentFormatV2 } from "@shared/format-v2";
import { extractPdfText } from "../src/client/document/extractText";
import { renderResumeToBuffer } from "../src/client/document/renderResume";

function profileFixture(): Profile {
  return {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    links: [],
  };
}

function resumeFixture(): TailoredResume {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "SUMMARY_TEXT: a track record of shipping backend systems.",
    sections: [
      {
        section: "experience",
        groups: [
          {
            heading: "Acme · Engineer · 2020-2023",
            items: [
              { entryId: "e1", text: "EXPERIENCE_ITEM_ONE" },
              { entryId: "e2", text: "EXPERIENCE_ITEM_TWO" },
            ],
          },
        ],
      },
    ],
    cut: [],
  };
}

async function renderWithHeadings(headings: DocumentFormatV2["headings"]): Promise<Buffer> {
  const format: DocumentFormatV2 = { ...DEFAULT_FORMAT_V2, headings };
  return renderResumeToBuffer({ resume: resumeFixture(), profile: profileFixture(), format });
}

describe("headings.style — 8 treatments render pairwise-distinct bytes (§31.2, E9-F2c)", () => {
  it("HEADING_STYLES has exactly 8 values (locked axis, cited not widened)", () => {
    expect(HEADING_STYLES).toHaveLength(8);
  });

  it("every style renders a nonempty PDF containing the section content (never cuts)", async () => {
    for (const style of HEADING_STYLES) {
      const buffer = await renderWithHeadings({
        ...DEFAULT_FORMAT_V2.headings,
        style,
      });
      expect(buffer.length).toBeGreaterThan(0);
      const text = (await extractPdfText(buffer)).join(" ");
      expect(text).toContain("EXPERIENCE_ITEM_ONE");
      expect(text).toContain("EXPERIENCE");
    }
  });

  it("all 8 HEADING_STYLES are pairwise-distinct PDF bytes", async () => {
    const buffers = await Promise.all(
      HEADING_STYLES.map((style) => renderWithHeadings({ ...DEFAULT_FORMAT_V2.headings, style })),
    );
    for (let i = 0; i < buffers.length; i++) {
      for (let j = i + 1; j < buffers.length; j++) {
        expect(
          Buffer.compare(buffers[i]!, buffers[j]!),
          `${HEADING_STYLES[i]} vs ${HEADING_STYLES[j]} must render distinct bytes`,
        ).not.toBe(0);
      }
    }
  });
});

describe("headings.capitalization — changes the extracted heading text case (§31.2, E9-F2c)", () => {
  it("uppercase vs capitalize renders different extracted section-label case", async () => {
    const upperBuffer = await renderWithHeadings({
      ...DEFAULT_FORMAT_V2.headings,
      capitalization: "uppercase",
    });
    const capBuffer = await renderWithHeadings({
      ...DEFAULT_FORMAT_V2.headings,
      capitalization: "capitalize",
    });

    expect(Buffer.compare(upperBuffer, capBuffer)).not.toBe(0);

    // The section-label text run is its OWN pdf.js text item (a distinct
    // <Text>, separate from "EXPERIENCE_ITEM_ONE"/"EXPERIENCE_ITEM_TWO" — an
    // exact-item-equality check, not substring, avoids false-matching this
    // fixture's item text against the SCREAMING-CASE label). @shared/
    // sections.ts's experience label is "Experience" — textTransform
    // 'uppercase' bakes SCREAMING-CASE into the extracted glyphs themselves;
    // 'capitalize' title-cases (@react-pdf/fns's capitalize), which for an
    // already-Title-Case label reproduces the raw "Experience" case.
    const upperItems = await extractPdfText(upperBuffer);
    const capItems = await extractPdfText(capBuffer);
    expect(upperItems).toContain("EXPERIENCE");
    expect(upperItems).not.toContain("Experience");
    expect(capItems).toContain("Experience");
    expect(capItems).not.toContain("EXPERIENCE");
  });
});

describe("headings.icons — none|outline|filled each change bytes (§31.2, E9-F2c)", () => {
  it("none, outline, and filled are pairwise-distinct PDF bytes", async () => {
    const none = await renderWithHeadings({ ...DEFAULT_FORMAT_V2.headings, icons: "none" });
    const outline = await renderWithHeadings({ ...DEFAULT_FORMAT_V2.headings, icons: "outline" });
    const filled = await renderWithHeadings({ ...DEFAULT_FORMAT_V2.headings, icons: "filled" });

    expect(Buffer.compare(none, outline)).not.toBe(0);
    expect(Buffer.compare(none, filled)).not.toBe(0);
    expect(Buffer.compare(outline, filled)).not.toBe(0);

    // §28.4 NEVER-CUT: the icon adornment never displaces the label text.
    for (const buffer of [none, outline, filled]) {
      const text = (await extractPdfText(buffer)).join(" ");
      expect(text).toContain("EXPERIENCE_ITEM_ONE");
    }
  });
});

describe("DEFAULT_FORMAT_V2 fallback parity (§31.2, migrateFormat's baseFromV1)", () => {
  it("DEFAULT_FORMAT_V2.headings is underline/uppercase/none — this module's pre-ticket look", () => {
    expect(DEFAULT_FORMAT_V2.headings).toEqual({
      style: "underline",
      capitalization: "uppercase",
      icons: "none",
    });
  });
});
