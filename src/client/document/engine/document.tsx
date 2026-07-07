// ENGINE ENTRY (spec.md §31.6 F0 — THE risk). ONE react-pdf composition,
// parameterized entirely by DocumentFormatV2: no per-preset render
// functions, no dispatch over which preset produced this format (this file
// never reads that identity field), and no dependency on the six-look
// lookup module or its per-look composition files (this whole directory is
// grep-guarded clean of both). Every section still renders through the
// shared section-renderer module in ../sections.tsx (oracle E7 lock) — this
// file composes layout, sections render content.
//
// AXES WIRED THIS TICKET (single-column parity — strict/classic/compact/
// banner): header.alignment (left/center), header.detailsArrangement
// (stacked/single-row), colors.area 'header' (a filled band with
// auto-contrast ink, ported from the retired banner look's source — see
// contrastInk below), fonts.body (mapped to a registered face, see
// legacyAdapt.ts), typeScale.bodySize,
// spacing.{lineHeight,elementSpacing,marginsMm}, colors.{accent,text},
// header.nameWeight, photo.{hidden,size,shape}, and the §28.4 density ladder
// (density.ts).
//
// AXES NOT YET WIRED (render as sections.tsx's one existing look — never a
// crash; later tickets land their seam per §31.6's phase list): two-column
// layout (layout.columns/headerPosition/sidebarWidthPct/sectionPlacement/
// manualPageBreaks), typeScale.{nameOffset,titleOffset,sectionHeadingOffset,
// entryHeaderOffset} (sections.tsx hardcodes name/heading sizes with no
// per-field seam), entries.* (structure/date-location/subtitle/list-style/
// per-field font style/body indent), headings.{style beyond the underline
// sections.tsx already draws,capitalization,icons}, fonts.name (no separate
// name-font render path), colors.{mode 'multi',full-page/border area,
// border,accentPlacement}, header.{detailsArrangement 'wrapped',separator,
// contactIconStyle,titleWeight,titlePosition}, photo.{crop,zoom}, links,
// footer, per-section display variants, document.{pageFormat is honored via
// `paper`; dateFormat is not applied to any rendered date}.
import { Document, Page, StyleSheet, View } from "@react-pdf/renderer";
import type { Paper, Profile, TailoredResume } from "@shared/types";
import type { DocumentFormatV2 } from "@shared/format-v2";
import {
  ProfileHeader,
  type ProfileHeaderVariant,
  SectionBlock,
  SummarySection,
} from "../sections";
import { applyEngineDensity, type EngineDensity } from "./density";
import { toLegacyFormat } from "./legacyAdapt";

const PAGE_SIZE: Record<Paper, "LETTER" | "A4"> = { letter: "LETTER", a4: "A4" };

// Ported (not imported — the per-look composition directory is grep-guarded
// out of this one) from the retired banner look's source: identical coarse
// WCAG-style luminance check, used only to pick white-vs-near-black ink on a
// filled band.
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

// The three ProfileHeader variants sections.tsx exposes collapse two
// independent v2 axes (alignment, detailsArrangement) into one enum;
// centered wins over single-row when both are set (an off-diagonal
// combination the four retired templates never produced) — an unhandled
// combination, not a crash.
function resolveVariant(format: DocumentFormatV2): ProfileHeaderVariant {
  if (format.header.alignment === "center") return "centered";
  if (format.header.detailsArrangement === "single-row") return "inline";
  return "left";
}

export type EngineDocumentProps = {
  resume: TailoredResume;
  profile: Profile;
  paper: Paper;
  format: DocumentFormatV2;
  // §28.4 fit ladder — auto-computed by callers (render.ts's
  // fitEngineToPages), never persisted. 'comfortable' (exactly as authored)
  // when omitted.
  density?: EngineDensity;
};

export function EngineDocument({
  resume,
  profile,
  paper,
  format,
  density = "comfortable",
}: EngineDocumentProps) {
  const legacy = applyEngineDensity(toLegacyFormat(format), density);
  const variant = resolveVariant(format);
  const hasBand = format.colors.area === "header";
  const ink = hasBand ? contrastInk(format.colors.accent) : undefined;

  const styles = StyleSheet.create({
    page: {
      paddingTop: hasBand ? 0 : legacy.page.marginY,
      paddingBottom: legacy.page.marginY,
      paddingHorizontal: hasBand ? 0 : legacy.page.marginX,
      fontSize: legacy.typography.body.size,
      fontFamily: legacy.typography.body.family,
    },
    band: {
      backgroundColor: format.colors.accent,
      paddingHorizontal: legacy.page.marginX,
      paddingVertical: legacy.page.marginY * 0.6,
    },
    body: {
      paddingHorizontal: legacy.page.marginX,
      paddingTop: legacy.page.marginY * 0.6,
    },
  });

  const header = <ProfileHeader profile={profile} format={legacy} variant={variant} ink={ink} />;
  const content = (
    <>
      <SummarySection summary={resume.summary} format={legacy} />
      {resume.sections.map((section) => (
        <SectionBlock key={section.section} section={section} format={legacy} />
      ))}
    </>
  );

  return (
    <Document title={profile.name} author={profile.name}>
      <Page size={PAGE_SIZE[paper]} style={styles.page}>
        {hasBand ? (
          <>
            <View style={styles.band}>{header}</View>
            <View style={styles.body}>{content}</View>
          </>
        ) : (
          <>
            {header}
            {content}
          </>
        )}
      </Page>
    </Document>
  );
}
