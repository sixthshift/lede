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
import type { DateFormatV2, EntryFontStyle } from "@shared/format-v2";
import type {
  EntriesRenderConfig,
  HeadingsRenderConfig,
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
  // "plain" (§31.2) means bare text — no accent color, no rule/box/bar
  // decoration at all — so it also drops the accent-colored text every other
  // treatment shares; every other treatment keeps today's colors.primary.
  const headingColor = headingsConfig.style === "plain" ? colors.text : colors.primary;
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
      color: colors.text,
    },
    // §31.2 "title/subtitle" — profile.headline, previously never rendered
    // in the PDF (only in plainText.ts's export) — this ticket gives it a
    // render seam so titleOffset has somewhere to land (format-v2.ts's
    // migration comment: "no distinct 'title' text rendered today").
    title: {
      fontSize: typeScaleSizes.title,
      fontFamily: typography.body.family,
      marginTop: 2,
      color: colors.text,
    },
    contactLine: {
      fontSize: typography.body.size - 0.5,
      marginTop: 3,
      flexDirection: "row",
      flexWrap: "wrap",
      fontFamily: typography.body.family,
    },
    contactLineInline: { marginTop: 0 },
    contactItem: { marginRight: 8, color: colors.text },
    link: { marginRight: 8, color: colors.primary },
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
    headingUnderline: {
      paddingBottom: 2,
      borderBottomWidth: 0.75,
      borderBottomColor: colors.primary,
    },
    headingThinUnderline: {
      paddingBottom: 2,
      borderBottomWidth: 0.25,
      borderBottomColor: colors.primary,
    },
    headingBoxed: {
      borderWidth: 0.75,
      borderColor: colors.primary,
      paddingVertical: 2,
      paddingHorizontal: 4,
      alignSelf: "flex-start",
    },
    headingRulesAboveBelow: {
      paddingVertical: 2,
      borderTopWidth: 0.5,
      borderBottomWidth: 0.5,
      borderTopColor: colors.primary,
      borderBottomColor: colors.primary,
    },
    headingAccentBar: {
      width: 3,
      marginRight: 6,
      backgroundColor: colors.primary,
      height: typeScaleSizes.sectionHeading,
    },
    headingShortRuleWrap: { flexDirection: "column" },
    headingShortRule: { marginTop: 2, width: 24, height: 1.25, backgroundColor: colors.primary },
    headingTicksRow: { flexDirection: "row", alignItems: "flex-end", marginRight: 5 },
    headingTickShort: {
      width: 2.5,
      height: typeScaleSizes.sectionHeading * 0.35,
      backgroundColor: colors.primary,
      marginRight: 2,
    },
    headingTickMid: {
      width: 2.5,
      height: typeScaleSizes.sectionHeading * 0.6,
      backgroundColor: colors.primary,
      marginRight: 2,
    },
    headingTickTall: {
      width: 2.5,
      height: typeScaleSizes.sectionHeading * 0.85,
      backgroundColor: colors.primary,
      marginRight: 2,
    },
    headingIconOutline: {
      width: 8,
      height: 8,
      marginRight: 5,
      borderWidth: 0.75,
      borderColor: colors.primary,
    },
    headingIconFilled: { width: 8, height: 8, marginRight: 5, backgroundColor: colors.primary },
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
      color: colors.text,
    },
    // Overrides entrySubtitle's inline marginLeft when subtitlePlacement is
    // 'below' — the subtitle starts its own line, flush with the title.
    entrySubtitleBelow: { marginLeft: 0, marginTop: 1 },
    entryDateLocationCluster: { flexDirection: "row", marginLeft: 6 },
    entryDate: {
      fontSize: typography.body.size,
      fontFamily: typography.body.family,
      color: colors.text,
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
  const nameOverrides: { color?: string; fontFamily?: string } = {};
  if (ink) nameOverrides.color = ink;
  if (nameFontFamily) nameOverrides.fontFamily = nameFontFamily;
  const nameStyle =
    Object.keys(nameOverrides).length > 0 ? [styles.name, nameOverrides] : styles.name;
  const contactItemStyle = ink ? [styles.contactItem, { color: ink }] : styles.contactItem;
  const linkStyle = ink ? [styles.link, { color: ink }] : styles.link;
  const titleStyle = ink ? [styles.title, { color: ink }] : styles.title;
  const titleNode = profile.headline ? <Text style={titleStyle}>{profile.headline}</Text> : null;
  const contactParts = [profile.email, profile.phone, profile.location].filter(
    (part): part is string => Boolean(part),
  );
  const showPhoto = format.photo.hidden === false;
  const contactItems = (
    <>
      {contactParts.map((part) => (
        <Text key={part} style={contactItemStyle}>
          {part}
        </Text>
      ))}
      {profile.links.map((link) => (
        <Link key={link.url} style={linkStyle} src={link.url}>
          {link.label}
        </Link>
      ))}
    </>
  );

  if (variant === "centered") {
    return (
      <View style={styles.headerCentered}>
        {showPhoto && profile.photoUrl ? (
          <Image src={profile.photoUrl} style={[styles.photo, styles.photoCenterOverride]} />
        ) : null}
        <Text style={nameStyle}>{profile.name}</Text>
        {titleNode}
        <View style={styles.contactLine}>{contactItems}</View>
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
          <Text style={nameStyle}>{profile.name}</Text>
          {titleNode}
        </View>
        <View style={[styles.contactLine, styles.contactLineInline]}>{contactItems}</View>
      </View>
    );
  }

  return (
    <View style={styles.header}>
      {showPhoto && profile.photoUrl ? <Image src={profile.photoUrl} style={styles.photo} /> : null}
      <View style={styles.headerText}>
        <Text style={nameStyle}>{profile.name}</Text>
        {titleNode}
        <View style={styles.contactLine}>{contactItems}</View>
      </View>
    </View>
  );
}

export function SummarySection({ summary, format }: { summary: string; format: DocumentFormat }) {
  if (!summary) return null;
  const styles = buildStyles(format);
  return <Text style={styles.summary}>{summary}</Text>;
}

type SectionStyles = ReturnType<typeof buildStyles>;

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
