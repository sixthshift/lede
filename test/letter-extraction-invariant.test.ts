// CI EXTRACTION-ORDER INVARIANT for letters (T21, mirrors
// test/document-extraction-invariant.test.ts): extractPdfText over the
// rendered letter PDF must contain the greeting, every body paragraph
// marker, and the closing IN EXACT CONTENT ORDER (index-increasing) — a
// real order proof over >=3 paragraphs, not a single-paragraph degenerate.
// groundedOn is citation metadata (fact-lock provenance for the app, not the
// page) — an id string that lives ONLY in a paragraph's groundedOn (never in
// its literal text) must never reach extracted text.
import { describe, expect, it } from "vitest";
import type { CoverLetter, Profile } from "@shared/types";
import { extractPdfText } from "../src/client/document/extractText";
import { renderLetterToBuffer } from "../src/client/document/renderLetter";

function profileFixture(): Profile {
  return {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    links: [{ type: "github", label: "github.com/jordan", url: "https://github.com/jordan" }],
  };
}

function letterFixture(): CoverLetter {
  return {
    greeting: "GREETING_LINE: Dear Hiring Team,",
    body: [
      {
        text: "BODY_PARA_ONE: opening paragraph of the letter.",
        groundedOn: ["cloudcase-platform-sdk"],
      },
      {
        text: "BODY_PARA_TWO: middle paragraph of the letter.",
        groundedOn: ["cloudcase-rules-engine"],
      },
      {
        text: "BODY_PARA_THREE: closing-adjacent paragraph.",
        groundedOn: ["cloudcase-frontend-rewrite"],
      },
    ],
    closing: "CLOSING_LINE: Thank you for your consideration.",
  };
}

describe("renderLetterToBuffer extraction-order invariant (T21)", () => {
  it("contains greeting, every body paragraph, and closing in exact content order", async () => {
    const buffer = await renderLetterToBuffer({
      letter: letterFixture(),
      profile: profileFixture(),
    });
    const items = await extractPdfText(buffer);
    const text = items.join(" ");

    const order = [
      "GREETING_LINE",
      "BODY_PARA_ONE",
      "BODY_PARA_TWO",
      "BODY_PARA_THREE",
      "CLOSING_LINE",
    ];
    let lastIndex = -1;
    for (const marker of order) {
      const idx = text.indexOf(marker);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it("never renders groundedOn ids — a paragraph's citation id absent from its own literal text", async () => {
    const letter: CoverLetter = {
      greeting: "Dear Hiring Team,",
      body: [
        {
          text: "A paragraph whose provenance is tracked separately from its prose.",
          groundedOn: ["cloudcase-platform-sdk"],
        },
      ],
      closing: "Thank you.",
    };
    const buffer = await renderLetterToBuffer({ letter, profile: profileFixture() });
    const items = await extractPdfText(buffer);
    const text = items.join(" ");

    expect(text).not.toContain("cloudcase-platform-sdk");
  });
});
