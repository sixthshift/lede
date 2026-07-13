// Shared render→blob→extractPdfText hook: runs the SAME extraction the
// content-fidelity invariant uses (extractPdfText) over an ACTUAL
// react-pdf-rendered document, so every consumer sees exactly what a real
// ATS text parser would read — never a re-derivation that could drift from
// the real PDF bytes. AtsView (§28.6) and CoveragePanel both consume this
// so there's one source, not two that can drift apart.
//
// Blob, not renderResumeToBuffer: this hook runs in the browser, and
// @react-pdf/renderer's browser build stubs renderToBuffer to throw ("Node
// specific API") — `pdf(doc).toBlob()` is the one entrypoint the browser
// build actually implements (same reasoning as download.ts).

import { pdf } from "@react-pdf/renderer";
import { useEffect, useState } from "react";
import type { DocumentFormatV2 } from "@shared/format-v2";
import type { Paper, Profile, TailoredResume } from "@shared/types";
import { extractPdfText } from "./extractText";
import { renderResumeDocument } from "./renderResume";
import type { EngineDensity } from "./engine";

// FileReader, not blob.arrayBuffer(): a real browser's Blob implements
// arrayBuffer() directly, but jsdom's Blob shim (this hook's other test
// environment, via ats-view.test.tsx) doesn't — FileReader.readAsArrayBuffer
// is the one bytes-out-of-a-Blob path both actually support.
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export type ExtractedTextState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: string[] };

export function useExtractedText(args: {
  resume: TailoredResume;
  profile: Profile;
  format: DocumentFormatV2;
  paper: Paper;
  density?: EngineDensity;
}): ExtractedTextState {
  const { resume, profile, format, paper, density } = args;
  const [state, setState] = useState<ExtractedTextState>({ status: "loading" });

  useEffect(() => {
    setState({ status: "loading" });
    let cancelled = false;

    pdf(renderResumeDocument({ resume, profile, paper, format, density }))
      .toBlob()
      .then(blobToArrayBuffer)
      .then((buffer) => extractPdfText(new Uint8Array(buffer)))
      .then((items) => {
        if (!cancelled) setState({ status: "ready", items });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [resume, profile, format, paper, density]);

  return state;
}
