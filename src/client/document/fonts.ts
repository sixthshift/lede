// Self-hosted font registry (spec.md §28.3): a curated ~12-face set via
// react-pdf's Font.register, never a runtime CDN and never free-form input.
// Every face is vendored through @fontsource — IBM Plex (sans/serif/mono)
// plus the metric-compatible stand-ins Arimo→Arial, Tinos→Times New Roman,
// Carlito→Calibri.
//
// react-pdf/fontkit only consumes .woff/.ttf (not .woff2), so every face
// below is the package's latin .woff. The react-pdf `family` string is the
// FontId itself, so a later renderer can pass a document's configured
// FontId straight through as `style.fontFamily` — no separate lookup table.
//
// DUAL ENVIRONMENT: this module registers fonts for BOTH a Node render
// (renderResumeToBuffer, under vitest/SSR) and a browser render
// (DocumentPreview's usePDF, a Vite client bundle). @react-pdf/font's node
// build reads `src` as a local filesystem path (fontkit.open); its browser
// build always `fetch()`s `src`, and a node_modules filesystem path isn't
// fetchable — the browser needs a bundled/servable asset URL instead.
// `new URL('pkg/path.woff', import.meta.url)` with a literal string is
// Vite's documented pattern for turning a node_modules asset into a bundled
// URL (see vite:asset-import-meta-url) — it rewrites the literal at
// transform time for the client build, and leaves it untouched (unused,
// never dereferenced) under SSR, where `resolveFontSrc` takes the
// `createRequire`/fs-path branch instead. `import.meta.env.SSR` is a
// compile-time constant Vite folds, so each branch is dead code in the
// other environment.
// A namespace import, not `import { createRequire }`: Vite externalizes
// "node:module" for the browser build as a stub with only a `default`
// export, and a *named* import binding against that stub fails Rollup's
// module-graph validation before dead-code elimination ever runs. A
// namespace import isn't checked against the stub's actual exports, so it
// survives graph validation — then `import.meta.env.SSR` folding to `false`
// lets Rollup tree-shake the whole SSR-only branch (and this import with it)
// out of the client bundle before `.createRequire` is ever dereferenced.
import * as nodeModule from "node:module";
import { Font } from "@react-pdf/renderer";
import type { FontId } from "@shared/types";

type FontManifest = { package: string; label: string };

const FONT_MANIFEST: Record<FontId, FontManifest> = {
  "ibm-plex-sans": { package: "@fontsource/ibm-plex-sans", label: "IBM Plex Sans" },
  "ibm-plex-serif": { package: "@fontsource/ibm-plex-serif", label: "IBM Plex Serif" },
  "ibm-plex-mono": { package: "@fontsource/ibm-plex-mono", label: "IBM Plex Mono" },
  arimo: { package: "@fontsource/arimo", label: "Arimo (Arial)" },
  tinos: { package: "@fontsource/tinos", label: "Tinos (Times New Roman)" },
  carlito: { package: "@fontsource/carlito", label: "Carlito (Calibri)" },
};

export const FONT_FACES: Record<FontId, { label: string }> = Object.fromEntries(
  Object.entries(FONT_MANIFEST).map(([id, { label }]) => [id, { label }]),
) as Record<FontId, { label: string }>;

const BOLD_WEIGHT = 700;

// Every `new URL(...)` call below needs a literal string argument (not a
// variable) for Vite's asset transform to statically detect and bundle it —
// see the module comment. Twelve literals (6 faces × 2 weights), written out
// rather than generated, is the price of that constraint.
const BROWSER_FONT_URLS: Record<FontId, { 400: string; 700: string }> = {
  "ibm-plex-sans": {
    400: new URL(
      "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "ibm-plex-serif": {
    400: new URL(
      "@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "ibm-plex-mono": {
    400: new URL(
      "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  arimo: {
    400: new URL("@fontsource/arimo/files/arimo-latin-400-normal.woff", import.meta.url).toString(),
    700: new URL("@fontsource/arimo/files/arimo-latin-700-normal.woff", import.meta.url).toString(),
  },
  tinos: {
    400: new URL("@fontsource/tinos/files/tinos-latin-400-normal.woff", import.meta.url).toString(),
    700: new URL("@fontsource/tinos/files/tinos-latin-700-normal.woff", import.meta.url).toString(),
  },
  carlito: {
    400: new URL(
      "@fontsource/carlito/files/carlito-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/carlito/files/carlito-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
};

function resolveFontSrc(fontId: FontId, manifest: FontManifest, weight: 400 | 700): string {
  if (import.meta.env.SSR) {
    const basename = manifest.package.replace("@fontsource/", "");
    return nodeModule
      .createRequire(import.meta.url)
      .resolve(`${manifest.package}/files/${basename}-latin-${weight}-normal.woff`);
  }
  return BROWSER_FONT_URLS[fontId][weight];
}

let registered = false;

export function registerDocumentFonts(): void {
  if (registered) return;

  for (const [fontId, manifest] of Object.entries(FONT_MANIFEST) as Array<[FontId, FontManifest]>) {
    Font.register({
      family: fontId,
      fonts: [
        { src: resolveFontSrc(fontId, manifest, 400), fontWeight: 400 },
        { src: resolveFontSrc(fontId, manifest, BOLD_WEIGHT), fontWeight: BOLD_WEIGHT },
      ],
    });
  }

  registered = true;
}
