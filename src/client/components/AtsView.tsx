// "What the ATS sees" — spec.md §28.6/§11. Lede showing its work about the
// FILE (sibling concern to ReasoningPanel showing its work about the
// judgment): runs the SAME extraction the content-fidelity invariant uses
// (extractPdfText) over the application's ACTUAL generated export, so this
// is exactly what a real ATS text parser reads — not a re-derivation that
// could drift from the real PDF bytes. leadRationale/cut[] can never appear
// here structurally: renderResumeDocument only ever receives
// resume/profile/paper/format (never those fields), so there is nothing for
// extraction to surface even if it tried.
//
// Blob, not renderResumeToBuffer: this component runs in the browser, and
// @react-pdf/renderer's browser build stubs renderToBuffer to throw ("Node
// specific API") — `pdf(doc).toBlob()` is the one entrypoint the browser
// build actually implements (same reasoning as download.ts).

import { pdf } from "@react-pdf/renderer";
import { useEffect, useState } from "react";
import { DEFAULT_FORMAT } from "@shared/format";
import type { DocumentFormat, Paper, Profile, TailoredResume } from "@shared/types";
import { extractPdfText } from "../document/extractText";
import { renderResumeDocument } from "../document/renderResume";

// FileReader, not blob.arrayBuffer(): a real browser's Blob implements
// arrayBuffer() directly, but jsdom's Blob shim (this component's other test
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

type AtsState = { status: "loading" } | { status: "error" } | { status: "ready"; items: string[] };

function useAtsExtraction(args: {
  resume: TailoredResume;
  profile: Profile;
  format: DocumentFormat;
  paper: Paper;
}): AtsState {
  const { resume, profile, format, paper } = args;
  const [state, setState] = useState<AtsState>({ status: "loading" });

  useEffect(() => {
    setState({ status: "loading" });
    let cancelled = false;

    pdf(renderResumeDocument({ resume, profile, paper, templateId: format.templateId, format }))
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
  }, [resume, profile, format, paper]);

  return state;
}

export function AtsView({
  resume,
  profile,
  format = DEFAULT_FORMAT,
  paper = "letter",
}: {
  resume: TailoredResume;
  profile: Profile;
  format?: DocumentFormat;
  paper?: Paper;
}) {
  const state = useAtsExtraction({ resume, profile, format, paper });

  if (state.status === "loading") {
    return <p className="ats-view__loading">Extracting…</p>;
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="ats-view__error">
        Couldn't extract the document text.
      </p>
    );
  }

  return (
    <div className="ats-view">
      <p className="ats-view__hint">
        This is the text an ATS parser reads out of your downloaded PDF — not a preview of the
        design.
      </p>
      <pre className="ats-view__text">{state.items.join(" ")}</pre>
    </div>
  );
}
