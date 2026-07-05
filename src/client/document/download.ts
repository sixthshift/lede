// Download PDF action (spec.md §28/§11). PDFs come ONLY from
// @react-pdf/renderer — the same render used for preview, never browser
// printing (§28.0). Filenames are slugged for filesystem safety using the
// same normalization approach as src/server/slug.ts (NFKD, strip
// diacritics), but keep case/spacing so the file reads as a name, not an id.

import type { Profile } from "@shared/types";
import { renderResumeToBuffer, type RenderResumeArgs } from "./renderResume";

const COMBINING_DIACRITICS = /[̀-ͯ]/g;
const ILLEGAL_FILENAME_CHARS = /[/\\:*?"<>|]/g;

function sanitizeSegment(value: string): string {
  return value
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(ILLEGAL_FILENAME_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type PdfFilenameInput = { name: string; company?: string; role?: string };

export function pdfFilename({ name, company, role }: PdfFilenameInput): string {
  const segments = [name, company, role]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(sanitizeSegment)
    .filter(Boolean);
  return `${segments.join(" — ")}.pdf`;
}

export type DownloadResumePdfArgs = RenderResumeArgs & {
  profile: Profile;
  company?: string;
  role?: string;
};

export async function downloadResumePdf(args: DownloadResumePdfArgs): Promise<void> {
  const buffer = await renderResumeToBuffer(args);
  const blob = new Blob([new Uint8Array(buffer)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = pdfFilename({ name: args.profile.name, company: args.company, role: args.role });
  link.click();
  URL.revokeObjectURL(url);
}
