import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const stylesDir = path.resolve(__dirname, "../src/client/styles");
const read = (name: string) => fs.readFileSync(path.join(stylesDir, name), "utf-8");

const tokens = read("tokens.css");
const app = read("app.css");
const print = read("print.css");

describe("render-polish (E4-A, §10/§12): tokens.css exact spec values", () => {
  it("declares the §12 palette with exact values", () => {
    expect(tokens).toMatch(/--ink:\s*#18181b\s*;/);
    expect(tokens).toMatch(/--bg:\s*#f4f4f6\s*;/);
    expect(tokens).toMatch(/--surface:\s*#ffffff\s*;/);
    expect(tokens).toMatch(/--accent:\s*#2643bd\s*;/);
    expect(tokens).toMatch(/--border:\s*#e4e4e7\s*;/);
  });

  it("sets --radius to 8px", () => {
    expect(tokens).toMatch(/--radius:\s*8px\s*;/);
  });

  it("declares the three Plex font-family vars", () => {
    expect(tokens).toMatch(/--font-sans:\s*"IBM Plex Sans"/);
    expect(tokens).toMatch(/--font-mono:\s*"IBM Plex Mono"/);
    expect(tokens).toMatch(/--font-serif:\s*"IBM Plex Serif"/);
  });

  it("maps the palette onto shadcn's CSS variable names", () => {
    expect(tokens).toMatch(/--primary:\s*var\(--accent\)\s*;/);
    expect(tokens).toMatch(/--background:\s*var\(--bg\)\s*;/);
    expect(tokens).toMatch(/--foreground:\s*var\(--ink\)\s*;/);
  });
});

describe("render-polish: Plex is self-hosted (no CDN anywhere in styles)", () => {
  it("app.css imports @fontsource IBM Plex faces", () => {
    expect(app).toMatch(/@import\s+"@fontsource\/ibm-plex-sans/);
    expect(app).toMatch(/@import\s+"@fontsource\/ibm-plex-mono/);
    expect(app).toMatch(/@import\s+"@fontsource\/ibm-plex-serif/);
  });

  it("no stylesheet references a font CDN", () => {
    for (const [name, css] of [
      ["tokens.css", tokens],
      ["app.css", app],
      ["print.css", print],
    ] as const) {
      expect(css, `${name} must not reference fonts.googleapis.com`).not.toMatch(
        /fonts\.googleapis\.com/,
      );
      expect(css, `${name} must not reference fonts.gstatic.com`).not.toMatch(
        /fonts\.gstatic\.com/,
      );
      expect(css, `${name} must not use a remote @import url()`).not.toMatch(
        /@import\s+url\(\s*['"]?https?:/,
      );
    }
  });
});

describe("render-polish: print.css is ATS-safe (§10)", () => {
  const printBlockMatch = print.match(/@media print\s*\{([\s\S]*)\}\s*$/);
  if (!printBlockMatch) throw new Error("print.css has no @media print block");
  const block = printBlockMatch[1];

  it("sets black text on white background", () => {
    expect(block).toMatch(/color:\s*#000\s*;/);
    expect(block).toMatch(/background:\s*#fff\s*;/);
  });

  it("is single-column: no flex/grid/multi-column/float layout rules", () => {
    expect(block).not.toMatch(/display:\s*flex/);
    expect(block).not.toMatch(/display:\s*grid/);
    expect(block).not.toMatch(/display:\s*inline-flex/);
    expect(block).not.toMatch(/display:\s*inline-grid/);
    expect(block).not.toMatch(/columns\s*:/);
    expect(block).not.toMatch(/column-count/);
    expect(block).not.toMatch(/float\s*:/);
  });

  it("has no table or image rules (ATS parsers choke on layout tables/images)", () => {
    expect(block).not.toMatch(/(^|\s)table\b/);
    expect(block).not.toMatch(/(^|\s)img\b/);
  });

  it("hides the reasoning panel and app chrome, never on paper", () => {
    expect(block).toMatch(/\.reasoning-panel[\s\S]{0,80}display:\s*none\s*!important/);
    expect(block).toMatch(/\.jd-input/);
    expect(block).toMatch(/\.tailor-view__pending/);
    expect(block).toMatch(/\.tailor-view__error/);
  });

  it("uses a non-Plex serif for print (avoids embedded-font PDF surprises)", () => {
    expect(block).toMatch(/font-family:\s*Georgia/);
    expect(block).not.toMatch(/IBM Plex/);
  });
});
