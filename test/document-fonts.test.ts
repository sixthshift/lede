import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { BODY_FONT_IDS, DEFAULT_FORMAT_V2, NAME_DISPLAY_FONT_IDS } from "@shared/format-v2";
import type { BodyFontId, NameFontId } from "@shared/format-v2";
import type { Profile, TailoredResume } from "@shared/types";
import { describe, expect, it } from "vitest";
import { FONT_FACES, registerDocumentFonts } from "../src/client/document/fonts";
import type { FontId } from "../src/client/document/fonts";
import { renderResumeToBuffer } from "../src/client/document/renderResume";

// The full §31.2 roster (§31.6 intake ledger v3-038..040, locked): 31 body
// faces + 8 name-slot faces, no overlap between the two lists — derived from
// format-v2.ts's own roster constants rather than hand-duplicated, so this
// test can't silently drift from the locked list it's asserting against.
const ALL_FONT_IDS: FontId[] = [...BODY_FONT_IDS, ...NAME_DISPLAY_FONT_IDS];

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

  it("registers a face for every FontId in the union (no FontId left unregistered) — the locked 31-body/8-name, 39-face roster", () => {
    registerDocumentFonts();
    expect(ALL_FONT_IDS.length).toBe(39);
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

// Escaped-bug regression, twice over (E9-R1, then E9-F0d1): ibm-plex-mono's
// vendored @fontsource .woff crashed fontkit ("Offset is outside the bounds
// of the DataView") as soon as multi-word text forced word-wrap layout —
// every other face was fine, so the bug shipped unnoticed. E9-R1 swapped the
// vendored asset to .woff2, which fixed THAT trigger but the smoke fixture
// still only carried a single colon — so E9-F0d1 escaped a SECOND, narrower
// crash the same package's .woff2 hit on a bare colon. Root cause both
// times: the fixture wasn't hostile enough. E9-R2 (this ticket) fixes the
// asset (fonts.ts now sources ibm-plex-mono from the official IBM
// `@ibm/plex-mono` package — see its PROVENANCE comment) AND closes the
// fixture gap for good: every face's smoke text below carries the full set
// of realistic resume punctuation — colon, comma, hyphen, en/em dash,
// parentheses, slash, digits, ampersand, percent — at BOTH the body role
// (summary/item text, weight 400) and the heading role (group heading,
// weight 700), so a defect confined to one weight's glyph table can't hide
// in an under-tested role again.
const PUNCTUATION_BODY_SUMMARY =
  "Skills: Python, Go, Rust (2019-2023) — shipped 3 services at 40% capacity & cut latency 2x, cost/perf ratio improved";
const PUNCTUATION_HEADING =
  "Acme Corp: Senior Engineer (2019-2023), 40% growth & 2x scale — ops/infra";
const PUNCTUATION_BODY_ITEM =
  "Shipped: backend systems (Go, Python) across 3 teams — cut costs 40% & latency 2x, 2019-2023, ops/infra";

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
    summary: PUNCTUATION_BODY_SUMMARY,
    sections: [
      {
        section: "experience",
        groups: [
          {
            heading: PUNCTUATION_HEADING,
            leadRationale: "led the platform migration",
            items: [{ entryId: "e1", text: PUNCTUATION_BODY_ITEM }],
          },
        ],
      },
    ],
    cut: [],
  };
}

describe.each(Object.keys(FONT_FACES) as FontId[])("render smoke: %s", (fontId) => {
  it("renders punctuation-bearing body AND heading text through the engine path without crashing", async () => {
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

describe("ibm-plex-mono (E9-R2 fix regression guard)", () => {
  it("the registered face itself renders a bare colon cleanly (was: crashed fontkit, both prior vendored assets)", async () => {
    registerDocumentFonts();
    const buffer = await renderFixture("ibm-plex-mono", ":");
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("legacyAdapt.ts no longer excludes ibm-plex-mono: it renders as itself, not the default fallback face", async () => {
    registerDocumentFonts();
    const [monoBuffer, defaultBuffer] = await Promise.all([
      renderResumeToBuffer({
        resume: fontSmokeResumeFixture(),
        profile: fontSmokeProfileFixture(),
        format: {
          ...DEFAULT_FORMAT_V2,
          fonts: { ...DEFAULT_FORMAT_V2.fonts, body: "ibm-plex-mono" },
        },
      }),
      renderResumeToBuffer({
        resume: fontSmokeResumeFixture(),
        profile: fontSmokeProfileFixture(),
        format: {
          ...DEFAULT_FORMAT_V2,
          fonts: { ...DEFAULT_FORMAT_V2.fonts, body: "ibm-plex-sans" },
        },
      }),
    ]);

    expect(monoBuffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // A monospace face lays out identically-worded text differently from a
    // proportional one, so distinct PDF bytes confirm ibm-plex-mono actually
    // rendered as itself rather than silently falling back to the default
    // (ibm-plex-sans) face.
    expect(Buffer.compare(monoBuffer, defaultBuffer)).not.toBe(0);
  });
});

describe("fonts.name render path (E9-F2a)", () => {
  it("setting fonts.name to a name-slot face changes PDF bytes vs 'same-as-body'", async () => {
    registerDocumentFonts();
    const base = {
      resume: fontSmokeResumeFixture(),
      profile: fontSmokeProfileFixture(),
    };
    const [sameAsBodyBuffer, playfairBuffer] = await Promise.all([
      renderResumeToBuffer({
        ...base,
        format: {
          ...DEFAULT_FORMAT_V2,
          fonts: { ...DEFAULT_FORMAT_V2.fonts, name: "same-as-body" },
        },
      }),
      renderResumeToBuffer({
        ...base,
        format: {
          ...DEFAULT_FORMAT_V2,
          fonts: { ...DEFAULT_FORMAT_V2.fonts, name: "playfair-display" as NameFontId },
        },
      }),
    ]);

    for (const buffer of [sameAsBodyBuffer, playfairBuffer]) {
      expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    }
    expect(Buffer.compare(sameAsBodyBuffer, playfairBuffer)).not.toBe(0);
  });

  it("every one of the 8 NAME_DISPLAY_FONT_IDS renders as the name font without crashing", async () => {
    registerDocumentFonts();
    for (const nameFont of NAME_DISPLAY_FONT_IDS) {
      const buffer = await renderResumeToBuffer({
        resume: fontSmokeResumeFixture(),
        profile: fontSmokeProfileFixture(),
        format: { ...DEFAULT_FORMAT_V2, fonts: { ...DEFAULT_FORMAT_V2.fonts, name: nameFont } },
      });
      expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    }
  });
});
