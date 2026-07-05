// Shared PDF text extraction (spec.md §28.4/§28.6) — pdf.js legacy build,
// text items in draw order across every page. The ATS-preview view and the
// extraction-order invariant test both need "what does an ATS parser see",
// so this is the one place that answers it.

export async function extractPdfText(buffer: Buffer | Uint8Array): Promise<string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;

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
