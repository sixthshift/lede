// Split view — spec.md §11/§28.0. DocumentPreview (the real react-pdf
// artifact, rendered via pdf.js) and ReasoningPanel render as SIBLINGS, never
// nested, so the reasoning strings never enter the rendered-PDF subtree.

import type { TailoredResume } from "@shared/types";
import { DocumentPreview } from "./DocumentPreview";
import { ReasoningPanel } from "./ReasoningPanel";

export function ResultView({ resume }: { resume: TailoredResume }) {
  return (
    <div className="result-view">
      <DocumentPreview resume={resume} />
      <ReasoningPanel resume={resume} />
    </div>
  );
}
