// Render entrypoints for the engine composition (document.tsx) — mirrors
// ../renderResume.ts's shape, minus the six-look lookup + identity dispatch
// it does to pick one of the retired code compositions.
import { renderToBuffer } from "@react-pdf/renderer";
import { registerDocumentFonts } from "../fonts";
import { loadPdfDocument } from "../extractText";
import { EngineDocument, type EngineDocumentProps } from "./document";
import { DENSITY_LADDER, type EngineDensity } from "./density";

export async function renderEngineToBuffer(args: EngineDocumentProps): Promise<Buffer> {
  registerDocumentFonts();
  return renderToBuffer(EngineDocument(args));
}

export type EngineFitResult = { density: EngineDensity; pageCount: number; fits: boolean };

// Ladder-walk, ported from ../fit.ts's fitToPages for the engine's own
// render path (fit.ts itself dispatches through the six-look lookup module,
// which this directory must never depend on — see density.ts's header
// comment).
export async function fitEngineToPages(args: {
  resume: EngineDocumentProps["resume"];
  profile: EngineDocumentProps["profile"];
  format: EngineDocumentProps["format"];
  paper: EngineDocumentProps["paper"];
  targetPages: number;
}): Promise<EngineFitResult> {
  let last: { density: EngineDensity; pageCount: number } | null = null;
  for (const density of DENSITY_LADDER) {
    const buffer = await renderEngineToBuffer({ ...args, density });
    const doc = await loadPdfDocument(buffer);
    const pageCount = doc.numPages;
    last = { density, pageCount };
    if (pageCount <= args.targetPages) return { density, pageCount, fits: true };
  }
  const overflow = last as { density: EngineDensity; pageCount: number };
  return { ...overflow, fits: false };
}
