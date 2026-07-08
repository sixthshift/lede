// The seam between the v2 axis space (§31.2, src/shared/format-v2.ts) and the
// one renderer contract this ticket must not touch: sections.tsx's
// buildStyles() reads typography/colors/page/photo off the LEGACY
// `DocumentFormat` shape (src/shared/types.ts). Every v2 axis this ticket
// wires for single-column parity is projected through this one function —
// see the engine-entry comment in document.tsx for which axes aren't wired
// yet and why.
import type { DocumentFormat, FontId } from "@shared/types";
import type {
  AccentPlacementV2,
  ContactIconStyle,
  DateFormatV2,
  DocumentFormatV2,
  EntriesV2,
  HeaderDetailsArrangement,
  HeaderSeparator,
  HeaderTitlePosition,
  HeadingCapitalization,
  HeadingIconStyle,
  HeadingStyle,
  LinksV2,
  PhotoV2,
  SectionDisplayV2,
} from "@shared/format-v2";

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

// header.nameWeight is a 2-value toggle; sections.tsx exposes a single
// `typography.heading.weight` used for the name AND every section/entry
// heading (there is no independent per-role weight seam on the legacy
// `DocumentFormat` shape) — so nameWeight alone drives this one field,
// matching the historical v1 behavior migrateFormat's baseFromV1 already
// derives from a single source weight. header.titleWeight is now INDEPENDENT
// (E9-F3c) — it no longer collapses onto this field; see
// resolveHeaderConfig's own `titleWeight` below, threaded to sections.tsx's
// `title` (profile.headline) style alone.
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

// typeScale's 4 offsets (§31.2, nameOffset/titleOffset/sectionHeadingOffset/
// entryHeaderOffset) each resolve to one rendered role's absolute size —
// bodySize plus that role's own offset. There is no per-role size field on
// the legacy `DocumentFormat` shape this file returns (typography carries
// one shared body/heading pair, not four independent sizes), so — same
// seam as resolveNameFont/nameFontFamily above — these are threaded onto the
// returned object as an EXTRA property (`typeScaleSizes`, optional on the
// type sections.tsx reads it through) rather than a `DocumentFormat` field.
// It survives density.ts's `{...format, ...}` reconstruction (which only
// overrides `typography`/`page`, never touches unrelated top-level keys), so
// it reaches sections.tsx unscaled by density — this ticket wires the 4
// offsets' bounded values, not their interaction with the density ladder.
export type TypeScaleSizes = {
  name: number;
  title: number;
  sectionHeading: number;
  entryHeader: number;
};

function resolveTypeScaleSizes(format: DocumentFormatV2): TypeScaleSizes {
  const { bodySize, nameOffset, titleOffset, sectionHeadingOffset, entryHeaderOffset } =
    format.typeScale;
  return {
    name: bodySize + nameOffset,
    title: bodySize + titleOffset,
    sectionHeading: bodySize + sectionHeadingOffset,
    entryHeader: bodySize + entryHeaderOffset,
  };
}

// headings.{style,capitalization,icons} (§31.2) already resolve 1:1 to what
// sections.tsx needs — no derivation, unlike resolveWeight/resolveTypeScaleSizes
// above. It still needs the SAME threading trick: the legacy `DocumentFormat`
// shape has one hardcoded section-label look (underline/uppercase/no icon)
// with no per-axis seam, so this rides along as an extra property
// (`headingsConfig`) exactly like typeScaleSizes/nameFontFamily.
export type HeadingsRenderConfig = {
  style: HeadingStyle;
  capitalization: HeadingCapitalization;
  icons: HeadingIconStyle;
};

function resolveHeadingsConfig(format: DocumentFormatV2): HeadingsRenderConfig {
  return { ...format.headings };
}

// document.dateFormat (§31.2) resolves 1:1 to sections.tsx's formatDate
// preset argument — no derivation needed, same as headingsConfig above. It
// rides the same extra-property seam (`dateFormat`) because the legacy
// `DocumentFormat` shape this file returns has no date-format field at all.
//
// entries.* (§31.2, E9-F2e) resolves 1:1 to sections.tsx's entry-header
// composition — no derivation, same as headingsConfig/dateFormat above. Named
// `entriesConfig` (not `entries`) to avoid colliding with the legacy shape's
// OWN `sections` field name and to keep the "*Config" naming this seam
// already uses for direct 1:1 passthroughs.
export type EntriesRenderConfig = EntriesV2;

function resolveEntriesConfig(format: DocumentFormatV2): EntriesRenderConfig {
  return { ...format.entries };
}

// header.{detailsArrangement,separator,contactIconStyle,titlePosition} (§31.2,
// E9-F3c) resolve 1:1 to sections.tsx's ProfileHeader composition — no
// derivation, same seam as headingsConfig/entriesConfig above (`headerConfig`,
// following the same "*Config" naming). titleWeight is the one derived field
// here: same normal/bold -> 400/700 mapping resolveWeight uses for nameWeight,
// but resolved INDEPENDENTLY into its own field rather than reusing
// resolveWeight's single shared `typography.heading.weight` — this is the
// seam that makes titleWeight and nameWeight genuinely independent (previously
// both read off that one shared field).
export type HeaderRenderConfig = {
  detailsArrangement: HeaderDetailsArrangement;
  separator: HeaderSeparator;
  contactIconStyle: ContactIconStyle;
  titleWeight: 400 | 700;
  titlePosition: HeaderTitlePosition;
};

function resolveHeaderConfig(format: DocumentFormatV2): HeaderRenderConfig {
  const { detailsArrangement, separator, contactIconStyle, titleWeight, titlePosition } =
    format.header;
  return {
    detailsArrangement,
    separator,
    contactIconStyle,
    titleWeight: titleWeight === "bold" ? 700 : 400,
    titlePosition,
  };
}

// links.{underline,accentColor,icon} (§31.2, E9-F3c) resolve 1:1 to
// sections.tsx's profile-link rendering — no derivation, same seam as
// headerConfig above (`linksConfig`).
export type LinksRenderConfig = LinksV2;

function resolveLinksConfig(format: DocumentFormatV2): LinksRenderConfig {
  return { ...format.links };
}

// colors.accentPlacement (§31.2, E9-F3d) resolves 1:1 to sections.tsx's
// per-element-class accent-vs-text gate — no derivation, same seam as
// linksConfig above (`accentPlacementConfig`).
export type AccentPlacementRenderConfig = AccentPlacementV2;

function resolveAccentPlacementConfig(format: DocumentFormatV2): AccentPlacementRenderConfig {
  return { ...format.colors.accentPlacement };
}

// photo.{crop,zoom} (§31.2, E9-F3f) arrive as an extra property on `format`,
// same seam as linksConfig/accentPlacementConfig above — NOT folded into the
// `photo` field below, because that field's static type is the legacy
// `DocumentFormat["photo"]` shape ({hidden,size,shape}, src/shared/types.ts),
// which this ticket's scope contract doesn't extend. size/shape stay on
// `photo` (unchanged since before this ticket); crop/zoom ride the same
// "*Config" passthrough sections.tsx already reads headerConfig/linksConfig
// through.
export type PhotoRenderConfig = Pick<PhotoV2, "crop" | "zoom">;

function resolvePhotoConfig(format: DocumentFormatV2): PhotoRenderConfig {
  return { crop: { ...format.photo.crop }, zoom: format.photo.zoom };
}

// sectionDisplay.* (§31.4) resolves 1:1 to sections.tsx's per-section display
// composition — no derivation, same seam as linksConfig/accentPlacementConfig
// above (`sectionDisplayConfig`). E9-F4b wired skillsLanguages/interests
// (the items-grid groups); this ticket (E9-F4c) widens the same seam to
// experience/summary/education (the narrative-section groups) — the full
// SectionDisplayV2 shape now passes through, since every one of its groups
// has a render consumer in sections.tsx.
export type SectionDisplayRenderConfig = SectionDisplayV2;

function resolveSectionDisplayConfig(format: DocumentFormatV2): SectionDisplayRenderConfig {
  return {
    skillsLanguages: {
      ...format.sectionDisplay.skillsLanguages,
      levelLabels: [...format.sectionDisplay.skillsLanguages.levelLabels],
    },
    interests: { ...format.sectionDisplay.interests },
    experience: { ...format.sectionDisplay.experience },
    summary: { ...format.sectionDisplay.summary },
    education: { ...format.sectionDisplay.education },
  };
}

export function toLegacyFormat(format: DocumentFormatV2): DocumentFormat & {
  typeScaleSizes: TypeScaleSizes;
  headingsConfig: HeadingsRenderConfig;
  dateFormat: DateFormatV2;
  entriesConfig: EntriesRenderConfig;
  headerConfig: HeaderRenderConfig;
  linksConfig: LinksRenderConfig;
  accentPlacementConfig: AccentPlacementRenderConfig;
  photoConfig: PhotoRenderConfig;
  sectionDisplayConfig: SectionDisplayRenderConfig;
} {
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
    typeScaleSizes: resolveTypeScaleSizes(format),
    headingsConfig: resolveHeadingsConfig(format),
    dateFormat: format.document.dateFormat,
    entriesConfig: resolveEntriesConfig(format),
    headerConfig: resolveHeaderConfig(format),
    linksConfig: resolveLinksConfig(format),
    accentPlacementConfig: resolveAccentPlacementConfig(format),
    photoConfig: resolvePhotoConfig(format),
    sectionDisplayConfig: resolveSectionDisplayConfig(format),
  };
}
