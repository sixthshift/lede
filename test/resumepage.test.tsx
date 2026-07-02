import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { TailoredResume } from "@shared/types";
import { ResumePage } from "../src/client/components/ResumePage";

function fixture(): TailoredResume {
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

describe("ResumePage", () => {
  it("never renders leadRationale or cut reasons (§10 leak check)", () => {
    const html = renderToStaticMarkup(<ResumePage resume={fixture()} />);

    expect(html).not.toContain("SENTINEL_RATIONALE_PROJECT");
    expect(html).not.toContain("SENTINEL_RATIONALE_EXPERIENCE");
    expect(html).not.toContain("SENTINEL_CUT_ONE");
    expect(html).not.toContain("SENTINEL_CUT_TWO");
  });

  it("renders sections/items in the resume's given order, not hardcoded (data-driven)", () => {
    const html = renderToStaticMarkup(<ResumePage resume={fixture()} />);

    const projectIdx = html.indexOf("Projects");
    const experienceIdx = html.indexOf("Experience");
    expect(projectIdx).toBeGreaterThan(-1);
    expect(experienceIdx).toBeGreaterThan(-1);
    expect(projectIdx).toBeLessThan(experienceIdx);

    // items within a group render in array order
    const item1Idx = html.indexOf("PROJECT_ITEM_ONE");
    const item2Idx = html.indexOf("PROJECT_ITEM_TWO");
    expect(item1Idx).toBeGreaterThan(-1);
    expect(item2Idx).toBeGreaterThan(item1Idx);
  });

  it("renders the summary and item texts (positive check)", () => {
    const html = renderToStaticMarkup(<ResumePage resume={fixture()} />);

    expect(html).toContain("SUMMARY_TEXT: a track record of shipping backend systems.");
    expect(html).toContain("PROJECT_ITEM_ONE");
    expect(html).toContain("EXPERIENCE_ITEM_TWO");
  });
});

describe("print.css (§10 ATS-safe)", () => {
  it("has an @media print block with single-column rules and no multi-column/table layout", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const css = await fs.readFile(
      path.resolve(__dirname, "../src/client/styles/print.css"),
      "utf-8",
    );

    expect(css).toMatch(/@media\s+print/);
    expect(css).not.toMatch(/column-count\s*:/);
    expect(css).not.toMatch(/columns\s*:\s*[2-9]/);
    expect(css).not.toMatch(/display\s*:\s*table/);
  });
});
