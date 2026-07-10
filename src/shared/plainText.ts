// Plain-text export (spec.md §11/§28.6) — the same content the document
// renders, in TailoredResume order, as flat text suitable for pasting into
// an application form field. leadRationale/cut[] are reasoning UI ONLY and
// never appear on the document (§11) — this function only ever reads
// profile/summary/section items, so there is nothing to filter out; the
// exclusion is structural, not a filter step.
//
// Lives in shared (not client/document) because the flag-voice route
// (T42) needs the SAME function server-side to freeze a resume's voice
// source byte-identical to what the client shows as "what the ATS sees" —
// the server has no @client alias, so this is the shared home both sides
// import from.

import type { Profile, TailoredResume } from "@shared/types";

function profileHeaderLines(profile: Profile): string[] {
  const lines = [profile.name];
  if (profile.headline) lines.push(profile.headline);
  const contact = [profile.email, profile.phone, profile.location].filter(Boolean);
  if (contact.length) lines.push(contact.join(" · "));
  for (const link of profile.links) lines.push(link.url);
  return lines;
}

export function plainText(resume: TailoredResume, profile: Profile): string {
  const lines: string[] = [...profileHeaderLines(profile), "", resume.summary];

  for (const section of resume.sections) {
    for (const group of section.groups) {
      for (const item of group.items) {
        lines.push(item.text);
      }
    }
  }

  return lines.join("\n");
}
