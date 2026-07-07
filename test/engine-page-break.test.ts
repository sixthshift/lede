// E9-F1c acceptance: layout.manualPageBreaks — the one F1 layout axis the
// engine did not yet render (document.tsx's header comment listed it under
// "AXES NOT YET WIRED" before this ticket). Patterned on
// test/engine-two-column.test.ts (fixture builders, extractPdfText, pdf.js
// per-page geometry) — same oracle shape, now proving a REAL react-pdf page
// boundary rather than a no-op field. ZERO imports of
// ../src/client/document/registry or ../src/client/document/templates.
import { describe, expect, it } from "vitest";
import type { Profile, TailoredResume } from "@shared/types";
import { DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import { extractPdfText } from "../src/client/document/extractText";
import { renderEngineToBuffer } from "../src/client/document/engine";
import { PRESETS } from "../src/client/document/presets";

function profileFixture(): Profile {
  return {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    links: [{ type: "github", label: "github.com/jordan", url: "https://github.com/jordan" }],
  };
}

// Three sections, small enough that the whole thing fits comfortably on one
// page with manualPageBreaks:[] — "project" (before), "experience" (the mid-
// document break target), "education" (after) — so a passing break test
// proves a REAL boundary moved content, not a fixture that would have
// spilled onto page 2 anyway.
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
            items: [
              { entryId: "e1", text: "EXPERIENCE_ITEM_ONE" },
              { entryId: "e2", text: "EXPERIENCE_ITEM_TWO" },
            ],
          },
        ],
      },
      {
        section: "education",
        groups: [
          {
            heading: "State University · BS Computer Science",
            items: [{ entryId: "ed1", text: "EDUCATION_ITEM_ONE" }],
          },
        ],
      },
    ],
    cut: [],
  };
}

function allItemTexts(resume: TailoredResume): string[] {
  return resume.sections.flatMap((section) =>
    section.groups.flatMap((group) => group.items.map((i) => i.text)),
  );
}

// Which 1-based page a given text marker lands on, per pdf.js per-page
// extraction — the mechanism the cross-page-ordering assertion needs (a
// single extractPdfText join loses page boundaries entirely).
async function pageOf(buffer: Buffer, marker: string): Promise<number> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const content = await (await doc.getPage(pageNumber)).getTextContent();
    for (const item of content.items) {
      if ("str" in item && item.str.includes(marker)) return pageNumber;
    }
  }
  throw new Error(`marker not found on any page: ${marker}`);
}

async function numPagesOf(buffer: Buffer): Promise<number> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return (await getDocument({ data: new Uint8Array(buffer) }).promise).numPages;
}

const COLUMN_CASES: { label: string; format: DocumentFormatV2 }[] = [
  { label: "one", format: DEFAULT_FORMAT_V2 },
  { label: "two", format: PRESETS["sidebar-left"] },
];

describe.each(COLUMN_CASES)("manualPageBreaks — columns:'$label', through the engine", ({
  format: base,
}) => {
  it("no manual break: the fixture fits on ONE page", async () => {
    const format: DocumentFormatV2 = {
      ...base,
      layout: { ...base.layout, manualPageBreaks: [] },
    };
    const buffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile: profileFixture(),
      paper: "letter",
      format,
    });
    expect(await numPagesOf(buffer)).toBe(1);
  });

  it("manual break before 'experience': numPages>=2 AND 'experience' content lands on a LATER page than 'project'", async () => {
    const format: DocumentFormatV2 = {
      ...base,
      layout: { ...base.layout, manualPageBreaks: ["experience"] },
    };
    const buffer = await renderEngineToBuffer({
      resume: resumeFixture(),
      profile: profileFixture(),
      paper: "letter",
      format,
    });

    expect(await numPagesOf(buffer)).toBeGreaterThanOrEqual(2);

    const projectPage = await pageOf(buffer, "PROJECT_ITEM_ONE");
    const experiencePage = await pageOf(buffer, "EXPERIENCE_ITEM_ONE");
    expect(experiencePage).toBeGreaterThan(projectPage);
  });

  it("NEVER-CUT: every selected item.text still present, no drop/duplicate, vs the no-break render", async () => {
    const resume = resumeFixture();
    const expected = allItemTexts(resume);

    const noBreakFormat: DocumentFormatV2 = {
      ...base,
      layout: { ...base.layout, manualPageBreaks: [] },
    };
    const breakFormat: DocumentFormatV2 = {
      ...base,
      layout: { ...base.layout, manualPageBreaks: ["experience"] },
    };

    const noBreakBuffer = await renderEngineToBuffer({
      resume,
      profile: profileFixture(),
      paper: "letter",
      format: noBreakFormat,
    });
    const breakBuffer = await renderEngineToBuffer({
      resume,
      profile: profileFixture(),
      paper: "letter",
      format: breakFormat,
    });

    const noBreakText = await extractPdfText(noBreakBuffer);
    const breakText = await extractPdfText(breakBuffer);

    for (const marker of expected) {
      const noBreakCount = noBreakText.filter((s) => s.includes(marker)).length;
      const breakCount = breakText.filter((s) => s.includes(marker)).length;
      expect(breakCount).toBe(noBreakCount);
      expect(breakCount).toBeGreaterThan(0);
    }
  });
});

describe("manualPageBreaks — off-diagonal: 'mix' columns never crashes with a break set", () => {
  it("columns:'mix' + a manual break renders every item and the profile header", async () => {
    const base = PRESETS["sidebar-left"];
    const format: DocumentFormatV2 = {
      ...base,
      layout: { ...base.layout, columns: "mix", manualPageBreaks: ["experience"] },
    };
    const profile = profileFixture();
    const resume = resumeFixture();
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const text = (await extractPdfText(buffer)).join(" ");
    expect(text).toContain(profile.name);
    for (const marker of allItemTexts(resume)) {
      expect(text).toContain(marker);
    }
  });
});
