// The preview IS the artifact — spec.md §28.0/§11. Renders the same react-pdf
// Document that export/lock would produce (renderResumeDocument), then paints
// those exact PDF bytes onto a canvas via pdf.js. There is no separate DOM
// approximation to keep in sync. ReasoningPanel is a SIBLING (see ResultView);
// nothing here ever sees leadRationale/cut — renderResumeDocument only ever
// receives resume/profile/paper, so those strings cannot enter this subtree.

import { useEffect, useRef } from "react";
import { usePDF } from "@react-pdf/renderer";
import { DEFAULT_FORMAT } from "@shared/format";
import type { DocumentFormat, Profile, TailoredResume } from "@shared/types";
import type { Paper } from "../document";
import { renderResumeDocument } from "../document";
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

function RenderedPreview({
  resume,
  profile,
  paper,
  format,
}: {
  resume: TailoredResume;
  profile: Profile;
  paper: Paper;
  format: DocumentFormat;
}) {
  const [instance] = usePDF({
    document: renderResumeDocument({ resume, profile, paper, format }),
  });

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
  return <PdfCanvas url={instance.url} />;
}

export function DocumentPreview({
  resume,
  format = DEFAULT_FORMAT,
}: {
  resume: TailoredResume;
  format?: DocumentFormat;
}) {
  const { data: profile } = useProfile();
  const { data: settings } = useSettings();

  // usePDF must never be called with a document assembled from partial data,
  // so the react-pdf render only mounts once profile + paper are in hand.
  return (
    <div className="document-preview">
      {profile && settings ? (
        <RenderedPreview resume={resume} profile={profile} paper={settings.paper} format={format} />
      ) : (
        <p className="document-preview__loading">Loading preview…</p>
      )}
    </div>
  );
}
