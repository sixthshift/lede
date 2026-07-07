// DocumentFormat v2 — spec.md §31.2 (design engine v2, epic E9). ADDITIVE ONLY:
// this file introduces the v2 axis space and the v1→v2 migration; it does not
// touch the existing `DocumentFormat` (src/shared/types.ts) or any consumer —
// the render-engine cutover is a later ticket. Every axis here is an
// enum/bounded range/curated list, never raw CSS or free positioning (§31.1).
import { z } from "zod";
import { SECTION_VALUES } from "@shared/sections";
import { DEFAULT_FORMAT } from "@shared/format";
import type { DocumentFormat, Section } from "@shared/types";

// ── Document ──
export type PageFormat = "a4" | "letter";
export const DATE_FORMATS = [
  "MM/DD/YYYY",
  "MMM DD, YYYY",
  "MMMM Do, YYYY",
  "DD/MM/YYYY",
  "DD.MM.YYYY",
  "DD MMM YYYY",
  "Do MMMM YYYY",
  "YYYY-MM-DD",
  "YYYY.MM.DD",
  "YYYY/MM/DD",
  "YYYY MMM DD",
  "YYYY MMMM DD",
] as const;
export type DateFormatV2 = (typeof DATE_FORMATS)[number];

export type DocumentV2 = { pageFormat: PageFormat; dateFormat: DateFormatV2 };

// ── Layout ──
export type ColumnsMode = "one" | "two" | "mix";
export type HeaderPosition = "top" | "left" | "right";
export type SectionColumn = "main" | "sidebar";

export type LayoutV2 = {
  columns: ColumnsMode;
  headerPosition: HeaderPosition;
  sidebarWidthPct: number; // 25-40
  sectionPlacement: Partial<Record<Section, { column: SectionColumn }>>;
  manualPageBreaks: Section[]; // force a page break immediately before this section
};

// ── Type scale ──
export type TypeScaleV2 = {
  bodySize: number; // 9-12 pt
  nameOffset: number; // +4..+12 pt over bodySize
  titleOffset: number; // 0..+4 pt over bodySize
  sectionHeadingOffset: number; // 0..+3 pt over bodySize
  entryHeaderOffset: number; // 0..+2 pt over bodySize
};

// ── Spacing ──
export type SpacingV2 = {
  lineHeight: number; // 1.15-1.5
  elementSpacing: number; // 0-4, discrete scale
  marginsMm: { x: number; y: number }; // each 10-28mm, paired L&R / T&B
};

// ── Entries ──
export type EntryStructure = "full-width" | "columns";
export type EntryDateLocationPlacement = "right" | "left" | "split";
export type EntryDateLocationOrder = "date-first" | "location-first";
export type EntrySubtitlePlacement = "same-line" | "below";
export type EntryListStyle = "bullet" | "hyphen";
export type EntryFontStyle = "normal" | "bold" | "italic";

export type EntriesV2 = {
  structure: EntryStructure;
  dateLocationPlacement: EntryDateLocationPlacement;
  dateLocationOrder: EntryDateLocationOrder;
  subtitlePlacement: EntrySubtitlePlacement;
  listStyle: EntryListStyle;
  subtitleFontStyle: EntryFontStyle;
  dateFontStyle: EntryFontStyle;
  locationFontStyle: EntryFontStyle;
  bodyIndent: boolean;
};

// ── Headings ──
export const HEADING_STYLES = [
  "underline",
  "boxed",
  "outline-short-rule",
  "rules-above-below",
  "accent-bar",
  "plain",
  "thin-underline",
  "tick-marks",
] as const;
export type HeadingStyle = (typeof HEADING_STYLES)[number];
export type HeadingCapitalization = "capitalize" | "uppercase";
export type HeadingIconStyle = "none" | "outline" | "filled";

export type HeadingsV2 = {
  style: HeadingStyle;
  capitalization: HeadingCapitalization;
  icons: HeadingIconStyle;
};

// ── Fonts (§31.2, roster fixed at intake [v3-038..040]) ──
export const BODY_FONT_IDS = [
  // sans
  "ibm-plex-sans",
  "arimo",
  "carlito",
  "source-sans-3",
  "lato",
  "roboto",
  "open-sans",
  "work-sans",
  "fira-sans",
  "inter",
  "nunito-sans",
  "mulish",
  "karla",
  "manrope",
  // serif
  "ibm-plex-serif",
  "tinos",
  "lora",
  "source-serif-4",
  "eb-garamond",
  "merriweather",
  "libre-baskerville",
  "crimson-pro",
  "spectral",
  "bitter",
  "zilla-slab",
  "noto-serif",
  // mono
  "ibm-plex-mono",
  "inconsolata",
  "space-mono",
  "jetbrains-mono",
  "source-code-pro",
] as const;
export type BodyFontId = (typeof BODY_FONT_IDS)[number];

export const NAME_DISPLAY_FONT_IDS = [
  "playfair-display",
  "dm-serif-display",
  "oswald",
  "bebas-neue",
  "archivo-black",
  "space-grotesk",
  "abril-fatface",
  "cormorant-garamond",
] as const;
export type NameFontId = "same-as-body" | (typeof NAME_DISPLAY_FONT_IDS)[number];

export type FontsV2 = { body: BodyFontId; name: NameFontId };

// ── Colors ──
export type ColorArea = "full-page" | "header" | "border";
export type ColorMode = "single" | "multi";
export type BorderSize = "s" | "m" | "l";

export type AccentPlacementV2 = {
  name: boolean;
  title: boolean;
  headings: boolean;
  headingRules: boolean;
  headerIcons: boolean;
  levelIndicators: boolean;
  dates: boolean;
  entrySubtitles: boolean;
  linkIcons: boolean;
};

export type ColorsV2 = {
  area: ColorArea;
  mode: ColorMode;
  text: string; // hex
  background: string; // hex
  accent: string; // hex
  border: {
    size: BorderSize;
    sides: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  };
  accentPlacement: AccentPlacementV2;
};

// ── Header ──
export type HeaderAlignment = "left" | "center";
export type HeaderDetailsArrangement = "stacked" | "single-row" | "wrapped";
export type HeaderSeparator = "icon" | "bullet" | "bar";
export const CONTACT_ICON_STYLES = [
  "none-frame",
  "circle-filled",
  "circle-outline",
  "rounded-filled",
  "rounded-outline",
  "square-filled",
  "square-outline",
] as const;
export type ContactIconStyle = (typeof CONTACT_ICON_STYLES)[number];
export type FontWeightToggle = "normal" | "bold";
export type HeaderTitlePosition = "same-line" | "below";

export type HeaderV2 = {
  alignment: HeaderAlignment;
  detailsArrangement: HeaderDetailsArrangement;
  separator: HeaderSeparator;
  contactIconStyle: ContactIconStyle;
  nameWeight: FontWeightToggle;
  titleWeight: FontWeightToggle;
  titlePosition: HeaderTitlePosition;
};

// ── Photo (§28.3 fields carried over + crop/zoom, §31.2) ──
export type PhotoShape = "circle" | "rounded" | "square";
export type PhotoV2 = {
  hidden: boolean;
  size: number; // 32-160
  shape: PhotoShape;
  crop: { x: number; y: number }; // 0-100, focal point percent
  zoom: number; // 1-2
};

// ── Links ──
export type LinksV2 = { underline: boolean; accentColor: boolean; icon: boolean };

// ── Footer ──
export type FooterV2 = {
  pageNumbers: boolean;
  email: boolean;
  name: boolean;
  customText: string; // one line, plain text
};

// ── Per-section display ──
export type SectionLayout = "grid" | "rows" | "compact" | "bubble" | "level";
export type InterestsLayout = "grid" | "rows" | "compact" | "bubble";
export type LevelDisplay = "text" | "dots" | "bar";
export type ExperienceOrder = "title-first" | "employer-first";
export type EducationOrder = "degree-first" | "school-first";

export type SkillsLanguagesDisplayV2 = {
  layout: SectionLayout;
  gridColumns: number; // 1-4
  levelDisplay: LevelDisplay;
  levelLabels: [string, string, string, string, string]; // format, not content (§31.4)
};

export type InterestsDisplayV2 = { layout: InterestsLayout; gridColumns: number };
export type ExperienceDisplayV2 = { order: ExperienceOrder; groupPromotions: boolean };
export type SummaryDisplayV2 = { asPartOfHeader: boolean; showHeading: boolean };
export type EducationDisplayV2 = { order: EducationOrder };

export type SectionDisplayV2 = {
  skillsLanguages: SkillsLanguagesDisplayV2;
  interests: InterestsDisplayV2;
  experience: ExperienceDisplayV2;
  summary: SummaryDisplayV2;
  education: EducationDisplayV2;
};

// ── The whole config ──
// `formatVersion: 2` is the v1/v2 discriminator (see isFormatV2) — v1
// `DocumentFormat` never carries this field, so the check is exact, not
// heuristic. `presetId` is PROVENANCE ONLY: UI may show which preset the axes
// came from; no axis behavior may key on it.
export type DocumentFormatV2 = {
  formatVersion: 2;
  presetId?: string;
  document: DocumentV2;
  layout: LayoutV2;
  typeScale: TypeScaleV2;
  spacing: SpacingV2;
  entries: EntriesV2;
  headings: HeadingsV2;
  fonts: FontsV2;
  colors: ColorsV2;
  header: HeaderV2;
  photo: PhotoV2;
  links: LinksV2;
  footer: FooterV2;
  sectionDisplay: SectionDisplayV2;
};

export function isFormatV2(value: unknown): value is DocumentFormatV2 {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { formatVersion?: unknown }).formatVersion === 2
  );
}

// ── zod schema — enforces every §31.2 bound; parse rejects out-of-range ──
const hexColorZ = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const sectionEnumZ = z.enum(SECTION_VALUES as [Section, ...Section[]]);
const fontStyleZ = z.enum(["normal", "bold", "italic"]);
const weightToggleZ = z.enum(["normal", "bold"]);
const sideTogglesZ = z.object({
  top: z.boolean(),
  right: z.boolean(),
  bottom: z.boolean(),
  left: z.boolean(),
});

export const formatV2Schema = z.object({
  formatVersion: z.literal(2),
  presetId: z.string().min(1).optional(),
  document: z.object({
    pageFormat: z.enum(["a4", "letter"]),
    dateFormat: z.enum(DATE_FORMATS),
  }),
  layout: z.object({
    columns: z.enum(["one", "two", "mix"]),
    headerPosition: z.enum(["top", "left", "right"]),
    sidebarWidthPct: z.number().min(25).max(40),
    sectionPlacement: z.partialRecord(
      sectionEnumZ,
      z.object({ column: z.enum(["main", "sidebar"]) }),
    ),
    manualPageBreaks: z.array(sectionEnumZ),
  }),
  typeScale: z.object({
    bodySize: z.number().min(9).max(12),
    nameOffset: z.number().min(4).max(12),
    titleOffset: z.number().min(0).max(4),
    sectionHeadingOffset: z.number().min(0).max(3),
    entryHeaderOffset: z.number().min(0).max(2),
  }),
  spacing: z.object({
    lineHeight: z.number().min(1.15).max(1.5),
    elementSpacing: z.number().min(0).max(4),
    marginsMm: z.object({
      x: z.number().min(10).max(28),
      y: z.number().min(10).max(28),
    }),
  }),
  entries: z.object({
    structure: z.enum(["full-width", "columns"]),
    dateLocationPlacement: z.enum(["right", "left", "split"]),
    dateLocationOrder: z.enum(["date-first", "location-first"]),
    subtitlePlacement: z.enum(["same-line", "below"]),
    listStyle: z.enum(["bullet", "hyphen"]),
    subtitleFontStyle: fontStyleZ,
    dateFontStyle: fontStyleZ,
    locationFontStyle: fontStyleZ,
    bodyIndent: z.boolean(),
  }),
  headings: z.object({
    style: z.enum(HEADING_STYLES),
    capitalization: z.enum(["capitalize", "uppercase"]),
    icons: z.enum(["none", "outline", "filled"]),
  }),
  fonts: z.object({
    body: z.enum(BODY_FONT_IDS),
    name: z.enum(["same-as-body", ...NAME_DISPLAY_FONT_IDS]),
  }),
  colors: z.object({
    area: z.enum(["full-page", "header", "border"]),
    mode: z.enum(["single", "multi"]),
    text: hexColorZ,
    background: hexColorZ,
    accent: hexColorZ,
    border: z.object({
      size: z.enum(["s", "m", "l"]),
      sides: sideTogglesZ,
    }),
    accentPlacement: z.object({
      name: z.boolean(),
      title: z.boolean(),
      headings: z.boolean(),
      headingRules: z.boolean(),
      headerIcons: z.boolean(),
      levelIndicators: z.boolean(),
      dates: z.boolean(),
      entrySubtitles: z.boolean(),
      linkIcons: z.boolean(),
    }),
  }),
  header: z.object({
    alignment: z.enum(["left", "center"]),
    detailsArrangement: z.enum(["stacked", "single-row", "wrapped"]),
    separator: z.enum(["icon", "bullet", "bar"]),
    contactIconStyle: z.enum(CONTACT_ICON_STYLES),
    nameWeight: weightToggleZ,
    titleWeight: weightToggleZ,
    titlePosition: z.enum(["same-line", "below"]),
  }),
  photo: z.object({
    hidden: z.boolean(),
    size: z.number().min(32).max(160),
    shape: z.enum(["circle", "rounded", "square"]),
    crop: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
    zoom: z.number().min(1).max(2),
  }),
  links: z.object({
    underline: z.boolean(),
    accentColor: z.boolean(),
    icon: z.boolean(),
  }),
  footer: z.object({
    pageNumbers: z.boolean(),
    email: z.boolean(),
    name: z.boolean(),
    customText: z
      .string()
      .max(200)
      .regex(/^[^\n\r]*$/),
  }),
  sectionDisplay: z.object({
    skillsLanguages: z.object({
      layout: z.enum(["grid", "rows", "compact", "bubble", "level"]),
      gridColumns: z.number().int().min(1).max(4),
      levelDisplay: z.enum(["text", "dots", "bar"]),
      levelLabels: z.tuple([
        z.string().min(1).max(40),
        z.string().min(1).max(40),
        z.string().min(1).max(40),
        z.string().min(1).max(40),
        z.string().min(1).max(40),
      ]),
    }),
    interests: z.object({
      layout: z.enum(["grid", "rows", "compact", "bubble"]),
      gridColumns: z.number().int().min(1).max(4),
    }),
    experience: z.object({
      order: z.enum(["title-first", "employer-first"]),
      groupPromotions: z.boolean(),
    }),
    summary: z.object({
      asPartOfHeader: z.boolean(),
      showHeading: z.boolean(),
    }),
    education: z.object({
      order: z.enum(["degree-first", "school-first"]),
    }),
  }),
});

// ── v1 → v2 migration constants (one table, so the engine ticket imports the
// same numbers rather than re-deriving them) ──
const PT_TO_MM = 0.352778;
const MARGIN_MM_MIN = 10;
const MARGIN_MM_MAX = 28;
const ELEMENT_SPACING_PT_STEP = 6; // page.sectionGap (0-24pt) -> elementSpacing (0-4)
// The retired v1 sidebar composition (deleted this ticket, E9-F0d1 —
// src/client/document/registry.ts): its shared `styles.sidebar` was
// `width: "32%"` for both orientations (one composition function, shared).
const SIDEBAR_WIDTH_PCT = 32;
// The retired v1 sidebar composition's own SIDEBAR_SECTIONS — the sections
// sidebar-left/right route into the sidebar column.
const SIDEBAR_SECTIONS: Section[] = ["skill", "language", "interest", "certification"];
// sections.tsx buildStyles: name.fontWeight === typography.heading.weight;
// v2's header weight is a 2-value toggle, so >=600 collapses to 'bold'.
const BOLD_WEIGHT_THRESHOLD = 600;

function ptToMm(pt: number): number {
  const mm = Math.round(pt * PT_TO_MM * 10) / 10;
  return Math.min(MARGIN_MM_MAX, Math.max(MARGIN_MM_MIN, mm));
}

function elementSpacingFromGap(sectionGapPt: number): number {
  const step = Math.round(sectionGapPt / ELEMENT_SPACING_PT_STEP);
  return Math.min(4, Math.max(0, step));
}

// Axes with no v1 analog (dateFormat, accent placement, footer, links, …)
// share ONE deterministic baseline, reproducing what today's shared
// sections.tsx actually renders (§31.6 F0 fixture-exact requirement) rather
// than inventing arbitrary "new feature" defaults.
function baseFromV1(v1: DocumentFormat): DocumentFormatV2 {
  const boldWeight = v1.typography.heading.weight >= BOLD_WEIGHT_THRESHOLD;
  return {
    formatVersion: 2,
    document: { pageFormat: "letter", dateFormat: "MM/DD/YYYY" },
    layout: {
      columns: "one",
      headerPosition: "top",
      sidebarWidthPct: SIDEBAR_WIDTH_PCT,
      sectionPlacement: {},
      manualPageBreaks: [],
    },
    typeScale: {
      bodySize: v1.typography.body.size,
      nameOffset: 10, // sections.tsx: name fontSize is hardcoded 20; 20 - body.size(10) = 10
      titleOffset: 0, // no distinct "title" text rendered today
      sectionHeadingOffset: 1, // sectionLabel: body.size + 1
      entryHeaderOffset: 0, // groupHeading: body.size
    },
    spacing: {
      lineHeight: Math.min(1.5, Math.max(1.15, v1.typography.body.lineHeight)),
      elementSpacing: elementSpacingFromGap(v1.page.sectionGap),
      marginsMm: { x: ptToMm(v1.page.marginX), y: ptToMm(v1.page.marginY) },
    },
    entries: {
      structure: "full-width",
      dateLocationPlacement: "right",
      dateLocationOrder: "date-first",
      subtitlePlacement: "same-line",
      listStyle: "bullet", // sections.tsx ItemRow: "•"
      subtitleFontStyle: "normal",
      dateFontStyle: "normal",
      locationFontStyle: "normal",
      bodyIndent: false,
    },
    headings: {
      style: "underline", // sectionLabel: borderBottomWidth/borderBottomColor
      capitalization: "uppercase", // sectionLabel: textTransform 'uppercase'
      icons: "none",
    },
    fonts: { body: v1.typography.body.family as BodyFontId, name: "same-as-body" },
    colors: {
      area: "border",
      mode: "single",
      text: v1.colors.text,
      background: "#ffffff",
      accent: v1.colors.primary,
      border: { size: "s", sides: { top: false, right: false, bottom: false, left: false } },
      accentPlacement: {
        name: false, // name uses colors.text, not colors.primary
        title: false,
        headings: true, // sectionLabel color: colors.primary
        headingRules: true, // sectionLabel borderBottomColor: colors.primary
        headerIcons: false,
        levelIndicators: false,
        dates: false,
        entrySubtitles: false,
        linkIcons: false,
      },
    },
    header: {
      alignment: "left",
      detailsArrangement: "stacked",
      separator: "bar",
      contactIconStyle: "none-frame",
      nameWeight: boldWeight ? "bold" : "normal",
      titleWeight: boldWeight ? "bold" : "normal",
      titlePosition: "same-line",
    },
    photo: {
      hidden: v1.photo.hidden,
      size: v1.photo.size,
      shape: v1.photo.shape,
      crop: { x: 50, y: 50 },
      zoom: 1,
    },
    links: { underline: false, accentColor: true, icon: false }, // sections.tsx link color: colors.primary
    footer: { pageNumbers: false, email: false, name: false, customText: "" },
    sectionDisplay: {
      skillsLanguages: {
        layout: "rows",
        gridColumns: 1,
        levelDisplay: "text",
        levelLabels: ["Beginner", "Elementary", "Intermediate", "Advanced", "Expert"],
      },
      interests: { layout: "rows", gridColumns: 1 },
      experience: { order: "employer-first", groupPromotions: false }, // groupBy: `${company} · ${role} · ${period}`
      summary: { asPartOfHeader: false, showHeading: false }, // SummarySection renders no label
      education: { order: "school-first" }, // groupBy: `${school} · ${degree}`
    },
  };
}

type TemplateOverlay = (base: DocumentFormatV2) => DocumentFormatV2;

const sidebarSectionPlacement = (): Partial<Record<Section, { column: SectionColumn }>> => {
  const placement: Partial<Record<Section, { column: SectionColumn }>> = {};
  for (const section of SECTION_VALUES) {
    placement[section] = { column: SIDEBAR_SECTIONS.includes(section) ? "sidebar" : "main" };
  }
  return placement;
};

// One entry per retired v1 template id (the per-look composition files under
// src/client/document/, deleted E9-F0d1, + registry.ts's old lookup) — each
// overlay reproduces exactly the composition delta that template's code
// introduced over the shared baseline above.
export const TEMPLATE_V2_OVERLAYS: Record<string, TemplateOverlay> = {
  strict: (base) => base,
  // classic.tsx: ProfileHeader variant="centered".
  classic: (base) => ({ ...base, header: { ...base.header, alignment: "center" } }),
  // compact.tsx: ProfileHeader variant="inline" (name + contact, one row).
  compact: (base) => ({
    ...base,
    header: { ...base.header, detailsArrangement: "single-row" },
  }),
  // sidebar.tsx: two-column composition, sidebar on the left.
  "sidebar-left": (base) => ({
    ...base,
    layout: {
      ...base.layout,
      columns: "two",
      headerPosition: "left",
      sidebarWidthPct: SIDEBAR_WIDTH_PCT,
      sectionPlacement: sidebarSectionPlacement(),
    },
  }),
  // sidebar-right.tsx: renderSidebarComposition(props, "right").
  "sidebar-right": (base) => ({
    ...base,
    layout: {
      ...base.layout,
      columns: "two",
      headerPosition: "right",
      sidebarWidthPct: SIDEBAR_WIDTH_PCT,
      sectionPlacement: sidebarSectionPlacement(),
    },
  }),
  // banner.tsx: full-bleed header band filled with colors.primary.
  banner: (base) => ({ ...base, colors: { ...base.colors, area: "header" } }),
};

// [v3-044] escaped-gap repair: v1's per-section `{columns: N>1}` had a seam
// for ANY section, but v2's grid axis only exists on two display groups —
// skillsLanguages (merging the v1 skill/language sections into one display
// concept) and interests. Every OTHER section's v1 columns value (experience,
// project, education, award, certification, publication, reference) has NO
// v2 axis to land on and is dropped here — honestly, not silently: there is
// no "narrative section grid" concept in §31.2, so a v1 config that set
// e.g. `sections.experience.columns` loses that value on migration, same as
// any other v1-only knob §31.2 doesn't carry forward.
function skillsLanguagesGridFromV1(v1: DocumentFormat): Partial<SkillsLanguagesDisplayV2> {
  // skill wins over language when both set (arbitrary but deterministic) —
  // v1 never let these two disagree in practice (one shared design-panel
  // control drove both via the same per-section selector).
  const columns = v1.sections.skill?.columns ?? v1.sections.language?.columns;
  if (!columns || columns <= 1) return {};
  return { layout: "grid", gridColumns: columns };
}

function interestsGridFromV1(v1: DocumentFormat): Partial<InterestsDisplayV2> {
  const columns = v1.sections.interest?.columns;
  if (!columns || columns <= 1) return {};
  return { layout: "grid", gridColumns: columns };
}

function repairSectionColumns(v1: DocumentFormat, v2: DocumentFormatV2): DocumentFormatV2 {
  const skillsLanguagesPatch = skillsLanguagesGridFromV1(v1);
  const interestsPatch = interestsGridFromV1(v1);
  if (Object.keys(skillsLanguagesPatch).length === 0 && Object.keys(interestsPatch).length === 0) {
    return v2; // no v1 columns set — v2 unchanged, still reference-stable
  }
  return {
    ...v2,
    sectionDisplay: {
      ...v2.sectionDisplay,
      skillsLanguages: { ...v2.sectionDisplay.skillsLanguages, ...skillsLanguagesPatch },
      interests: { ...v2.sectionDisplay.interests, ...interestsPatch },
    },
  };
}

export function migrateFormat(v1: DocumentFormat): DocumentFormatV2 {
  if (isFormatV2(v1)) return v1; // idempotent no-op: already v2, never re-migrated
  const base = baseFromV1(v1);
  const overlay = TEMPLATE_V2_OVERLAYS[v1.templateId];
  const overlaid = overlay ? overlay(base) : base;
  return repairSectionColumns(v1, overlaid);
}

export const DEFAULT_FORMAT_V2: DocumentFormatV2 = migrateFormat(DEFAULT_FORMAT);

// Read-time gate for a JSON column typed `DocumentFormatV2` (settings.
// defaultFormat, src/server/db/schema.ts) that may still hold a v1-shaped
// VALUE: the column's SQL-level DEFAULT is frozen at v1 JSON in an already-
// shipped migration (drizzle/0003_typical_malice.sql) — editing a past
// migration is out of this ticket's file contract, and a real data migration
// for already-written rows is explicitly the NEXT ticket's job (§31.1's
// "migration is deterministic" clause; every OTHER JSON column that can
// carry a DocumentFormat — application.format — only ever receives a value
// through the v2-only `formatV2Schema` PUT validator, so it needs no gate).
// Idempotent: a genuine v2 value passes through unchanged via migrateFormat's
// own isFormatV2 short-circuit.
export function resolveStoredFormat(value: unknown): DocumentFormatV2 {
  return isFormatV2(value) ? value : migrateFormat(value as DocumentFormat);
}
