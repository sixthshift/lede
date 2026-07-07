// Split view — spec.md §11/§28.0. DocumentPreview (the real react-pdf
// artifact, rendered via pdf.js) and ReasoningPanel render as SIBLINGS, never
// nested, so the reasoning strings never enter the rendered-PDF subtree.

import type { TailoredResume } from "@shared/types";
import type { DocumentFormatV2 } from "@shared/format-v2";
import type { EngineDensity } from "../document/engine";
import { DocumentPreview } from "./DocumentPreview";
import { ReasoningPanel } from "./ReasoningPanel";

export function ResultView({
  resume,
  format,
  density,
}: {
  resume: TailoredResume;
  format?: DocumentFormatV2;
  density?: EngineDensity;
}) {
  return (
    <div className="result-view">
      <DocumentPreview resume={resume} format={format} density={density} />
      <ReasoningPanel resume={resume} />
    </div>
  );
}
