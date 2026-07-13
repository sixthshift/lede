// "What the ATS sees" — spec.md §28.6/§11. Lede showing its work about the
// FILE (sibling concern to ReasoningPanel showing its work about the
// judgment): runs the SAME extraction the content-fidelity invariant uses
// (extractPdfText) over the application's ACTUAL generated export, so this
// is exactly what a real ATS text parser reads — not a re-derivation that
// could drift from the real PDF bytes. leadRationale/cut[] can never appear
// here structurally: renderResumeDocument only ever receives
// resume/profile/paper/format (never those fields), so there is nothing for
// extraction to surface even if it tried.

import { DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import type { Paper, Profile, TailoredResume } from "@shared/types";
import { useExtractedText } from "../document/useExtractedText";
import type { EngineDensity } from "../document/engine";

export function AtsView({
  resume,
  profile,
  format = DEFAULT_FORMAT_V2,
  paper = "letter",
  density,
}: {
  resume: TailoredResume;
  profile: Profile;
  format?: DocumentFormatV2;
  paper?: Paper;
  density?: EngineDensity;
}) {
  const state = useExtractedText({ resume, profile, format, paper, density });

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
