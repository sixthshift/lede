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
// AXES WIRED THIS TICKET (E9-F1c): layout.manualPageBreaks — a real react-pdf
// `break` on the wrapper View of any section named in the list, applied
// identically in every column mode (one/two/mix). In columnar modes the
// break is local to whichever column flow (sidebar or main) the section
// landed in via sectionPlacement — it pushes that column's own subsequent
// sections to the next page without assuming anything about the other
// column, per the unhandled-off-diagonal contract below. Never drops/
// duplicates content (§28.4/§31 NEVER-CUT) — it only adds page boundaries.
//
// AXES WIRED THIS TICKET (E9-F2a): fonts.body now resolves to any of §31.2's
// 31 registered body faces (previously 6 — see fonts.ts). fonts.name gets
// its own render path: resolved by legacyAdapt's resolveNameFont ("same-as-
// body" defers to the already-resolved body font; any of the 8 §31.2
// NAME_DISPLAY_FONT_IDS resolves to itself) and passed to ProfileHeader as
// a dedicated prop — the name Text renders in it instead of the shared
// heading family, the only section-heading-vs-name font split this engine
// makes.
//
// AXES WIRED THIS TICKET (E9-F3a): colors.area 'full-page' (page-level
// backgroundColor = colors.background) and 'border' (same page background,
// SENSIBLY rendered ahead of the actual frame — that's F3b's job, not this
// one's); colors.mode 'multi' generalizes contrastInk (see below) beyond the
// header band to the whole document's text when a full-page/border
// background is actually painted — 'single' keeps the pre-ticket band-only
// ink scope unchanged. The 'header' band (colors.area 'header') is now also
// wired for columns:'two' (previously an unhandled off-diagonal — folded into
// the main column with no band); 'one'/'mix' unchanged.
//
// AXES WIRED THIS TICKET (E9-F3b): colors.border — a page-frame, one filled
// rect per colors.border.sides.{top,right,bottom,left}, thickness from
// colors.border.size, colored by colors.accent. Each rect is absolutely
// positioned against the Page's own physical edges (verified against a real
// render at authoring time: position:'absolute' + top/right/bottom/left:0
// resolves to the page's box, ignoring the page's own padding — so the frame
// hugs the true page edge regardless of margins). [v3-038] (intake decision,
// ledger) promoted border to ATS-neutral because "a frame drawn first AND
// last leaves extraction order intact": these rects carry no Text child, so
// they contribute zero items to pdf.js text extraction NO MATTER where they
// land in the render tree or paint order — there is nothing here for
// extraction order to be perturbed BY. See borderSideStyles below.
//
// AXES WIRED THIS TICKET (E9-F3c, sections.tsx's ProfileHeader — see that
// file's own comments for the render detail): header.detailsArrangement's
// full 3 values (previously only 'single-row', via resolveVariant's 'inline'
// below — 'stacked' is that resolver's 'left'/'centered' default, 'wrapped'
// is new: the contact-fields row and the links row split onto two lines
// instead of one merged, flowing row); header.separator (a glyph — bullet
// '•', bar '|', or a glyph-free View dot for 'icon' — between adjacent
// contact fields/links); header.contactIconStyle (7 View shapes, one per
// contact field, "none-frame" = none); header.titlePosition (same-line: name
// + headline share one row; below: headline starts its own line — previously
// hardcoded to the 'below' look regardless of this field's value);
// header.titleWeight (now independent of header.nameWeight — see
// legacyAdapt.ts's resolveHeaderConfig comment); links.{underline,
// accentColor,icon} (textDecoration, colors.primary-vs-text, and a small
// glyph View per profile link).
//
// AXES NOT YET WIRED (render as sections.tsx's one existing look — never a
// crash; later tickets land their seam per §31.6's phase list):
// typeScale.{nameOffset,titleOffset,
// sectionHeadingOffset,entryHeaderOffset} (sections.tsx hardcodes name/
// heading sizes with no per-field seam), entries.* (structure/date-location/
// subtitle/list-style/per-field font style/body indent), headings.{style
// beyond the underline sections.tsx already draws,capitalization,icons},
// colors.accentPlacement (the header-icon/link-icon element classes E9-F3c
// just added are addressable for this, but not yet colored by it), photo.
// {crop,zoom}, footer, per-section display variants, document.{pageFormat is
// honored via `paper`; dateFormat is not applied to any rendered date}.
import { Document, Page, StyleSheet, View } from "@react-pdf/renderer";
import type { Paper, Profile, TailoredResume, TailoredSection } from "@shared/types";
import type { BorderSize, DocumentFormatV2 } from "@shared/format-v2";
import {
  ProfileHeader,
  type ProfileHeaderVariant,
  SectionBlock,
  SummarySection,
} from "../sections";
import { applyEngineDensity, type EngineDensity } from "./density";
import { resolveNameFont, toLegacyFormat } from "./legacyAdapt";

const PAGE_SIZE: Record<Paper, "LETTER" | "A4"> = { letter: "LETTER", a4: "A4" };
// The gutter between sidebar and main columns — ported from the retired
// sidebar-left/right code compositions' inner padding (16pt on each side of
// the column boundary).
const COLUMN_GUTTER_PT = 16;

// Ported (not imported — the per-look composition directory is grep-guarded
// out of this one) from the retired banner look's source: identical coarse
// WCAG-style luminance check, used to pick white-vs-near-black ink on any
// filled surface this engine paints — originally the header band alone,
// generalized this ticket (E9-F3a) to a full-page/border background too.
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

// colors.background as a page-level fill (§31.2) is a MULTI-mode-only feature:
// spec.md:1014 defines single = "accent over black-on-white" and :1093 pins
// "no full-page/header background (single mode over white)" as the strict-grade
// premise F5's atsGrade relies on — so single mode ALWAYS leaves the page white
// regardless of colors.area, and only multi paints colors.background. 'border'
// rides the same gate ahead of its own frame (F3b): a page background is
// sensible to render now even though the frame stroke isn't drawn yet. (The
// header BAND — colors.area 'header' — is deliberately NOT gated here: the
// banner preset paints its full-bleed accent band in single mode by default,
// so band-in-single is pre-existing and F5 owns reconciling it with the grade
// table.)
function resolvePageBackground(format: DocumentFormatV2): string | undefined {
  if (format.colors.mode !== "multi") return undefined;
  return format.colors.area === "full-page" || format.colors.area === "border"
    ? format.colors.background
    : undefined;
}

// colors.border.size (§31.2) is a curated 3-value scale, not a raw pt input
// (§31.1) — s/m/l map to 0.5/1/2pt, a coarse-to-fine ladder chosen so 'l' is
// unmistakably heavier than 's' at any page size while staying a hairline
// relative to the page (2pt on a 612pt-wide letter page).
const BORDER_WIDTH_PT: Record<BorderSize, number> = { s: 0.5, m: 1, l: 2 };

// colors.border (§31.2): one plain filled rect per enabled side, pinned to
// that edge of the Page's own box (position:'absolute' resolves against the
// page's physical edges, not its padding — verified against a real render at
// authoring time), thickness from size, color from colors.accent. A filled
// rect (not a stroked border box) so its geometry is exactly the requested
// thickness with no stroke-centering half-width offset to reason about, and
// so detecting it in a rendered PDF is the SAME setFillRGBColor + fill-rect-
// bounds read the header band already uses (page1FillColors) — no new
// extraction machinery for a different paint primitive. Independent per-side
// booleans, so 0-4 rects; empty array when every side is off.
function borderSideStyles(format: DocumentFormatV2) {
  const { size, sides } = format.colors.border;
  const width = BORDER_WIDTH_PT[size];
  const backgroundColor = format.colors.accent;
  const styles: {
    side: "top" | "right" | "bottom" | "left";
    style: Record<string, string | number>;
  }[] = [];
  if (sides.top) {
    styles.push({
      side: "top",
      style: { position: "absolute", top: 0, left: 0, right: 0, height: width, backgroundColor },
    });
  }
  if (sides.right) {
    styles.push({
      side: "right",
      style: { position: "absolute", top: 0, bottom: 0, right: 0, width, backgroundColor },
    });
  }
  if (sides.bottom) {
    styles.push({
      side: "bottom",
      style: { position: "absolute", bottom: 0, left: 0, right: 0, height: width, backgroundColor },
    });
  }
  if (sides.left) {
    styles.push({
      side: "left",
      style: { position: "absolute", top: 0, bottom: 0, left: 0, width, backgroundColor },
    });
  }
  return styles;
}

// The three ProfileHeader variants sections.tsx exposes collapse two
// independent v2 axes (alignment, detailsArrangement) into one enum;
// centered wins over single-row when both are set (an off-diagonal
// combination the four retired templates never produced) — an unhandled
// combination, not a crash. detailsArrangement's third value ('wrapped',
// E9-F3c) is deliberately NOT part of this collapse: it never coincides with
// 'inline' (that variant requires detailsArrangement === 'single-row' exactly)
// so it always renders through 'left' or 'centered' — ProfileHeader reads
// header.detailsArrangement directly off `format` to decide the two-row split,
// independent of which of these three variants it lands in.
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

// layout.manualPageBreaks (§31.2) names sections that force a real page
// break immediately before them — a plain lookup, not a layout decision;
// the caller wraps the section's own View in `break={…}` wherever it renders
// (one/two/mix all route through this one predicate).
function breaksBeforeSection(format: DocumentFormatV2, section: TailoredSection): boolean {
  return format.layout.manualPageBreaks.includes(section.section);
}

// react-pdf's pagination only re-examines a subtree for a `break` prop when
// that subtree's own parent already needs splitting (@react-pdf/layout's
// splitNodes walks a container's children looking for overflow OR `break`,
// but only recurses into grandchildren once a container is found to
// overflow the page) — a `break` set three levels deep inside a two-column
// row that itself fits on one page is silently never seen. So for columnar
// modes, a manual break can't be a prop on a nested section View (that
// works for the single-column case, whose sections ARE direct Page
// children); it has to be a NEW row that is itself a direct Page child.
// This splits the ordered section list into contiguous segments at every
// manualPageBreaks boundary, one row per segment, `break` on every row
// after the first — the same "section and everything after it moves"
// semantics as the single-column wrapper, reconstructed at row grain.
function splitIntoBreakSegments(
  format: DocumentFormatV2,
  sections: TailoredSection[],
): TailoredSection[][] {
  const segments: TailoredSection[][] = [[]];
  for (const section of sections) {
    const isNewSegment = format.layout.manualPageBreaks.includes(section.section);
    const current = segments[segments.length - 1];
    if (isNewSegment && current.length > 0) segments.push([]);
    segments[segments.length - 1].push(section);
  }
  return segments;
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
  const bandInk = hasBand ? contrastInk(format.colors.accent) : undefined;
  // Only ever set in multi mode over a full-page/border area (see
  // resolvePageBackground's own gate) — single mode leaves the page white.
  const pageBackground = resolvePageBackground(format);
  // A painted page background implies multi mode, so its auto-contrast ink
  // (§31.2: "auto-contrast ink, the E8 banner logic generalized") generalizes
  // contrastInk from the band to the whole document. Single mode never paints
  // a page background, so it never gets document-wide ink — it keeps the
  // pre-ticket band-only ink scope.
  const documentInk = pageBackground ? contrastInk(pageBackground) : undefined;
  // documentInk repaints EVERY text color sections.tsx reads off colors.text
  // (name, contact, summary, entry titles, item text, …) by overriding that
  // one field on the legacy shape handed to every renderer below — the same
  // "one seam, every consumer" trick as bandInk's `ink` prop, just scoped to
  // the whole document instead of the header alone.
  const inkedLegacy = documentInk
    ? { ...legacy, colors: { ...legacy.colors, text: documentInk } }
    : legacy;
  const headerInk = bandInk ?? documentInk;
  const columnsMode = format.layout.columns;
  const isColumnar = columnsMode !== "one";
  // The header band (colors.area 'header') sits at the top of the page for
  // 'one' and 'mix' (mix's header spans full width above the columns, same
  // as 'one'); 'two' folds the header into the main column instead, where the
  // band wraps just that column's header block (see mainColumn below) rather
  // than the page.
  const bandAtPageTop = hasBand && columnsMode !== "two";

  const pageStyleBase = {
    paddingTop: bandAtPageTop ? 0 : legacy.page.marginY,
    paddingBottom: legacy.page.marginY,
    // Columnar layouts hand their own horizontal margins to the `row`
    // (see resolveColumnGeometry) rather than the page — mirrors the
    // retired sidebar templates' page style (paddingHorizontal: 0).
    paddingHorizontal: bandAtPageTop || isColumnar ? 0 : legacy.page.marginX,
    fontSize: legacy.typography.body.size,
    fontFamily: legacy.typography.body.family,
  };
  const styles = StyleSheet.create({
    page: pageBackground ? { ...pageStyleBase, backgroundColor: pageBackground } : pageStyleBase,
    band: {
      backgroundColor: format.colors.accent,
      paddingHorizontal: legacy.page.marginX,
      paddingVertical: legacy.page.marginY * 0.6,
    },
    // The 'two'-column band (see mainColumn below): the row that hosts this
    // column already carries the page's horizontal margin as its own
    // paddingHorizontal (see `row`), so this fills only vertically — adding
    // styles.band's own paddingHorizontal here would double the left/right
    // margin inside the column.
    columnBand: {
      backgroundColor: format.colors.accent,
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

  const borderSides = borderSideStyles(format);
  const nameFontFamily = resolveNameFont(format);
  const header = (
    <ProfileHeader
      profile={profile}
      format={inkedLegacy}
      variant={variant}
      ink={headerInk}
      nameFontFamily={nameFontFamily}
    />
  );
  const summary = <SummarySection summary={resume.summary} format={inkedLegacy} />;

  if (!isColumnar) {
    const content = (
      <>
        {summary}
        {resume.sections.map((section) => (
          <View key={section.section} break={breaksBeforeSection(format, section)}>
            <SectionBlock section={section} format={inkedLegacy} />
          </View>
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
          {borderSides.map(({ side, style }) => (
            <View key={side} style={style} />
          ))}
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

  // One row per manualPageBreaks segment (see splitIntoBreakSegments) — the
  // no-break case is a single segment, i.e. exactly the one row this engine
  // rendered before this ticket. Header/summary ('two' only; 'mix' renders
  // its header above the rows) belong to the first row alone.
  const segments = splitIntoBreakSegments(format, resume.sections);
  const rows = segments.map((segmentSections, index) => {
    const { sidebar, main } = splitSectionsByColumn(format, segmentSections);
    const sidebarColumn = (
      <View style={columnStyles.sidebar}>
        {sidebar.map((section) => (
          <SectionBlock key={section.section} section={section} format={inkedLegacy} />
        ))}
      </View>
    );
    // 'two' + colors.area 'header' (the residual this ticket fixes): the band
    // wraps just the header block, local to the main column it already folds
    // into — not the full page width the 'one'/'mix' band gets (there is no
    // full-bleed row here to paint; painting the whole `row` would tint the
    // sidebar too, which colors.area 'header' never promised).
    const headerBlock =
      index === 0 && columnsMode === "two" ? (
        hasBand ? (
          <View style={styles.columnBand}>{header}</View>
        ) : (
          header
        )
      ) : null;
    const mainColumn = (
      <View style={columnStyles.main}>
        {headerBlock}
        {index === 0 && columnsMode === "two" ? summary : null}
        {main.map((section) => (
          <SectionBlock key={section.section} section={section} format={inkedLegacy} />
        ))}
      </View>
    );
    return (
      <View key={segmentSections[0]?.section ?? index} break={index > 0} style={styles.row}>
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
  });

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
        {rows}
        {borderSides.map(({ side, style }) => (
          <View key={side} style={style} />
        ))}
      </Page>
    </Document>
  );
}
