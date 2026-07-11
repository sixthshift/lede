import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";

import { Button } from "../src/client/components/ui/button";
import { Badge } from "../src/client/components/ui/badge";
import { ReasoningPanel } from "../src/client/components/ReasoningPanel";
import type { TailoredResume } from "../src/shared/types";

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
    expect(tokens).toMatch(/--ink:\s*#18181b/);
    expect(tokens).toMatch(/--bg:\s*#f4f4f6/);
    expect(tokens).toMatch(/--surface:\s*#fff/);
    expect(tokens).toMatch(/--border:\s*#e4e4e7/);
    expect(tokens).toMatch(/--accent:\s*#2643bd/);
    expect(tokens).toMatch(/--accent-weak:\s*#e9edfa/);
    // F109: darkened from #15803d (same hue/sat family) for 4.5:1 text-on-
    // -success-soft contrast — the §12-verbatim guarantee moves with this
    // spec-authorized, intentional value change (see the F109 contrast suite
    // below for the hue-family guard proving it's a nudge, not a re-hue).
    expect(tokens).toMatch(/--success:\s*#137337/);
    expect(tokens).toMatch(/--warn:\s*#b45309/);
    expect(tokens).toMatch(/--danger:\s*#b91c1c/);
  });

  it("maps shadcn's primary onto --accent", () => {
    expect(tokens).toMatch(/--primary:\s*var\(--accent\)/);
  });
});

describe("ui-foundation: self-hosted fonts (§12, no Google Fonts CDN)", () => {
  it("app.css imports @fontsource IBM Plex, not a remote font URL", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../src/client/styles/app.css"), "utf-8");

    expect(css).toMatch(/@fontsource\/ibm-plex-sans/);
    expect(css).toMatch(/@fontsource\/ibm-plex-mono/);
    expect(css).toMatch(/@fontsource\/ibm-plex-serif/);
    expect(css).not.toMatch(/fonts\.googleapis\.com/);
    expect(css).not.toMatch(/fonts\.gstatic\.com/);
  });
});

// F109 — computed-contrast regression guard. jsdom's CSS engine resolves
// custom-property cascade (a `:root.dark` class toggle really does change
// what `--success` etc. resolve to) even though it won't resolve `var()`
// inside an ordinary property value — so real theming is exercised via the
// class toggle + a custom-property lookup, and only the one-level `var(...)`
// unwrap on `color`/`background`/`accent-color` is done by hand.
describe("ui-foundation: F109 contrast (weight-bar/rationale labels, success pill, checkbox accent)", () => {
  const tokensCss = fs.readFileSync(
    path.resolve(__dirname, "../src/client/styles/tokens.css"),
    "utf-8",
  );
  const appCss = fs.readFileSync(path.resolve(__dirname, "../src/client/styles/app.css"), "utf-8");
  const tailwindConfig = fs.readFileSync(path.resolve(__dirname, "../tailwind.config.ts"), "utf-8");

  function extractRule(css: string, selector: string): string {
    const escaped = selector.replace(/[.]/g, "\\.");
    const match = css.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`, "s"));
    if (!match) throw new Error(`rule not found for selector "${selector}"`);
    return match[0];
  }

  // Read the actual utility→token mapping from tailwind.config.ts rather than
  // hardcoding it, so the test tracks the real source of truth.
  function extractTailwindColorVar(key: string, sub: string): string {
    const blockMatch = tailwindConfig.match(new RegExp(`${key}:\\s*\\{([^}]*)\\}`));
    if (!blockMatch) throw new Error(`tailwind.config.ts: no "${key}" color block`);
    const varMatch = blockMatch[1].match(new RegExp(`${sub}:\\s*"([^"]+)"`));
    if (!varMatch) throw new Error(`tailwind.config.ts: "${key}.${sub}" not found`);
    return varMatch[1];
  }

  const successTextVar = extractTailwindColorVar("success", "DEFAULT"); // "var(--success)"
  const successSoftVar = extractTailwindColorVar("success", "soft"); // "var(--success-soft)"

  function buildDom() {
    const resumeFixture: TailoredResume = {
      signals: { roleLevel: "SIGNAL_ROLE_LEVEL_STAFF", weights: [], hardRequirements: [] },
      summary: "",
      sections: [
        {
          section: "experience",
          groups: [
            {
              heading: "Acme · Engineer",
              leadRationale: "RATIONALE",
              items: [{ entryId: "e1", text: "ITEM" }],
            },
          ],
        },
      ],
      cut: [],
    };

    const markup = renderToStaticMarkup(
      <div>
        {/* ReasoningPanel renders WeightBar internally — the real
            .weight-bar__label / .reasoning-panel__rationale-source instances,
            on the real .reasoning-panel (--surface) background. */}
        <ReasoningPanel resume={resumeFixture} />
        <Badge variant="success">Tailored</Badge>
      </div>,
    );

    const style = [
      tokensCss,
      extractRule(appCss, ".reasoning-panel"),
      extractRule(appCss, ".weight-bar__label"),
      extractRule(appCss, ".reasoning-panel__rationale-source"),
      `.text-success { color: ${successTextVar}; }`,
      `.bg-success-soft { background-color: ${successSoftVar}; }`,
    ].join("\n");

    const dom = new JSDOM(
      `<!doctype html><html><head><style>${style}</style></head><body>${markup}<input type="checkbox" id="native-checkbox" /></body></html>`,
    );
    return dom;
  }

  // `accent-color` is a spec-inherited property (CSS UI §accent-color), but
  // jsdom's getComputedStyle doesn't implement inheritance for it (it only
  // resolves rules that directly match the queried element) — so walk the
  // real ancestor chain ourselves, exactly as inheritance would, to reach the
  // real `:root` declaration a checkbox actually inherits from in a browser.
  function resolveInheritedProperty(dom: JSDOM, el: Element, prop: string): string {
    let cur: Element | null = el;
    while (cur) {
      const value = dom.window.getComputedStyle(cur).getPropertyValue(prop).trim();
      if (value !== "") return value;
      cur = cur.parentElement;
    }
    return "";
  }

  function resolveVarValue(rawValue: string, root: CSSStyleDeclaration): string {
    const match = rawValue.trim().match(/^var\((--[\w-]+)(?:\s*,\s*(.+))?\)$/);
    if (!match) return rawValue.trim();
    const [, name, fallback] = match;
    const resolved = root.getPropertyValue(name).trim();
    return resolved || (fallback ?? rawValue).trim();
  }

  function hexToRgb(hex: string): [number, number, number] {
    let clean = hex.trim().replace("#", "");
    if (clean.length === 3) {
      clean = clean
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const n = Number.parseInt(clean, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function relativeLuminance([r, g, b]: [number, number, number]): number {
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function contrastRatio(hexA: string, hexB: string): number {
    const la = relativeLuminance(hexToRgb(hexA));
    const lb = relativeLuminance(hexToRgb(hexB));
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  }

  function hexToHsl(hex: string): { h: number; s: number; l: number } {
    const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: l * 100 };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  for (const theme of ["light", "dark"] as const) {
    describe(`${theme} theme`, () => {
      function setup() {
        const dom = buildDom();
        const doc = dom.window.document;
        if (theme === "dark") doc.documentElement.classList.add("dark");
        const root = dom.window.getComputedStyle(doc.documentElement);
        return { dom, doc, root };
      }

      it("weight-bar label vs its (--surface) background clears 4.5:1", () => {
        const { dom, doc, root } = setup();
        const label = doc.querySelector(".weight-bar__label")!;
        const panel = doc.querySelector(".reasoning-panel")!;
        const labelStyle = dom.window.getComputedStyle(label);
        const panelStyle = dom.window.getComputedStyle(panel);
        const fg = resolveVarValue(labelStyle.color, root);
        const bg = resolveVarValue(panelStyle.background, root);
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      });

      it("rationale-source label vs its (--surface) background clears 4.5:1", () => {
        const { dom, doc, root } = setup();
        const label = doc.querySelector(".reasoning-panel__rationale-source")!;
        const panel = doc.querySelector(".reasoning-panel")!;
        const labelStyle = dom.window.getComputedStyle(label);
        const panelStyle = dom.window.getComputedStyle(panel);
        const fg = resolveVarValue(labelStyle.color, root);
        const bg = resolveVarValue(panelStyle.background, root);
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      });

      it("success pill text vs --success-soft clears 4.5:1", () => {
        const { dom, doc, root } = setup();
        const pill = doc.querySelector(".bg-success-soft.text-success")!;
        const pillStyle = dom.window.getComputedStyle(pill);
        const fg = resolveVarValue(pillStyle.color, root);
        const bg = resolveVarValue(pillStyle.backgroundColor, root);
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      });

      it("native checkbox accent-color resolves to the theme's --accent", () => {
        const { dom, doc, root } = setup();
        const checkbox = doc.getElementById("native-checkbox")!;
        const inheritedAccentColor = resolveInheritedProperty(dom, checkbox, "accent-color");
        // must actually inherit something — a missing declaration (UA default
        // "auto") must fail here, not silently pass
        expect(inheritedAccentColor).not.toBe("");
        expect(inheritedAccentColor).not.toBe("auto");
        const resolvedAccentColor = resolveVarValue(inheritedAccentColor, root);
        const resolvedAccentToken = root.getPropertyValue("--accent").trim();
        expect(resolvedAccentToken).not.toBe("");
        expect(resolvedAccentColor.toLowerCase()).toBe(resolvedAccentToken.toLowerCase());
      });
    });
  }

  it("--success is a value nudge, not a re-hue (hue/saturation family frozen)", () => {
    const original = hexToHsl("#15803d");
    const current = tokensCss.match(/--success:\s*(#[0-9a-fA-F]{6})/);
    if (!current) throw new Error("--success not found in tokens.css");
    const updated = hexToHsl(current[1]);

    expect(Math.abs(updated.h - original.h)).toBeLessThan(2);
    expect(Math.abs(updated.s - original.s)).toBeLessThan(5);
    // the fix darkens, it doesn't lighten
    expect(updated.l).toBeLessThan(original.l);
  });

  it("no other test file pins the pre-fix --success literal", () => {
    const testDir = path.resolve(__dirname, ".");
    const offenders: string[] = [];
    for (const entry of fs.readdirSync(testDir)) {
      if (entry === "ui-foundation.test.tsx" || !/\.tsx?$/.test(entry)) continue;
      const full = path.join(testDir, entry);
      if (fs.statSync(full).isDirectory()) continue;
      const content = fs.readFileSync(full, "utf-8");
      if (content.includes("#15803d")) offenders.push(entry);
    }
    expect(offenders).toEqual([]);
  });
});
