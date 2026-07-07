// Pure react-pdf render entrypoint (spec.md §28, §31). Deterministic: same
// resume/profile/paper/format/density ⇒ the same document element ⇒ the same
// bytes — formatting never mutates the stored TailoredResume (§28.1).
//
// §31/E9-F0d1: THE ONE ENGINE is the only render path — this module is now a
// thin, browser/Node-dual wrapper around EngineDocument (./engine), never a
// per-template dispatch. `format` is DocumentFormatV2; `density` (§28.4) is a
// per-render sibling of format, never baked into a scaled copy of it (unlike
// v1's applyDensity) — EngineDocument itself applies the ladder internally.

import { pdf, renderToBuffer } from "@react-pdf/renderer";
import type { Profile, TailoredResume } from "@shared/types";
import { DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import { registerDocumentFonts } from "./fonts";
import { EngineDocument, type EngineDensity } from "./engine";
import type { Paper } from "./registry";

export type RenderResumeArgs = {
  resume: TailoredResume;
  profile: Profile;
  paper?: Paper;
  format?: DocumentFormatV2;
  density?: EngineDensity;
};

export function renderResumeDocument({
  resume,
  profile,
  paper = "letter",
  format = DEFAULT_FORMAT_V2,
  density,
}: RenderResumeArgs) {
  registerDocumentFonts();
  return EngineDocument({ resume, profile, paper, format, density });
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
