// Content budget derivation — spec.md §28.5. Server-side, keyless, pure: the
// model never sees paper/targetPages/format directly, only a phrased budget
// on the user message (engine.ts's buildUserPrompt). §28.5:869 — the fit
// ladder absorbs estimation error at render time, so this only needs to be
// roughly right, not exact; it must never touch entries/validate (§6.2/§6.3
// stay entries-only) and must never import the client fit ladder — fit.ts
// and registry.ts pull in @react-pdf/renderer/pdf.js, which is not safely
// importable from src/server.
//
// §31/E9-F0d1: `format` moved from the v1 `DocumentFormat` to `DocumentFormatV2`
// (application.format/settings.defaultFormat are v2 now) — reads typeScale/
// spacing directly rather than importing the client-only legacyAdapt seam.
import type { Paper } from "@shared/types";
import type { DocumentFormatV2 } from "@shared/format-v2";

// Points are standard PDF units (72pt = 1in) — the same values
// @react-pdf/renderer's <Page size="LETTER"|"A4"> uses internally, duplicated
// here rather than imported to keep this module react-pdf-free.
const PAPER_SIZE_PT: Record<Paper, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
};

// 72pt / 25.4mm — v2 stores margins in mm (§31.2); duplicated rather than
// imported for the same react-pdf-free reason as PAPER_SIZE_PT above (also
// duplicated, for the same reason, in src/client/document/engine/legacyAdapt.ts).
const PT_PER_MM = 72 / 25.4;
// v2's elementSpacing is a discrete 0-4 scale; 6pt/step matches
// legacyAdapt.ts's/format-v2.ts's own ELEMENT_SPACING_PT_STEP.
const ELEMENT_SPACING_PT_STEP = 6;

// Local heuristic constants, deliberately rough:
// - AVG_CHAR_WIDTH_RATIO: a proportional body font's average glyph advance
//   width, as a fraction of its point size.
// - CONTENT_FRACTION: share of the page's line grid actually available to
//   bulleted content once header/summary/section-heading rows are subtracted,
//   calibrated at 'standard' density.
// - WORDS_PER_BULLET / CHARS_PER_WORD: translate a character budget into the
//   bullets/words phrasing the model expects.
const AVG_CHAR_WIDTH_RATIO = 0.5;
const CONTENT_FRACTION_AT_STANDARD_DENSITY = 0.62;
const WORDS_PER_BULLET = 13;
const CHARS_PER_WORD = 6; // average word length + trailing space

export function deriveContentBudget({
  paper,
  targetPages,
  format,
}: {
  paper: Paper;
  targetPages: 1 | 2;
  format: DocumentFormatV2;
}): string {
  const { width, height } = PAPER_SIZE_PT[paper];
  const bodySize = format.typeScale.bodySize;
  const lineHeight = format.spacing.lineHeight;
  const marginX = format.spacing.marginsMm.x * PT_PER_MM;
  const marginY = format.spacing.marginsMm.y * PT_PER_MM;
  const sectionGap = format.spacing.elementSpacing * ELEMENT_SPACING_PT_STEP;

  const usableWidth = Math.max(width - 2 * marginX, 1);
  const usableHeight = Math.max(height - 2 * marginY, 1);

  const lineHeightPt = bodySize * lineHeight;
  const rowPt = lineHeightPt + sectionGap / 8; // sectionGap amortized across many lines, not charged per-line
  const linesPerPage = usableHeight / rowPt;
  const charsPerLine = usableWidth / (bodySize * AVG_CHAR_WIDTH_RATIO);

  const totalChars =
    linesPerPage * charsPerLine * targetPages * CONTENT_FRACTION_AT_STANDARD_DENSITY;
  const words = Math.max(Math.round(totalChars / CHARS_PER_WORD), 1);
  const bullets = Math.max(Math.round(words / WORDS_PER_BULLET), 1);

  return (
    `Aim for roughly ${bullets} bullets (~${words} words) total so the resume fits ` +
    `${targetPages} page${targetPages > 1 ? "s" : ""}; prefer selecting the most relevant items ` +
    `over including everything.`
  );
}
