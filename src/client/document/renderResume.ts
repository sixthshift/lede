// Pure react-pdf render entrypoint (spec.md §28). Deterministic: same
// resume/profile/paper/templateId ⇒ the same document element ⇒ the same
// bytes — formatting never mutates the stored TailoredResume (§28.1).

import { renderToBuffer } from "@react-pdf/renderer";
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
