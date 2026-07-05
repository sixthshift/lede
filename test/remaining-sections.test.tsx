// E3-B — remaining sections render from meta when facts are empty (spec §10, §4.3).
// Ported to the react-pdf document (E7-A6): renders via renderResumeToBuffer and
// asserts against pdf.js-extracted text instead of the retired DOM ResumePage.
import { describe, it, expect } from "vitest";
import type { Entry, EntryMeta, Layout, Profile, TailorDecision } from "@shared/types";
import { SECTIONS } from "@shared/sections";
import { assemble } from "../src/server/tailor/assemble";
import { renderResumeToBuffer } from "../src/client/document/renderResume";

function entry(
  id: string,
  section: Entry["section"],
  meta: EntryMeta,
  facts: string[],
  sortKey: number,
): Entry {
  return { id, section, meta, facts, tags: [], sortKey };
}

function decisionFor(entries: Entry[]): TailorDecision {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "Summary.",
    items: entries.map((e, i) => ({ entryId: e.id, text: `MODEL_TEXT_${e.id}`, rank: i + 1 })),
    cut: [],
  };
}

function layoutFor(sections: Layout[number]["section"][]): Layout {
  return sections.map((section) => ({ section, enabled: true }));
}

function profileFixture(): Profile {
  return {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    links: [],
  };
}

async function extractText(buffer: Buffer): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
}

describe("remaining sections — coverage (§10)", () => {
  it("renders one entry of each remaining section under its registry label", async () => {
    const entries = [
      entry(
        "award1",
        "award",
        { section: "award", title: "Employee of the Year", issuer: "Acme" },
        ["Recognized for shipping"],
        202301,
      ),
      entry(
        "cert1",
        "certification",
        { section: "certification", name: "AWS Certified Solutions Architect", issuer: "AWS" },
        ["AWS Certified Solutions Architect"],
        202401,
      ),
      entry(
        "pub1",
        "publication",
        { section: "publication", title: "Scaling Systems", venue: "ACM" },
        ["Scaling Systems"],
        202101,
      ),
      entry("interest1", "interest", { section: "interest" }, ["Woodworking"], 202001),
      entry("lang1", "language", { section: "language", level: "fluent" }, ["Spanish"], 202001),
      entry(
        "ref1",
        "reference",
        { section: "reference", name: "Jane Smith", relationship: "Manager" },
        [],
        202201,
      ),
    ];
    const layout = layoutFor([
      "award",
      "certification",
      "publication",
      "interest",
      "language",
      "reference",
    ]);
    const resume = assemble(decisionFor(entries), entries, layout);
    const buffer = await renderResumeToBuffer({ resume, profile: profileFixture() });
    const text = await extractText(buffer);

    // Section labels render through sections.tsx's textTransform:"uppercase"
    // style, which react-pdf bakes into the PDF's actual text runs (unlike
    // CSS, there is no separate visual-only transform) — compare
    // case-insensitively so the assertion targets the label, not its case.
    const upperText = text.toUpperCase();
    for (const section of [
      "award",
      "certification",
      "publication",
      "interest",
      "language",
      "reference",
    ] as const) {
      expect(upperText).toContain(SECTIONS[section].label.toUpperCase());
    }
  });
});

describe("remaining sections — meta fallback for empty facts (§4.3, gameable-resistant)", () => {
  it("renders a certification with empty facts from its meta, not blank", async () => {
    const entries = [
      entry(
        "cert2",
        "certification",
        {
          section: "certification",
          name: "AWS Certified Cloud Practitioner",
          issuer: "Amazon Web Services",
        },
        [],
        202401,
      ),
    ];
    const layout = layoutFor(["certification"]);
    const resume = assemble(decisionFor(entries), entries, layout);
    const buffer = await renderResumeToBuffer({ resume, profile: profileFixture() });
    const text = await extractText(buffer);

    expect(text).toContain("AWS Certified Cloud Practitioner");
    expect(text).toContain("Amazon Web Services");
  });

  it("renders a reference with empty facts from its meta, not blank", async () => {
    const entries = [
      entry(
        "ref2",
        "reference",
        { section: "reference", name: "Jane Smith", relationship: "Manager" },
        [],
        202201,
      ),
    ];
    const layout = layoutFor(["reference"]);
    const resume = assemble(decisionFor(entries), entries, layout);
    const buffer = await renderResumeToBuffer({ resume, profile: profileFixture() });
    const text = await extractText(buffer);

    expect(text).toContain("Jane Smith");
  });

  it("still renders facts verbatim when present (no regression for rephrase:'none')", async () => {
    const entries = [
      entry(
        "cert3",
        "certification",
        { section: "certification", name: "Should Not Appear" },
        ["Verbatim Fact Text"],
        202401,
      ),
    ];
    const layout = layoutFor(["certification"]);
    const resume = assemble(decisionFor(entries), entries, layout);
    const buffer = await renderResumeToBuffer({ resume, profile: profileFixture() });
    const text = await extractText(buffer);

    expect(text).toContain("Verbatim Fact Text");
    expect(text).not.toContain("Should Not Appear");
  });

  it("leaves rephrase:'full'/'light' sections rendering the model's text unchanged", async () => {
    const entries = [
      entry(
        "exp1",
        "experience",
        { section: "experience", company: "Acme", role: "Eng", period: "2020-2023" },
        ["did a thing"],
        202301,
      ),
    ];
    const layout = layoutFor(["experience"]);
    const resume = assemble(decisionFor(entries), entries, layout);
    const buffer = await renderResumeToBuffer({ resume, profile: profileFixture() });
    const text = await extractText(buffer);

    expect(text).toContain("MODEL_TEXT_exp1");
  });
});
