// CI EXTRACTION-ORDER INVARIANT (spec.md §28.6/§11): for every template
// declaring atsGrade 'strict' — a declared grade must be EARNED —
// extractPdfText over the rendered PDF must contain the profile header +
// every selected item.text in EXACT TailoredResume content order
// (index-increasing), and leadRationale/cut[] sentinel strings — reasoning
// UI only — must never reach the document.
import { describe, expect, it } from "vitest";
import type { Profile, TailoredResume } from "@shared/types";
import { extractPdfText } from "../src/client/document/extractText";
import { renderResumeToBuffer } from "../src/client/document/renderResume";
import { PRESET_MANIFESTS } from "../src/client/document/registry";
import { PRESETS } from "../src/client/document/presets";

const STRICT_PRESET_IDS = Object.values(PRESET_MANIFESTS)
  .filter((manifest) => manifest.atsGrade === "strict")
  .map((manifest) => manifest.id);

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

describe.each(
  STRICT_PRESET_IDS,
)("extractPdfText extraction-order invariant (%s preset, §28.6/§11)", (presetId) => {
  it("contains profile header + every item.text in exact TailoredResume order; leadRationale/cut absent", async () => {
    const profile = profileFixture();
    const buffer = await renderResumeToBuffer({
      resume: resumeFixture(),
      profile,
      format: PRESETS[presetId],
    });
    const items = await extractPdfText(buffer);
    const text = items.join(" ");

    // profile header present
    expect(text).toContain(profile.name);
    expect(text).toContain(profile.email);

    // summary present
    expect(text).toContain("SUMMARY_TEXT");

    // every selected item.text present in exact content order (index-increasing)
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

    // leadRationale / cut[] reasoning strings never reach the document (§11)
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
