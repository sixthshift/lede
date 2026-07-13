// The differentiator — spec.md §11. Renders WHY the resume looks the way it
// does: signals, per-group leadRationale, and what got cut. This panel is
// never part of the react-pdf document — see ResultView, which renders it as
// a sibling of DocumentPreview, so its content can never reach the PDF.

import type { TailoredResume } from "@shared/types";
import { SECTIONS } from "@shared/sections";
import { uncoveredSignals } from "@shared/signal-coverage";
import { WeightBar } from "./WeightBar";
import { Callout } from "./Callout";
import { CutList } from "./CutList";

export function ReasoningPanel({ resume }: { resume: TailoredResume }) {
  // Honest framing (locked): "no lede addresses X" is never "your resume
  // lacks X". With zero ledes at all, EVERY signal would read uncovered —
  // that degenerate case reads as the forbidden judgment, so the section
  // hides rather than list the whole signal set.
  const hasLedes = resume.sections.some((section) => section.groups.length > 0);
  const uncovered = uncoveredSignals(resume);

  return (
    <div className="reasoning-panel">
      <h2 className="reasoning-panel__heading">Why this resume</h2>

      <WeightBar signals={resume.signals} />

      {resume.sections.map((section) =>
        section.groups
          .filter((group) => group.leadRationale)
          .map((group, i) => (
            <div
              key={group.heading ?? `${section.section}-${i}`}
              className="reasoning-panel__rationale"
            >
              <span className="reasoning-panel__rationale-source">
                {SECTIONS[section.section].label}
                {group.heading ? ` · ${group.heading}` : ""}
              </span>
              <Callout text={group.leadRationale!} />
            </div>
          )),
      )}

      {hasLedes && uncovered.length > 0 && (
        <p className="reasoning-panel__uncovered">
          No lede addresses these signals: {uncovered.join(", ")}
        </p>
      )}

      <CutList cut={resume.cut} />
    </div>
  );
}
