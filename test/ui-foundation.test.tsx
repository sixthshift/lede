import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";

import { Button } from "../src/client/components/ui/button";

describe("ui-foundation: Button primitive", () => {
  it("renders and mounts", () => {
    const html = renderToStaticMarkup(<Button>Click me</Button>);

    expect(html).toContain("<button");
    expect(html).toContain("Click me");
    // themed via tokens, not shadcn's stock indigo/slate defaults
    expect(html).toContain("bg-primary");
  });
});

describe("ui-foundation: tokens.css (§12)", () => {
  const tokens = fs.readFileSync(
    path.resolve(__dirname, "../src/client/styles/tokens.css"),
    "utf-8",
  );

  it("defines the §12 palette verbatim", () => {
    expect(tokens).toMatch(/--ink:\s*#1a1a1a/);
    expect(tokens).toMatch(/--bg:\s*#fff/);
    expect(tokens).toMatch(/--border:\s*#e4e4e7/);
    expect(tokens).toMatch(/--accent:\s*#2f5fdd/);
    expect(tokens).toMatch(/--accent-weak:\s*#eef2fe/);
    expect(tokens).toMatch(/--success:\s*#15803d/);
    expect(tokens).toMatch(/--warn:\s*#b45309/);
    expect(tokens).toMatch(/--danger:\s*#b91c1c/);
  });

  it("maps shadcn's primary onto --accent", () => {
    expect(tokens).toMatch(/--primary:\s*var\(--accent\)/);
  });
});

describe("ui-foundation: self-hosted fonts (§12, no Google Fonts CDN)", () => {
  it("app.css imports @fontsource IBM Plex, not a remote font URL", () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, "../src/client/styles/app.css"),
      "utf-8",
    );

    expect(css).toMatch(/@fontsource\/ibm-plex-sans/);
    expect(css).toMatch(/@fontsource\/ibm-plex-mono/);
    expect(css).toMatch(/@fontsource\/ibm-plex-serif/);
    expect(css).not.toMatch(/fonts\.googleapis\.com/);
    expect(css).not.toMatch(/fonts\.gstatic\.com/);
  });
});
