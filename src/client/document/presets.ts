// Preset v2 configs (spec.md §31.1: "the six E7/E8 code templates are
// RETIRED as code and reborn as the first six presets"). Each of the six
// LEGACY presets is a pure migration of that template's v1 default config,
// plus its own identity — never a hand-authored fork of the axes
// (migrateFormat already encodes each retired template's composition delta,
// see src/shared/format-v2.ts's TEMPLATE_V2_OVERLAYS).
//
// E9-F5c adds a second, v2-NATIVE roster: curated presets with no v1
// predecessor, composed directly off DEFAULT_FORMAT_V2 rather than through
// migrateFormat (there is nothing to migrate — they never existed as a v1
// template). Same contract as the legacy six otherwise: every axis they set
// is one already wired by the engine (../engine/document.tsx's own "AXES
// WIRED" ledger), never a new render path.
import { DEFAULT_FORMAT } from "@shared/format";
import { migrateFormat, DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import { SECTION_VALUES } from "@shared/sections";
import type { DocumentFormat, Section } from "@shared/types";

export const LEGACY_PRESET_IDS = [
  "strict",
  "classic",
  "compact",
  "banner",
  "sidebar-left",
  "sidebar-right",
] as const;
export type LegacyPresetId = (typeof LEGACY_PRESET_IDS)[number];

export const NEW_AXIS_PRESET_IDS = ["signature", "ledger", "frame", "spotlight"] as const;
export type NewAxisPresetId = (typeof NEW_AXIS_PRESET_IDS)[number];

export const PRESET_IDS = [...LEGACY_PRESET_IDS, ...NEW_AXIS_PRESET_IDS] as const;
export type PresetId = (typeof PRESET_IDS)[number];

// The only field that varies across the six legacy templates' v1 defaults is
// templateId — colors/typography/page/photo start from the same instance
// default (src/shared/format.ts's DEFAULT_FORMAT) today.
function v1DefaultFor(templateId: LegacyPresetId): DocumentFormat {
  return { ...DEFAULT_FORMAT, templateId };
}

const LEGACY_PRESETS: Record<LegacyPresetId, DocumentFormatV2> = Object.fromEntries(
  LEGACY_PRESET_IDS.map((id) => [id, { ...migrateFormat(v1DefaultFor(id)), presetId: id }]),
) as Record<LegacyPresetId, DocumentFormatV2>;

// Every section not named here lands in 'main' — same convention the
// retired sidebar-left/right compositions used (format-v2.ts's
// sidebarSectionPlacement), reconstructed here since that helper is private
// to format-v2.ts (not exported, and this ticket's declared files don't
// include that module).
function sectionPlacementFor(
  sidebarSections: readonly Section[],
): Partial<Record<Section, { column: "main" | "sidebar" }>> {
  const placement: Partial<Record<Section, { column: "main" | "sidebar" }>> = {};
  for (const section of SECTION_VALUES) {
    placement[section] = { column: sidebarSections.includes(section) ? "sidebar" : "main" };
  }
  return placement;
}

const SPOTLIGHT_SIDEBAR_SECTIONS: readonly Section[] = [
  "skill",
  "language",
  "interest",
  "certification",
];

// New-axis presets (§31.5's vetted design, E9-F5c): each composes ATS-graded
// axes already wired by the engine — no render-path change. Every field not
// mentioned below stays at DEFAULT_FORMAT_V2's own baseline.
const NEW_AXIS_PRESETS: Record<NewAxisPresetId, DocumentFormatV2> = {
  // Single-column, strict — accent-bar headings, a display name face, rich
  // accent placement, dot-style skill/language levels: every one of these
  // axes is ATS-neutral per the §31.5 table (headings.style/fonts.name/
  // colors.accentPlacement/sectionDisplay.levelDisplay never appear in
  // atsGradeCauses), so 'strict' is earned, not asserted.
  signature: {
    ...DEFAULT_FORMAT_V2,
    presetId: "signature",
    headings: { ...DEFAULT_FORMAT_V2.headings, style: "accent-bar" },
    fonts: { ...DEFAULT_FORMAT_V2.fonts, name: "space-grotesk" },
    colors: {
      ...DEFAULT_FORMAT_V2.colors,
      accentPlacement: {
        name: true,
        title: true,
        headings: true,
        headingRules: true,
        headerIcons: true,
        levelIndicators: true,
        dates: true,
        entrySubtitles: true,
        linkIcons: true,
      },
    },
    sectionDisplay: {
      ...DEFAULT_FORMAT_V2.sectionDisplay,
      skillsLanguages: {
        ...DEFAULT_FORMAT_V2.sectionDisplay.skillsLanguages,
        levelDisplay: "dots",
      },
    },
  },
  // Single-column, strict — thin-underline headings, split date/location,
  // indented item bodies, circle-filled contact icons, a display name face.
  // entries.{dateLocationPlacement,bodyIndent} and header.contactIconStyle
  // are likewise absent from atsGradeCauses (§31.5 table): none of them
  // downgrade the grade.
  ledger: {
    ...DEFAULT_FORMAT_V2,
    presetId: "ledger",
    headings: { ...DEFAULT_FORMAT_V2.headings, style: "thin-underline" },
    entries: {
      ...DEFAULT_FORMAT_V2.entries,
      dateLocationPlacement: "split",
      bodyIndent: true,
    },
    header: { ...DEFAULT_FORMAT_V2.header, contactIconStyle: "circle-filled" },
    fonts: { ...DEFAULT_FORMAT_V2.fonts, name: "oswald" },
  },
  // Single-column, strict — a 4-side accent-colored page frame (colors.area
  // 'border', mode stays 'single': the §31.5 table only downgrades a
  // colored PAGE background in 'multi' mode over 'full-page'/'border' —
  // single-mode border is the pre-existing ATS-neutral case, unchanged),
  // boxed headings, a display name face.
  frame: {
    ...DEFAULT_FORMAT_V2,
    presetId: "frame",
    colors: {
      ...DEFAULT_FORMAT_V2.colors,
      area: "border",
      mode: "single",
      border: { size: "m", sides: { top: true, right: true, bottom: true, left: true } },
    },
    headings: { ...DEFAULT_FORMAT_V2.headings, style: "boxed" },
    fonts: { ...DEFAULT_FORMAT_V2.fonts, name: "archivo-black" },
  },
  // Two-column, capped 'good' (layout.columns !== 'one' always downgrades,
  // §31.5 table) — columns:'mix' renders a full-width header band ABOVE the
  // sidebar/main split (engine/document.tsx), visually distinct from
  // sidebar-left/right's columns:'two' (header folded INTO the sidebar
  // column) even at the identical sidebarWidthPct those two use (proven-safe
  // column geometry — resolveColumnGeometry divides the row identically
  // regardless of columnsMode, so this reuses exactly the width the legacy
  // sidebar presets already render correctly at, rather than picking a new
  // number that could reflow a long word into a hyphenated line break).
  spotlight: {
    ...DEFAULT_FORMAT_V2,
    presetId: "spotlight",
    layout: {
      ...DEFAULT_FORMAT_V2.layout,
      columns: "mix",
      headerPosition: "left",
      sidebarWidthPct: 32,
      sectionPlacement: sectionPlacementFor(SPOTLIGHT_SIDEBAR_SECTIONS),
    },
  },
};

export const PRESETS: Record<PresetId, DocumentFormatV2> = {
  ...LEGACY_PRESETS,
  ...NEW_AXIS_PRESETS,
};

// Single-column presets — strict/classic/compact/banner (legacy) plus the
// new-axis single-column strict presets (signature/ledger/frame); sidebar-
// left/right and spotlight are all columnar.
export const SINGLE_COLUMN_PRESET_IDS = [
  "strict",
  "classic",
  "compact",
  "banner",
  "signature",
  "ledger",
  "frame",
] as const;

export function isPresetId(id: string): id is PresetId {
  return (PRESET_IDS as readonly string[]).includes(id);
}

// Applying a preset (spec.md §31.1: "applying one rewrites panel state") means
// adopting that preset's COMPOSITION while preserving every stylistic axis
// the user already dialed in (colors.accent/text, fonts.body, header.
// nameWeight/titleWeight, …) — exactly like v1's templateId switch left
// typography/colors/page untouched. The composition-only fields below are
// picked individually off the target preset rather than merged wholesale, so
// a user's own customization of the REST of each field's group survives the
// switch. `layout` is taken wholesale (columns/headerPosition/
// sidebarWidthPct/sectionPlacement are one coupled composition, never mixed-
// and-matched across presets).
//
// E9-F5c widens this same picked-individually contract to the axes the new
// curated presets introduce as their own identity (headings.style, fonts.
// name, header.contactIconStyle, colors.border, colors.accentPlacement,
// entries.dateLocationPlacement/bodyIndent, sectionDisplay.skillsLanguages.
// levelDisplay) — every legacy preset shares one identical baseline value on
// each of these fields (TEMPLATE_V2_OVERLAYS never touches them), so this is
// a no-op widening for switches among the original six.
export function applyPreset(current: DocumentFormatV2, presetId: PresetId): DocumentFormatV2 {
  const preset = PRESETS[presetId];
  return {
    ...current,
    presetId,
    layout: preset.layout,
    header: {
      ...current.header,
      alignment: preset.header.alignment,
      detailsArrangement: preset.header.detailsArrangement,
      contactIconStyle: preset.header.contactIconStyle,
    },
    headings: { ...current.headings, style: preset.headings.style },
    fonts: { ...current.fonts, name: preset.fonts.name },
    colors: {
      ...current.colors,
      area: preset.colors.area,
      border: preset.colors.border,
      accentPlacement: preset.colors.accentPlacement,
    },
    entries: {
      ...current.entries,
      dateLocationPlacement: preset.entries.dateLocationPlacement,
      bodyIndent: preset.entries.bodyIndent,
    },
    sectionDisplay: {
      ...current.sectionDisplay,
      skillsLanguages: {
        ...current.sectionDisplay.skillsLanguages,
        levelDisplay: preset.sectionDisplay.skillsLanguages.levelDisplay,
      },
    },
  };
}
