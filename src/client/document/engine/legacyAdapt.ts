// The seam between the v2 axis space (§31.2, src/shared/format-v2.ts) and the
// one renderer contract this ticket must not touch: sections.tsx's
// buildStyles() reads typography/colors/page/photo off the LEGACY
// `DocumentFormat` shape (src/shared/types.ts). Every v2 axis this ticket
// wires for single-column parity is projected through this one function —
// see the engine-entry comment in document.tsx for which axes aren't wired
// yet and why.
import type { DocumentFormat, FontId } from "@shared/types";
import type { DocumentFormatV2 } from "@shared/format-v2";

// sections.tsx's fontFamily is just a string handed to react-pdf. §31.2's
// full 31-body/8-name-slot roster now registers a face for every id
// (src/client/document/fonts.ts, E9-F2a) — so a v2 body font resolves to
// itself, full stop; there is no longer a "roster face with no registered
// look" case to fall back from. `id`'s static type is `@shared/types`'s
// legacy 6-value FontId (this function feeds `DocumentFormat.typography`,
// whose `family` field is locked to that type) even though the runtime
// value is one of the roster's 39 ids — the assertion is safe because
// fonts.ts's Font.register call keys on the SAME string the caller passes
// in as `family`, so react-pdf resolves the actual registered face
// regardless of what TypeScript's legacy type says it "should" be.
function resolveFont(id: string): FontId {
  return id as FontId;
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

// fonts.name (§31.2) has no seam on the legacy `DocumentFormat` shape this
// file's return type is locked to (its typography carries one shared
// `heading.family`, not an independent name slot) — so the name-slot font
// is resolved here but threaded to the renderer as its own prop
// (document.tsx -> sections.tsx's ProfileHeader), not through
// toLegacyFormat's return value. "same-as-body" (the default) defers to the
// already-resolved body font; any of the 8 §31.2 NAME_DISPLAY_FONT_IDS
// resolves to itself, same reasoning as resolveFont above.
export function resolveNameFont(format: DocumentFormatV2): FontId {
  const { name } = format.fonts;
  return name === "same-as-body" ? resolveFont(format.fonts.body) : (name as unknown as FontId);
}

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
