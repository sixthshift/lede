import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import type { FontId } from "@shared/types";
import { describe, expect, it } from "vitest";
import { FONT_FACES, registerDocumentFonts } from "../src/client/document/fonts";

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
