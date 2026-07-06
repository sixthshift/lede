// Live mini-render template thumbnails (spec.md §28.2, decided 2026-07-05:
// previews are LIVE renders of THIS application's tailored resume, never
// static images or per-template screenshots). Mirrors DocumentPreview's
// render path — the same react-pdf bytes, painted onto a canvas via
// pdf.js — scaled down and multiplied by six (one per template in the
// registry), which is why this file adds two things DocumentPreview doesn't
// need: a CACHE (repeated opens repaint instantly, keyed on the exact inputs
// that could change the pixels) and a QUEUE (six cards mounting at once must
// never mean six concurrent react-pdf renders).
//
// Renders go through pdf(doc).toBlob() (renderResumeToBlob), never
// renderToBuffer — @react-pdf/renderer's browser build stubs renderToBuffer
// to throw ("Node specific API"); this was an escaped bug once already
// (E7-C2). A render failure (bad font fetch, pdf.js paint failure, anything)
// leaves the canvas blank rather than crashing the picker — thumbnails are
// decorative, never load-bearing.

import { useEffect, useMemo, useRef } from "react";
import type { DocumentFormat, Paper, Profile, TailoredResume } from "@shared/types";
import { renderResumeToBlob } from "./renderResume";

const THUMBNAIL_SCALE = 0.35;

// FNV-1a — fast, deterministic, dependency-free; only needs to distinguish
// cache keys, never needs to resist tampering.
function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

// The cache key mirrors exactly what changes the rendered pixels: the
// template being previewed (the explicit prop, NOT format.templateId — a
// card previews a template regardless of which one is currently selected),
// every other format field, the paper size, the resume's content, and the
// render scale (the gallery, §28.2, renders the SAME component at a larger
// scale than the inline picker — a bigger raster is different pixels, so it
// needs its own cache entry). profile is deliberately excluded (spec'd) — it
// rarely changes within a picker's lifetime, and isn't worth widening the
// key for. scale defaults to THUMBNAIL_SCALE so callers that never pass it
// (every call site before the gallery) are unaffected.
export function thumbnailCacheKey(args: {
  templateId: string;
  format: DocumentFormat;
  paper: Paper;
  resume: TailoredResume;
  scale?: number;
}): string {
  const { templateId, format, paper, resume, scale = THUMBNAIL_SCALE } = args;
  const { templateId: _formatTemplateId, ...formatRest } = format;
  const formatKey = hashString(JSON.stringify(formatRest));
  const resumeKey = hashString(JSON.stringify(resume));
  return `${templateId}::${paper}::${formatKey}::${resumeKey}::${scale}`;
}

// Module-level (app-wide) render queue — six cards mounting together must
// render one PDF at a time, never six concurrently.
let queueTail: Promise<void> = Promise.resolve();

export function enqueueThumbnailRender<T>(job: () => Promise<T>): Promise<T> {
  const started = queueTail.then(job, job);
  queueTail = started.then(
    () => undefined,
    () => undefined,
  );
  return started;
}

// Module-level cache — keyed on thumbnailCacheKey, so re-opening the picker
// (or re-mounting a card) repaints instantly instead of re-rendering. Caches
// the in-flight PROMISE (not just the settled blob) so concurrent mounts of
// the same key share one render rather than each enqueueing their own.
const thumbnailBlobCache = new Map<string, Promise<Blob>>();

function getOrRenderBlob(key: string, render: () => Promise<Blob>): Promise<Blob> {
  const cached = thumbnailBlobCache.get(key);
  if (cached) return cached;
  const job = enqueueThumbnailRender(render);
  thumbnailBlobCache.set(key, job);
  // A failed render shouldn't be cached forever — a later mount (e.g. after
  // a transient font-fetch failure) should get to try again.
  job.catch(() => thumbnailBlobCache.delete(key));
  return job;
}

// pdf.js touches browser-only globals (DOMMatrix, Worker) at module-init —
// loaded lazily, same as DocumentPreview.tsx, so a render failure here (no
// real browser, e.g. under vitest's jsdom) leaves the canvas blank instead
// of crashing.
// jsdom's Blob shim (and some real-world Blob implementations) don't support
// arrayBuffer() directly — FileReader.readAsArrayBuffer is the one
// bytes-out-of-a-Blob path both a real browser and jsdom actually support
// (same constraint fit.ts's blobToBytes already solved).
function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function paintFirstPage(
  blob: Blob,
  canvas: HTMLCanvasElement,
  isCancelled: () => boolean,
  scale: number,
): Promise<void> {
  // Raw bytes, not an object URL: pdf.js fetches a URL-backed document
  // lazily (range requests can outlive this function), so revoking a blob
  // URL when the paint "finishes" races those fetches into
  // net::ERR_FILE_NOT_FOUND console errors — and never revoking leaks a
  // blob per render. Handing pdf.js the bytes sidesteps the URL lifecycle
  // entirely.
  const data = await blobToBytes(blob);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  if (isCancelled()) return;
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  await page.render({ canvas, canvasContext: context, viewport }).promise;
}

export function TemplateThumbnail({
  resume,
  profile,
  paper,
  format,
  templateId,
  scale = THUMBNAIL_SCALE,
}: {
  resume: TailoredResume;
  profile: Profile;
  paper: Paper;
  format: DocumentFormat;
  templateId: string;
  // Larger for the dedicated gallery (§28.2) than the inline picker's card —
  // same component, same render/paint path, just a bigger pdf.js viewport.
  scale?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheKey = useMemo(
    () => thumbnailCacheKey({ templateId, format, paper, resume, scale }),
    [templateId, format, paper, resume, scale],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    const render = () => {
      getOrRenderBlob(cacheKey, () =>
        renderResumeToBlob({
          resume,
          profile,
          paper,
          templateId,
          format: { ...format, templateId },
        }),
      )
        .then((blob) => {
          if (cancelled) return;
          return paintFirstPage(blob, canvas, () => cancelled, scale);
        })
        .catch(() => {
          // Best-effort thumbnail — leave the canvas blank.
        });
    };

    // Thumbnails are decorative, not load-bearing — only worth spending a
    // real PDF render on once the card is actually visible, which also
    // keeps six cards' worth of render work off the main thread until
    // there's something on screen to show for it. Environments without
    // IntersectionObserver just leave the canvas blank — the same
    // leave-it-blank posture a pdf.js paint failure gets.
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      // requestIdleCallback (falling back to a macrotask where unsupported,
      // e.g. Safari) so six background renders yield to whatever's actually
      // in flight — a tailor request, the main DocumentPreview's own render
      // — instead of racing it for the main thread the instant a card
      // scrolls into view. The timeout bounds the deferral: a busy main
      // thread (exactly the six-renders case) can otherwise starve idle
      // callbacks indefinitely and the thumbnails would never start.
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(render, { timeout: 1000 });
      } else {
        setTimeout(render, 0);
      }
    });
    observer.observe(canvas);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [cacheKey, resume, profile, paper, format, templateId, scale]);

  return <canvas ref={canvasRef} className="template-thumbnail__canvas" aria-hidden />;
}
