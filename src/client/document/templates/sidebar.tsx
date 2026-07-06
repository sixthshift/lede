// 'sidebar-left' / 'sidebar-right' templates — two-column composition
// (spec.md §28.2). Composition only: every section renders through the
// shared renderers in ../sections.tsx; this file only decides which column a
// section's block lands in (skills/contact-adjacent sections in the sidebar,
// narrative sections in the main column) and which side the sidebar sits on
// — it never redefines section features (rx-resume's rule).
//
// `renderSidebarComposition` is the shared body for both orientations;
// sidebar-right.tsx calls it with side:'right' (mirrored column order +
// paddings, same section split). SidebarTemplate (side:'left') keeps its
// exact original JSX tree so its rendered bytes stay unchanged.

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

export type SidebarSide = "left" | "right";

export function renderSidebarComposition(
  { resume, profile, paper, format }: TemplateProps,
  side: SidebarSide,
) {
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
    sidebar:
      side === "left"
        ? { width: "32%", paddingLeft: format.page.marginX, paddingRight: 16 }
        : { width: "32%", paddingRight: format.page.marginX, paddingLeft: 16 },
    main:
      side === "left"
        ? { width: "68%", paddingLeft: 16, paddingRight: format.page.marginX }
        : { width: "68%", paddingRight: 16, paddingLeft: format.page.marginX },
  });

  const sidebarColumn = (
    <View style={styles.sidebar}>
      {sidebar.map((section) => (
        <SectionBlock key={section.section} section={section} format={format} />
      ))}
    </View>
  );
  const mainColumn = (
    <View style={styles.main}>
      <ProfileHeader profile={profile} format={format} />
      <SummarySection summary={resume.summary} format={format} />
      {main.map((section) => (
        <SectionBlock key={section.section} section={section} format={format} />
      ))}
    </View>
  );

  return (
    <Document title={profile.name} author={profile.name}>
      <Page size={PAGE_SIZE[paper]} style={styles.page}>
        {side === "left" ? (
          <>
            {sidebarColumn}
            {mainColumn}
          </>
        ) : (
          <>
            {mainColumn}
            {sidebarColumn}
          </>
        )}
      </Page>
    </Document>
  );
}

export function SidebarTemplate(props: TemplateProps) {
  return renderSidebarComposition(props, "left");
}
