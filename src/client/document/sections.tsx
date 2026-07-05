// Shared section renderers — react-pdf primitives (spec.md §10, §28.2).
// ALL templates render every section through these; templates differ in
// composition only, never in features (rx-resume's rule).
// CRITICAL: leadRationale and cut[] are reasoning UI (§11) and must NEVER be
// rendered here — only profile, summary, and sections/groups/items, in order.

import { Link, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Profile, TailoredGroup, TailoredItem, TailoredSection } from "@shared/types";
import { SECTIONS } from "@shared/sections";

const styles = StyleSheet.create({
  header: { marginBottom: 12 },
  name: { fontSize: 20, fontWeight: 700 },
  contactLine: { fontSize: 9.5, marginTop: 3, flexDirection: "row", flexWrap: "wrap" },
  contactItem: { marginRight: 8 },
  summary: { fontSize: 10, marginBottom: 10, lineHeight: 1.4 },
  section: { marginBottom: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  group: { marginBottom: 6 },
  groupHeading: { fontSize: 10, fontWeight: 600, marginBottom: 2 },
  item: { fontSize: 10, marginBottom: 2, flexDirection: "row" },
  bullet: { width: 10 },
  itemText: { flex: 1, lineHeight: 1.3 },
});

export function ProfileHeader({ profile }: { profile: Profile }) {
  const contactParts = [profile.email, profile.phone, profile.location].filter(
    (part): part is string => Boolean(part),
  );
  return (
    <View style={styles.header}>
      <Text style={styles.name}>{profile.name}</Text>
      <View style={styles.contactLine}>
        {contactParts.map((part) => (
          <Text key={part} style={styles.contactItem}>
            {part}
          </Text>
        ))}
        {profile.links.map((link) => (
          <Link key={link.url} style={styles.contactItem} src={link.url}>
            {link.label}
          </Link>
        ))}
      </View>
    </View>
  );
}

export function SummarySection({ summary }: { summary: string }) {
  if (!summary) return null;
  return <Text style={styles.summary}>{summary}</Text>;
}

export function ItemRow({ item }: { item: TailoredItem }) {
  return (
    <View style={styles.item}>
      <Text style={styles.bullet}>{"•"}</Text>
      <Text style={styles.itemText}>{item.text}</Text>
    </View>
  );
}

export function GroupBlock({ group }: { group: TailoredGroup }) {
  return (
    <View style={styles.group}>
      {group.heading ? <Text style={styles.groupHeading}>{group.heading}</Text> : null}
      {group.items.map((item) => (
        <ItemRow key={item.entryId} item={item} />
      ))}
    </View>
  );
}

export function SectionBlock({ section }: { section: TailoredSection }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{SECTIONS[section.section].label}</Text>
      {section.groups.map((group, i) => (
        <GroupBlock key={group.heading ?? i} group={group} />
      ))}
    </View>
  );
}
