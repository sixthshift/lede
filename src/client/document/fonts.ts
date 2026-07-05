// Self-hosted font registry (spec.md §28.3): a curated ~12-face set via
// react-pdf's Font.register, never a runtime CDN and never free-form input.
// Every face is vendored through @fontsource and resolved to a local
// node_modules file — IBM Plex (sans/serif/mono) plus the metric-compatible
// stand-ins Arimo→Arial, Tinos→Times New Roman, Carlito→Calibri.
//
// react-pdf/fontkit only consumes .woff/.ttf (not .woff2), so every face
// below is the package's latin .woff. The react-pdf `family` string is the
// FontId itself, so a later renderer can pass a document's configured
// FontId straight through as `style.fontFamily` — no separate lookup table.

import { createRequire } from "node:module";
import { Font } from "@react-pdf/renderer";
import type { FontId } from "@shared/types";

const require = createRequire(import.meta.url);

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

function resolveFontFile(pkgName: string, weight: 400 | 700): string {
  const basename = pkgName.replace("@fontsource/", "");
  return require.resolve(`${pkgName}/files/${basename}-latin-${weight}-normal.woff`);
}

let registered = false;

export function registerDocumentFonts(): void {
  if (registered) return;

  for (const [fontId, { package: pkgName }] of Object.entries(FONT_MANIFEST) as Array<
    [FontId, FontManifest]
  >) {
    Font.register({
      family: fontId,
      fonts: [
        { src: resolveFontFile(pkgName, 400), fontWeight: 400 },
        { src: resolveFontFile(pkgName, BOLD_WEIGHT), fontWeight: BOLD_WEIGHT },
      ],
    });
  }

  registered = true;
}
