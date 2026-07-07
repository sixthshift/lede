// Shared section renderers — react-pdf primitives (spec.md §10, §28.2, §28.3).
// ALL templates render every section through these; templates differ in
// composition only, never in features (rx-resume's rule). Every visual knob
// here (typography, color, page rhythm, per-section columns, the photo) is
// read from the caller's `format: DocumentFormat` — nothing is hardcoded, so
// a template can never silently ignore the user's design choices.
// CRITICAL: leadRationale and cut[] are reasoning UI (§11) and must NEVER be
// rendered here — only profile, summary, and sections/groups/items, in order.

import { Image, Link, StyleSheet, Text, View } from "@react-pdf/renderer";
import type {
  DocumentFormat,
  Profile,
  TailoredGroup,
  TailoredItem,
  TailoredSection,
} from "@shared/types";
import { SECTIONS } from "@shared/sections";
import type { HeadingsRenderConfig, TypeScaleSizes } from "./engine/legacyAdapt";

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
    groupHeading: {
      fontSize: typeScaleSizes.entryHeader,
      fontFamily: typography.heading.family,
      fontWeight: typography.heading.weight,
      marginBottom: 2,
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
  const width = columns > 1 ? { width: `${100 / columns}%` } : {};
  return (
    <View style={[styles.item, width]}>
      <Text style={styles.bullet}>{"•"}</Text>
      <Text style={styles.itemText}>{item.text}</Text>
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
  return (
    <View style={styles.group}>
      {group.heading ? <Text style={styles.groupHeading}>{group.heading}</Text> : null}
      <View style={columns > 1 ? styles.itemsGrid : styles.items}>
        {group.items.map((item) => (
          <ItemRow key={item.entryId} item={item} format={format} columns={columns} />
        ))}
      </View>
    </View>
  );
}

type SectionStyles = ReturnType<typeof buildStyles>;

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
