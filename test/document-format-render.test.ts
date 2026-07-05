// E7-B1d acceptance: the renderer OBEYS DocumentFormat (typography, color,
// page rhythm, per-section columns, the photo) instead of hardcoding
// Helvetica/fixed sizes/margins/no color/no photo. §11 still applies here —
// no fixture below ever needs leadRationale/cut asserted absent again;
// test/document-render.test.ts already owns that invariant and stays green.
import { describe, expect, it } from "vitest";
import type { DocumentFormat, Profile, TailoredResume } from "@shared/types";
import { DEFAULT_FORMAT } from "@shared/format";
import { effectiveAtsGrade, TEMPLATES } from "../src/client/document/registry";
import { renderResumeToBuffer } from "../src/client/document/renderResume";

// A 1x1 transparent PNG, small enough to inline — @react-pdf/image resolves
// `data:image/...;base64,...` directly in both Node and browser, so this
// fixture never depends on the same dual-environment font-src problem the
// photo could otherwise inherit.
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

function profileFixture(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    links: [{ type: "github", label: "github.com/jordan", url: "https://github.com/jordan" }],
    ...overrides,
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

function skillsFixture(): TailoredResume {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "",
    sections: [
      {
        section: "skill",
        groups: [
          {
            items: [
              { entryId: "s1", text: "SKILL_ONE" },
              { entryId: "s2", text: "SKILL_TWO" },
              { entryId: "s3", text: "SKILL_THREE" },
              { entryId: "s4", text: "SKILL_FOUR" },
            ],
          },
        ],
      },
    ],
    cut: [],
  };
}

async function loadPdf(buffer: Buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return getDocument({ data: new Uint8Array(buffer) }).promise;
}

async function extractTextItems(buffer: Buffer) {
  const doc = await loadPdf(buffer);
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items.filter(
    (item): item is { str: string; transform: number[] } => "str" in item,
  );
}

async function extractText(buffer: Buffer): Promise<string> {
  const items = await extractTextItems(buffer);
  return items.map((item) => item.str).join(" ");
}

async function hasImage(buffer: Buffer): Promise<boolean> {
  const { OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await loadPdf(buffer);
  const page = await doc.getPage(1);
  const opList = await page.getOperatorList();
  return opList.fnArray.includes(OPS.paintImageXObject);
}

describe("renderer obeys DocumentFormat (§28.3)", () => {
  it("CONTRAST: a non-default format (font/color/page margin) produces different PDF bytes than DEFAULT_FORMAT", async () => {
    const resume = resumeFixture();
    const profile = profileFixture();

    const defaultBuffer = await renderResumeToBuffer({ resume, profile });

    const customFormat: DocumentFormat = {
      ...DEFAULT_FORMAT,
      typography: {
        ...DEFAULT_FORMAT.typography,
        body: { ...DEFAULT_FORMAT.typography.body, family: "tinos" },
      },
      colors: { primary: "#8b0000", text: "#222222" },
      page: { ...DEFAULT_FORMAT.page, marginX: 90 },
    };
    const customBuffer = await renderResumeToBuffer({ resume, profile, format: customFormat });

    expect(Buffer.compare(defaultBuffer, customBuffer)).not.toBe(0);

    // formatting must never change WHAT is extracted, only how it looks
    expect(await extractText(customBuffer)).toContain("EXPERIENCE_ITEM_ONE");
    expect(await extractText(customBuffer)).toContain("EXPERIENCE_ITEM_TWO");
  });

  it("PHOTO: appears only when format.photo.hidden is false", async () => {
    const resume = resumeFixture();
    const profile = profileFixture({ photoUrl: TINY_PNG_DATA_URL });

    const hiddenBuffer = await renderResumeToBuffer({ resume, profile, format: DEFAULT_FORMAT });
    expect(DEFAULT_FORMAT.photo.hidden).toBe(true);
    expect(await hasImage(hiddenBuffer)).toBe(false);

    const shownFormat: DocumentFormat = {
      ...DEFAULT_FORMAT,
      photo: { ...DEFAULT_FORMAT.photo, hidden: false },
    };
    const shownBuffer = await renderResumeToBuffer({ resume, profile, format: shownFormat });
    expect(await hasImage(shownBuffer)).toBe(true);

    expect(Buffer.compare(hiddenBuffer, shownBuffer)).not.toBe(0);
  });

  it("a profile with no photoUrl never renders an image even when photo.hidden is false", async () => {
    const resume = resumeFixture();
    const profile = profileFixture(); // no photoUrl
    const shownFormat: DocumentFormat = {
      ...DEFAULT_FORMAT,
      photo: { ...DEFAULT_FORMAT.photo, hidden: false },
    };
    const buffer = await renderResumeToBuffer({ resume, profile, format: shownFormat });
    expect(await hasImage(buffer)).toBe(false);
  });

  it("per-section columns: a section given columns:2 lays its items across 2 x-offsets, all items present", async () => {
    const resume = skillsFixture();
    const profile = profileFixture();

    const columnsFormat: DocumentFormat = {
      ...DEFAULT_FORMAT,
      sections: { skill: { columns: 2 } },
    };
    const buffer = await renderResumeToBuffer({ resume, profile, format: columnsFormat });

    const text = await extractText(buffer);
    for (const marker of ["SKILL_ONE", "SKILL_TWO", "SKILL_THREE", "SKILL_FOUR"]) {
      expect(text).toContain(marker); // §28.4: the renderer never cuts
    }

    const items = await extractTextItems(buffer);
    const xOffsets = new Set(
      items
        .filter((item) => item.str.startsWith("SKILL_"))
        .map((item) => Math.round(item.transform[4])),
    );
    // a single vertical column would put every item at the same x; 2 columns
    // must place items at (at least) 2 distinct x-offsets.
    expect(xOffsets.size).toBeGreaterThanOrEqual(2);
  });

  it("without a columns override, a section's items share a single x-offset", async () => {
    const resume = skillsFixture();
    const profile = profileFixture();
    const buffer = await renderResumeToBuffer({ resume, profile, format: DEFAULT_FORMAT });

    const items = await extractTextItems(buffer);
    const xOffsets = new Set(
      items
        .filter((item) => item.str.startsWith("SKILL_"))
        .map((item) => Math.round(item.transform[4])),
    );
    expect(xOffsets.size).toBe(1);
  });
});

describe("effectiveAtsGrade (§28.2)", () => {
  it("strict template + hidden photo => 'strict'", () => {
    expect(effectiveAtsGrade(TEMPLATES.strict, DEFAULT_FORMAT)).toBe("strict");
  });

  it("sidebar layout => 'good' regardless of photo", () => {
    expect(effectiveAtsGrade(TEMPLATES["sidebar-left"], DEFAULT_FORMAT)).toBe("good");
  });

  it("strict template + photo shown => 'good'", () => {
    const shownFormat: DocumentFormat = {
      ...DEFAULT_FORMAT,
      photo: { ...DEFAULT_FORMAT.photo, hidden: false },
    };
    expect(effectiveAtsGrade(TEMPLATES.strict, shownFormat)).toBe("good");
  });
});
