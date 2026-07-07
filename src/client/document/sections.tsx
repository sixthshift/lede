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
} from "@shared/format-v2";
import type {
  AccentPlacementRenderConfig,
  EntriesRenderConfig,
  HeaderRenderConfig,
  HeadingsRenderConfig,
  LinksRenderConfig,
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
// levelIndicators is a NO-OP here: its element (skills/languages level
// display) doesn't exist in this file yet — it's built in E9-F4. The flag
// is threaded through so AccentPlacementV2 stays whole end-to-end, but
// nothing reads it until that ticket gives it a color path to gate.
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
  const headingTextTransform =
    headingsConfig.capitalization === "uppercase" ? "uppercase" : "capitalize";

  return StyleSheet.create({
    header: { marginBottom: 12, flexDirection: "row", alignItems: "center" },
    // centered/inline are alternate header compositions (spec.md §28.2's
    // classic/compact templates) — the profile's fields never change, only
    // which axis they're laid out on.
    headerCentered: { marginBottom: 12, flexDirection: "column", alignItems: "center" },
    headerInline: {
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerInlineLeft: { flexDirection: "row", alignItems: "center" },
    photo: {
      width: photo.size,
      height: photo.size,
      marginRight: 12,
      borderRadius: photoRadius,
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
  });
}

type SectionStyles = ReturnType<typeof buildStyles>;

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
  const showPhoto = format.photo.hidden === false;

  if (variant === "centered") {
    return (
      <View style={styles.headerCentered}>
        {showPhoto && profile.photoUrl ? (
          <Image src={profile.photoUrl} style={[styles.photo, styles.photoCenterOverride]} />
        ) : null}
        {nameTitleNode}
        {buildContactBlock(fieldNodes, linkNodes, headerConfig, styles, ink)}
      </View>
    );
  }

  if (variant === "inline") {
    return (
      <View style={styles.headerInline}>
        <View style={styles.headerInlineLeft}>
          {showPhoto && profile.photoUrl ? (
            <Image src={profile.photoUrl} style={styles.photo} />
          ) : null}
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
      {showPhoto && profile.photoUrl ? <Image src={profile.photoUrl} style={styles.photo} /> : null}
      <View style={styles.headerText}>
        {nameTitleNode}
        {buildContactBlock(fieldNodes, linkNodes, headerConfig, styles, ink)}
      </View>
    </View>
  );
}

export function SummarySection({ summary, format }: { summary: string; format: DocumentFormat }) {
  if (!summary) return null;
  const styles = buildStyles(format);
  return <Text style={styles.summary}>{summary}</Text>;
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
}: {
  item: TailoredItem;
  format: DocumentFormat;
  columns: number;
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

export function GroupBlock({
  group,
  format,
  columns = 1,
}: {
  group: TailoredGroup;
  format: DocumentFormat;
  columns?: number;
}) {
  const styles = buildStyles(format);
  const entriesConfig = resolveEntriesConfig(format);
  const parts = group.headingParts;
  const itemsBlock = (
    <View style={columns > 1 ? styles.itemsGrid : styles.items}>
      {group.items.map((item) => (
        <ItemRow key={item.entryId} item={item} format={format} columns={columns} />
      ))}
    </View>
  );

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

export function SectionBlock({
  section,
  format,
}: {
  section: TailoredSection;
  format: DocumentFormat;
}) {
  const styles = buildStyles(format);
  const headingsConfig = resolveHeadingsConfig(format);
  const columns = format.sections[section.section]?.columns ?? 1;
  return (
    <View style={styles.section}>
      {renderSectionHeading(SECTIONS[section.section].label, styles, headingsConfig)}
      {section.groups.map((group, i) => (
        <GroupBlock key={group.heading ?? i} group={group} format={format} columns={columns} />
      ))}
    </View>
  );
}
