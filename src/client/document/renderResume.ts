// Pure react-pdf render entrypoint (spec.md §28). Deterministic: same
// resume/profile/paper/templateId ⇒ the same document element ⇒ the same
// bytes — formatting never mutates the stored TailoredResume (§28.1).

import { pdf, renderToBuffer } from "@react-pdf/renderer";
import { DEFAULT_FORMAT } from "@shared/format";
import type { DocumentFormat, Profile, TailoredResume } from "@shared/types";
import { registerDocumentFonts } from "./fonts";
import { getTemplate, type Paper } from "./registry";

export type RenderResumeArgs = {
  resume: TailoredResume;
  profile: Profile;
  paper?: Paper;
  templateId?: string;
  format?: DocumentFormat;
};

export function renderResumeDocument({
  resume,
  profile,
  paper = "letter",
  templateId = "strict",
  format = DEFAULT_FORMAT,
}: RenderResumeArgs) {
  registerDocumentFonts();
  const template = getTemplate(templateId);
  return template.render({ resume, profile, paper, format });
}

export async function renderResumeToBuffer(args: RenderResumeArgs): Promise<Buffer> {
  return renderToBuffer(renderResumeDocument(args));
}

// Browser-safe counterpart to renderResumeToBuffer: @react-pdf/renderer's
// browser build stubs renderToBuffer/renderToStream/renderToFile to throw
// ("Node specific API") — pdf(doc).toBlob() is the one render entrypoint the
// browser build actually implements (same reasoning as document/download.ts
// and AtsView.tsx, which already had to solve this).
export async function renderResumeToBlob(args: RenderResumeArgs): Promise<Blob> {
  return pdf(renderResumeDocument(args)).toBlob();
}
