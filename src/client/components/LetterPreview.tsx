// Cover-letter analog of DocumentPreview.tsx (T23) — same react-pdf ->
// pdf.js paint path, so the letter preview IS the artifact export/lock would
// produce, same as the resume. No design axes, no density ladder, no
// multi-page host: a letter is a single short page, so this only ever paints
// page 1 via the shared PdfCanvas.
//
// T34 — in-place paragraph editing. Text-level edits (greeting/body/closing)
// PATCH /letter-part; unlike the resume, the letter ALSO allows paragraph
// insert/remove (LOCKED decision: prose structure IS the user's here). The
// editor is a plain DOM form, never part of the react-pdf document, so an
// edit only reaches the artifact by round-tripping through the server and
// refetching letterCurrent.

import { useEffect, useState } from "react";
import { usePDF } from "@react-pdf/renderer";
import { DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import type { CoverLetter, Profile } from "@shared/types";
import type { Paper } from "../document";
import { renderLetterDocument } from "../document";
import { useProfile, useSettings } from "../hooks/queries";
import {
  useInsertLetterParagraph,
  usePatchLetterPart,
  useRemoveLetterParagraph,
} from "../queries/useApplications";
import { PdfCanvas } from "./DocumentPreview";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

function RenderedLetterPreview({
  letter,
  profile,
  paper,
  format,
}: {
  letter: CoverLetter;
  profile: Profile;
  paper: Paper;
  format: DocumentFormatV2;
}) {
  const [instance, update] = usePDF({
    document: renderLetterDocument({ letter, profile, paper, format }),
  });

  // Same fix as DocumentPreview's RenderedPreview: usePDF's own render effect
  // has an empty dependency array, so a changed letter/format prop would be
  // silently ignored without this explicit update() call keyed on the actual
  // rendered inputs.
  useEffect(() => {
    update(renderLetterDocument({ letter, profile, paper, format }));
  }, [update, letter, profile, paper, format]);

  if (instance.error) {
    return (
      <p role="alert" className="letter-preview__error">
        Couldn't render the letter preview.
      </p>
    );
  }
  if (instance.loading || !instance.url) {
    return <p className="letter-preview__loading">Rendering preview…</p>;
  }
  return <PdfCanvas url={instance.url} className="letter-preview__canvas" />;
}

// Same uncontrolled-draft-committed-on-blur pattern as ResultView's
// EditableField — a no-op blur (draft unchanged) never round-trips.
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

function LetterTextEditor({
  applicationId,
  letter,
  readOnly,
}: {
  applicationId: string;
  letter: CoverLetter;
  readOnly: boolean;
}) {
  const patchLetterPart = usePatchLetterPart();
  const insertParagraph = useInsertLetterParagraph();
  const removeParagraph = useRemoveLetterParagraph();

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs">
      <p className="text-sm font-semibold">Edit text</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="letter-edit-greeting">Greeting</Label>
        <EditableField
          id="letter-edit-greeting"
          data-testid="letter-edit-greeting"
          rows={1}
          value={letter.greeting}
          readOnly={readOnly}
          onCommit={(text) =>
            patchLetterPart.mutate({
              id: applicationId,
              input: { path: { kind: "greeting" }, text },
            })
          }
        />
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={readOnly || insertParagraph.isPending}
          onClick={() => insertParagraph.mutate({ id: applicationId, position: 0, text: "" })}
          data-testid="letter-insert-paragraph-0"
        >
          Insert paragraph at top
        </Button>
      </div>

      {letter.body.map((paragraph, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: index IS this domain's own identity for a paragraph — /letter-part/paragraph addresses one by index; there is no other id on a CoverLetter body entry.
        <div key={index} className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`letter-edit-paragraph-${index}`}>Paragraph {index + 1}</Label>
            <EditableField
              id={`letter-edit-paragraph-${index}`}
              data-testid={`letter-edit-paragraph-${index}`}
              rows={3}
              value={paragraph.text}
              readOnly={readOnly}
              onCommit={(text) =>
                patchLetterPart.mutate({
                  id: applicationId,
                  input: { path: { kind: "body", index }, text },
                })
              }
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={readOnly || removeParagraph.isPending}
              onClick={() => removeParagraph.mutate({ id: applicationId, index })}
              data-testid={`letter-remove-paragraph-${index}`}
            >
              Remove paragraph
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={readOnly || insertParagraph.isPending}
              onClick={() =>
                insertParagraph.mutate({ id: applicationId, position: index + 1, text: "" })
              }
              data-testid={`letter-insert-paragraph-${index + 1}`}
            >
              Insert paragraph after
            </Button>
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="letter-edit-closing">Closing</Label>
        <EditableField
          id="letter-edit-closing"
          data-testid="letter-edit-closing"
          rows={1}
          value={letter.closing}
          readOnly={readOnly}
          onCommit={(text) =>
            patchLetterPart.mutate({
              id: applicationId,
              input: { path: { kind: "closing" }, text },
            })
          }
        />
      </div>
    </div>
  );
}

export function LetterPreview({
  letter,
  format = DEFAULT_FORMAT_V2,
  applicationId,
  readOnly = false,
}: {
  letter: CoverLetter;
  format?: DocumentFormatV2;
  // Optional so a caller that only wants the read-only preview (none exist
  // today, but ResultView's own applicationId prop follows the same shape)
  // isn't forced to carry an id it has no use for — the editor only mounts
  // once one is given.
  applicationId?: string;
  readOnly?: boolean;
}) {
  const { data: profile } = useProfile();
  const { data: settings } = useSettings();

  // usePDF must never be called with a document assembled from partial data,
  // so the react-pdf render only mounts once profile + paper are in hand.
  return (
    <div className="letter-preview flex flex-col gap-6">
      {profile && settings ? (
        <RenderedLetterPreview
          letter={letter}
          profile={profile}
          paper={settings.paper}
          format={format}
        />
      ) : (
        <p className="letter-preview__loading">Loading preview…</p>
      )}
      {applicationId ? (
        <LetterTextEditor applicationId={applicationId} letter={letter} readOnly={readOnly} />
      ) : null}
    </div>
  );
}
