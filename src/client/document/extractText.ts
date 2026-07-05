// Shared PDF text extraction (spec.md §28.4/§28.6) — pdf.js legacy build,
// text items in draw order across every page. The ATS-preview view, fit.ts's
// page-count measurement, and the extraction-order invariant test all need
// to open a pdf.js document from raw bytes, so loadPdfDocument is the one
// place that answers "how do I get a pdf.js document in this environment".
//
// A real browser's pdf.js spawns an actual Worker thread and hard-throws
// ("No GlobalWorkerOptions.workerSrc specified") without one configured;
// Node's build disables that path automatically, which is why this only
// shows up outside vitest. Rather than bundling a worker asset, importing
// the worker module directly and handing pdf.js its message handler via
// `globalThis.pdfjsWorker` triggers the SAME main-thread fallback pdf.js
// itself uses when a real worker fails to load (see PDFWorker#initialize in
// pdfjs-dist) — no background thread needed for text/page-count extraction.

let workerConfigured = false;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!workerConfigured) {
    // pdfjs-dist ships no type declarations for this worker entry point.
    // @ts-expect-error — untyped module, see comment above.
    const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = workerModule;
    workerConfigured = true;
  }
  return pdfjs;
}

export async function loadPdfDocument(buffer: Buffer | Uint8Array) {
  const { getDocument } = await loadPdfjs();
  return getDocument({ data: new Uint8Array(buffer) }).promise;
}

export async function extractPdfText(buffer: Buffer | Uint8Array): Promise<string[]> {
  const doc = await loadPdfDocument(buffer);

  const items: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ("str" in item) items.push(item.str);
    }
  }
  return items;
}
