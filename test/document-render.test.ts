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
    ],
    cut: [
      { entryId: "c1", reason: "SENTINEL_CUT_ONE" },
      { entryId: "c2", reason: "SENTINEL_CUT_TWO" },
    ],
  };
}

async function extractText(buffer: Buffer): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
}

describe("template registry", () => {
  it("registers the strict template with atsGrade:'strict', layout:'single'", () => {
    expect(TEMPLATES.strict.atsGrade).toBe("strict");
    expect(TEMPLATES.strict.layout).toBe("single");
  });
});

describe("renderResumeToBuffer (strict template, §28.8-A oracle)", () => {
  it("extracts profile + summary + every item in exact content order, never leadRationale/cut", async () => {
    const buffer = await renderResumeToBuffer({
      resume: resumeFixture(),
      profile: profileFixture(),
    });
    const text = await extractText(buffer);

    // (a) profile.name present
    expect(text).toContain(profileFixture().name);

    // (d) summary present
    expect(text).toContain("SUMMARY_TEXT");

    // (b) every item.text in exactly TailoredResume content order (index-increasing)
    const order = [
      "PROJECT_ITEM_ONE",
      "PROJECT_ITEM_TWO",
      "EXPERIENCE_ITEM_ONE",
      "EXPERIENCE_ITEM_TWO",
    ];
    let lastIdx = -1;
    for (const marker of order) {
      const idx = text.indexOf(marker);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }

    // (c) SENTINEL_RATIONALE_* and cut-reason strings absent from extracted text
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
