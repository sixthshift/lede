// Render entrypoints for the engine composition (document.tsx) — mirrors
// ../renderResume.ts's shape, minus the six-look lookup + identity dispatch
// it does to pick one of the retired code compositions.
import { pdf, renderToBuffer } from "@react-pdf/renderer";
import { registerDocumentFonts } from "../fonts";
import { loadPdfDocument } from "../extractText";
import { EngineDocument, type EngineDocumentProps } from "./document";
import { DENSITY_LADDER, type EngineDensity } from "./density";

export async function renderEngineToBuffer(args: EngineDocumentProps): Promise<Buffer> {
  registerDocumentFonts();
  return renderToBuffer(EngineDocument(args));
}

// Browser-safe counterpart to renderEngineToBuffer — @react-pdf/renderer's
// browser build stubs renderToBuffer/renderToStream/renderToFile to throw
// ("Node specific API"); `pdf(doc).toBlob()` is the one render entrypoint
// the browser build actually implements (same constraint renderResume.ts's
// renderResumeToBlob, thumbnail.tsx, and AtsView.tsx already solved — this
// escaped once already, E7-C2, when fitToPages's browser path was missing).
export async function renderEngineToBlob(args: EngineDocumentProps): Promise<Blob> {
  registerDocumentFonts();
  return pdf(EngineDocument(args)).toBlob();
}

// jsdom's Blob shim (and some real-world Blob implementations) don't support
// arrayBuffer() directly — FileReader.readAsArrayBuffer is the one
// bytes-out-of-a-Blob path both a real browser and jsdom actually support
// (same constraint ../fit.ts's v1 blobToBytes / thumbnail.tsx's already solved).
function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function pageCountAt(args: EngineDocumentProps): Promise<number> {
  // Node/SSR (vitest, this file's own unit tests) keeps the buffer path;
  // the real browser bundle takes the toBlob path instead — the same
  // import.meta.env.SSR branch fonts.ts/the retired v1 fit.ts already use
  // for this exact dual-environment render constraint.
  if (import.meta.env.SSR) {
    const buffer = await renderEngineToBuffer(args);
    return (await loadPdfDocument(buffer)).numPages;
  }
  const blob = await renderEngineToBlob(args);
  const bytes = await blobToBytes(blob);
  return (await loadPdfDocument(bytes)).numPages;
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
    const pageCount = await pageCountAt({ ...args, density });
    last = { density, pageCount };
    if (pageCount <= args.targetPages) return { density, pageCount, fits: true };
  }
  const overflow = last as { density: EngineDensity; pageCount: number };
  return { ...overflow, fits: false };
}
