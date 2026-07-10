// Split view — spec.md §11/§28.0. DocumentPreview (the real react-pdf
// artifact, rendered via pdf.js) and ReasoningPanel render as SIBLINGS, never
// nested, so the reasoning strings never enter the rendered-PDF subtree.
//
// T34 — in-place text editing. RESUME IS TEXT-ONLY (locked decision): the
// editor below can rewrite the summary and any item's own text via PATCH
// /resume-part, but offers no add/remove/reorder affordance — which items
// are selected, their order, and their grouping stay the model's. The
// editor is a plain DOM form, never part of the react-pdf document — same
// isolation ReasoningPanel already relies on — so an edit only reaches the
// artifact by round-tripping through the server and refetching `current`.

import { useEffect, useState } from "react";
import type { TailoredResume } from "@shared/types";
import type { DocumentFormatV2 } from "@shared/format-v2";
import { SECTIONS } from "@shared/sections";
import type { EngineDensity } from "../document/engine";
import { usePatchResumePart } from "../queries/useApplications";
import { DocumentPreview } from "./DocumentPreview";
import { ReasoningPanel } from "./ReasoningPanel";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

// Uncontrolled-by-parent draft, committed on blur — so a keystroke doesn't
// fire a PATCH per character, and a no-op blur (draft === last-committed
// value) never round-trips at all. `value` resets the draft whenever the
// server hands back a different one (a successful commit, or another
// tab/reload's edit), so the field never lingers on stale local state.
function EditableField({
  value,
  readOnly,
  onCommit,
  id,
  rows,
  "data-testid": dataTestId,
}: {
  value: string;
  readOnly: boolean;
  onCommit: (text: string) => void;
  id: string;
  rows: number;
  "data-testid": string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <Textarea
      id={id}
      data-testid={dataTestId}
      rows={rows}
      value={draft}
      disabled={readOnly}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}

function ResumeTextEditor({
  applicationId,
  resume,
  readOnly,
}: {
  applicationId: string;
  resume: TailoredResume;
  readOnly: boolean;
}) {
  const patchResumePart = usePatchResumePart();
  let itemFlatIndex = -1;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs">
      <p className="text-sm font-semibold">Edit text</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="resume-edit-summary">Summary</Label>
        <EditableField
          id="resume-edit-summary"
          data-testid="resume-edit-summary"
          rows={3}
          value={resume.summary}
          readOnly={readOnly}
          onCommit={(text) =>
            patchResumePart.mutate({
              id: applicationId,
              input: { path: { kind: "summary" }, text },
            })
          }
        />
      </div>

      {resume.sections.map((section) =>
        section.groups.map((group, groupIndex) =>
          group.items.map((item, index) => {
            itemFlatIndex += 1;
            const flatIndex = itemFlatIndex;
            const fieldId = `resume-edit-item-${flatIndex}`;
            return (
              <div key={fieldId} className="flex flex-col gap-1.5">
                <Label htmlFor={fieldId}>
                  {SECTIONS[section.section].label}
                  {group.heading ? ` · ${group.heading}` : ""}
                </Label>
                <EditableField
                  id={fieldId}
                  data-testid={fieldId}
                  rows={2}
                  value={item.text}
                  readOnly={readOnly}
                  onCommit={(text) =>
                    patchResumePart.mutate({
                      id: applicationId,
                      input: {
                        path: {
                          kind: "item",
                          section: section.section,
                          group: groupIndex,
                          index,
                        },
                        text,
                      },
                    })
                  }
                />
              </div>
            );
          }),
        ),
      )}
    </div>
  );
}

export function ResultView({
  resume,
  format,
  density,
  applicationId,
  readOnly = false,
}: {
  resume: TailoredResume;
  format?: DocumentFormatV2;
  density?: EngineDensity;
  // Both optional so every pre-existing caller (AtsView's own read path,
  // any test that mounts ResultView standalone) keeps rendering exactly as
  // before — the editor only mounts once an applicationId is actually given.
  applicationId?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="result-view">
        <DocumentPreview resume={resume} format={format} density={density} />
        <ReasoningPanel resume={resume} />
      </div>
      {applicationId ? (
        <ResumeTextEditor applicationId={applicationId} resume={resume} readOnly={readOnly} />
      ) : null}
    </div>
  );
}
