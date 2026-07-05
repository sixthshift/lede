// Download PDF action (spec.md §28/§11). PDFs come ONLY from
// @react-pdf/renderer — the same render used for preview, never browser
// printing (§28.0). Filenames are slugged for filesystem safety using the
// same normalization approach as src/server/slug.ts (NFKD, strip
// diacritics), but keep case/spacing so the file reads as a name, not an id.
//
// Blob, not renderResumeToBuffer: @react-pdf/renderer's browser build stubs
// renderToBuffer/renderToStream/renderToFile to throw ("Node specific API")
// — those only work under the Node build (which is what renderResumeToBuffer
// resolves to under vitest/SSR, so it looks fine there). `pdf(doc).toBlob()`
// is the one render entrypoint the browser build actually implements, so
// this is the only browser-safe way to get this document's real bytes for a
// download the user's browser has to save.

import { pdf } from "@react-pdf/renderer";
import type { Profile, TailoredResume } from "@shared/types";
import { plainText } from "./plainText";
import { renderResumeDocument, type RenderResumeArgs } from "./renderResume";

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

function slugFilename({ name, company, role }: PdfFilenameInput, extension: string): string {
  const segments = [name, company, role]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(sanitizeSegment)
    .filter(Boolean);
  return `${segments.join(" — ")}.${extension}`;
}

export function pdfFilename(input: PdfFilenameInput): string {
  return slugFilename(input, "pdf");
}

export function textFilename(input: PdfFilenameInput): string {
  return slugFilename(input, "txt");
}

// The browser hands a download off to its own download manager
// asynchronously after `link.click()` returns — revoking the object URL in
// the same tick can race that handoff and turn the save into a silent
// net::ERR_FILE_NOT_FOUND. A short deferral clears the handoff window without
// leaking the blob for the life of the tab.
function revokeObjectUrlSoon(url: string): void {
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type DownloadResumePdfArgs = RenderResumeArgs & {
  profile: Profile;
  company?: string;
  role?: string;
};

export async function downloadResumePdf(args: DownloadResumePdfArgs): Promise<void> {
  const blob = await pdf(renderResumeDocument(args)).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = pdfFilename({ name: args.profile.name, company: args.company, role: args.role });
  link.click();
  revokeObjectUrlSoon(url);
}

export type DownloadResumeTextArgs = {
  resume: TailoredResume;
  profile: Profile;
  company?: string;
  role?: string;
};

// Same blob+anchor pattern as downloadResumePdf, but the content is the
// plain-text derivation (plainText) rather than a react-pdf render — this
// is the "paste into an application form field" export (§11).
export function downloadResumeText({
  resume,
  profile,
  company,
  role,
}: DownloadResumeTextArgs): void {
  const text = plainText(resume, profile);
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = textFilename({ name: profile.name, company, role });
  link.click();
  revokeObjectUrlSoon(url);
}
