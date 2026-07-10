// LETTER ENGINE ENTRY (T21, mirrors document.tsx's EngineDocument). One
// react-pdf composition for CoverLetter: a single column — header, date,
// greeting, body paragraphs IN ORDER, sign-off — sharing the format's
// typography/colors via the same toLegacyFormat/resolveNameFont seam
// EngineDocument uses, with none of its column/band/border/footer/density
// machinery (a letter has no sections, no density ladder — §T21 lock: no
// letter-specific design axes this epic). Renders ONLY paragraph.text —
// groundedOn is citation metadata (fact-lock provenance for the app, not the
// page) and must never reach extracted text, same contract as the resume's
// leadRationale/cut never reaching it (a letter has neither field).
import { Document, Page, StyleSheet, Text } from "@react-pdf/renderer";
import type { CoverLetter, Profile } from "@shared/types";
import type { DocumentFormatV2 } from "@shared/format-v2";
import { formatDate } from "../formatDate";
import { ProfileHeader } from "../sections";
import { resolveNameFont, toLegacyFormat } from "./legacyAdapt";
import type { Paper } from "../registry";

const PAGE_SIZE: Record<Paper, "LETTER" | "A4"> = { letter: "LETTER", a4: "A4" };

export type EngineLetterProps = {
  letter: CoverLetter;
  profile: Profile;
  paper: Paper;
  format: DocumentFormatV2;
};

export function EngineLetter({ letter, profile, paper, format }: EngineLetterProps) {
  const legacy = toLegacyFormat(format);
  const nameFontFamily = resolveNameFont(format);

  const styles = StyleSheet.create({
    page: {
      paddingHorizontal: legacy.page.marginX,
      paddingVertical: legacy.page.marginY,
      fontSize: legacy.typography.body.size,
      fontFamily: legacy.typography.body.family,
      color: legacy.colors.text,
    },
    date: { marginTop: legacy.page.sectionGap, marginBottom: legacy.page.sectionGap },
    greeting: { marginBottom: legacy.page.sectionGap },
    paragraph: {
      marginBottom: legacy.page.sectionGap,
      lineHeight: legacy.typography.body.lineHeight,
    },
    closing: { marginTop: legacy.page.sectionGap },
  });

  return (
    <Document title={profile.name} author={profile.name}>
      <Page size={PAGE_SIZE[paper]} style={styles.page}>
        <ProfileHeader profile={profile} format={legacy} nameFontFamily={nameFontFamily} />
        <Text style={styles.date}>{formatDate(new Date(), legacy.dateFormat)}</Text>
        <Text style={styles.greeting}>{letter.greeting}</Text>
        {letter.body.map((paragraph) => (
          <Text key={paragraph.text} style={styles.paragraph}>
            {paragraph.text}
          </Text>
        ))}
        <Text style={styles.closing}>{letter.closing}</Text>
      </Page>
    </Document>
  );
}
