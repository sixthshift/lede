// 'strict' template — single-column, ATS-strict composition (spec.md §28.2).
// Composition only: every section renders through the shared renderers in
// ../sections.tsx; this file never redefines section features, only layout.

import { Document, Page, StyleSheet } from "@react-pdf/renderer";
import type { TemplateProps } from "../registry";
import { ProfileHeader, SectionBlock, SummarySection } from "../sections";

const PAGE_SIZE: Record<TemplateProps["paper"], "LETTER" | "A4"> = {
  letter: "LETTER",
  a4: "A4",
};

export function StrictTemplate({ resume, profile, paper, format }: TemplateProps) {
  const styles = StyleSheet.create({
    page: {
      paddingTop: format.page.marginY,
      paddingBottom: format.page.marginY,
      paddingHorizontal: format.page.marginX,
      fontSize: format.typography.body.size,
      fontFamily: format.typography.body.family,
    },
  });
  return (
    <Document title={profile.name} author={profile.name}>
      <Page size={PAGE_SIZE[paper]} style={styles.page}>
        <ProfileHeader profile={profile} format={format} />
        <SummarySection summary={resume.summary} format={format} />
        {resume.sections.map((section) => (
          <SectionBlock key={section.section} section={section} format={format} />
        ))}
      </Page>
    </Document>
  );
}
