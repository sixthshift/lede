// E9-F4c acceptance: sectionDisplay.{experience,summary,education} — the
// narrative-section render axes format-v2.ts already defined/migrated/
// validated but the engine ignored (E9-F4b wired skillsLanguages/interests
// only; toLegacyFormat emitted no config at all for this ticket's three
// groups). Patterned on test/engine-single-column.test.ts and
// test/engine-section-display.test.ts (inline op-extractor, extractPdfText,
// the "identical fixture, only the flag under test changes" discipline) —
// ported again here rather than shared, same reasoning as those files' own
// sibling files. ZERO imports of ../src/client/document/registry or
// ../src/client/document/templates.
import { describe, expect, it } from "vitest";
import type { Profile, TailoredGroup, TailoredResume } from "@shared/types";
import {
  DEFAULT_FORMAT_V2,
  type DocumentFormatV2,
  type EducationDisplayV2,
  type ExperienceDisplayV2,
  type SummaryDisplayV2,
} from "@shared/format-v2";
import { extractPdfText } from "../src/client/document/extractText";
import { renderEngineToBuffer } from "../src/client/document/engine";

function profileFixture(): Profile {
  return {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    links: [],
  };
}

function formatWithExperience(overrides: Partial<ExperienceDisplayV2>): DocumentFormatV2 {
  return {
    ...DEFAULT_FORMAT_V2,
    sectionDisplay: {
      ...DEFAULT_FORMAT_V2.sectionDisplay,
      experience: { ...DEFAULT_FORMAT_V2.sectionDisplay.experience, ...overrides },
    },
  };
}

function formatWithSummary(overrides: Partial<SummaryDisplayV2>): DocumentFormatV2 {
  return {
    ...DEFAULT_FORMAT_V2,
    sectionDisplay: {
      ...DEFAULT_FORMAT_V2.sectionDisplay,
      summary: { ...DEFAULT_FORMAT_V2.sectionDisplay.summary, ...overrides },
    },
  };
}

function formatWithEducation(overrides: Partial<EducationDisplayV2>): DocumentFormatV2 {
  return {
    ...DEFAULT_FORMAT_V2,
    sectionDisplay: {
      ...DEFAULT_FORMAT_V2.sectionDisplay,
      education: { ...DEFAULT_FORMAT_V2.sectionDisplay.education, ...overrides },
    },
  };
}

// One experience group, headingParts mirroring assemble.ts's
// headingPartsFromMeta mapping for "experience" exactly: title = role,
// subtitle = company (§4.1's own facts) — this ticket's order axis never
// changes THAT mapping, only which of the two leads in the rendered heading.
function experienceResume(): TailoredResume {
  const group: TailoredGroup = {
    heading: "ROLE_EMPLOYER_HEADING",
    headingParts: {
      title: "SENIOR_ENGINEER_ROLE",
      subtitle: "ACME_CORP_EMPLOYER",
      date: "2020-2023",
    },
    items: [{ entryId: "e1", text: "EXP_ITEM_ONE" }],
  };
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "",
    sections: [{ section: "experience", groups: [group] }],
    cut: [],
  };
}

// Two roles at the SAME employer — headingParts.subtitle (the company fact)
// is identical across both groups, everything else distinct — the exact
// shape collapsePromotions (sections.tsx) keys its merge on.
function twoRolesOneCompanyResume(): TailoredResume {
  const groups: TailoredGroup[] = [
    {
      heading: "JUNIOR_HEADING",
      headingParts: {
        title: "JUNIOR_ROLE",
        subtitle: "PROMO_CORP_EMPLOYER",
        date: "2018-2020",
      },
      items: [{ entryId: "e1", text: "PROMO_ITEM_ONE" }],
    },
    {
      heading: "SENIOR_HEADING",
      headingParts: {
        title: "SENIOR_ROLE",
        subtitle: "PROMO_CORP_EMPLOYER",
        date: "2020-2023",
      },
      items: [{ entryId: "e2", text: "PROMO_ITEM_TWO" }],
    },
  ];
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "",
    sections: [{ section: "experience", groups }],
    cut: [],
  };
}

function educationResume(): TailoredResume {
  const group: TailoredGroup = {
    heading: "SCHOOL_DEGREE_HEADING",
    headingParts: {
      title: "BACHELOR_DEGREE",
      subtitle: "STATE_UNIVERSITY_SCHOOL",
      date: "2016-2020",
    },
    items: [{ entryId: "d1", text: "EDU_ITEM_ONE" }],
  };
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "",
    sections: [{ section: "education", groups: [group] }],
    cut: [],
  };
}

function summaryResume(): TailoredResume {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "TRACK_RECORD_BODY_TEXT: a track record of shipping backend systems.",
    sections: [],
    cut: [],
  };
}

type TextGeometry = { str: string; x: number; y: number };

// Same inline op-extractor pattern as engine-section-display.test.ts's own
// page1Geometry — kept local to this file rather than imported, same
// reasoning as that file's own copy (no shared helper module for it).
async function page1Geometry(buffer: Buffer): Promise<TextGeometry[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items
    .filter((item): item is typeof item & { str: string; transform: number[] } => "str" in item)
    .map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5] }));
}

function indexOfText(text: string[], needle: string): number {
  return text.findIndex((str) => str.includes(needle));
}

// headings.capitalization (§31.2) defaults to 'uppercase' — sections.tsx's
// renderSectionHeading applies that CSS textTransform, and @react-pdf bakes
// it into the actual rendered glyphs (there's no native PDF text-transform
// operator), so the "Summary" label extracts as "SUMMARY". Case-insensitive
// on purpose: this test is about the label's PRESENCE/absence and position,
// not headings.capitalization (a different, already-wired axis).
function indexOfLabelCI(text: string[], needle: string): number {
  return text.findIndex((str) => str.toLowerCase().includes(needle.toLowerCase()));
}

function occurrences(text: string[], needle: string): number {
  return text.filter((str) => str.includes(needle)).length;
}

describe("sectionDisplay.experience.order — title-first vs employer-first flips extraction ORDER", () => {
  const profile = profileFixture();
  const resume = experienceResume();

  it("title-first: role text extracts before employer text", async () => {
    const format = formatWithExperience({ order: "title-first" });
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const text = await extractPdfText(buffer);
    const roleIdx = indexOfText(text, "SENIOR_ENGINEER_ROLE");
    const employerIdx = indexOfText(text, "ACME_CORP_EMPLOYER");
    expect(roleIdx).toBeGreaterThanOrEqual(0);
    expect(employerIdx).toBeGreaterThanOrEqual(0);
    expect(roleIdx).toBeLessThan(employerIdx);
  });

  it("employer-first: employer text extracts before role text (the flip)", async () => {
    const format = formatWithExperience({ order: "employer-first" });
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const text = await extractPdfText(buffer);
    const roleIdx = indexOfText(text, "SENIOR_ENGINEER_ROLE");
    const employerIdx = indexOfText(text, "ACME_CORP_EMPLOYER");
    expect(roleIdx).toBeGreaterThanOrEqual(0);
    expect(employerIdx).toBeGreaterThanOrEqual(0);
    expect(employerIdx).toBeLessThan(roleIdx);
  });

  it("both orders still render every item's text (never-cut) and are pairwise-distinct bytes", async () => {
    const titleFirstBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWithExperience({ order: "title-first" }),
    });
    const employerFirstBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWithExperience({ order: "employer-first" }),
    });
    expect(Buffer.compare(titleFirstBuffer, employerFirstBuffer)).not.toBe(0);
    for (const buffer of [titleFirstBuffer, employerFirstBuffer]) {
      const joined = (await extractPdfText(buffer)).join(" ");
      expect(joined).toContain("EXP_ITEM_ONE");
    }
  });
});

describe("sectionDisplay.experience.groupPromotions — group COUNT changes for a 2-roles-1-company fixture", () => {
  const profile = profileFixture();
  const resume = twoRolesOneCompanyResume();

  it("false (today's behavior): the employer name renders once PER role — 2 occurrences", async () => {
    const format = formatWithExperience({ groupPromotions: false });
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const text = await extractPdfText(buffer);
    expect(occurrences(text, "PROMO_CORP_EMPLOYER")).toBe(2);
  });

  it("true: the employer name renders ONCE, shared by both roles — group count 1", async () => {
    const format = formatWithExperience({ groupPromotions: true });
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const text = await extractPdfText(buffer);
    expect(occurrences(text, "PROMO_CORP_EMPLOYER")).toBe(1);
  });

  it("item count is invariant across both values (never-cut, §28.4)", async () => {
    for (const groupPromotions of [false, true]) {
      const format = formatWithExperience({ groupPromotions });
      const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
      const joined = (await extractPdfText(buffer)).join(" ");
      expect(joined).toContain("PROMO_ITEM_ONE");
      expect(joined).toContain("PROMO_ITEM_TWO");
      expect(joined).toContain("JUNIOR_ROLE");
      expect(joined).toContain("SENIOR_ROLE");
    }
  });

  it("true vs false are pairwise-distinct bytes", async () => {
    const offBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWithExperience({ groupPromotions: false }),
    });
    const onBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWithExperience({ groupPromotions: true }),
    });
    expect(Buffer.compare(offBuffer, onBuffer)).not.toBe(0);
  });
});

describe("sectionDisplay.summary.asPartOfHeader — moves the summary's position relative to the header", () => {
  const profile = profileFixture();
  const resume = summaryResume();

  async function headerToSummaryGap(asPartOfHeader: boolean): Promise<number> {
    const format = formatWithSummary({ asPartOfHeader });
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const geometry = await page1Geometry(buffer);
    const emailY = geometry.find((g) => g.str.includes("jordan@example.com"))?.y;
    const summaryY = geometry.find((g) => g.str.includes("TRACK_RECORD_BODY_TEXT"))?.y;
    expect(emailY).toBeDefined();
    expect(summaryY).toBeDefined();
    // PDF y grows upward; the header sits above the summary, so this is
    // always positive regardless of asPartOfHeader — only its MAGNITUDE
    // (the gap) is what this axis changes.
    return (emailY as number) - (summaryY as number);
  }

  it("true renders a measurably SMALLER header-to-summary gap than false", async () => {
    const gapOff = await headerToSummaryGap(false);
    const gapOn = await headerToSummaryGap(true);
    expect(gapOn).toBeLessThan(gapOff);
  });
});

describe('sectionDisplay.summary.showHeading — the "Summary" label appears/disappears in extraction', () => {
  const profile = profileFixture();
  const resume = summaryResume();

  it("false: no 'Summary' label in extraction (today's look)", async () => {
    const format = formatWithSummary({ showHeading: false });
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const text = await extractPdfText(buffer);
    expect(indexOfLabelCI(text, "Summary")).toBe(-1);
    expect(text.join(" ")).toContain("TRACK_RECORD_BODY_TEXT");
  });

  it("true: the 'Summary' label renders, ahead of the summary body text", async () => {
    const format = formatWithSummary({ showHeading: true });
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const text = await extractPdfText(buffer);
    const labelIdx = indexOfLabelCI(text, "Summary");
    const bodyIdx = indexOfText(text, "TRACK_RECORD_BODY_TEXT");
    expect(labelIdx).toBeGreaterThanOrEqual(0);
    expect(bodyIdx).toBeGreaterThanOrEqual(0);
    expect(labelIdx).toBeLessThan(bodyIdx);
  });

  it("true vs false are pairwise-distinct bytes", async () => {
    const offBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWithSummary({ showHeading: false }),
    });
    const onBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWithSummary({ showHeading: true }),
    });
    expect(Buffer.compare(offBuffer, onBuffer)).not.toBe(0);
  });
});

describe("sectionDisplay.education.order — degree-first vs school-first flips extraction ORDER", () => {
  const profile = profileFixture();
  const resume = educationResume();

  it("degree-first: degree text extracts before school text", async () => {
    const format = formatWithEducation({ order: "degree-first" });
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const text = await extractPdfText(buffer);
    const degreeIdx = indexOfText(text, "BACHELOR_DEGREE");
    const schoolIdx = indexOfText(text, "STATE_UNIVERSITY_SCHOOL");
    expect(degreeIdx).toBeGreaterThanOrEqual(0);
    expect(schoolIdx).toBeGreaterThanOrEqual(0);
    expect(degreeIdx).toBeLessThan(schoolIdx);
  });

  it("school-first: school text extracts before degree text (the flip)", async () => {
    const format = formatWithEducation({ order: "school-first" });
    const buffer = await renderEngineToBuffer({ resume, profile, paper: "letter", format });
    const text = await extractPdfText(buffer);
    const degreeIdx = indexOfText(text, "BACHELOR_DEGREE");
    const schoolIdx = indexOfText(text, "STATE_UNIVERSITY_SCHOOL");
    expect(degreeIdx).toBeGreaterThanOrEqual(0);
    expect(schoolIdx).toBeGreaterThanOrEqual(0);
    expect(schoolIdx).toBeLessThan(degreeIdx);
  });

  it("both orders still render the item's text (never-cut) and are pairwise-distinct bytes", async () => {
    const degreeFirstBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWithEducation({ order: "degree-first" }),
    });
    const schoolFirstBuffer = await renderEngineToBuffer({
      resume,
      profile,
      paper: "letter",
      format: formatWithEducation({ order: "school-first" }),
    });
    expect(Buffer.compare(degreeFirstBuffer, schoolFirstBuffer)).not.toBe(0);
    for (const buffer of [degreeFirstBuffer, schoolFirstBuffer]) {
      const joined = (await extractPdfText(buffer)).join(" ");
      expect(joined).toContain("EDU_ITEM_ONE");
    }
  });
});
