// E7-A2 — sidebar-left template renders the same shared-section content as
// strict (composition differs, features don't). Oracle: renderToBuffer(doc)
// → real PDF → extract text via pdfjs-dist and assert on it (spec.md §28.8-A).

import { describe, expect, it } from "vitest";
import type { Profile, TailoredResume } from "@shared/types";
import { TEMPLATES } from "../src/client/document/registry";
import { renderResumeToBuffer } from "../src/client/document/renderResume";

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
      {
        section: "skill",
        groups: [
          {
            items: [
              { entryId: "s1", text: "SKILL_ITEM_ONE" },
              { entryId: "s2", text: "SKILL_ITEM_TWO" },
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

const ALL_ITEM_TEXTS = [
  "PROJECT_ITEM_ONE",
  "PROJECT_ITEM_TWO",
  "EXPERIENCE_ITEM_ONE",
  "EXPERIENCE_ITEM_TWO",
  "SKILL_ITEM_ONE",
  "SKILL_ITEM_TWO",
];

async function extractText(buffer: Buffer): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
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

describe("template registry", () => {
  it("has 4 entries (strict, classic, compact, sidebar-left)", () => {
    const ids = Object.keys(TEMPLATES).sort();
    expect(ids).toEqual(["classic", "compact", "sidebar-left", "strict"]);
  });

  it("classic and compact declare layout 'single' + atsGrade 'strict'", () => {
    for (const id of ["classic", "compact"] as const) {
      expect(TEMPLATES[id].layout).toBe("single");
      expect(TEMPLATES[id].atsGrade).toBe("strict");
    }
  });

  it("strict and sidebar-left keep their existing manifest values", () => {
    expect(TEMPLATES.strict.atsGrade).toBe("strict");
    expect(TEMPLATES.strict.layout).toBe("single");
    expect(TEMPLATES["sidebar-left"].atsGrade).toBe("good");
    expect(TEMPLATES["sidebar-left"].layout).toBe("sidebar-left");
  });
});

describe.each(["classic", "compact"] as const)("%s template (§28.8-A oracle)", (templateId) => {
  it("renders the fixture to a valid PDF containing profile header + every item.text, never leadRationale/cut", async () => {
    const buffer = await renderResumeToBuffer({
      resume: resumeFixture(),
      profile: profileFixture(),
      templateId,
    });
    const text = await extractText(buffer);

    expect(text).toContain(profileFixture().name);
    expect(text).toContain(profileFixture().email);
    expect(text).toContain("SUMMARY_TEXT");

    for (const marker of ALL_ITEM_TEXTS) {
      expect(text).toContain(marker);
    }

    for (const sentinel of [
      "SENTINEL_RATIONALE_PROJECT",
      "SENTINEL_RATIONALE_EXPERIENCE",
      "SENTINEL_CUT_ONE",
      "SENTINEL_CUT_TWO",
    ]) {
      expect(text).not.toContain(sentinel);
    }
  });
});

describe("CONTRAST — classic/compact must actually differ in composition, not just manifest (anti-gaming)", () => {
  it("classic centers the profile name; strict left-anchors it", async () => {
    const profile = profileFixture();
    const strictBuffer = await renderResumeToBuffer({
      resume: resumeFixture(),
      profile,
      templateId: "strict",
    });
    const classicBuffer = await renderResumeToBuffer({
      resume: resumeFixture(),
      profile,
      templateId: "classic",
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

    // strict: left-anchored — mean-x in the left third of the page
    expect(strictMeanX).toBeLessThan(strict.pageWidth / 3);
    // classic: centered — mean-x within ~15% of the page midline
    expect(Math.abs(classicMeanX - midline)).toBeLessThanOrEqual(tolerance);
  });

  it("compact puts the name and contact line on one header row; strict/classic stack them", async () => {
    const profile = profileFixture();
    const LINE_HEIGHT_GAP_PT = 10; // comfortably between the ~4pt same-row gap and the ~18pt stacked gap

    for (const templateId of ["strict", "classic"] as const) {
      const buffer = await renderResumeToBuffer({ resume: resumeFixture(), profile, templateId });
      const { items } = await page1Geometry(buffer);
      const name = items.find((item) => item.str === profile.name);
      const email = items.find((item) => item.str === profile.email);
      if (!name || !email) throw new Error("header text items not found");
      expect(Math.abs(name.y - email.y)).toBeGreaterThan(LINE_HEIGHT_GAP_PT);
    }

    const compactBuffer = await renderResumeToBuffer({
      resume: resumeFixture(),
      profile,
      templateId: "compact",
    });
    const { items } = await page1Geometry(compactBuffer);
    const name = items.find((item) => item.str === profile.name);
    const email = items.find((item) => item.str === profile.email);
    if (!name || !email) throw new Error("header text items not found");
    expect(Math.abs(name.y - email.y)).toBeLessThanOrEqual(LINE_HEIGHT_GAP_PT);
  });
});

describe("sidebar-left template (§28.8-A oracle)", () => {
  it("renders the fixture to a valid PDF containing profile.name + every item.text, never leadRationale/cut", async () => {
    const buffer = await renderResumeToBuffer({
      resume: resumeFixture(),
      profile: profileFixture(),
      templateId: "sidebar-left",
    });
    const text = await extractText(buffer);

    expect(text).toContain(profileFixture().name);
    expect(text).toContain("SUMMARY_TEXT");

    for (const marker of ALL_ITEM_TEXTS) {
      expect(text).toContain(marker);
    }

    for (const sentinel of [
      "SENTINEL_RATIONALE_PROJECT",
      "SENTINEL_RATIONALE_EXPERIENCE",
      "SENTINEL_CUT_ONE",
      "SENTINEL_CUT_TWO",
    ]) {
      expect(text).not.toContain(sentinel);
    }
  });
});

describe("strict vs sidebar-left — same content, different composition", () => {
  it("both templates render the exact same set of item texts + profile name for the same fixture", async () => {
    const resume = resumeFixture();
    const profile = profileFixture();

    const strictBuffer = await renderResumeToBuffer({ resume, profile, templateId: "strict" });
    const sidebarBuffer = await renderResumeToBuffer({
      resume,
      profile,
      templateId: "sidebar-left",
    });

    const strictText = await extractText(strictBuffer);
    const sidebarText = await extractText(sidebarBuffer);

    for (const text of [strictText, sidebarText]) {
      expect(text).toContain(profile.name);
      for (const marker of ALL_ITEM_TEXTS) {
        expect(text).toContain(marker);
      }
    }
  });
});
