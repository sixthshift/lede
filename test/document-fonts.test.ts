import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { DEFAULT_FORMAT } from "@shared/format";
import type { DocumentFormat, FontId, Profile, TailoredResume } from "@shared/types";
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

function fixtureDocument(family: FontId) {
  return createElement(
    Document,
    null,
    createElement(
      Page,
      null,
      createElement(Text, { style: { fontFamily: family } }, "The quick brown fox"),
    ),
  );
}

async function renderFixture(family: FontId): Promise<Buffer> {
  return renderToBuffer(fixtureDocument(family));
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

// Escaped-bug regression (E9-R1): ibm-plex-mono's vendored @fontsource .woff
// crashes fontkit ("Offset is outside the bounds of the DataView" reading the
// space glyph) as soon as multi-word text forces word-wrap layout — every
// other face was fine, so the bug shipped unnoticed. Parameterized over the
// live FONT_FACES registry (not a hand-maintained id list) so a newly added
// face is covered automatically, and applied at both the body and heading
// typography roles since sections.tsx wires each role to a distinct style.

function fontSmokeProfileFixture(): Profile {
  return {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    links: [],
  };
}

function fontSmokeResumeFixture(): TailoredResume {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "a proven track record of shipping backend systems at scale",
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

function formatWithRole(role: "body" | "heading", family: FontId): DocumentFormat {
  return {
    ...DEFAULT_FORMAT,
    typography:
      role === "body"
        ? { ...DEFAULT_FORMAT.typography, body: { ...DEFAULT_FORMAT.typography.body, family } }
        : {
            ...DEFAULT_FORMAT.typography,
            heading: { ...DEFAULT_FORMAT.typography.heading, family },
          },
  };
}

describe.each(Object.keys(FONT_FACES) as FontId[])("render smoke: %s", (fontId) => {
  it.each([
    "body",
    "heading",
  ] as const)("renders multi-word text with the face at the %s role", async (role) => {
    const buffer = await renderResumeToBuffer({
      resume: fontSmokeResumeFixture(),
      profile: fontSmokeProfileFixture(),
      format: formatWithRole(role, fontId),
    });

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(0);
  });
});
