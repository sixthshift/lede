// Cover-letter analog of DocumentPreview.tsx (T23) — same react-pdf ->
// pdf.js paint path, so the letter preview IS the artifact export/lock would
// produce, same as the resume. No design axes, no density ladder, no
// multi-page host: a letter is a single short page, so this only ever paints
// page 1 via the shared PdfCanvas.

import { useEffect } from "react";
import { usePDF } from "@react-pdf/renderer";
import { DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import type { CoverLetter, Profile } from "@shared/types";
import type { Paper } from "../document";
import { renderLetterDocument } from "../document";
import { useProfile, useSettings } from "../hooks/queries";
import { PdfCanvas } from "./DocumentPreview";

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

export function LetterPreview({
  letter,
  format = DEFAULT_FORMAT_V2,
}: {
  letter: CoverLetter;
  format?: DocumentFormatV2;
}) {
  const { data: profile } = useProfile();
  const { data: settings } = useSettings();

  // usePDF must never be called with a document assembled from partial data,
  // so the react-pdf render only mounts once profile + paper are in hand.
  return (
    <div className="letter-preview">
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
    </div>
  );
}
