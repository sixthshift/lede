// Download PDF action — spec.md §28/§11 (ticket E7-A5). pdfFilename is a
// pure slugging function; the metadata check confirms renderResumeToBuffer's
// react-pdf Document carries title/author sourced from the profile (never
// browser-printed — §28.0).
import { describe, expect, it } from "vitest";
import type { Profile, TailoredResume } from "@shared/types";
import { pdfFilename } from "../src/client/document/download";
import { renderResumeToBuffer } from "../src/client/document/renderResume";

function profileFixture(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    links: [],
    ...overrides,
  };
}

function resumeFixture(): TailoredResume {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "Summary.",
    sections: [],
    cut: [],
  };
}

describe("pdfFilename", () => {
  it("slugs {name, company, role} into '<Name> — <Company> — <Role>.pdf' (exact string)", () => {
    expect(
      pdfFilename({ name: "Ada Lovelace", company: "Acme Corp", role: "Staff Engineer" }),
    ).toBe("Ada Lovelace — Acme Corp — Staff Engineer.pdf");
  });

  it("a distinct input yields a different filename", () => {
    const a = pdfFilename({ name: "Ada Lovelace", company: "Acme Corp", role: "Staff Engineer" });
    const b = pdfFilename({ name: "Grace Hopper", company: "Navy", role: "Rear Admiral" });
    expect(a).not.toBe(b);
  });

  it("strips filesystem-illegal characters from each segment", () => {
    expect(pdfFilename({ name: "A/B\\C", company: 'D:E*F?"G<H>I|J', role: "K" })).toBe(
      "ABC — DEFGHIJ — K.pdf",
    );
  });

  it("omits missing company/role segments", () => {
    expect(pdfFilename({ name: "Ada Lovelace" })).toBe("Ada Lovelace.pdf");
  });
});

describe("renderResumeToBuffer PDF metadata", () => {
  it("Title and Author land in the PDF metadata from the profile", async () => {
    const profile = profileFixture({ name: "Jordan Rivera" });
    const buffer = await renderResumeToBuffer({ resume: resumeFixture(), profile });

    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
    const { info } = await doc.getMetadata();

    expect((info as { Title?: string }).Title).toBe(profile.name);
    expect((info as { Author?: string }).Author).toBe(profile.name);
  });
});
