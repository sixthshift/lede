// @vitest-environment jsdom
// E7-C1c acceptance: "what the ATS sees" (spec.md §28.6/§11).
//
// plainText: pure derivation, content in TailoredResume order, contrasted
// against unique leadRationale/cut sentinels that must be absent.
//
// AtsView: renders extractPdfText over the REAL renderResumeToBuffer output
// (same as document-extraction-invariant.test.ts) — renderResumeToBuffer
// works for real under jsdom (per fit-ui.test.tsx), it just needs the font
// fetch handler below since jsdom's SSR flag is false, unlike vitest's
// default node env.
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import type { Profile, TailoredResume } from "@shared/types";
import { AtsView } from "../src/client/components/AtsView";
import { plainText } from "../src/client/document/plainText";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

function expectInOrder(text: string, markers: string[]) {
  let lastIdx = -1;
  for (const marker of markers) {
    const idx = text.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    expect(idx).toBeGreaterThan(lastIdx);
    lastIdx = idx;
  }
}

describe("plainText (§11)", () => {
  it("contains profile + every selected item.text in TailoredResume order", () => {
    const profile = profileFixture();
    const resume = resumeFixture();
    const text = plainText(resume, profile);

    expect(text).toContain(profile.name);
    expect(text).toContain(profile.email);
    expect(text).toContain("SUMMARY_TEXT");

    expectInOrder(text, [
      "PROJECT_ITEM_ONE",
      "PROJECT_ITEM_TWO",
      "EXPERIENCE_ITEM_ONE",
      "EXPERIENCE_ITEM_TWO",
    ]);
  });

  it("CONTRAST: excludes leadRationale/cut[] reason sentinels", () => {
    const text = plainText(resumeFixture(), profileFixture());

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

// renderResumeToBuffer (@react-pdf/renderer) fetches font FACES at render
// time; under jsdom (import.meta.env.SSR === false) fonts.ts resolves those
// to http(s) asset URLs rather than filesystem paths, same as a real browser
// bundle would — see fit-ui.test.tsx's identical rationale.
function fontResponse(url: string): Response {
  const pathname = new URL(url).pathname;
  const bytes = readFileSync(join(process.cwd(), pathname));
  return new Response(bytes, { status: 200 });
}

function mockFontFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/node_modules/@fontsource/")) return fontResponse(url);
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

describe("AtsView (§28.6)", () => {
  it("shows extracted text with the profile + every selected item.text in order; leadRationale/cut absent", async () => {
    mockFontFetch();
    const profile = profileFixture();
    const resume = resumeFixture();

    const { container } = render(<AtsView resume={resume} profile={profile} />);

    await waitFor(() => {
      expect(container.querySelector(".ats-view")).toBeTruthy();
    });

    const text = container.querySelector(".ats-view__text")!.textContent ?? "";
    expect(text).toContain(profile.name);
    expect(text).toContain(profile.email);

    expectInOrder(text, [
      "PROJECT_ITEM_ONE",
      "PROJECT_ITEM_TWO",
      "EXPERIENCE_ITEM_ONE",
      "EXPERIENCE_ITEM_TWO",
    ]);

    for (const sentinel of [
      "SENTINEL_RATIONALE_PROJECT",
      "SENTINEL_RATIONALE_EXPERIENCE",
      "SENTINEL_CUT_ONE",
      "SENTINEL_CUT_TWO",
    ]) {
      expect(text).not.toContain(sentinel);
    }
  });

  it("never renders a loading/error placeholder once extraction resolves", async () => {
    mockFontFetch();
    render(<AtsView resume={resumeFixture()} profile={profileFixture()} />);

    await waitFor(() => {
      expect(screen.queryByText("Extracting…")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
