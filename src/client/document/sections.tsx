// Shared section renderers — react-pdf primitives (spec.md §10, §28.2, §28.3).
// ALL templates render every section through these; templates differ in
// composition only, never in features (rx-resume's rule). Every visual knob
// here (typography, color, page rhythm, per-section columns, the photo) is
// read from the caller's `format: DocumentFormat` — nothing is hardcoded, so
// a template can never silently ignore the user's design choices.
// CRITICAL: leadRationale and cut[] are reasoning UI (§11) and must NEVER be
// rendered here — only profile, summary, and sections/groups/items, in order.

import type { ReactNode } from "react";
import { Image, Link, StyleSheet, Text, View } from "@react-pdf/renderer";
import type {
  DocumentFormat,
  Profile,
  Section,
  TailoredGroup,
  TailoredGroupHeadingParts,
  TailoredItem,
  TailoredSection,
} from "@shared/types";
import { SECTIONS } from "@shared/sections";
import type {
  ContactIconStyle,
  DateFormatV2,
  EntryFontStyle,
  HeaderSeparator,
  InterestsLayout,
  LevelDisplay,
  SectionLayout,
} from "@shared/format-v2";
import type {
  AccentPlacementRenderConfig,
  EntriesRenderConfig,
  HeaderRenderConfig,
  HeadingsRenderConfig,
  LinksRenderConfig,
  PhotoRenderConfig,
  SectionDisplayRenderConfig,
  TypeScaleSizes,
} from "./engine/legacyAdapt";
import { formatDate, parseHeadingDate } from "./formatDate";

// §31.2 typeScale's 4 offsets (nameOffset/titleOffset/sectionHeadingOffset/
// entryHeaderOffset) arrive as an extra property on `format` rather than a
// field of the legacy `DocumentFormat` type this module is locked to — see
// legacyAdapt.ts's toLegacyFormat for why. Optional or absent (e.g. a caller
// that builds a plain DocumentFormat directly, same as the type declares)
// falls back to exactly the sizes this module hardcoded before this ticket,
// so no existing caller's output changes.
function resolveTypeScaleSizes(format: DocumentFormat): TypeScaleSizes {
  const sizes = (format as DocumentFormat & { typeScaleSizes?: TypeScaleSizes }).typeScaleSizes;
  return (
    sizes ?? {
      name: 20,
      title: format.typography.body.size,
      sectionHeading: format.typography.body.size + 1,
      entryHeader: format.typography.body.size,
    }
  );
}

// §31.2 headings.{style,capitalization,icons} arrive as an extra property on
// `format`, same seam as typeScaleSizes above (legacyAdapt.ts's
// toLegacyFormat / HeadingsRenderConfig). Absent (a caller building a plain
// DocumentFormat directly) falls back to exactly this module's pre-ticket
// look: the underline treatment, uppercase, no icon.
const DEFAULT_HEADINGS_CONFIG: HeadingsRenderConfig = {
  style: "underline",
  capitalization: "uppercase",
  icons: "none",
};

function resolveHeadingsConfig(format: DocumentFormat): HeadingsRenderConfig {
  const config = (format as DocumentFormat & { headingsConfig?: HeadingsRenderConfig })
    .headingsConfig;
  return config ?? DEFAULT_HEADINGS_CONFIG;
}

// document.dateFormat (§31.2) arrives as an extra property on `format`, same
// seam as headingsConfig/typeScaleSizes above (legacyAdapt.ts's
// toLegacyFormat). Absent (a plain DocumentFormat, or a stored TailoredGroup
// with no headingParts to format) falls back to this module's pre-ticket
// look: the group's raw `heading` string, untouched.
const DEFAULT_DATE_FORMAT: DateFormatV2 = "MM/DD/YYYY";

function resolveDateFormat(format: DocumentFormat): DateFormatV2 {
  const dateFormat = (format as DocumentFormat & { dateFormat?: DateFormatV2 }).dateFormat;
  return dateFormat ?? DEFAULT_DATE_FORMAT;
}

// entries.* (§31.2, E9-F2e) arrives as an extra property on `format`, same
// seam as headingsConfig/dateFormat above (legacyAdapt.ts's toLegacyFormat).
// Absent (a plain DocumentFormat built directly) falls back to exactly this
// module's pre-ticket look: right-placed date-first bullet list, no font
// styling, no body indent — see format-v2.ts's baseFromV1 `entries` value,
// which this mirrors 1:1.
const DEFAULT_ENTRIES_CONFIG: EntriesRenderConfig = {
  structure: "full-width",
  dateLocationPlacement: "right",
  dateLocationOrder: "date-first",
  subtitlePlacement: "same-line",
  listStyle: "bullet",
  subtitleFontStyle: "normal",
  dateFontStyle: "normal",
  locationFontStyle: "normal",
  bodyIndent: false,
};

function resolveEntriesConfig(format: DocumentFormat): EntriesRenderConfig {
  const config = (format as DocumentFormat & { entriesConfig?: EntriesRenderConfig }).entriesConfig;
  return config ?? DEFAULT_ENTRIES_CONFIG;
}

// header.* (§31.2, E9-F3c) arrives as an extra property on `format`, same
// seam as headingsConfig/entriesConfig above (legacyAdapt.ts's
// toLegacyFormat). Absent falls back to exactly this module's pre-ticket
// look: one merged, wrapping contact row, no separator glyph, no per-field
// icon, headline stacked below the name at its unstyled default weight.
const DEFAULT_HEADER_CONFIG: HeaderRenderConfig = {
  detailsArrangement: "stacked",
  separator: "bar",
  contactIconStyle: "none-frame",
  titleWeight: 400,
  titlePosition: "below",
};

function resolveHeaderConfig(format: DocumentFormat): HeaderRenderConfig {
  const config = (format as DocumentFormat & { headerConfig?: HeaderRenderConfig }).headerConfig;
  return config ?? DEFAULT_HEADER_CONFIG;
}

// links.* (§31.2, E9-F3c) arrives as an extra property on `format`, same
// seam as headerConfig above. Absent falls back to this module's pre-ticket
// look: no underline, colors.primary (accentColor true), no icon.
const DEFAULT_LINKS_CONFIG: LinksRenderConfig = {
  underline: false,
  accentColor: true,
  icon: false,
};

function resolveLinksConfig(format: DocumentFormat): LinksRenderConfig {
  const config = (format as DocumentFormat & { linksConfig?: LinksRenderConfig }).linksConfig;
  return config ?? DEFAULT_LINKS_CONFIG;
}

// colors.accentPlacement (§31.2, E9-F3d) arrives as an extra property on
// `format`, same seam as linksConfig above. Absent falls back to exactly
// this module's pre-ticket look: headings/headingRules colored by
// colors.primary, every other element class (name/title/headerIcons/dates/
// entrySubtitles/linkIcons) by colors.text — see format-v2.ts's baseFromV1
// accentPlacement value, which this mirrors 1:1.
// levelIndicators (E9-F4b): the flag went live once the level element it
// gates — the skills/languages level display below — existed to color. Same
// accentOrText gate as every other element class here.
const DEFAULT_ACCENT_PLACEMENT: AccentPlacementRenderConfig = {
  name: false,
  title: false,
  headings: true,
  headingRules: true,
  headerIcons: false,
  levelIndicators: false,
  dates: false,
  entrySubtitles: false,
  linkIcons: false,
};

function resolveAccentPlacement(format: DocumentFormat): AccentPlacementRenderConfig {
  const config = (
    format as DocumentFormat & { accentPlacementConfig?: AccentPlacementRenderConfig }
  ).accentPlacementConfig;
  return config ?? DEFAULT_ACCENT_PLACEMENT;
}

// photo.{crop,zoom} (§31.2, E9-F3f) arrive as an extra property on `format`,
// same seam as accentPlacementConfig above (legacyAdapt.ts's toLegacyFormat /
// PhotoRenderConfig) — size/shape stay on format.photo directly (unchanged
// since before this ticket). Absent falls back to a centered, unzoomed crop:
// identical to this module's pre-ticket look (a plain cover-fit photo).
const DEFAULT_PHOTO_CONFIG: PhotoRenderConfig = { crop: { x: 50, y: 50 }, zoom: 1 };

function resolvePhotoConfig(format: DocumentFormat): PhotoRenderConfig {
  const config = (format as DocumentFormat & { photoConfig?: PhotoRenderConfig }).photoConfig;
  return config ?? DEFAULT_PHOTO_CONFIG;
}

// sectionDisplay.* (§31.4) arrives as an extra property on `format`, same
// seam as photoConfig above (legacyAdapt.ts's toLegacyFormat /
// SectionDisplayRenderConfig). Absent falls back to exactly format-v2.ts's
// own DEFAULT_FORMAT_V2 values for every group — 'rows' at 1 column for
// skillsLanguages/interests, 'text' level display with the stock 5 labels,
// employer-first/school-first experience/education order (mirroring the
// registry groupBy's own company-first/school-first string join — see
// sections.ts), promotions never collapsed, and the summary rendered as its
// own unlabeled section — this module's pre-ticket look end to end.
const DEFAULT_SECTION_DISPLAY_CONFIG: SectionDisplayRenderConfig = {
  skillsLanguages: {
    layout: "rows",
    gridColumns: 1,
    levelDisplay: "text",
    levelLabels: ["Beginner", "Elementary", "Intermediate", "Advanced", "Expert"],
  },
  interests: { layout: "rows", gridColumns: 1 },
  experience: { order: "employer-first", groupPromotions: false },
  summary: { asPartOfHeader: false, showHeading: false },
  education: { order: "school-first" },
};

function resolveSectionDisplayConfig(format: DocumentFormat): SectionDisplayRenderConfig {
  const config = (format as DocumentFormat & { sectionDisplayConfig?: SectionDisplayRenderConfig })
    .sectionDisplayConfig;
  return config ?? DEFAULT_SECTION_DISPLAY_CONFIG;
}

// The skill/language sections share ONE display config (skillsLanguages);
// interest owns its own (no level axis — InterestsLayout has no 'level'
// value, §31.4). experience/summary/education have their own §31.4 axes
// (order/groupPromotions/asPartOfHeader/showHeading, wired below via
// resolveGroupHeadingParts/collapsePromotions/SummarySection) but none of
// them is an items-GRID layout — this ItemsDisplayConfig seam stays specific
// to the skillsLanguages/interests items grid. Every other section has no
// items-display seam at all — undefined, so SectionBlock falls through to
// the legacy per-section `columns` field exactly as this module rendered
// before E9-F4b.
type ItemsDisplayConfig = {
  layout: SectionLayout | InterestsLayout;
  gridColumns: number;
  levelDisplay?: LevelDisplay;
  levelLabels?: readonly [string, string, string, string, string];
};

function resolveItemsDisplay(
  section: Section,
  sectionDisplay: SectionDisplayRenderConfig,
): ItemsDisplayConfig | undefined {
  if (section === "skill" || section === "language") return sectionDisplay.skillsLanguages;
  if (section === "interest") return sectionDisplay.interests;
  return undefined;
}

// §31.4: meta.level (skill/language EntryMeta, src/shared/types.ts) is
// CONTENT, 1–5. The assemble()->TailoredItem pipeline (src/server/tailor/
// assemble.ts) doesn't carry it onto TailoredItem yet — outside this
// ticket's declared files — so, same "extra property, absent = fallback"
// seam as every format extra above, an item MAY carry its own `level`
// alongside entryId/text. Absent (every item until that pipeline threads it)
// renders through the plain row the 'level' layout guarantees for a
// level-less entry — never an invented number.
type LeveledItem = TailoredItem & { level?: number };

function resolveItemLevel(item: TailoredItem): number | undefined {
  return (item as LeveledItem).level;
}

// Every gated element class below reduces to this: colors.primary when its
// own accentPlacement flag is on, colors.text otherwise. One helper so the
// 8 call sites (name/title/headings/headingRules/headerIcons/dates/
// entrySubtitles/linkIcons) can't drift into slightly different ternaries.
function accentOrText(enabled: boolean, colors: DocumentFormat["colors"]): string {
  return enabled ? colors.primary : colors.text;
}

// A group's structured date (headingParts.date), re-rendered through the
// chosen dateFormat preset when parseable — same rule resolveGroupHeadingText
// used pre-ticket, just extracted so both the fallback string join (none
// left, see below) and the split title/subtitle/date/location elements this
// ticket introduces share one implementation.
function resolveFormattedDate(
  parts: TailoredGroupHeadingParts,
  format: DocumentFormat,
): string | undefined {
  const parsedDate = parseHeadingDate(parts.date);
  return parsedDate ? formatDate(parsedDate, resolveDateFormat(format)) : parts.date;
}

function buildStyles(format: DocumentFormat) {
  const { typography, colors, page, photo } = format;
  const photoRadius = photo.shape === "circle" ? photo.size / 2 : photo.shape === "rounded" ? 8 : 0;
  const typeScaleSizes = resolveTypeScaleSizes(format);
  const headingsConfig = resolveHeadingsConfig(format);
  const headerConfig = resolveHeaderConfig(format);
  const linksConfig = resolveLinksConfig(format);
  const accentPlacement = resolveAccentPlacement(format);
  // "plain" (§31.2) means bare text — no accent color, no rule/box/bar
  // decoration at all — so it drops the accent-colored text every other
  // treatment shares regardless of accentPlacement.headings; every other
  // treatment gates that same fill on the flag (E9-F3d).
  const headingColor =
    headingsConfig.style === "plain" ? colors.text : accentOrText(accentPlacement.headings, colors);
  const headingRuleColor = accentOrText(accentPlacement.headingRules, colors);
  const nameColor = accentOrText(accentPlacement.name, colors);
  const titleColor = accentOrText(accentPlacement.title, colors);
  const headerIconColor = accentOrText(accentPlacement.headerIcons, colors);
  const dateColor = accentOrText(accentPlacement.dates, colors);
  const entrySubtitleColor = accentOrText(accentPlacement.entrySubtitles, colors);
  const linkIconColor = accentOrText(accentPlacement.linkIcons, colors);
  const levelIndicatorColor = accentOrText(accentPlacement.levelIndicators, colors);
  const headingTextTransform =
    headingsConfig.capitalization === "uppercase" ? "uppercase" : "capitalize";
  // sectionDisplay.summary.asPartOfHeader (§31.4, F4c): document.tsx (outside
  // this ticket's declared files) always renders `header` then `summary` as
  // adjacent siblings — this axis can't change THAT composition, only how
  // close the two sit. Off keeps this module's pre-ticket 12pt header gap
  // (its own section's worth of whitespace, visually distinct from the
  // summary below). On shrinks it to 2pt — the same tight gap
  // ProfileHeader's own name/title/contact lines use between each other — so
  // the summary reads as one more line of the header block rather than a new
  // section starting after it.
  const sectionDisplay = resolveSectionDisplayConfig(format);
  const headerBottomGap = sectionDisplay.summary.asPartOfHeader ? 2 : 12;

  return StyleSheet.create({
    header: { marginBottom: headerBottomGap, flexDirection: "row", alignItems: "center" },
    // centered/inline are alternate header compositions (spec.md §28.2's
    // classic/compact templates) — the profile's fields never change, only
    // which axis they're laid out on.
    headerCentered: {
      marginBottom: headerBottomGap,
      flexDirection: "column",
      alignItems: "center",
    },
    headerInline: {
      marginBottom: headerBottomGap,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerInlineLeft: { flexDirection: "row", alignItems: "center" },
    // The clipping frame: fixed size + shape's radius + overflow:hidden, so
    // the (possibly zoom-enlarged, see photoImageStyle below) image inside
    // never draws outside the size/shape the user picked.
    photo: {
      position: "relative",
      width: photo.size,
      height: photo.size,
      marginRight: 12,
      borderRadius: photoRadius,
      overflow: "hidden",
    },
    photoCenterOverride: { marginRight: 0, marginBottom: 8 },
    headerText: { flex: 1 },
    name: {
      fontSize: typeScaleSizes.name,
      fontFamily: typography.heading.family,
      fontWeight: typography.heading.weight,
      color: nameColor,
    },
    // §31.2 "title/subtitle" — profile.headline, previously never rendered
    // in the PDF (only in plainText.ts's export) — this ticket gives it a
    // render seam so titleOffset has somewhere to land (format-v2.ts's
    // migration comment: "no distinct 'title' text rendered today").
    // fontWeight is header.titleWeight (E9-F3c) — resolved independently of
    // the `name`/heading styles' shared typography.heading.weight above (see
    // legacyAdapt.ts's resolveHeaderConfig comment for why this is now its
    // own field rather than a reuse of that one).
    title: {
      fontSize: typeScaleSizes.title,
      fontFamily: typography.body.family,
      fontWeight: headerConfig.titleWeight,
      color: titleColor,
    },
    // header.titlePosition (E9-F3c): 'same-line' wraps name+title in a row
    // (nameTitleRow); 'below' keeps the pre-ticket look — a plain column, the
    // title starting its own line with a small top gap (titleBelowGap, since
    // that gap doesn't apply when the title instead sits beside the name).
    nameTitleRow: { flexDirection: "row", alignItems: "baseline" },
    nameTitleColumn: { flexDirection: "column" },
    titleSameLineGap: { marginLeft: 6 },
    titleBelowGap: { marginTop: 2 },
    contactLine: {
      fontSize: typography.body.size - 0.5,
      marginTop: 3,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      fontFamily: typography.body.family,
    },
    contactLineInline: { marginTop: 0 },
    // header.detailsArrangement 'wrapped' (E9-F3c): the links row, a second
    // line below contactLine — same base look, its own top gap since it
    // follows a line rather than the name.
    linksLine: {
      fontSize: typography.body.size - 0.5,
      marginTop: 2,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      fontFamily: typography.body.family,
    },
    // Each contact field is now an icon+text pair (header.contactIconStyle,
    // E9-F3c), not a bare Text — contactFieldRow is that pair's row
    // container; contactItem keeps the text run's own look unchanged.
    contactFieldRow: { flexDirection: "row", alignItems: "center", marginRight: 8 },
    contactItem: { color: colors.text },
    // header.separator (E9-F3c): the glyph between adjacent contact fields/
    // links. separatorText covers bullet ('•') and bar ('|'); separatorDot is
    // the glyph-free 'icon' value — a small View, same "no font glyph
    // dependency" reasoning as the section-heading icons below.
    separatorText: { marginRight: 8, color: colors.text },
    separatorDot: { width: 3, height: 3, marginRight: 8, backgroundColor: colors.text },
    // header.contactIconStyle's 7 values (E9-F3c) — View shapes, same
    // "no font glyph dependency" reasoning as headingIconOutline/Filled below.
    // "none-frame" renders no View at all (see renderContactIcon).
    contactIconBase: { width: 7, height: 7, marginRight: 3 },
    contactIconCircleFilled: { borderRadius: 3.5, backgroundColor: headerIconColor },
    contactIconCircleOutline: {
      borderRadius: 3.5,
      borderWidth: 0.75,
      borderColor: headerIconColor,
    },
    contactIconRoundedFilled: { borderRadius: 1.5, backgroundColor: headerIconColor },
    contactIconRoundedOutline: {
      borderRadius: 1.5,
      borderWidth: 0.75,
      borderColor: headerIconColor,
    },
    contactIconSquareFilled: { backgroundColor: headerIconColor },
    contactIconSquareOutline: { borderWidth: 0.75, borderColor: headerIconColor },
    // links.* (E9-F3c): accentColor picks colors.primary vs colors.text for
    // the link TEXT; underline is applied per-Link (textDecoration) since it
    // composes onto this base rather than replacing it. linkFieldRow/linkIcon
    // mirror contactFieldRow/contactIconBase above — links.icon is a small
    // glyph-free View ahead of the link text, sized distinctly from a
    // contact icon so the two element classes stay visually (and byte-)
    // distinguishable. The icon's OWN fill is linkIconColor (E9-F3d,
    // accentPlacement.linkIcons) — an independent element class from the
    // link text, gated by its own flag rather than links.accentColor.
    linkFieldRow: { flexDirection: "row", alignItems: "center", marginRight: 8 },
    link: { color: linksConfig.accentColor ? colors.primary : colors.text },
    linkIcon: {
      width: 5,
      height: 5,
      marginRight: 3,
      borderRadius: 1,
      borderWidth: 0.75,
      borderColor: linkIconColor,
    },
    summary: {
      fontSize: typography.body.size,
      marginBottom: page.sectionGap,
      lineHeight: typography.body.lineHeight,
      fontFamily: typography.body.family,
      color: colors.text,
    },
    // sectionDisplay.summary.showHeading (§31.4, F4c): the labeled path wraps
    // the summary in `section` (below) alongside its own heading row — that
    // outer View already carries the trailing sectionGap, so this text-only
    // style drops `summary`'s OWN marginBottom to avoid doubling it, same
    // "section supplies the gap, its children don't" split SectionBlock's own
    // heading+groups composition already uses.
    summaryText: {
      fontSize: typography.body.size,
      lineHeight: typography.body.lineHeight,
      fontFamily: typography.body.family,
      color: colors.text,
    },
    section: { marginBottom: page.sectionGap },
    // §31.2 headings.style's 8 treatments (HEADING_STYLES) each own a
    // distinct wrapper style below, composed onto the section-label row by
    // renderSectionHeading — see that function for which of these a given
    // style actually uses. sectionHeadingRow/sectionHeadingText are the two
    // EVERY treatment shares (row container, text run); the rest are
    // decoration a subset of treatments opts into.
    sectionHeadingRow: { marginBottom: 4, flexDirection: "row", alignItems: "center" },
    sectionHeadingText: {
      fontSize: typeScaleSizes.sectionHeading,
      fontFamily: typography.heading.family,
      fontWeight: typography.heading.weight,
      textTransform: headingTextTransform,
      color: headingColor,
    },
    // headingRuleColor (E9-F3d, accentPlacement.headingRules) is the ONE
    // fill every decoration below shares — the section-label TEXT
    // (sectionHeadingText, above) is a separate element class gated by its
    // own accentPlacement.headings flag.
    headingUnderline: {
      paddingBottom: 2,
      borderBottomWidth: 0.75,
      borderBottomColor: headingRuleColor,
    },
    headingThinUnderline: {
      paddingBottom: 2,
      borderBottomWidth: 0.25,
      borderBottomColor: headingRuleColor,
    },
    headingBoxed: {
      borderWidth: 0.75,
      borderColor: headingRuleColor,
      paddingVertical: 2,
      paddingHorizontal: 4,
      alignSelf: "flex-start",
    },
    headingRulesAboveBelow: {
      paddingVertical: 2,
      borderTopWidth: 0.5,
      borderBottomWidth: 0.5,
      borderTopColor: headingRuleColor,
      borderBottomColor: headingRuleColor,
    },
    headingAccentBar: {
      width: 3,
      marginRight: 6,
      backgroundColor: headingRuleColor,
      height: typeScaleSizes.sectionHeading,
    },
    headingShortRuleWrap: { flexDirection: "column" },
    headingShortRule: { marginTop: 2, width: 24, height: 1.25, backgroundColor: headingRuleColor },
    headingTicksRow: { flexDirection: "row", alignItems: "flex-end", marginRight: 5 },
    headingTickShort: {
      width: 2.5,
      height: typeScaleSizes.sectionHeading * 0.35,
      backgroundColor: headingRuleColor,
      marginRight: 2,
    },
    headingTickMid: {
      width: 2.5,
      height: typeScaleSizes.sectionHeading * 0.6,
      backgroundColor: headingRuleColor,
      marginRight: 2,
    },
    headingTickTall: {
      width: 2.5,
      height: typeScaleSizes.sectionHeading * 0.85,
      backgroundColor: headingRuleColor,
      marginRight: 2,
    },
    headingIconOutline: {
      width: 8,
      height: 8,
      marginRight: 5,
      borderWidth: 0.75,
      borderColor: headingRuleColor,
    },
    headingIconFilled: { width: 8, height: 8, marginRight: 5, backgroundColor: headingRuleColor },
    group: { marginBottom: 6 },
    // sectionDisplay.experience.groupPromotions (§31.4, F4c): one role
    // sub-entry within a collapsed multi-role PromotionGroupBlock — indented
    // under the shared employer header, its own small top gap since it
    // follows either that header or a previous role's items.
    promotionRole: { marginTop: 4, marginLeft: 8 },
    // groupHeading: the pre-F2e joined-string look, kept ONLY for the
    // `headingParts`-less fallback (a group with a bare `heading`, e.g. a
    // pre-E9-F2d stored snapshot) — every group WITH headingParts renders
    // through the split entryTitle/entrySubtitle/entryDate/entryLocation
    // elements below instead (§31.2 entries.* needs separate elements to
    // apply placement/order/font-style independently; one joined string
    // can't carry that).
    groupHeading: {
      fontSize: typeScaleSizes.entryHeader,
      fontFamily: typography.heading.family,
      fontWeight: typography.heading.weight,
      marginBottom: 2,
      color: colors.text,
    },
    // entries.dateLocationPlacement's 3 rows (§31.2, E9-F2e). 'right'/'left'
    // are one flowing row — the date/location cluster sits immediately
    // beside the title cluster, wherever that ends up. 'split' pins the
    // date/location cluster to the row's far end via space-between — the
    // one placement value with genuinely different x geometry from the
    // other two regardless of title length.
    entryHeaderRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 2 },
    entryHeaderRowSplit: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: 2,
    },
    // entries.structure 'columns' (§31.2): a fixed-width meta column (date/
    // location) beside a flexible main column (title/subtitle + items) —
    // real geometry distinct from 'full-width', where title/date/location
    // all share one row spanning the group's own width.
    entryColumnsRow: { flexDirection: "row" },
    entryMetaColumn: { width: "25%" },
    entryMainColumn: { flex: 1, marginLeft: 8 },
    entryTitleCluster: { flexDirection: "column" },
    // entries.subtitlePlacement (§31.2): 'same-line' keeps the row direction
    // here (subtitle appended right after the title text); 'below' switches
    // GroupBlock to render the subtitle as a second child of
    // entryTitleCluster instead — a real y-offset, not just a style tweak.
    entryTitleRow: { flexDirection: "row", alignItems: "baseline" },
    entryTitle: {
      fontSize: typeScaleSizes.entryHeader,
      fontFamily: typography.heading.family,
      fontWeight: typography.heading.weight,
      color: colors.text,
    },
    entrySubtitle: {
      fontSize: typography.body.size,
      fontFamily: typography.body.family,
      marginLeft: 4,
      color: entrySubtitleColor,
    },
    // Overrides entrySubtitle's inline marginLeft when subtitlePlacement is
    // 'below' — the subtitle starts its own line, flush with the title.
    entrySubtitleBelow: { marginLeft: 0, marginTop: 1 },
    entryDateLocationCluster: { flexDirection: "row", marginLeft: 6 },
    entryDate: {
      fontSize: typography.body.size,
      fontFamily: typography.body.family,
      color: dateColor,
    },
    entryLocation: {
      fontSize: typography.body.size,
      fontFamily: typography.body.family,
      marginLeft: 4,
      color: colors.text,
    },
    items: { flexDirection: "column" },
    itemsGrid: { flexDirection: "row", flexWrap: "wrap" },
    item: {
      fontSize: typography.body.size,
      marginBottom: 2,
      flexDirection: "row",
      fontFamily: typography.body.family,
    },
    bullet: { width: 10, color: colors.text },
    itemText: { flex: 1, lineHeight: typography.body.lineHeight, color: colors.text },
    // entries.bodyIndent (§31.2): shifts the item's own text run right,
    // independent of the bullet glyph's position — a real x-offset on the
    // body only, never the bullet.
    itemTextIndent: { marginLeft: 10 },
    // sectionDisplay.{skillsLanguages,interests}.layout 'compact'/'bubble'
    // (§31.4, E9-F4b): both share the row-wrap container (itemsGrid, above —
    // the SAME container 'grid' reuses) but replace ItemRow's bullet+flex
    // item with a bare, un-widthed Text run — no bullet glyph, so 'compact'
    // is byte-distinct from 'rows'/'grid' by that glyph's absence alone,
    // on top of the tighter margins below.
    itemTextInline: {
      fontSize: typography.body.size,
      fontFamily: typography.body.family,
      color: colors.text,
    },
    itemCompact: { flexDirection: "row", marginRight: 8, marginBottom: 4 },
    // 'bubble': the same bare text run, wrapped in a bordered pill — real
    // geometry (a stroked box) 'compact' never draws, so the two stay
    // pairwise-distinct regardless of content.
    itemBubble: {
      flexDirection: "row",
      borderWidth: 0.75,
      borderColor: colors.text,
      borderRadius: 8,
      paddingVertical: 2,
      paddingHorizontal: 6,
      marginRight: 6,
      marginBottom: 6,
    },
    // sectionDisplay.skillsLanguages.levelDisplay (§31.4, E9-F4b): the
    // per-item level indicator, appended after an otherwise-ordinary
    // ItemRow — 'level' layout is exactly the 'rows' row plus this, so an
    // item with no level (resolveItemLevel undefined) renders NOTHING extra,
    // which is the fallback the ticket requires. 'dots'/'bar' are plain
    // Views — no Text child, so pdf.js text extraction sees zero added
    // content for either (the EXTRACTION-NEUTRALITY oracle,
    // test/engine-section-display.test.ts); 'text' is the one levelDisplay
    // that legitimately adds extraction text (levelIndicatorText, below).
    levelIndicatorWrap: { flexDirection: "row", alignItems: "center", marginLeft: 6 },
    levelDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      marginRight: 2,
      borderWidth: 0.75,
      borderColor: levelIndicatorColor,
    },
    levelDotFilled: { backgroundColor: levelIndicatorColor },
    // The bar track is a fixed-width strip tinted off colors.text at low
    // opacity (never a new hardcoded hex) so it reads as a neutral groove
    // regardless of the document's own palette; the fill on top of it is
    // the one part levelIndicators actually gates.
    levelBarTrack: {
      position: "relative",
      width: 30,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.text,
      opacity: 0.2,
    },
    levelBarFill: {
      position: "absolute",
      top: 0,
      left: 0,
      height: 4,
      borderRadius: 2,
      backgroundColor: levelIndicatorColor,
    },
    levelIndicatorText: {
      fontSize: typography.body.size - 1,
      fontFamily: typography.body.family,
      marginLeft: 6,
      color: levelIndicatorColor,
    },
  });
}

type SectionStyles = ReturnType<typeof buildStyles>;

// photo.zoom (§31.2, E9-F3f): the image itself renders BIGGER than the
// styles.photo frame it sits in (frame stays fixed at photo.size, clipped by
// its own borderRadius+overflow:hidden) — negative margins re-center the
// oversized image so the frame's clip crops evenly on every side, the same
// "enlarge, then clip" a CSS `transform: scale()` inside `overflow: hidden`
// would produce. photo.crop.{x,y} rides react-pdf's own objectFit:'cover' +
// objectPosition — a no-op when the source image's aspect ratio matches the
// (square) frame exactly, and the focal point otherwise.
function buildPhotoImageStyle(size: number, photoConfig: PhotoRenderConfig) {
  const zoomedSize = size * photoConfig.zoom;
  const centeringOffset = (zoomedSize - size) / 2;
  return {
    position: "absolute" as const,
    top: -centeringOffset,
    left: -centeringOffset,
    width: zoomedSize,
    height: zoomedSize,
    objectFit: "cover" as const,
    objectPosition: `${photoConfig.crop.x}% ${photoConfig.crop.y}%`,
  };
}

// The one seam all three ProfileHeader variants (default/centered/inline)
// render the photo through — hidden/no-photoUrl (§28.3) is a single gate
// here rather than three copies of the same `showPhoto && profile.photoUrl`
// check.
function buildPhotoNode(
  profile: Profile,
  format: DocumentFormat,
  styles: SectionStyles,
  frameOverride?: SectionStyles["photoCenterOverride"],
): ReactNode {
  if (format.photo.hidden || !profile.photoUrl) return null;
  const photoConfig = resolvePhotoConfig(format);
  const frameStyle = frameOverride ? [styles.photo, frameOverride] : styles.photo;
  return (
    <View style={frameStyle}>
      <Image src={profile.photoUrl} style={buildPhotoImageStyle(format.photo.size, photoConfig)} />
    </View>
  );
}

// header.titlePosition (§31.2, E9-F3c): 'same-line' puts name+title in one
// row; 'below' keeps them stacked in a column, the title starting its own
// line. Both are DIRECT Text siblings of the row/column (the title's own
// gap — titleSameLineGap/titleBelowGap — is baked into its style by the
// caller, not a wrapping View here) — react-pdf's row-level baseline
// alignment only lines up SIBLING Text runs correctly; a Text wrapped in its
// own View sibling throws that alignment off by a few points (verified
// against a real render at authoring time). No title (profile.headline
// unset) ⇒ just the name node, same either way.
function buildNameTitleNode(
  nameNode: ReactNode,
  titleTextNode: ReactNode,
  titlePosition: HeaderRenderConfig["titlePosition"],
  styles: SectionStyles,
): ReactNode {
  if (!titleTextNode) return nameNode;
  return (
    <View style={titlePosition === "same-line" ? styles.nameTitleRow : styles.nameTitleColumn}>
      {nameNode}
      {titleTextNode}
    </View>
  );
}

// header.separator's 3 values (§31.2, E9-F3c) — the glyph between adjacent
// contact fields/links. 'bullet'/'bar' are Text runs (so they show up in
// extraction text — sentinel-distinct at authoring time); 'icon' is a
// glyph-free View dot, same "no font glyph dependency" reasoning as the
// section-heading icons (renderHeadingIcon below).
function renderSeparator(
  separator: HeaderSeparator,
  styles: SectionStyles,
  ink: string | undefined,
  key: string,
): ReactNode {
  if (separator === "icon") {
    return (
      <View
        key={key}
        style={ink ? [styles.separatorDot, { backgroundColor: ink }] : styles.separatorDot}
      />
    );
  }
  const glyph = separator === "bullet" ? "•" : "|";
  return (
    <Text key={key} style={ink ? [styles.separatorText, { color: ink }] : styles.separatorText}>
      {glyph}
    </Text>
  );
}

// header.contactIconStyle's 7 values (§31.2, E9-F3c), one per contact field
// (email/phone/location) — View shapes, same reasoning as the section-
// heading icons: never a font-glyph dependency. "none-frame" renders no icon
// at all, so it stays pairwise-distinct from the other 6 by its absence.
const CONTACT_ICON_SHAPE_STYLE_KEY = {
  "circle-filled": "contactIconCircleFilled",
  "circle-outline": "contactIconCircleOutline",
  "rounded-filled": "contactIconRoundedFilled",
  "rounded-outline": "contactIconRoundedOutline",
  "square-filled": "contactIconSquareFilled",
  "square-outline": "contactIconSquareOutline",
} satisfies Record<Exclude<ContactIconStyle, "none-frame">, keyof SectionStyles>;

function renderContactIcon(
  iconStyle: ContactIconStyle,
  styles: SectionStyles,
  ink: string | undefined,
): ReactNode {
  if (iconStyle === "none-frame") return null;
  const shapeStyle = styles[CONTACT_ICON_SHAPE_STYLE_KEY[iconStyle]];
  const override = ink
    ? iconStyle.endsWith("filled")
      ? { backgroundColor: ink }
      : { borderColor: ink }
    : null;
  return (
    <View
      style={
        override
          ? [styles.contactIconBase, shapeStyle, override]
          : [styles.contactIconBase, shapeStyle]
      }
    />
  );
}

// The contact-fields row's children (§31.2 header.contactIconStyle/separator,
// E9-F3c) — one icon+text pair per email/phone/location, a separator glyph
// between adjacent pairs. Order (not just presence) is the extraction
// contract §31.1 already locks for these three fields.
function buildContactFieldNodes(
  fields: { key: string; text: string }[],
  headerConfig: HeaderRenderConfig,
  styles: SectionStyles,
  ink: string | undefined,
): ReactNode[] {
  const contactItemStyle = ink ? [styles.contactItem, { color: ink }] : styles.contactItem;
  const nodes: ReactNode[] = [];
  fields.forEach((field, i) => {
    if (i > 0)
      nodes.push(renderSeparator(headerConfig.separator, styles, ink, `sep-field-${field.key}`));
    nodes.push(
      <View key={field.key} style={styles.contactFieldRow}>
        {renderContactIcon(headerConfig.contactIconStyle, styles, ink)}
        <Text style={contactItemStyle}>{field.text}</Text>
      </View>,
    );
  });
  return nodes;
}

// The links row's children (§31.2 links.*, E9-F3c) — links.icon's glyph
// (linkIcon, a View, same "no font glyph dependency" reasoning) ahead of
// each Link; links.underline/accentColor style the Link itself (accentColor
// is already baked into styles.link/styles.linkIcon by buildStyles).
function buildLinkFieldNodes(
  links: Profile["links"],
  headerConfig: HeaderRenderConfig,
  linksConfig: LinksRenderConfig,
  styles: SectionStyles,
  ink: string | undefined,
): ReactNode[] {
  const linkStyle = [
    styles.link,
    { textDecoration: linksConfig.underline ? "underline" : "none" } as const,
    ...(ink ? [{ color: ink }] : []),
  ];
  const linkIconStyle = ink ? [styles.linkIcon, { borderColor: ink }] : styles.linkIcon;
  const nodes: ReactNode[] = [];
  links.forEach((link, i) => {
    if (i > 0)
      nodes.push(renderSeparator(headerConfig.separator, styles, ink, `sep-link-${link.url}`));
    nodes.push(
      <View key={link.url} style={styles.linkFieldRow}>
        {linksConfig.icon ? <View style={linkIconStyle} /> : null}
        <Link style={linkStyle} src={link.url}>
          {link.label}
        </Link>
      </View>,
    );
  });
  return nodes;
}

// header.detailsArrangement's 3 values (§31.2, E9-F3c). 'wrapped' is
// genuinely distinct geometry from 'stacked'/'single-row': the contact
// fields and the links each get their OWN line (contactLine, then linksLine
// below it) instead of sharing one merged, flowing row — a real y-offset
// between the two field classes that neither other value produces.
// 'stacked'/'single-row' differ only in which ProfileHeader variant hosts
// this one merged row (resolveVariant, document.tsx) — never in the row's
// own contents, so this function doesn't need to know which of those two it
// is. `extraRowStyle` threads variant 'inline''s contactLineInline override
// onto the merged row (the two-row 'wrapped' case never needs it — inline
// requires detailsArrangement === 'single-row' exactly, see document.tsx's
// resolveVariant comment).
function buildContactBlock(
  fieldNodes: ReactNode[],
  linkNodes: ReactNode[],
  headerConfig: HeaderRenderConfig,
  styles: SectionStyles,
  ink: string | undefined,
  extraRowStyle?: SectionStyles["contactLineInline"],
): ReactNode {
  if (headerConfig.detailsArrangement === "wrapped") {
    return (
      <>
        <View style={extraRowStyle ? [styles.contactLine, extraRowStyle] : styles.contactLine}>
          {fieldNodes}
        </View>
        {linkNodes.length > 0 ? (
          <View style={extraRowStyle ? [styles.linksLine, extraRowStyle] : styles.linksLine}>
            {linkNodes}
          </View>
        ) : null}
      </>
    );
  }
  const rowStyle = extraRowStyle ? [styles.contactLine, extraRowStyle] : styles.contactLine;
  return (
    <View style={rowStyle}>
      {fieldNodes}
      {fieldNodes.length > 0 && linkNodes.length > 0
        ? renderSeparator(headerConfig.separator, styles, ink, "sep-fields-links")
        : null}
      {linkNodes}
    </View>
  );
}

// 'left' (default, strict/sidebar's header): photo + name-above-contact block,
// left-anchored. 'centered' (classic): the whole block centered on the page.
// 'inline' (compact): name and contact share one row. Composition only — the
// profile fields and shared contact/link rendering never change by variant.
export type ProfileHeaderVariant = "left" | "centered" | "inline";

export function ProfileHeader({
  profile,
  format,
  variant = "left",
  ink,
  nameFontFamily,
}: {
  profile: Profile;
  format: DocumentFormat;
  variant?: ProfileHeaderVariant;
  // Optional ink override for the name/contact/link text — used only by
  // templates that set the header on a filled band (banner, spec.md §28.2)
  // and need a contrasting color instead of the default colors.text/primary.
  // Undefined ⇒ identical output to before this prop existed.
  ink?: string;
  // §31.2 fonts.name (E9-F2a) — the name-slot font, resolved by the caller
  // (document.tsx via legacyAdapt's resolveNameFont) independently of
  // `format.typography.heading.family`. There is no seam for it on the
  // legacy `DocumentFormat` shape this component's `format` prop is locked
  // to (typography carries one shared heading family, not a separate name
  // slot), so it arrives as its own prop instead. Undefined ⇒ falls back to
  // the heading family, identical to output before this prop existed.
  nameFontFamily?: string;
}) {
  const styles = buildStyles(format);
  const headerConfig = resolveHeaderConfig(format);
  const linksConfig = resolveLinksConfig(format);
  const nameOverrides: { color?: string; fontFamily?: string } = {};
  if (ink) nameOverrides.color = ink;
  if (nameFontFamily) nameOverrides.fontFamily = nameFontFamily;
  const nameStyle =
    Object.keys(nameOverrides).length > 0 ? [styles.name, nameOverrides] : styles.name;
  const titleStyle = [
    styles.title,
    headerConfig.titlePosition === "same-line" ? styles.titleSameLineGap : styles.titleBelowGap,
    ...(ink ? [{ color: ink }] : []),
  ];
  const nameNode = <Text style={nameStyle}>{profile.name}</Text>;
  const titleTextNode = profile.headline ? (
    <Text style={titleStyle}>{profile.headline}</Text>
  ) : null;
  const nameTitleNode = buildNameTitleNode(
    nameNode,
    titleTextNode,
    headerConfig.titlePosition,
    styles,
  );

  const contactFields = [
    profile.email ? { key: "email", text: profile.email } : null,
    profile.phone ? { key: "phone", text: profile.phone } : null,
    profile.location ? { key: "location", text: profile.location } : null,
  ].filter((field): field is { key: string; text: string } => field !== null);
  const fieldNodes = buildContactFieldNodes(contactFields, headerConfig, styles, ink);
  const linkNodes = buildLinkFieldNodes(profile.links, headerConfig, linksConfig, styles, ink);

  if (variant === "centered") {
    return (
      <View style={styles.headerCentered}>
        {buildPhotoNode(profile, format, styles, styles.photoCenterOverride)}
        {nameTitleNode}
        {buildContactBlock(fieldNodes, linkNodes, headerConfig, styles, ink)}
      </View>
    );
  }

  if (variant === "inline") {
    return (
      <View style={styles.headerInline}>
        <View style={styles.headerInlineLeft}>
          {buildPhotoNode(profile, format, styles)}
          {nameTitleNode}
        </View>
        {buildContactBlock(
          fieldNodes,
          linkNodes,
          headerConfig,
          styles,
          ink,
          styles.contactLineInline,
        )}
      </View>
    );
  }

  return (
    <View style={styles.header}>
      {buildPhotoNode(profile, format, styles)}
      <View style={styles.headerText}>
        {nameTitleNode}
        {buildContactBlock(fieldNodes, linkNodes, headerConfig, styles, ink)}
      </View>
    </View>
  );
}

// sectionDisplay.summary.showHeading (§31.4, F4c): off keeps this module's
// pre-ticket look — a bare Text run, no label, own trailing sectionGap
// (styles.summary). On renders the SAME "Summary" label every other section
// gets from renderSectionHeading (headings.style/capitalization/icons all
// apply identically — never a hand-rolled second look for this one label),
// wrapped in `section` so ONE place supplies the trailing gap.
export function SummarySection({ summary, format }: { summary: string; format: DocumentFormat }) {
  if (!summary) return null;
  const styles = buildStyles(format);
  const sectionDisplay = resolveSectionDisplayConfig(format);
  if (!sectionDisplay.summary.showHeading) {
    return <Text style={styles.summary}>{summary}</Text>;
  }
  const headingsConfig = resolveHeadingsConfig(format);
  return (
    <View style={styles.section}>
      {renderSectionHeading("Summary", styles, headingsConfig)}
      <Text style={styles.summaryText}>{summary}</Text>
    </View>
  );
}

// entries.listStyle (§31.2) picks the bullet glyph. Only 2 values —
// this is the one enum-shaped char lookup, never free text (§31.1).
const BULLET_GLYPHS: Record<EntriesRenderConfig["listStyle"], string> = {
  bullet: "•",
  hyphen: "-",
};

// entries.{subtitle,date,location}FontStyle (§31.2) each independently pick
// normal/bold/italic for their own Text run — a style ARRAY entry, not a
// derived style key, since it composes onto the field's own base style
// (entrySubtitle/entryDate/entryLocation) rather than replacing it.
// 'italic' renders as a synthetic skew, not react-pdf's native `fontStyle:
// "italic"`: fonts.ts's registered roster (E9-F2a) carries only regular/bold
// weights for every one of its 39 faces, no italic source for any of
// them — react-pdf's FontFamily.resolve hard-errors ("Could not resolve
// font…fontStyle italic") rather than faux-italicizing on a missing face,
// and this file's contract can't touch fonts.ts to add one. A CSS skew
// transform is a real, independent style axis (@react-pdf/stylesheet
// supports `transform` on Text) that needs no font asset at all.
function fontStyleOverride(style: EntryFontStyle): { fontWeight?: 700; transform?: string } {
  if (style === "bold") return { fontWeight: 700 };
  if (style === "italic") return { transform: "skewX(-12deg)" };
  return {};
}

export function ItemRow({
  item,
  format,
  columns,
  trailing,
}: {
  item: TailoredItem;
  format: DocumentFormat;
  columns: number;
  // sectionDisplay.skillsLanguages.layout 'level' (§31.4, E9-F4b): the
  // item's own level indicator, rendered as this row's last child — absent
  // (every other layout, or a level-less item within 'level' itself) leaves
  // this row byte-identical to the plain 'rows' row it always was.
  trailing?: ReactNode;
}) {
  const styles = buildStyles(format);
  const entriesConfig = resolveEntriesConfig(format);
  const width = columns > 1 ? { width: `${100 / columns}%` } : {};
  const bodyStyle = entriesConfig.bodyIndent
    ? [styles.itemText, styles.itemTextIndent]
    : styles.itemText;
  return (
    <View style={[styles.item, width]}>
      <Text style={styles.bullet}>{BULLET_GLYPHS[entriesConfig.listStyle]}</Text>
      <Text style={bodyStyle}>{item.text}</Text>
      {trailing}
    </View>
  );
}

// sectionDisplay.{skillsLanguages,interests}.layout 'compact'/'bubble'
// (§31.4, E9-F4b) — see itemCompact/itemBubble's own comment (buildStyles)
// for why these skip ItemRow's bullet entirely rather than reusing it.
function ChipItemRow({
  item,
  styles,
  variant,
}: {
  item: TailoredItem;
  styles: SectionStyles;
  variant: "compact" | "bubble";
}) {
  return (
    <View style={variant === "bubble" ? styles.itemBubble : styles.itemCompact}>
      <Text style={styles.itemTextInline}>{item.text}</Text>
    </View>
  );
}

// sectionDisplay.skillsLanguages.levelDisplay (§31.4, E9-F4b). `level`
// undefined (an unleveled entry, or levelDisplay has nothing to show for
// it) renders nothing — the 'level' layout's rows fallback for that one
// item. 'dots'/'bar' are plain Views (levelDot/levelBarTrack+Fill,
// buildStyles) — zero Text children, so they add nothing to pdf.js
// extraction; 'text' is a Text run and legitimately does.
function renderLevelIndicator(
  level: number | undefined,
  levelDisplay: LevelDisplay,
  levelLabels: readonly string[],
  styles: SectionStyles,
): ReactNode {
  if (level === undefined) return null;
  if (levelDisplay === "text") {
    return <Text style={styles.levelIndicatorText}>{levelLabels[level - 1]}</Text>;
  }
  if (levelDisplay === "dots") {
    return (
      <View style={styles.levelIndicatorWrap}>
        {[1, 2, 3, 4, 5].map((dotLevel) => (
          <View
            key={`dot-${dotLevel}`}
            style={dotLevel <= level ? [styles.levelDot, styles.levelDotFilled] : styles.levelDot}
          />
        ))}
      </View>
    );
  }
  return (
    <View style={[styles.levelBarTrack, { marginLeft: 6 }]}>
      <View style={[styles.levelBarFill, { width: `${(level / 5) * 100}%` }]} />
    </View>
  );
}

// The section/group items block — every §31.4 skillsLanguages/interests
// layout value shares this ONE dispatch, reusing the same itemsGrid-vs-items
// container switch this module used before this ticket (never a second grid
// path): 'compact'/'bubble' opt into the row-wrap container with a bare
// ChipItemRow child; 'grid' and the legacy per-section `columns` fallback
// both resolve to a column count and share ItemRow's existing width-percent
// math; 'level' stays in the single-column container and appends each item's
// own indicator via ItemRow's `trailing`.
function buildItemsBlock(
  items: TailoredGroup["items"],
  format: DocumentFormat,
  styles: SectionStyles,
  columns: number,
  itemsDisplay: ItemsDisplayConfig | undefined,
): ReactNode {
  const layout = itemsDisplay?.layout;

  if (layout === "compact" || layout === "bubble") {
    return (
      <View style={styles.itemsGrid}>
        {items.map((item) => (
          <ChipItemRow key={item.entryId} item={item} styles={styles} variant={layout} />
        ))}
      </View>
    );
  }

  if (layout === "level") {
    const levelDisplay = itemsDisplay?.levelDisplay ?? "text";
    const levelLabels =
      itemsDisplay?.levelLabels ?? DEFAULT_SECTION_DISPLAY_CONFIG.skillsLanguages.levelLabels;
    return (
      <View style={styles.items}>
        {items.map((item) => (
          <ItemRow
            key={item.entryId}
            item={item}
            format={format}
            columns={1}
            trailing={renderLevelIndicator(
              resolveItemLevel(item),
              levelDisplay,
              levelLabels,
              styles,
            )}
          />
        ))}
      </View>
    );
  }

  const resolvedColumns = layout === "grid" ? (itemsDisplay?.gridColumns ?? 1) : columns;
  return (
    <View style={resolvedColumns > 1 ? styles.itemsGrid : styles.items}>
      {items.map((item) => (
        <ItemRow key={item.entryId} item={item} format={format} columns={resolvedColumns} />
      ))}
    </View>
  );
}

// entries.subtitlePlacement (§31.2): the subtitle Text run, styled per
// subtitleFontStyle either way — 'below' additionally drops the inline
// marginLeft (entrySubtitleBelow) since it now starts its own line.
function buildSubtitleNode(
  parts: TailoredGroupHeadingParts,
  entriesConfig: EntriesRenderConfig,
  styles: SectionStyles,
): ReactNode {
  if (!parts.subtitle) return null;
  const style = [
    styles.entrySubtitle,
    fontStyleOverride(entriesConfig.subtitleFontStyle),
    ...(entriesConfig.subtitlePlacement === "below" ? [styles.entrySubtitleBelow] : []),
  ];
  return <Text style={style}>{parts.subtitle}</Text>;
}

// The title + subtitle cluster — entries.subtitlePlacement decides whether
// the subtitle is the title row's second child (same-line) or
// entryTitleCluster's second child (below, its own line — a real y-offset).
function buildTitleCluster(
  parts: TailoredGroupHeadingParts,
  entriesConfig: EntriesRenderConfig,
  styles: SectionStyles,
): ReactNode {
  const subtitleNode = buildSubtitleNode(parts, entriesConfig, styles);
  const sameLine = entriesConfig.subtitlePlacement === "same-line";
  return (
    <View style={styles.entryTitleCluster}>
      <View style={styles.entryTitleRow}>
        <Text style={styles.entryTitle}>{parts.title}</Text>
        {sameLine ? subtitleNode : null}
      </View>
      {sameLine ? null : subtitleNode}
    </View>
  );
}

// The date + location cluster, ordered per entries.dateLocationOrder —
// independent of dateLocationPlacement, which only decides where this
// cluster sits relative to the title cluster (buildEntryHeaderRow) or
// whether it renders in its own column at all (GroupBlock's 'columns'
// structure branch).
function buildDateLocationCluster(
  parts: TailoredGroupHeadingParts,
  format: DocumentFormat,
  entriesConfig: EntriesRenderConfig,
  styles: SectionStyles,
): ReactNode {
  const date = resolveFormattedDate(parts, format);
  const dateNode = date ? (
    <Text key="date" style={[styles.entryDate, fontStyleOverride(entriesConfig.dateFontStyle)]}>
      {date}
    </Text>
  ) : null;
  const locationNode = parts.location ? (
    <Text
      key="location"
      style={[styles.entryLocation, fontStyleOverride(entriesConfig.locationFontStyle)]}
    >
      {parts.location}
    </Text>
  ) : null;
  const ordered =
    entriesConfig.dateLocationOrder === "location-first"
      ? [locationNode, dateNode]
      : [dateNode, locationNode];
  if (!ordered.some(Boolean)) return null;
  return <View style={styles.entryDateLocationCluster}>{ordered}</View>;
}

// entries.dateLocationPlacement's 'left'/'right' (§31.2): one flowing row,
// the date/location cluster before or after the title cluster. 'split' pins
// it to the row's far end instead (entryHeaderRowSplit's justifyContent) —
// see that style's comment for why this is the one placement with genuinely
// different geometry from the other two regardless of title length.
function buildEntryHeaderRow(
  parts: TailoredGroupHeadingParts,
  format: DocumentFormat,
  entriesConfig: EntriesRenderConfig,
  styles: SectionStyles,
): ReactNode {
  const titleCluster = buildTitleCluster(parts, entriesConfig, styles);
  const dateLocationCluster = buildDateLocationCluster(parts, format, entriesConfig, styles);
  const rowStyle =
    entriesConfig.dateLocationPlacement === "split"
      ? styles.entryHeaderRowSplit
      : styles.entryHeaderRow;
  if (entriesConfig.dateLocationPlacement === "left") {
    return (
      <View style={rowStyle}>
        {dateLocationCluster}
        {titleCluster}
      </View>
    );
  }
  return (
    <View style={rowStyle}>
      {titleCluster}
      {dateLocationCluster}
    </View>
  );
}

// sectionDisplay.experience.order / .education.order (§31.4, F4c): headingParts
// (assemble.ts's headingPartsFromMeta) always carries title=role/subtitle=company
// for experience and title=degree/subtitle=school for education — the SAME
// mapping regardless of this axis, since it's the entry's own facts, not a
// display choice. 'title-first'/'degree-first' render that mapping as-is
// (title leads, exactly this module's pre-ticket look); 'employer-first'/
// 'school-first' swap which fact occupies the leading (bold, entryTitle)
// slot vs the trailing (entrySubtitle) one — a real content swap, not a
// style-only change, so extraction order actually flips. Every other
// groupable section (project, skill's category grouping) has no order axis
// at all — parts pass through untouched.
function swapTitleSubtitle(parts: TailoredGroupHeadingParts): TailoredGroupHeadingParts {
  if (!parts.subtitle) return parts;
  return { ...parts, title: parts.subtitle, subtitle: parts.title };
}

function resolveOrderedHeadingParts(
  section: Section | undefined,
  parts: TailoredGroupHeadingParts,
  sectionDisplay: SectionDisplayRenderConfig,
): TailoredGroupHeadingParts {
  if (section === "experience" && sectionDisplay.experience.order === "employer-first") {
    return swapTitleSubtitle(parts);
  }
  if (section === "education" && sectionDisplay.education.order === "school-first") {
    return swapTitleSubtitle(parts);
  }
  return parts;
}

export function GroupBlock({
  group,
  format,
  columns = 1,
  itemsDisplay,
  section,
}: {
  group: TailoredGroup;
  format: DocumentFormat;
  columns?: number;
  // §31.4 sectionDisplay.{skillsLanguages,interests} (E9-F4b) — set only by
  // SectionBlock, only for skill/language/interest sections (resolveItemsDisplay).
  // Undefined ⇒ `columns` alone decides the container, exactly this module's
  // pre-ticket behavior for every other section.
  itemsDisplay?: ItemsDisplayConfig;
  // §31.4 sectionDisplay.{experience,education}.order (F4c) — which section
  // this group belongs to, so resolveOrderedHeadingParts knows whether/how to
  // apply the order axis. Undefined (every non-experience/education caller,
  // or a caller built before this ticket) ⇒ parts pass through untouched.
  section?: Section;
}) {
  const styles = buildStyles(format);
  const entriesConfig = resolveEntriesConfig(format);
  const sectionDisplay = resolveSectionDisplayConfig(format);
  const parts = group.headingParts
    ? resolveOrderedHeadingParts(section, group.headingParts, sectionDisplay)
    : undefined;
  const itemsBlock = buildItemsBlock(group.items, format, styles, columns, itemsDisplay);

  // Back-compat (§31.1): a group with no headingParts (every snapshot from
  // before E9-F2d, or a hand-built fixture) renders exactly its raw
  // `heading` string, untouched — entries.* has nothing structured to apply
  // to.
  if (!parts) {
    return (
      <View style={styles.group}>
        {group.heading ? <Text style={styles.groupHeading}>{group.heading}</Text> : null}
        {itemsBlock}
      </View>
    );
  }

  // entries.structure 'columns' (§31.2): the date/location cluster moves
  // into its own fixed-width column beside title+items — dateLocationPlacement
  // has nothing to decide here (there is no shared row to place it within),
  // an unhandled off-diagonal rather than a crash, same convention as every
  // other engine axis combination this codebase doesn't wire.
  if (entriesConfig.structure === "columns") {
    return (
      <View style={styles.group}>
        <View style={styles.entryColumnsRow}>
          <View style={styles.entryMetaColumn}>
            {buildDateLocationCluster(parts, format, entriesConfig, styles)}
          </View>
          <View style={styles.entryMainColumn}>
            {buildTitleCluster(parts, entriesConfig, styles)}
            {itemsBlock}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.group}>
      {buildEntryHeaderRow(parts, format, entriesConfig, styles)}
      {itemsBlock}
    </View>
  );
}

// §31.2 headings.icons's outline/filled render as a small geometric square (a
// View, not a font glyph) so the adornment never depends on the chosen
// heading font having an icon glyph in its coverage.
function renderHeadingIcon(icons: HeadingsRenderConfig["icons"], styles: SectionStyles) {
  if (icons === "none") return null;
  return <View style={icons === "filled" ? styles.headingIconFilled : styles.headingIconOutline} />;
}

// §31.2 headings.style's 8 treatments — every branch renders the SAME label
// text (capitalization/icon already baked into sectionHeadingText/icon
// above); only the surrounding decoration differs, so each of the 8 must
// produce visually and byte-distinct output. 'underline' is also this
// module's pre-ticket look (DEFAULT_HEADINGS_CONFIG's fallback).
function renderSectionHeading(
  label: string,
  styles: SectionStyles,
  headingsConfig: HeadingsRenderConfig,
) {
  const icon = renderHeadingIcon(headingsConfig.icons, styles);
  const text = <Text style={styles.sectionHeadingText}>{label}</Text>;

  switch (headingsConfig.style) {
    case "boxed":
      return (
        <View style={[styles.sectionHeadingRow, styles.headingBoxed]}>
          {icon}
          {text}
        </View>
      );
    case "rules-above-below":
      return (
        <View style={[styles.sectionHeadingRow, styles.headingRulesAboveBelow]}>
          {icon}
          {text}
        </View>
      );
    case "thin-underline":
      return (
        <View style={[styles.sectionHeadingRow, styles.headingThinUnderline]}>
          {icon}
          {text}
        </View>
      );
    case "accent-bar":
      return (
        <View style={styles.sectionHeadingRow}>
          <View style={styles.headingAccentBar} />
          {icon}
          {text}
        </View>
      );
    case "outline-short-rule":
      return (
        <View style={styles.headingShortRuleWrap}>
          <View style={styles.sectionHeadingRow}>
            {icon}
            {text}
          </View>
          <View style={styles.headingShortRule} />
        </View>
      );
    case "tick-marks":
      return (
        <View style={styles.sectionHeadingRow}>
          <View style={styles.headingTicksRow}>
            <View style={styles.headingTickShort} />
            <View style={styles.headingTickMid} />
            <View style={styles.headingTickTall} />
          </View>
          {icon}
          {text}
        </View>
      );
    case "plain":
      return (
        <View style={styles.sectionHeadingRow}>
          {icon}
          {text}
        </View>
      );
    default:
      return (
        <View style={[styles.sectionHeadingRow, styles.headingUnderline]}>
          {icon}
          {text}
        </View>
      );
  }
}

// sectionDisplay.experience.groupPromotions (§31.4, F4c): a VIEW-layer
// re-grouping on top of the section registry's own company·role·period
// groupBy (src/shared/sections.ts, unedited) — merges the TailoredGroups
// that share the SAME employer (headingParts.subtitle: the entry's own
// company fact, assemble.ts's headingPartsFromMeta) into one rendered block,
// each source group becoming a role sub-entry instead of its own top-level
// group. A group with no headingParts, or no subtitle at all, never merges
// with any other group — it's keyed by its own position, so two such groups
// can't spuriously collide on the shared "no employer" bucket.
type PromotionGroup = { employer?: string; roles: TailoredGroup[] };

function collapsePromotions(groups: TailoredGroup[]): PromotionGroup[] {
  const byEmployer = new Map<string, PromotionGroup>();
  const order: PromotionGroup[] = [];
  groups.forEach((group, i) => {
    const employer = group.headingParts?.subtitle;
    const key = employer ?? `__ungrouped_${i}__`;
    let promoted = byEmployer.get(key);
    if (!promoted) {
      promoted = { employer, roles: [] };
      byEmployer.set(key, promoted);
      order.push(promoted);
    }
    promoted.roles.push(group);
  });
  return order;
}

// A single-role PromotionGroup (no actual promotion at that employer, the
// common case) renders through the SAME GroupBlock every other experience
// group does — byte-identical to groupPromotions off, so collapsing never
// changes the 1-role-per-employer look. Multiple roles get ONE employer
// header (entryTitle's own look) followed by one role sub-block per member:
// role/date/location per role, subtitle stripped since the employer header
// above already carries that fact — it never repeats per role.
function PromotionGroupBlock({
  promoted,
  format,
  columns,
  itemsDisplay,
}: {
  promoted: PromotionGroup;
  format: DocumentFormat;
  columns: number;
  itemsDisplay?: ItemsDisplayConfig;
}) {
  if (promoted.roles.length === 1) {
    return (
      <GroupBlock
        group={promoted.roles[0]}
        format={format}
        columns={columns}
        itemsDisplay={itemsDisplay}
        section="experience"
      />
    );
  }
  const styles = buildStyles(format);
  const entriesConfig = resolveEntriesConfig(format);
  return (
    <View style={styles.group}>
      {promoted.employer ? <Text style={styles.entryTitle}>{promoted.employer}</Text> : null}
      {promoted.roles.map((role, i) => (
        <View key={role.headingParts?.title ?? i} style={styles.promotionRole}>
          {role.headingParts
            ? buildEntryHeaderRow(
                { ...role.headingParts, subtitle: undefined },
                format,
                entriesConfig,
                styles,
              )
            : null}
          {buildItemsBlock(role.items, format, styles, columns, itemsDisplay)}
        </View>
      ))}
    </View>
  );
}

export function SectionBlock({
  section,
  format,
}: {
  section: TailoredSection;
  format: DocumentFormat;
}) {
  const styles = buildStyles(format);
  const headingsConfig = resolveHeadingsConfig(format);
  const sectionDisplay = resolveSectionDisplayConfig(format);
  const itemsDisplay = resolveItemsDisplay(section.section, sectionDisplay);
  // §31.4 (E9-F4b): a skill/language/interest section's column count now
  // comes from its own gridColumns when its layout is 'grid' (1 for every
  // other layout — 'compact'/'bubble' wrap freely, 'rows'/'level' stay
  // single-column); every other section keeps the legacy per-section
  // `columns` field exactly as this module read it before this ticket.
  const columns = itemsDisplay
    ? itemsDisplay.layout === "grid"
      ? itemsDisplay.gridColumns
      : 1
    : (format.sections[section.section]?.columns ?? 1);
  const promoted =
    section.section === "experience" && sectionDisplay.experience.groupPromotions
      ? collapsePromotions(section.groups)
      : undefined;
  return (
    <View style={styles.section}>
      {renderSectionHeading(SECTIONS[section.section].label, styles, headingsConfig)}
      {promoted
        ? promoted.map((group, i) => (
            <PromotionGroupBlock
              key={group.employer ?? i}
              promoted={group}
              format={format}
              columns={columns}
              itemsDisplay={itemsDisplay}
            />
          ))
        : section.groups.map((group, i) => (
            <GroupBlock
              key={group.heading ?? i}
              group={group}
              format={format}
              columns={columns}
              itemsDisplay={itemsDisplay}
              section={section.section}
            />
          ))}
    </View>
  );
}
