// The differentiator — spec.md §11. Renders WHY the resume looks the way it
// does: signals, per-group leadRationale, and what got cut. NEVER printed
// (hidden in print.css) and NEVER nested inside ResumePage/.resume-page —
// see ResultView, which renders this as a sibling.

import type { TailoredResume } from "@shared/types";
import { SECTIONS } from "@shared/sections";
import { WeightBar } from "./WeightBar";
import { Callout } from "./Callout";
import { CutList } from "./CutList";

export function ReasoningPanel({ resume }: { resume: TailoredResume }) {
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

      <CutList cut={resume.cut} />
    </div>
  );
}
