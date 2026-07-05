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

function buildStyles(format: DocumentFormat) {
  const { typography, colors, page, photo } = format;
  const photoRadius = photo.shape === "circle" ? photo.size / 2 : photo.shape === "rounded" ? 8 : 0;

  return StyleSheet.create({
    header: { marginBottom: 12, flexDirection: "row", alignItems: "center" },
    photo: {
      width: photo.size,
      height: photo.size,
      marginRight: 12,
      borderRadius: photoRadius,
    },
    headerText: { flex: 1 },
    name: {
      fontSize: 20,
      fontFamily: typography.heading.family,
      fontWeight: typography.heading.weight,
      color: colors.text,
    },
    contactLine: {
      fontSize: typography.body.size - 0.5,
      marginTop: 3,
      flexDirection: "row",
      flexWrap: "wrap",
      fontFamily: typography.body.family,
    },
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
    sectionLabel: {
      fontSize: typography.body.size + 1,
      fontFamily: typography.heading.family,
      fontWeight: typography.heading.weight,
      marginBottom: 4,
      paddingBottom: 2,
      textTransform: "uppercase",
      color: colors.primary,
      borderBottomWidth: 0.75,
      borderBottomColor: colors.primary,
    },
    group: { marginBottom: 6 },
    groupHeading: {
      fontSize: typography.body.size,
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

export function ProfileHeader({ profile, format }: { profile: Profile; format: DocumentFormat }) {
  const styles = buildStyles(format);
  const contactParts = [profile.email, profile.phone, profile.location].filter(
    (part): part is string => Boolean(part),
  );
  const showPhoto = format.photo.hidden === false;

  return (
    <View style={styles.header}>
      {showPhoto && profile.photoUrl ? <Image src={profile.photoUrl} style={styles.photo} /> : null}
      <View style={styles.headerText}>
        <Text style={styles.name}>{profile.name}</Text>
        <View style={styles.contactLine}>
          {contactParts.map((part) => (
            <Text key={part} style={styles.contactItem}>
              {part}
            </Text>
          ))}
          {profile.links.map((link) => (
            <Link key={link.url} style={styles.link} src={link.url}>
              {link.label}
            </Link>
          ))}
        </View>
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

export function SectionBlock({
  section,
  format,
}: {
  section: TailoredSection;
  format: DocumentFormat;
}) {
  const styles = buildStyles(format);
  const columns = format.sections[section.section]?.columns ?? 1;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{SECTIONS[section.section].label}</Text>
      {section.groups.map((group, i) => (
        <GroupBlock key={group.heading ?? i} group={group} format={format} columns={columns} />
      ))}
    </View>
  );
}
