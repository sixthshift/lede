// The preview IS the artifact — spec.md §28.0/§11. Renders the same react-pdf
// Document that export/lock would produce (renderResumeDocument), then paints
// those exact PDF bytes onto a canvas via pdf.js. There is no separate DOM
// approximation to keep in sync. ReasoningPanel is a SIBLING (see ResultView);
// nothing here ever sees leadRationale/cut — renderResumeDocument only ever
// receives resume/profile/paper, so those strings cannot enter this subtree.

import { useEffect, useRef } from "react";
import { usePDF } from "@react-pdf/renderer";
import { DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import type { Profile, TailoredResume } from "@shared/types";
import type { Paper } from "../document";
import { renderResumeDocument } from "../document";
import type { EngineDensity } from "../document/engine";
import { useProfile, useSettings } from "../hooks/queries";

// pdf.js touches browser-only globals (DOMMatrix, Worker) at module-init —
// loaded lazily so importing this component never requires a real browser
// (e.g. under vitest's jsdom environment, where the preview simply stays
// blank rather than crashing the page).
async function renderPageToCanvas(
  url: string,
  canvas: HTMLCanvasElement,
  isCancelled: () => boolean,
): Promise<void> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const doc = await pdfjs.getDocument({ url }).promise;
  const page = await doc.getPage(1);
  if (isCancelled()) return;
  const viewport = page.getViewport({ scale: 1.5 });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  await page.render({ canvas, canvasContext: context, viewport }).promise;
}

function PdfCanvas({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    renderPageToCanvas(url, canvas, () => cancelled).catch(() => {
      // pdf.js needs a real canvas/worker (browser-only) — a failure here
      // leaves the canvas blank rather than crashing the page.
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return <canvas ref={canvasRef} className="document-preview__canvas" />;
}

// Every page, not just page 1 (E9-F1a's design view: a resume that overflows
// its target still needs every overflow page visible, not just a first-page
// crop). Canvases are built and painted off-DOM, then appended to the
// container in order — appending only once a page is fully painted means the
// container never shows a half-drawn canvas, and sidesteps the ref-timing
// problem of asking React to hand back N refs for a page count pdf.js hasn't
// reported yet.
async function renderAllPagesInto(
  url: string,
  container: HTMLDivElement,
  isCancelled: () => boolean,
): Promise<void> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const doc = await pdfjs.getDocument({ url }).promise;
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    if (isCancelled()) return;
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.className = "document-preview__canvas";
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    if (!context) continue;
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    if (isCancelled()) return;
    container.appendChild(canvas);
  }
}

// Visible gap + border between stacked pages (className, not app.css: this
// component owns its own presentation) so a multi-page render never reads as
// one long, ambiguous strip.
function PdfPages({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren();

    renderAllPagesInto(url, container, () => cancelled).catch(() => {
      // Same browser-only caveat as PdfCanvas — a failure here leaves
      // whatever pages already painted in place rather than crashing.
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div
      ref={containerRef}
      className="document-preview__pages flex flex-col items-center gap-6 [&>canvas]:rounded-sm [&>canvas]:border [&>canvas]:border-border [&>canvas]:shadow-md"
    />
  );
}

function RenderedPreview({
  resume,
  profile,
  paper,
  format,
  density,
  allPages,
}: {
  resume: TailoredResume;
  profile: Profile;
  paper: Paper;
  format: DocumentFormatV2;
  density?: EngineDensity;
  allPages?: boolean;
}) {
  const [instance, update] = usePDF({
    document: renderResumeDocument({ resume, profile, paper, format, density }),
  });

  // usePDF's own render effect has an empty dependency array — it calls
  // updateContainer once on mount and never again, so a changed
  // resume/format/density prop was silently ignored: the preview only
  // repainted after a full remount (e.g. a page reload). Calling its
  // returned `update` fn here, in an effect keyed on the actual rendered
  // document, is the same pattern react-pdf's own PDFViewer uses internally
  // (usePDF() + useEffect(() => updateInstance(children), [children])) —
  // it re-runs the container update whenever the document actually changes,
  // which is what makes the preview repaint in place instead of requiring a
  // remount.
  useEffect(() => {
    update(renderResumeDocument({ resume, profile, paper, format, density }));
  }, [update, resume, profile, paper, format, density]);

  if (instance.error) {
    return (
      <p role="alert" className="document-preview__error">
        Couldn't render the resume preview.
      </p>
    );
  }
  if (instance.loading || !instance.url) {
    return <p className="document-preview__loading">Rendering preview…</p>;
  }
  return allPages ? <PdfPages url={instance.url} /> : <PdfCanvas url={instance.url} />;
}

export function DocumentPreview({
  resume,
  format = DEFAULT_FORMAT_V2,
  density,
  allPages = false,
}: {
  resume: TailoredResume;
  format?: DocumentFormatV2;
  density?: EngineDensity;
  // Every page instead of just the first (E9-F1a's design view, where an
  // overflowing resume needs every page visible) — default false keeps
  // every existing single-page caller (ResultView/AtsView) unchanged.
  allPages?: boolean;
}) {
  const { data: profile } = useProfile();
  const { data: settings } = useSettings();

  // usePDF must never be called with a document assembled from partial data,
  // so the react-pdf render only mounts once profile + paper are in hand.
  return (
    <div className="document-preview">
      {profile && settings ? (
        <RenderedPreview
          resume={resume}
          profile={profile}
          paper={settings.paper}
          format={format}
          density={density}
          allPages={allPages}
        />
      ) : (
        <p className="document-preview__loading">Loading preview…</p>
      )}
    </div>
  );
}
