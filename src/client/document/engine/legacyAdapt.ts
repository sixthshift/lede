// The seam between the v2 axis space (§31.2, src/shared/format-v2.ts) and the
// one renderer contract this ticket must not touch: sections.tsx's
// buildStyles() reads typography/colors/page/photo off the LEGACY
// `DocumentFormat` shape (src/shared/types.ts). Every v2 axis this ticket
// wires for single-column parity is projected through this one function —
// see the engine-entry comment in document.tsx for which axes aren't wired
// yet and why.
import type { DocumentFormat, FontId } from "@shared/types";
import type { DocumentFormatV2 } from "@shared/format-v2";

// sections.tsx's fontFamily is just a string handed to react-pdf; only these
// ids have a registered face (src/client/document/fonts.ts) as of this
// ticket. A v2 body font outside this set falls back to the roster's default
// face — the "unhandled axis renders as the default look" contract (the
// other 25 §31.2 body-font ids register in a later ticket, F2).
//
// "ibm-plex-mono" stays EXCLUDED — RE-VERIFIED this ticket, deviating from
// this ticket's brief ("REMOVE legacyAdapt.ts's temporary ibm-plex-mono
// exclusion — the per-face render smoke protects it"). E9-R1 swapped the
// vendored asset from .woff to .woff2 because the .woff crashed fontkit
// ("Offset is outside the bounds of the DataView") on ANY multi-word text —
// the .woff2 genuinely fixes THAT trigger (confirmed directly against
// fontkit: "Acme Engineer", "a b" now render clean). But removing the
// exclusion this ticket re-exposed a SECOND, narrower trigger the existing
// per-face smoke never happened to contain: @fontsource/ibm-plex-mono
// 5.2.7's .woff2 (latest published version — no newer release exists)
// crashes fontkit on a bare colon (":"), reproduced isolated from this
// engine (single Text node, "test-woff2" family, content ":") and NOT
// present in the ORIGINAL .woff (which is fine with ":" but crashes on
// spaces) — i.e. the two vendored assets have complementary defects, no
// single one of the two is safe for general resume prose (colons are
// ordinary resume content — dates, labels, ratios). No fontkit patch or
// alternate published version was available to try within this ticket's
// scope (fonts.ts, the file that would own such a fix, only vendors
// woff/woff2 — no ttf exists in the package to fall back to either).
// Falling back to the default face keeps the axis from crashing; unexcluding
// ibm-plex-mono is a follow-up ticket's job once a clean asset/patch exists.
const LEGACY_FONT_IDS = new Set<string>([
  "ibm-plex-sans",
  "ibm-plex-serif",
  "arimo",
  "tinos",
  "carlito",
]);

function resolveFont(id: string): FontId {
  return LEGACY_FONT_IDS.has(id) ? (id as FontId) : "ibm-plex-sans";
}

// 72pt / 25.4mm, the standard point/millimeter conversion. format-v2.ts
// carries the opposite-direction conversion (pt->mm) as a private constant
// for its v1->v2 migration; this ticket's file contract can't edit that file
// to export it, so the engine keeps its own copy of the same physical
// constant for the mm->pt direction it needs.
const PT_PER_MM = 72 / 25.4;

// header.nameWeight/titleWeight is a 2-value toggle; sections.tsx exposes a
// single `typography.heading.weight` used for the name AND every heading —
// there is no seam to give them independent weights without editing the
// locked renderer, so both toggles collapse onto that one field (nameWeight
// wins — matches the historical v1 behavior migrateFormat's baseFromV1
// already derives from a single source weight).
function resolveWeight(format: DocumentFormatV2): 400 | 700 {
  return format.header.nameWeight === "bold" ? 700 : 400;
}

// This ticket's engine is a design-only composition, never a persisted
// record — the `templateId` field is unused by sections.tsx and carries no
// behavior; a fixed placeholder keeps the legacy shape's required field
// filled without reading the v2 format's own identity (locked: the engine
// never branches on preset identity).
const ENGINE_TEMPLATE_ID = "engine-v2";

export function toLegacyFormat(format: DocumentFormatV2): DocumentFormat {
  const bodyFont = resolveFont(format.fonts.body);
  return {
    templateId: ENGINE_TEMPLATE_ID,
    typography: {
      body: {
        family: bodyFont,
        size: format.typeScale.bodySize,
        lineHeight: format.spacing.lineHeight,
      },
      heading: { family: bodyFont, weight: resolveWeight(format) },
    },
    colors: { primary: format.colors.accent, text: format.colors.text },
    page: {
      marginX: format.spacing.marginsMm.x * PT_PER_MM,
      marginY: format.spacing.marginsMm.y * PT_PER_MM,
      // elementSpacing is a discrete 0-4 scale (§31.2); 6pt/step reproduces
      // format-v2.ts's baseFromV1 round-trip (its private
      // ELEMENT_SPACING_PT_STEP constant, same reasoning as PT_PER_MM above:
      // not exported, so the engine keeps its own copy of the same number).
      sectionGap: format.spacing.elementSpacing * 6,
    },
    photo: { hidden: format.photo.hidden, size: format.photo.size, shape: format.photo.shape },
    sections: {},
  };
}
