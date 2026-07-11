// F104 — form-field focus ring must resolve to the ACTIVE THEME's accent
// (not Tailwind's default blue). `ring-ring/25` never resolved an alpha
// because `ring: "var(--accent)"` (tailwind.config.ts) carries no
// <alpha-value> slot, so the modifier fell back to Tailwind's default ring
// color, rgb(59 130 246 / 0.5|0.25), in BOTH themes. The fix: an explicit
// `--ring-weak` token (accent pre-composed at reduced alpha, per theme) that
// `ring-ring-weak` resolves to.
//
// jsdom can't be trusted to replay Tailwind's real cascade/var() resolution
// for a box-shadow value (see ticket note), so this test compiles the actual
// classNames shipped in ui/input.tsx, ui/textarea.tsx, ui/select.tsx through
// the real tailwindcss/postcss pipeline (the same engine `bun run build`
// uses) and asserts on the generated CSS — deterministic, no jsdom guessing.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const tokensCss = readFileSync(resolve(ROOT, "src/client/styles/tokens.css"), "utf-8");

function readClassAttr(relPath: string, marker: string): string {
  const src = readFileSync(resolve(ROOT, relPath), "utf-8");
  const match = src.match(new RegExp(`"([^"]*${marker}[^"]*)"`));
  if (!match)
    throw new Error(`could not find a className string containing "${marker}" in ${relPath}`);
  return match[1]!;
}

// Pulled live from source, not retyped — the test tracks the real classNames.
const inputClasses = readClassAttr("src/client/components/ui/input.tsx", "focus-visible:ring-2");
const textareaClasses = readClassAttr(
  "src/client/components/ui/textarea.tsx",
  "focus-visible:ring-2",
);
const selectClasses = readClassAttr("src/client/components/ui/select.tsx", "focus:ring-2");

function extractRootBlock(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`selector "${selector}" not found in tokens.css`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function tokenValue(block: string, name: string): string {
  const match = block.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token "${name}" not found`);
  return match[1]!.trim();
}

function parseRgba(value: string): { r: number; g: number; b: number; a: number } {
  const match = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (!match) throw new Error(`not an rgb()/rgba() value: "${value}"`);
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] !== undefined ? Number(match[4]) : 1,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

const lightBlock = extractRootBlock(tokensCss, ":root");
const darkBlock = extractRootBlock(tokensCss, ":root.dark");

describe("F104 — focus-ring token plumbing", () => {
  it.each([
    ["light", lightBlock],
    ["dark", darkBlock],
  ])("%s: --ring-weak is that theme's --accent at nonzero alpha", (_label, block) => {
    const accentRgb = hexToRgb(tokenValue(block, "--accent"));
    const ringWeak = parseRgba(tokenValue(block, "--ring-weak"));
    expect([ringWeak.r, ringWeak.g, ringWeak.b]).toEqual([accentRgb.r, accentRgb.g, accentRgb.b]);
    expect(ringWeak.a).toBeGreaterThan(0);
    // Not Tailwind's default ring-color fallback in either theme.
    expect([ringWeak.r, ringWeak.g, ringWeak.b]).not.toEqual([59, 130, 246]);
  });

  it("light and dark --ring-weak resolve to different colors (no light-only hardcode leaking into dark)", () => {
    const light = parseRgba(tokenValue(lightBlock, "--ring-weak"));
    const dark = parseRgba(tokenValue(darkBlock, "--ring-weak"));
    expect([light.r, light.g, light.b]).not.toEqual([dark.r, dark.g, dark.b]);
  });

  it("Input/Textarea/Select no longer reference ring-ring/25 and do reference ring-ring-weak", () => {
    for (const classes of [inputClasses, textareaClasses, selectClasses]) {
      expect(classes).not.toContain("ring-ring/25");
      expect(classes).toContain("ring-ring-weak");
    }
  });

  it("real Tailwind compile: focus ring resolves --tw-ring-color to var(--ring-weak) with nonzero ring width, and rest state carries no ring layer", async () => {
    const { default: tailwindConfig } = await import("../tailwind.config");
    const result = await postcss([
      // @ts-expect-error tailwindcss v3's default export accepts a Config object
      tailwindcss({
        ...tailwindConfig,
        content: [
          { raw: inputClasses, extension: "html" },
          { raw: textareaClasses, extension: "html" },
          { raw: selectClasses, extension: "html" },
        ],
      }),
    ]).process("@tailwind utilities;", { from: undefined });

    // Parse the AST rather than regex-matching raw text — postcss's own
    // (unminified) formatting shouldn't matter to what's actually asserted.
    const declsFor = (selector: string): Record<string, string> => {
      const decls: Record<string, string> = {};
      result.root.walkRules(selector, (rule) => {
        rule.walkDecls((decl) => {
          decls[decl.prop] = decl.value;
        });
      });
      return decls;
    };

    for (const ringColorSelector of [
      ".focus-visible\\:ring-ring-weak:focus-visible",
      ".focus\\:ring-ring-weak:focus",
    ]) {
      const decls = declsFor(ringColorSelector);
      // Color resolves to the new token, not the old rgba(59,130,246,...) default.
      expect(decls["--tw-ring-color"], ringColorSelector).toBe("var(--ring-weak)");
    }
    expect(result.css).not.toContain("59 130 246");

    // Width: ring-2's box-shadow layer carries a real nonzero spread (2px).
    // ring-2 is itself gated behind focus-visible:/focus: (never applied
    // unconditionally), so this --tw-ring-shadow layer — and the box-shadow
    // property it feeds — exists ONLY at the focus state; rest state's
    // box-shadow is shadow-xs alone. That is the "focus-state box-shadow
    // value differs from rest-state" assertion, proven structurally rather
    // than by re-deriving jsdom's cascade.
    for (const ringWidthSelector of [
      ".focus-visible\\:ring-2:focus-visible",
      ".focus\\:ring-2:focus",
    ]) {
      const decls = declsFor(ringWidthSelector);
      expect(decls["--tw-ring-shadow"], ringWidthSelector).toContain("calc(2px");
      expect(decls["box-shadow"], ringWidthSelector).toBe(
        "var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000)",
      );
    }

    // Rest state (bare .shadow-xs, no focus pseudo-class) never SETS
    // --tw-ring-shadow/--tw-ring-color — box-shadow's ring layers fall back to
    // the var()s' own "0 0 #0000" defaults (invisible), so shadow-xs alone is
    // what paints. Only the focus rule above sets --tw-ring-shadow to a real
    // value referencing --tw-ring-color — that's what makes the RESOLVED
    // box-shadow differ between rest and focus, despite both declarations
    // referencing the same var() expression.
    const restDecls = declsFor(".shadow-xs");
    expect(restDecls["--tw-ring-shadow"]).toBeUndefined();
    expect(restDecls["box-shadow"]).toContain("var(--tw-shadow)");
  });
});
