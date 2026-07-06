// 'compact' template — single-column, ATS-strict composition (spec.md §28.2).
// Composition only: every section renders through the shared renderers in
// ../sections.tsx; this file never redefines section features, only layout.
// Distinguishing composition vs. strict: a one-line header (name left,
// contact right, same row) PLUS a tighter baseline than strict's at the same
// nominal density — a fixed template-level squeeze on top of whatever
// density the fit ladder already picked. Composed the exact way fit.ts
// composes density (applyDensity returns a new, derived DocumentFormat; the
// caller's format is never mutated), just always at this template's own
// fixed compaction, independent of the runtime density ladder.

import { Document, Page, StyleSheet } from "@react-pdf/renderer";
import { applyDensity } from "../fit";
import type { TemplateProps } from "../registry";
import { ProfileHeader, SectionBlock, SummarySection } from "../sections";

const PAGE_SIZE: Record<TemplateProps["paper"], "LETTER" | "A4"> = {
  letter: "LETTER",
  a4: "A4",
};

// Only 'compact' is used below; comfortable/standard are unused but required
// by applyDensity's multiplier shape.
const BASELINE_SQUEEZE = { comfortable: 1, standard: 1, compact: 0.88 } as const;

export function CompactTemplate({ resume, profile, paper, format }: TemplateProps) {
  const tightFormat = applyDensity(format, "compact", BASELINE_SQUEEZE);
  const styles = StyleSheet.create({
    page: {
      paddingTop: tightFormat.page.marginY,
      paddingBottom: tightFormat.page.marginY,
      paddingHorizontal: tightFormat.page.marginX,
      fontSize: tightFormat.typography.body.size,
      fontFamily: tightFormat.typography.body.family,
    },
  });
  return (
    <Document title={profile.name} author={profile.name}>
      <Page size={PAGE_SIZE[paper]} style={styles.page}>
        <ProfileHeader profile={profile} format={tightFormat} variant="inline" />
        <SummarySection summary={resume.summary} format={tightFormat} />
        {resume.sections.map((section) => (
          <SectionBlock key={section.section} section={section} format={tightFormat} />
        ))}
      </Page>
    </Document>
  );
}
