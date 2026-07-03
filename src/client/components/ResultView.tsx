// Split view — spec.md §11. ResumePage (the print target) and ReasoningPanel
// render as SIBLINGS, never nested, so the reasoning strings never enter the
// .resume-page subtree that print.css/window.print() emits.

import type { TailoredResume } from "@shared/types";
import { ResumePage } from "./ResumePage";
import { ReasoningPanel } from "./ReasoningPanel";

export function ResultView({ resume }: { resume: TailoredResume }) {
  return (
    <div className="result-view">
      <ResumePage resume={resume} />
      <ReasoningPanel resume={resume} />
    </div>
  );
}
