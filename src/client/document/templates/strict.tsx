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

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
});

export function StrictTemplate({ resume, profile, paper }: TemplateProps) {
  return (
    <Document title={profile.name} author={profile.name}>
      <Page size={PAGE_SIZE[paper]} style={styles.page}>
        <ProfileHeader profile={profile} />
        <SummarySection summary={resume.summary} />
        {resume.sections.map((section) => (
          <SectionBlock key={section.section} section={section} />
        ))}
      </Page>
    </Document>
  );
}
