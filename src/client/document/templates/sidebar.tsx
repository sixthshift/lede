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

function splitSections(sections: TailoredSection[]) {
  const sidebar: TailoredSection[] = [];
  const main: TailoredSection[] = [];
  for (const section of sections) {
    (SIDEBAR_SECTIONS.includes(section.section) ? sidebar : main).push(section);
  }
  return { sidebar, main };
}

export function SidebarTemplate({ resume, profile, paper, format }: TemplateProps) {
  const { sidebar, main } = splitSections(resume.sections);
  const styles = StyleSheet.create({
    page: {
      paddingTop: format.page.marginY,
      paddingBottom: format.page.marginY,
      paddingHorizontal: 0,
      fontSize: format.typography.body.size,
      fontFamily: format.typography.body.family,
      flexDirection: "row",
    },
    sidebar: {
      width: "32%",
      paddingLeft: format.page.marginX,
      paddingRight: 16,
    },
    main: {
      width: "68%",
      paddingLeft: 16,
      paddingRight: format.page.marginX,
    },
  });
  return (
    <Document title={profile.name} author={profile.name}>
      <Page size={PAGE_SIZE[paper]} style={styles.page}>
        <View style={styles.sidebar}>
          {sidebar.map((section) => (
            <SectionBlock key={section.section} section={section} format={format} />
          ))}
        </View>
        <View style={styles.main}>
          <ProfileHeader profile={profile} format={format} />
          <SummarySection summary={resume.summary} format={format} />
          {main.map((section) => (
            <SectionBlock key={section.section} section={section} format={format} />
          ))}
        </View>
      </Page>
    </Document>
  );
}
