import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { DEFAULT_FORMAT_V2 } from "@shared/format-v2";
import type { BodyFontId } from "@shared/format-v2";
import type { FontId, Profile, TailoredResume } from "@shared/types";
import { describe, expect, it } from "vitest";
import { FONT_FACES, registerDocumentFonts } from "../src/client/document/fonts";
import { renderResumeToBuffer } from "../src/client/document/renderResume";

const ALL_FONT_IDS: FontId[] = [
  "ibm-plex-sans",
  "ibm-plex-serif",
  "ibm-plex-mono",
  "arimo",
  "tinos",
  "carlito",
];

function fixtureDocument(family: FontId, text: string) {
  return createElement(
    Document,
    null,
    createElement(Page, null, createElement(Text, { style: { fontFamily: family } }, text)),
  );
}

async function renderFixture(family: FontId, text = "The quick brown fox"): Promise<Buffer> {
  return renderToBuffer(fixtureDocument(family, text));
}

describe("registerDocumentFonts", () => {
  it("is idempotent — calling twice does not throw", () => {
    expect(() => {
      registerDocumentFonts();
      registerDocumentFonts();
    }).not.toThrow();
  });

  it("registers a face for every FontId in the union (no FontId left unregistered)", () => {
    registerDocumentFonts();
    for (const fontId of ALL_FONT_IDS) {
      expect(FONT_FACES[fontId]).toBeDefined();
      expect(FONT_FACES[fontId].label.length).toBeGreaterThan(0);
    }
    // Coverage check: FONT_FACES must have exactly the FontId keys, no more/fewer.
    expect(Object.keys(FONT_FACES).sort()).toEqual([...ALL_FONT_IDS].sort());
  });

  it("actually applies the registered face: tinos vs ibm-plex-sans render distinct PDF bytes", async () => {
    registerDocumentFonts();

    const tinosBuffer = await renderFixture("tinos");
    const sansBuffer = await renderFixture("ibm-plex-sans");

    for (const buffer of [tinosBuffer, sansBuffer]) {
      expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(buffer.length).toBeGreaterThan(0);
    }

    expect(Buffer.compare(tinosBuffer, sansBuffer)).not.toBe(0);
  });

  it("never references a runtime CDN (no fonts.googleapis/gstatic/https URL)", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/client/document/fonts.ts"), "utf8");
    expect(source).not.toMatch(/fonts\.googleapis|gstatic|https?:\/\//i);
  });
});

// Escaped-bug regression (E9-R1 + re-verified E9-F0d1): ibm-plex-mono's
// vendored @fontsource .woff crashed fontkit ("Offset is outside the bounds
// of the DataView") as soon as multi-word text forced word-wrap layout —
// every other face was fine, so the bug shipped unnoticed. E9-R1 swapped the
// vendored asset to .woff2, which genuinely fixes THAT trigger. E9-F0d1
// (this ticket) tried removing legacyAdapt.ts's ibm-plex-mono exclusion per
// its brief and found a SECOND, narrower crash the original smoke fixture
// never contained: @fontsource/ibm-plex-mono 5.2.7's .woff2 (latest
// published — no newer version exists) crashes fontkit on a bare colon
// (":"), which the ORIGINAL .woff does NOT (the two vendored assets have
// complementary defects — neither is safe alone). The fixture below is
// strengthened with a colon (this ticket) so this class of gap can't recur
// silently; the exclusion in legacyAdapt.ts stays, verified below.

function fontSmokeProfileFixture(): Profile {
  return {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    links: [],
  };
}

// "Skills:" (colon) is the E9-F0d1 escaped-gap capture — ordinary resume
// content (labels, ratios, dates) routinely carries a colon.
function fontSmokeResumeFixture(): TailoredResume {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "Skills: a proven track record of shipping backend systems at scale",
    sections: [
      {
        section: "experience",
        groups: [
          {
            heading: "Acme Corp Senior Engineer",
            leadRationale: "led the platform migration",
            items: [{ entryId: "e1", text: "shipped several backend systems across many teams" }],
          },
        ],
      },
    ],
    cut: [],
  };
}

describe.each(Object.keys(FONT_FACES) as FontId[])("render smoke: %s", (fontId) => {
  it("renders multi-word, colon-bearing text through the fallback-safe engine path without crashing", async () => {
    const buffer = await renderResumeToBuffer({
      resume: fontSmokeResumeFixture(),
      profile: fontSmokeProfileFixture(),
      format: {
        ...DEFAULT_FORMAT_V2,
        fonts: { ...DEFAULT_FORMAT_V2.fonts, body: fontId as BodyFontId },
      },
    });

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(0);
  });
});

describe("ibm-plex-mono known limitation (§ document-fonts.test.ts escaped-gap capture)", () => {
  it("the REGISTERED FACE ITSELF still crashes fontkit on a bare colon (tracked, not fixed here)", async () => {
    registerDocumentFonts();
    await expect(renderFixture("ibm-plex-mono", ":")).rejects.toThrow(
      /Offset is outside the bounds of the DataView/,
    );
  });

  it("but the ENGINE PATH never hits it: legacyAdapt.ts's exclusion routes fonts.body:'ibm-plex-mono' to the default face", async () => {
    const buffer = await renderResumeToBuffer({
      resume: fontSmokeResumeFixture(),
      profile: fontSmokeProfileFixture(),
      format: {
        ...DEFAULT_FORMAT_V2,
        fonts: { ...DEFAULT_FORMAT_V2.fonts, body: "ibm-plex-mono" },
      },
    });
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
