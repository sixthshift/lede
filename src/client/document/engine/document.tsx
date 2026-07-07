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
// AXES WIRED THIS TICKET (E9-F0c, two-column — additive over F0b's list
// above): layout.columns ('two' = sidebar + main; 'mix' = full-width header
// then sidebar + main), layout.headerPosition ('left'/'right' pick the
// sidebar side; 'top' falls back to 'left' — an off-diagonal no retired
// template produced), layout.sidebarWidthPct (real geometry, see
// resolveColumnGeometry), layout.sectionPlacement (per-section column
// assignment; unset ⇒ 'main', matching migrateFormat's own fallback).
//
// AXES NOT YET WIRED (render as sections.tsx's one existing look — never a
// crash; later tickets land their seam per §31.6's phase list):
// layout.manualPageBreaks, typeScale.{nameOffset,titleOffset,
// sectionHeadingOffset,entryHeaderOffset} (sections.tsx hardcodes name/
// heading sizes with no per-field seam), entries.* (structure/date-location/
// subtitle/list-style/per-field font style/body indent), headings.{style
// beyond the underline sections.tsx already draws,capitalization,icons},
// fonts.name (no separate name-font render path), colors.{mode 'multi',
// full-page/border area,border,accentPlacement} (colors.area 'header' is
// only wired for columns:'one' and for the full-width header block in
// 'mix' — a 'header' band combined with columns:'two' is an unhandled
// off-diagonal: renders without the band, never crashes), header.
// {detailsArrangement 'wrapped',separator,contactIconStyle,titleWeight,
// titlePosition}, photo.{crop,zoom}, links, footer, per-section display
// variants, document.{pageFormat is honored via `paper`; dateFormat is not
// applied to any rendered date}.
import { Document, Page, StyleSheet, View } from "@react-pdf/renderer";
import type { Paper, Profile, TailoredResume, TailoredSection } from "@shared/types";
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
// The gutter between sidebar and main columns — ported from the retired
// sidebar-left/right code compositions' inner padding (16pt on each side of
// the column boundary).
const COLUMN_GUTTER_PT = 16;

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

// Per-section column assignment (§31.2 Layout). A section with no explicit
// placement defaults to 'main' — the same fallback migrateFormat's
// sidebarSectionPlacement uses when it pins the retired sidebar templates'
// split, so a migrated preset's sections land exactly where they did before.
function splitSectionsByColumn(
  format: DocumentFormatV2,
  sections: TailoredSection[],
): { sidebar: TailoredSection[]; main: TailoredSection[] } {
  const sidebar: TailoredSection[] = [];
  const main: TailoredSection[] = [];
  for (const section of sections) {
    const column = format.layout.sectionPlacement[section.section]?.column ?? "main";
    (column === "sidebar" ? sidebar : main).push(section);
  }
  return { sidebar, main };
}

// headerPosition 'left'/'right' names which side the sidebar sits on;
// 'top' is an off-diagonal combination no retired template produced
// (columns 'two'/'mix' with headerPosition 'top') — falls back to 'left'
// rather than crashing, per the unhandled-axis contract.
function resolveSidebarSide(format: DocumentFormatV2): "left" | "right" {
  return format.layout.headerPosition === "right" ? "right" : "left";
}

// sidebarWidthPct (25-40, §31.2) is a percentage of CONTENT width (page
// width minus both horizontal margins), not full page width — so the row
// that hosts the two columns carries the page's horizontal margins as its
// own padding (see the `row` style below), and the column widths are plain
// percentages of what's left. This makes sidebarWidthPct real, measurable
// geometry: moving it from 25 to 40 shifts the sidebar/main boundary by
// exactly 15% of content width.
function resolveColumnGeometry(format: DocumentFormatV2) {
  const pct = format.layout.sidebarWidthPct;
  return {
    side: resolveSidebarSide(format),
    sidebarWidthPercent: `${pct}%` as const,
    mainWidthPercent: `${100 - pct}%` as const,
  };
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
  const columnsMode = format.layout.columns;
  const isColumnar = columnsMode !== "one";
  // The header band (colors.area 'header') is only wired at the top of the
  // page for 'one' and 'mix' (mix's header spans full width above the
  // columns, same as 'one'); 'two' folds the header into the main column,
  // where a full-bleed band isn't wired this ticket (unhandled off-diagonal
  // — renders without the band, never crashes).
  const bandAtPageTop = hasBand && columnsMode !== "two";

  const styles = StyleSheet.create({
    page: {
      paddingTop: bandAtPageTop ? 0 : legacy.page.marginY,
      paddingBottom: legacy.page.marginY,
      // Columnar layouts hand their own horizontal margins to the `row`
      // (see resolveColumnGeometry) rather than the page — mirrors the
      // retired sidebar templates' page style (paddingHorizontal: 0).
      paddingHorizontal: bandAtPageTop || isColumnar ? 0 : legacy.page.marginX,
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
    // 'mix' header block, non-band case: the page's own paddingTop already
    // supplies the top margin (bandAtPageTop is false here), so this only
    // needs the horizontal margin the columnar page style hands off.
    mixHeaderPlain: { paddingHorizontal: legacy.page.marginX },
    row: { flexDirection: "row", paddingHorizontal: legacy.page.marginX },
  });

  const header = <ProfileHeader profile={profile} format={legacy} variant={variant} ink={ink} />;
  const summary = <SummarySection summary={resume.summary} format={legacy} />;

  if (!isColumnar) {
    const content = (
      <>
        {summary}
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

  // columns 'two' | 'mix': split resume.sections into sidebar/main per the
  // per-section placement axis, then lay the two out side by side at
  // sidebarWidthPct. 'two' folds the header + summary into the main
  // column (the retired sidebar templates' exact composition); 'mix'
  // (band + two-column body, §31.2) renders the header full-width above the
  // columns instead — the column machinery itself never assumes the header
  // spans a column.
  const { sidebar, main } = splitSectionsByColumn(format, resume.sections);
  const { side, sidebarWidthPercent, mainWidthPercent } = resolveColumnGeometry(format);
  const columnStyles = StyleSheet.create({
    sidebar:
      side === "left"
        ? { width: sidebarWidthPercent, paddingRight: COLUMN_GUTTER_PT }
        : { width: sidebarWidthPercent, paddingLeft: COLUMN_GUTTER_PT },
    main:
      side === "left"
        ? { width: mainWidthPercent, paddingLeft: COLUMN_GUTTER_PT }
        : { width: mainWidthPercent, paddingRight: COLUMN_GUTTER_PT },
  });

  const sidebarColumn = (
    <View style={columnStyles.sidebar}>
      {sidebar.map((section) => (
        <SectionBlock key={section.section} section={section} format={legacy} />
      ))}
    </View>
  );
  const mainColumn = (
    <View style={columnStyles.main}>
      {columnsMode === "two" ? header : null}
      {columnsMode === "two" ? summary : null}
      {main.map((section) => (
        <SectionBlock key={section.section} section={section} format={legacy} />
      ))}
    </View>
  );
  const columnsRow = (
    <View style={styles.row}>
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
    </View>
  );

  return (
    <Document title={profile.name} author={profile.name}>
      <Page size={PAGE_SIZE[paper]} style={styles.page}>
        {columnsMode === "mix" ? (
          hasBand ? (
            <View style={styles.band}>
              {header}
              {summary}
            </View>
          ) : (
            <View style={styles.mixHeaderPlain}>
              {header}
              {summary}
            </View>
          )
        ) : null}
        {columnsRow}
      </Page>
    </Document>
  );
}
