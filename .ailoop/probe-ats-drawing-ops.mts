// Intake probe — spec §31.5 (E9 intake, 2026-07-07). The graded-honesty table
// classifies several axes as "provisionally neutral: drawing ops, verify at
// intake". This probe renders ordered marker text decorated by each risky
// axis's drawing ops (page-frame border before/after content, level dots,
// level bars, header background band, vector icons, full-page background)
// and asserts pdf.js extraction order is unchanged. Its verdicts set the
// shipped classification table (oracle.md Phase 8); the per-axis CI tests
// land with the axes' tickets (F3/F4) and must agree with this probe.
// Run: npx tsx .ailoop/probe-ats-drawing-ops.mts   (from /workspace)
import React from "react";
import { Circle, Document, Page, Rect, renderToBuffer, Svg, Text, View } from "@react-pdf/renderer";

const h = React.createElement;

const MARKERS = [
  "PROBE_HEADER_NAME",
  "PROBE_HEADER_CONTACT",
  "PROBE_S1_HEADING",
  "PROBE_S1_ITEM_A",
  "PROBE_S1_ITEM_B",
  "PROBE_S2_HEADING",
  "PROBE_S2_ITEM_A",
] as const;

const t = (s: string, style: object = {}) => h(Text, { style: { fontSize: 10, ...style } }, s);

const dots = (filled: number) =>
  h(
    Svg,
    { width: 60, height: 10 },
    ...Array.from({ length: 5 }, (_, i) =>
      h(Circle, {
        key: i,
        cx: 6 + i * 12,
        cy: 5,
        r: 4,
        fill: i < filled ? "#1a1a2e" : "none",
        stroke: "#1a1a2e",
        strokeWidth: 1,
      }),
    ),
  );

const bar = (fraction: number) =>
  h(
    Svg,
    { width: 80, height: 6 },
    h(Rect, { x: 0, y: 0, width: 80, height: 6, fill: "#dddddd" }),
    h(Rect, { x: 0, y: 0, width: 80 * fraction, height: 6, fill: "#1a1a2e" }),
  );

const icon = () =>
  h(
    Svg,
    { width: 10, height: 10 },
    h(Circle, { cx: 5, cy: 5, r: 4, fill: "none", stroke: "#1a1a2e", strokeWidth: 1.5 }),
  );

type Decor = {
  header?: (children: React.ReactElement[]) => React.ReactElement;
  beforeContent?: React.ReactElement;
  afterContent?: React.ReactElement;
  afterItem?: () => React.ReactElement;
  headingRow?: (heading: React.ReactElement) => React.ReactElement;
  pageProps?: object;
};

function doc(decor: Decor) {
  const headerTexts = [t(MARKERS[0], { fontSize: 18 }), t(MARKERS[1])];
  const header = decor.header ? decor.header(headerTexts) : h(View, {}, ...headerTexts);
  const heading1 = t(MARKERS[2], { fontSize: 12 });
  const heading2 = t(MARKERS[5], { fontSize: 12 });
  const body = h(
    View,
    {},
    decor.headingRow ? decor.headingRow(heading1) : heading1,
    t(MARKERS[3]),
    decor.afterItem ? decor.afterItem() : null,
    t(MARKERS[4]),
    decor.afterItem ? decor.afterItem() : null,
    decor.headingRow ? decor.headingRow(heading2) : heading2,
    t(MARKERS[6]),
  );
  return h(
    Document,
    {},
    h(
      Page,
      { size: "LETTER", style: { padding: 40 }, ...(decor.pageProps ?? {}) },
      decor.beforeContent ?? null,
      header,
      body,
      decor.afterContent ?? null,
    ),
  );
}

const frame = h(View, {
  fixed: true,
  style: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    bottom: 12,
    borderWidth: 3,
    borderColor: "#1a1a2e",
  },
});

const VARIANTS: Record<string, Decor> = {
  baseline: {},
  "border-frame-drawn-first": { beforeContent: frame },
  "border-frame-drawn-last": { afterContent: frame },
  "level-dots": { afterItem: () => dots(3) },
  "level-bar": { afterItem: () => bar(0.6) },
  "header-band": {
    header: (children) =>
      h(
        View,
        { style: { backgroundColor: "#1a1a2e", padding: 12, margin: -20 } },
        ...children.map((c, i) =>
          h(View, { key: i, style: { color: "#ffffff" } }, c),
        ),
      ),
  },
  "heading-icons": {
    headingRow: (heading) =>
      h(View, { style: { flexDirection: "row", alignItems: "center", gap: 4 } }, icon(), heading),
  },
  "full-page-background": {
    beforeContent: h(View, {
      fixed: true,
      style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#f3ecdf" },
    }),
  },
};

async function extract(buffer: Buffer): Promise<string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // @ts-expect-error untyped worker entry (same pattern as src/client/document/extractText.ts)
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import(
    "pdfjs-dist/legacy/build/pdf.worker.mjs"
  );
  const pdfDoc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const items: string[] = [];
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const content = await (await pdfDoc.getPage(p)).getTextContent();
    for (const item of content.items) if ("str" in item) items.push(item.str);
  }
  return items;
}

let failed = false;
for (const [name, decor] of Object.entries(VARIANTS)) {
  const buffer = await renderToBuffer(doc(decor));
  const items = await extract(buffer);
  const probeItems = items.filter((s) => s.includes("PROBE_"));
  const orderOk =
    probeItems.length === MARKERS.length && probeItems.every((s, i) => s === MARKERS[i]);
  const strayText = items.filter((s) => s.trim() !== "" && !s.includes("PROBE_"));
  const verdict = orderOk && strayText.length === 0 ? "NEUTRAL (order intact)" : "DISTURBS";
  if (verdict === "DISTURBS") failed = true;
  console.log(
    `${name.padEnd(28)} ${verdict}  extracted=[${probeItems.join(", ")}]${
      strayText.length ? ` stray=${JSON.stringify(strayText)}` : ""
    }`,
  );
}
process.exit(failed ? 1 : 0);
