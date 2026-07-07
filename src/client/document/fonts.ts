// Self-hosted font registry (spec.md §28.3, roster locked at §31.2): the
// full 31-body/8-name-slot roster (src/shared/format-v2.ts's BODY_FONT_IDS /
// NAME_DISPLAY_FONT_IDS) via react-pdf's Font.register, never a runtime CDN
// and never free-form input. Every face is vendored through @fontsource
// except ibm-plex-mono (see PROVENANCE below). The react-pdf `family` string
// is the FontId itself, so a later renderer can pass a document's configured
// FontId straight through as `style.fontFamily` — no separate lookup table.
//
// PROVENANCE — ibm-plex-mono (E9-R2): BOTH assets @fontsource ever vendored
// for this face are individually defective under fontkit (the engine used by
// react-pdf), with complementary triggers. @fontsource/ibm-plex-mono's latin
// .woff (every published version) crashes fontkit ("Offset is outside the
// bounds of the DataView" in TTFGlyph._getCBox) reading the space glyph on
// ANY multi-word text (E9-R1). The same package's .woff2 (5.2.7, latest
// published — no newer release exists) renders spaces fine but crashes
// identically on a bare colon (E9-F0d1) — ordinary resume content (dates,
// ratios, labels). Neither vendored @fontsource asset is safe for resume
// prose. Fix: source the face from the official IBM `@ibm/plex-mono` npm
// package instead (OFL-1.1, same upstream font project as @fontsource's
// build, pinned exact at 2.5.0 — see package.json). Verified directly against
// fontkit (bypassing react-pdf) AND through a full react-pdf renderToBuffer,
// with punctuation-bearing multi-word text (colons, parens, %, &, digits,
// hyphen, em dash, slash) at both weights: the package's
// fonts/complete/woff/IBMPlexMono-{Regular,Bold}.woff render clean with no
// crash. (The complete/woff2 build renders clean too but bloats react-pdf's
// embedded subset ~140x vs the reference `ibm-plex-sans` woff render for the
// same fixture — an unexplained subsetting inefficiency specific to that
// asset's woff2 encoding — so .woff is the one wired here, matching every
// other face's format.) No TTF ships in the published npm package (only in
// `files`-restricted woff/woff2 dirs), so unlike every other face this one
// resolves through a package-specific complete/woff/<Weight>.woff path
// rather than the @fontsource `<pkg>/files/<basename>-latin-<weight>-normal.
// <format>` naming convention — see `manifest.files` below.
//
// SINGLE-WEIGHT NAME FACES (§31.2 E9-F2a): four of the 8 name-slot display
// faces (dm-serif-display, bebas-neue, archivo-black, abril-fatface) are
// single-weight designs upstream — @fontsource ships only their 400 file, no
// 700 exists to vendor. Both weights resolve to the same 400 asset via
// `manifest.files` (same override mechanism ibm-plex-mono uses for its
// nonstandard path) rather than crash on a missing bold file; "bold" simply
// renders as the one weight this face has, never a phantom face swap.
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
import type { BODY_FONT_IDS, NAME_DISPLAY_FONT_IDS } from "@shared/format-v2";

// The full registered roster: §31.2's 31 body ids + 8 name-slot ids (no
// overlap between the two lists) — NOT `@shared/types`'s legacy FontId
// (a 6-face v1 remnant that predates this roster and is unrelated to it).
export type FontId = (typeof BODY_FONT_IDS)[number] | (typeof NAME_DISPLAY_FONT_IDS)[number];

type FontManifest = {
  package: string;
  label: string;
  format: "woff" | "woff2";
  // Packages whose weight files don't follow the @fontsource
  // `<pkg>/files/<basename>-latin-<weight>-normal.<format>` convention (see
  // the ibm-plex-mono PROVENANCE and single-weight-name-face notes above)
  // list their exact per-weight subpaths here instead; `resolveFontSrc`
  // prefers this over the convention when present.
  files?: { 400: string; 700: string };
};

const FONT_MANIFEST: Record<FontId, FontManifest> = {
  "ibm-plex-sans": { package: "@fontsource/ibm-plex-sans", label: "IBM Plex Sans", format: "woff" },
  arimo: { package: "@fontsource/arimo", label: "Arimo (Arial)", format: "woff" },
  carlito: { package: "@fontsource/carlito", label: "Carlito (Calibri)", format: "woff" },
  "source-sans-3": {
    package: "@fontsource/source-sans-3",
    label: "Source Sans 3",
    format: "woff",
  },
  lato: { package: "@fontsource/lato", label: "Lato", format: "woff" },
  roboto: { package: "@fontsource/roboto", label: "Roboto", format: "woff" },
  "open-sans": { package: "@fontsource/open-sans", label: "Open Sans", format: "woff" },
  "work-sans": { package: "@fontsource/work-sans", label: "Work Sans", format: "woff" },
  "fira-sans": { package: "@fontsource/fira-sans", label: "Fira Sans", format: "woff" },
  inter: { package: "@fontsource/inter", label: "Inter", format: "woff" },
  "nunito-sans": { package: "@fontsource/nunito-sans", label: "Nunito Sans", format: "woff" },
  mulish: { package: "@fontsource/mulish", label: "Mulish", format: "woff" },
  karla: { package: "@fontsource/karla", label: "Karla", format: "woff" },
  manrope: { package: "@fontsource/manrope", label: "Manrope", format: "woff" },
  "ibm-plex-serif": {
    package: "@fontsource/ibm-plex-serif",
    label: "IBM Plex Serif",
    format: "woff",
  },
  tinos: { package: "@fontsource/tinos", label: "Tinos (Times New Roman)", format: "woff" },
  lora: { package: "@fontsource/lora", label: "Lora", format: "woff" },
  "source-serif-4": {
    package: "@fontsource/source-serif-4",
    label: "Source Serif 4",
    format: "woff",
  },
  "eb-garamond": { package: "@fontsource/eb-garamond", label: "EB Garamond", format: "woff" },
  merriweather: { package: "@fontsource/merriweather", label: "Merriweather", format: "woff" },
  "libre-baskerville": {
    package: "@fontsource/libre-baskerville",
    label: "Libre Baskerville",
    format: "woff",
  },
  "crimson-pro": { package: "@fontsource/crimson-pro", label: "Crimson Pro", format: "woff" },
  spectral: { package: "@fontsource/spectral", label: "Spectral", format: "woff" },
  bitter: { package: "@fontsource/bitter", label: "Bitter", format: "woff" },
  "zilla-slab": { package: "@fontsource/zilla-slab", label: "Zilla Slab", format: "woff" },
  "noto-serif": { package: "@fontsource/noto-serif", label: "Noto Serif", format: "woff" },
  "ibm-plex-mono": {
    package: "@ibm/plex-mono",
    label: "IBM Plex Mono",
    format: "woff",
    files: {
      400: "fonts/complete/woff/IBMPlexMono-Regular.woff",
      700: "fonts/complete/woff/IBMPlexMono-Bold.woff",
    },
  },
  inconsolata: { package: "@fontsource/inconsolata", label: "Inconsolata", format: "woff" },
  "space-mono": { package: "@fontsource/space-mono", label: "Space Mono", format: "woff" },
  "jetbrains-mono": {
    package: "@fontsource/jetbrains-mono",
    label: "JetBrains Mono",
    format: "woff",
  },
  "source-code-pro": {
    package: "@fontsource/source-code-pro",
    label: "Source Code Pro",
    format: "woff",
  },
  "playfair-display": {
    package: "@fontsource/playfair-display",
    label: "Playfair Display",
    format: "woff",
  },
  "dm-serif-display": {
    package: "@fontsource/dm-serif-display",
    label: "DM Serif Display",
    format: "woff",
    files: {
      400: "files/dm-serif-display-latin-400-normal.woff",
      700: "files/dm-serif-display-latin-400-normal.woff",
    },
  },
  oswald: { package: "@fontsource/oswald", label: "Oswald", format: "woff" },
  "bebas-neue": {
    package: "@fontsource/bebas-neue",
    label: "Bebas Neue",
    format: "woff",
    files: {
      400: "files/bebas-neue-latin-400-normal.woff",
      700: "files/bebas-neue-latin-400-normal.woff",
    },
  },
  "archivo-black": {
    package: "@fontsource/archivo-black",
    label: "Archivo Black",
    format: "woff",
    files: {
      400: "files/archivo-black-latin-400-normal.woff",
      700: "files/archivo-black-latin-400-normal.woff",
    },
  },
  "space-grotesk": {
    package: "@fontsource/space-grotesk",
    label: "Space Grotesk",
    format: "woff",
  },
  "abril-fatface": {
    package: "@fontsource/abril-fatface",
    label: "Abril Fatface",
    format: "woff",
    files: {
      400: "files/abril-fatface-latin-400-normal.woff",
      700: "files/abril-fatface-latin-400-normal.woff",
    },
  },
  "cormorant-garamond": {
    package: "@fontsource/cormorant-garamond",
    label: "Cormorant Garamond",
    format: "woff",
  },
};

export const FONT_FACES: Record<FontId, { label: string }> = Object.fromEntries(
  Object.entries(FONT_MANIFEST).map(([id, { label }]) => [id, { label }]),
) as Record<FontId, { label: string }>;

const BOLD_WEIGHT = 700;

// Every `new URL(...)` call below needs a literal string argument (not a
// variable) for Vite's asset transform to statically detect and bundle it —
// see the module comment. 78 literals (39 faces × 2 weights), written out
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
  arimo: {
    400: new URL("@fontsource/arimo/files/arimo-latin-400-normal.woff", import.meta.url).toString(),
    700: new URL("@fontsource/arimo/files/arimo-latin-700-normal.woff", import.meta.url).toString(),
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
  "source-sans-3": {
    400: new URL(
      "@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/source-sans-3/files/source-sans-3-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  lato: {
    400: new URL("@fontsource/lato/files/lato-latin-400-normal.woff", import.meta.url).toString(),
    700: new URL("@fontsource/lato/files/lato-latin-700-normal.woff", import.meta.url).toString(),
  },
  roboto: {
    400: new URL(
      "@fontsource/roboto/files/roboto-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/roboto/files/roboto-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "open-sans": {
    400: new URL(
      "@fontsource/open-sans/files/open-sans-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/open-sans/files/open-sans-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "work-sans": {
    400: new URL(
      "@fontsource/work-sans/files/work-sans-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/work-sans/files/work-sans-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "fira-sans": {
    400: new URL(
      "@fontsource/fira-sans/files/fira-sans-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/fira-sans/files/fira-sans-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  inter: {
    400: new URL("@fontsource/inter/files/inter-latin-400-normal.woff", import.meta.url).toString(),
    700: new URL("@fontsource/inter/files/inter-latin-700-normal.woff", import.meta.url).toString(),
  },
  "nunito-sans": {
    400: new URL(
      "@fontsource/nunito-sans/files/nunito-sans-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/nunito-sans/files/nunito-sans-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  mulish: {
    400: new URL(
      "@fontsource/mulish/files/mulish-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/mulish/files/mulish-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  karla: {
    400: new URL("@fontsource/karla/files/karla-latin-400-normal.woff", import.meta.url).toString(),
    700: new URL("@fontsource/karla/files/karla-latin-700-normal.woff", import.meta.url).toString(),
  },
  manrope: {
    400: new URL(
      "@fontsource/manrope/files/manrope-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/manrope/files/manrope-latin-700-normal.woff",
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
  tinos: {
    400: new URL("@fontsource/tinos/files/tinos-latin-400-normal.woff", import.meta.url).toString(),
    700: new URL("@fontsource/tinos/files/tinos-latin-700-normal.woff", import.meta.url).toString(),
  },
  lora: {
    400: new URL("@fontsource/lora/files/lora-latin-400-normal.woff", import.meta.url).toString(),
    700: new URL("@fontsource/lora/files/lora-latin-700-normal.woff", import.meta.url).toString(),
  },
  "source-serif-4": {
    400: new URL(
      "@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "eb-garamond": {
    400: new URL(
      "@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/eb-garamond/files/eb-garamond-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  merriweather: {
    400: new URL(
      "@fontsource/merriweather/files/merriweather-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/merriweather/files/merriweather-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "libre-baskerville": {
    400: new URL(
      "@fontsource/libre-baskerville/files/libre-baskerville-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/libre-baskerville/files/libre-baskerville-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "crimson-pro": {
    400: new URL(
      "@fontsource/crimson-pro/files/crimson-pro-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/crimson-pro/files/crimson-pro-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  spectral: {
    400: new URL(
      "@fontsource/spectral/files/spectral-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/spectral/files/spectral-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  bitter: {
    400: new URL(
      "@fontsource/bitter/files/bitter-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/bitter/files/bitter-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "zilla-slab": {
    400: new URL(
      "@fontsource/zilla-slab/files/zilla-slab-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/zilla-slab/files/zilla-slab-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "noto-serif": {
    400: new URL(
      "@fontsource/noto-serif/files/noto-serif-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/noto-serif/files/noto-serif-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "ibm-plex-mono": {
    400: new URL(
      "@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Regular.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Bold.woff",
      import.meta.url,
    ).toString(),
  },
  inconsolata: {
    400: new URL(
      "@fontsource/inconsolata/files/inconsolata-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/inconsolata/files/inconsolata-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "space-mono": {
    400: new URL(
      "@fontsource/space-mono/files/space-mono-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/space-mono/files/space-mono-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "jetbrains-mono": {
    400: new URL(
      "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "source-code-pro": {
    400: new URL(
      "@fontsource/source-code-pro/files/source-code-pro-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/source-code-pro/files/source-code-pro-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "playfair-display": {
    400: new URL(
      "@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "dm-serif-display": {
    400: new URL(
      "@fontsource/dm-serif-display/files/dm-serif-display-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/dm-serif-display/files/dm-serif-display-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
  },
  oswald: {
    400: new URL(
      "@fontsource/oswald/files/oswald-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/oswald/files/oswald-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "bebas-neue": {
    400: new URL(
      "@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "archivo-black": {
    400: new URL(
      "@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "space-grotesk": {
    400: new URL(
      "@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "abril-fatface": {
    400: new URL(
      "@fontsource/abril-fatface/files/abril-fatface-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/abril-fatface/files/abril-fatface-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
  },
  "cormorant-garamond": {
    400: new URL(
      "@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff",
      import.meta.url,
    ).toString(),
    700: new URL(
      "@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff",
      import.meta.url,
    ).toString(),
  },
};

function resolveFontSrc(fontId: FontId, manifest: FontManifest, weight: 400 | 700): string {
  if (import.meta.env.SSR) {
    const subpath =
      manifest.files?.[weight] ??
      `files/${manifest.package.replace("@fontsource/", "")}-latin-${weight}-normal.${manifest.format}`;
    return nodeModule.createRequire(import.meta.url).resolve(`${manifest.package}/${subpath}`);
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
