import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Escaped-bug guard (ledger [v3-090]): every @fontsource face that app.css
// @imports MUST be a DECLARED dependency in package.json — not merely present
// in a dev node_modules. The production image builds with
// `bun install --frozen-lockfile`, so a CSS @import of an undeclared package
// resolves on a dev machine (whose node_modules accreted it) but ENOENTs the
// container build — exactly how @fontsource/ibm-plex-mono slipped past every
// per-phase gate (the docker e2e that would have caught it runs at phase-close
// only, [v3-004]). This unit check moves that guard onto every vitest run.

const root = fileURLToPath(new URL("..", import.meta.url));

function declaredPackages(): Set<string> {
  const pkg = JSON.parse(readFileSync(`${root}package.json`, "utf8"));
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
}

function fontImportsInAppCss(): string[] {
  const css = readFileSync(`${root}src/client/styles/app.css`, "utf8");
  const packages = [...css.matchAll(/@fontsource\/([^/"']+)\//g)].map((m) => `@fontsource/${m[1]}`);
  return [...new Set(packages)];
}

describe("app.css @fontsource imports are declared dependencies", () => {
  it("every imported font package is in package.json (frozen-lockfile safe)", () => {
    const declared = declaredPackages();
    const imported = fontImportsInAppCss();
    expect(imported.length).toBeGreaterThan(0); // the regex must actually match
    const undeclared = imported.filter((p) => !declared.has(p));
    expect(
      undeclared,
      `undeclared @fontsource imports in app.css: ${undeclared.join(", ")}`,
    ).toEqual([]);
  });
});
