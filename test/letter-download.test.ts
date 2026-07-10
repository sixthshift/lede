// @vitest-environment jsdom
// letterPdfFilename mirrors download.test.ts's pdfFilename four-case
// structure (exact string / distinct input / illegal chars+diacritics /
// omitted segments), plus a property test proving it's derived from
// pdfFilename (shared sanitizer) rather than a second, parallel one.
// downloadLetterPdf mirrors downloadResumePdf but must call the letter's
// own render path (renderLetterToBlob), never the resume's.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoverLetter, Profile } from "@shared/types";
import { downloadLetterPdf, letterPdfFilename, pdfFilename } from "../src/client/document/download";
import * as renderResumeModule from "../src/client/document/renderResume";

vi.mock("../src/client/document/renderLetter", () => ({
  renderLetterToBlob: vi.fn(async () => new Blob(["pdf-bytes"], { type: "application/pdf" })),
}));

import { renderLetterToBlob } from "../src/client/document/renderLetter";

function profileFixture(overrides: Partial<Profile> = {}): Profile {
  return { name: "Ada Lovelace", email: "ada@example.com", links: [], ...overrides };
}

function letterFixture(): CoverLetter {
  return {
    greeting: "Dear Hiring Manager,",
    body: [{ text: "Body paragraph.", groundedOn: [] }],
    closing: "Sincerely,",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("letterPdfFilename", () => {
  it("slugs {name, company, role} into '<Name> — <Company> — <Role> — Cover Letter.pdf' (exact string)", () => {
    expect(letterPdfFilename("Ada Lovelace", "Acme Corp", "Staff Engineer")).toBe(
      "Ada Lovelace — Acme Corp — Staff Engineer — Cover Letter.pdf",
    );
  });

  it("a distinct input yields a different filename", () => {
    const a = letterPdfFilename("Ada Lovelace", "Acme Corp", "Staff Engineer");
    const b = letterPdfFilename("Grace Hopper", "Navy", "Rear Admiral");
    expect(a).not.toBe(b);
  });

  it("strips filesystem-illegal characters and diacritics from each segment", () => {
    expect(letterPdfFilename("A/B\\C", 'D:E*F?"G<H>I|J', "Ké")).toBe(
      "ABC — DEFGHIJ — Ke — Cover Letter.pdf",
    );
  });

  it("omits missing company/role segments", () => {
    expect(letterPdfFilename("Ada Lovelace")).toBe("Ada Lovelace — Cover Letter.pdf");
  });
});

describe("letterPdfFilename vs pdfFilename", () => {
  it("stripping ' — Cover Letter' reproduces pdfFilename's output for the same inputs", () => {
    const inputs = { name: "Ada Lovelace", company: "Acme Corp", role: "Staff Engineer" };
    const letterName = letterPdfFilename(inputs.name, inputs.company, inputs.role);
    expect(letterName.replace(" — Cover Letter.pdf", ".pdf")).toBe(pdfFilename(inputs));
  });
});

describe("downloadLetterPdf", () => {
  it("calls renderLetterToBlob (not renderResumeToBlob) and sets anchor .download to letterPdfFilename(...)", async () => {
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });
    const resumeBlobSpy = vi.spyOn(renderResumeModule, "renderResumeToBlob");

    const link = { href: "", download: "", click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(link);

    const letter = letterFixture();
    const profile = profileFixture();
    const args = {
      letter,
      profile,
      company: "Acme Corp",
      role: "Staff Engineer",
      paper: "letter" as const,
    };

    await downloadLetterPdf(args);

    expect(renderLetterToBlob).toHaveBeenCalledWith(
      expect.objectContaining({ letter, profile, paper: "letter" }),
    );
    expect(resumeBlobSpy).not.toHaveBeenCalled();
    expect(link.download).toBe(letterPdfFilename(profile.name, "Acme Corp", "Staff Engineer"));
    expect(link.click).toHaveBeenCalledTimes(1);
  });
});
