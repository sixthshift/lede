// 'banner' template — single-column, ATS-strict composition (spec.md §28.2).
// Composition only: every section renders through the shared renderers in
// ../sections.tsx; this file never redefines section features, only layout.
// Distinguishing composition: a full-bleed header band filled with
// format.colors.primary, with the name/contact set ON the band in a
// contrasting ink; section headings keep the shared SectionBlock's
// colors.primary tint (already true of every template — nothing to override
// here). The band is a plain react-pdf `backgroundColor` fill — a drawing
// op, not a text node — so pdf.js's text extraction order is exactly the
// same index-increasing order as any other single-column template; only the
// band's fill color depends on the caller's format, which is what makes the
// tint live rather than hardcoded (§28.8-A oracle).

import { Document, Page, StyleSheet, View } from "@react-pdf/renderer";
import type { TemplateProps } from "../registry";
import { ProfileHeader, SectionBlock, SummarySection } from "../sections";

const PAGE_SIZE: Record<TemplateProps["paper"], "LETTER" | "A4"> = {
  letter: "LETTER",
  a4: "A4",
};

// WCAG-style relative luminance, coarse on purpose: this only decides
// white-vs-near-black ink on a filled band, not a color-matching system.
function contrastInk(hex: string): string {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}

export function BannerTemplate({ resume, profile, paper, format }: TemplateProps) {
  const ink = contrastInk(format.colors.primary);
  const styles = StyleSheet.create({
    page: {
      paddingTop: 0,
      paddingBottom: format.page.marginY,
      paddingHorizontal: 0,
      fontSize: format.typography.body.size,
      fontFamily: format.typography.body.family,
    },
    band: {
      backgroundColor: format.colors.primary,
      paddingHorizontal: format.page.marginX,
      paddingVertical: format.page.marginY * 0.6,
    },
    body: {
      paddingHorizontal: format.page.marginX,
      paddingTop: format.page.marginY * 0.6,
    },
  });
  return (
    <Document title={profile.name} author={profile.name}>
      <Page size={PAGE_SIZE[paper]} style={styles.page}>
        <View style={styles.band}>
          <ProfileHeader profile={profile} format={format} ink={ink} />
        </View>
        <View style={styles.body}>
          <SummarySection summary={resume.summary} format={format} />
          {resume.sections.map((section) => (
            <SectionBlock key={section.section} section={section} format={format} />
          ))}
        </View>
      </Page>
    </Document>
  );
}
