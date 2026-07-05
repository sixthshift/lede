// 'sidebar-left' template — two-column composition (spec.md §28.2). Composition
// only: every section renders through the shared renderers in ../sections.tsx;
// this file only decides which column a section's block lands in (skills/
// contact-adjacent sections in the left sidebar, narrative sections in the
// main column) — it never redefines section features (rx-resume's rule).

import { Document, Page, StyleSheet, View } from "@react-pdf/renderer";
import type { Section, TailoredSection } from "@shared/types";
import type { TemplateProps } from "../registry";
import { ProfileHeader, SectionBlock, SummarySection } from "../sections";

const PAGE_SIZE: Record<TemplateProps["paper"], "LETTER" | "A4"> = {
  letter: "LETTER",
  a4: "A4",
};

// Sections that read as compact, scannable facts belong in the sidebar
// column; everything else is narrative and belongs in the main column. This
// is a layout split only — every section still renders through SectionBlock.
const SIDEBAR_SECTIONS: Section[] = ["skill", "language", "interest", "certification"];

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 0,
    fontSize: 10,
    fontFamily: "Helvetica",
    flexDirection: "row",
  },
  sidebar: {
    width: "32%",
    paddingLeft: 28,
    paddingRight: 16,
  },
  main: {
    width: "68%",
    paddingLeft: 16,
    paddingRight: 40,
  },
});

function splitSections(sections: TailoredSection[]) {
  const sidebar: TailoredSection[] = [];
  const main: TailoredSection[] = [];
  for (const section of sections) {
    (SIDEBAR_SECTIONS.includes(section.section) ? sidebar : main).push(section);
  }
  return { sidebar, main };
}

export function SidebarTemplate({ resume, profile, paper }: TemplateProps) {
  const { sidebar, main } = splitSections(resume.sections);
  return (
    <Document title={profile.name} author={profile.name}>
      <Page size={PAGE_SIZE[paper]} style={styles.page}>
        <View style={styles.sidebar}>
          {sidebar.map((section) => (
            <SectionBlock key={section.section} section={section} />
          ))}
        </View>
        <View style={styles.main}>
          <ProfileHeader profile={profile} />
          <SummarySection summary={resume.summary} />
          {main.map((section) => (
            <SectionBlock key={section.section} section={section} />
          ))}
        </View>
      </Page>
    </Document>
  );
}
