// Pure react-pdf render entrypoint for CoverLetter (T21, mirrors
// renderResume.ts). Deterministic: same letter/profile/paper/format ⇒ the
// same document element ⇒ the same bytes.
//
// Thin browser/Node-dual wrapper around EngineLetter (./engine/letter),
// same reasoning as renderResume.ts — the letter shares the application
// format's typography/colors (toLegacyFormat/resolveNameFont) but composes
// its own single-column layout, never EngineDocument's.

import { pdf, renderToBuffer } from "@react-pdf/renderer";
import type { CoverLetter, Profile } from "@shared/types";
import { DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import { registerDocumentFonts } from "./fonts";
import { EngineLetter } from "./engine/letter";
import type { Paper } from "./registry";

export type RenderLetterArgs = {
  letter: CoverLetter;
  profile: Profile;
  paper?: Paper;
  format?: DocumentFormatV2;
};

export function renderLetterDocument({
  letter,
  profile,
  paper = "letter",
  format = DEFAULT_FORMAT_V2,
}: RenderLetterArgs) {
  registerDocumentFonts();
  return EngineLetter({ letter, profile, paper, format });
}

export async function renderLetterToBuffer(args: RenderLetterArgs): Promise<Buffer> {
  return renderToBuffer(renderLetterDocument(args));
}

// Browser-safe counterpart — see renderResume.ts's renderResumeToBlob for why
// pdf(doc).toBlob() is the one render entrypoint the browser build implements.
export async function renderLetterToBlob(args: RenderLetterArgs): Promise<Blob> {
  return pdf(renderLetterDocument(args)).toBlob();
}
