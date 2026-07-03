// @vitest-environment jsdom
// E3-B — remaining sections render from meta when facts are empty (spec §10, §4.3).
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Entry, EntryMeta, Layout, TailorDecision } from "@shared/types";
import { SECTIONS } from "@shared/sections";
import { assemble } from "../src/server/tailor/assemble";
import { ResumePage } from "../src/client/components/ResumePage";

afterEach(cleanup);

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

describe("remaining sections — coverage (§10)", () => {
  it("renders one entry of each remaining section under its registry label", () => {
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
    render(<ResumePage resume={resume} />);

    for (const section of [
      "award",
      "certification",
      "publication",
      "interest",
      "language",
      "reference",
    ] as const) {
      expect(screen.getByText(SECTIONS[section].label)).toBeInTheDocument();
    }
  });
});

describe("remaining sections — meta fallback for empty facts (§4.3, gameable-resistant)", () => {
  it("renders a certification with empty facts from its meta, not blank", () => {
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
    render(<ResumePage resume={resume} />);

    expect(screen.getByText(/AWS Certified Cloud Practitioner/)).toBeInTheDocument();
    expect(screen.getByText(/Amazon Web Services/)).toBeInTheDocument();
  });

  it("renders a reference with empty facts from its meta, not blank", () => {
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
    render(<ResumePage resume={resume} />);

    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it("still renders facts verbatim when present (no regression for rephrase:'none')", () => {
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
    render(<ResumePage resume={resume} />);

    expect(screen.getByText("Verbatim Fact Text")).toBeInTheDocument();
    expect(screen.queryByText(/Should Not Appear/)).not.toBeInTheDocument();
  });

  it("leaves rephrase:'full'/'light' sections rendering the model's text unchanged", () => {
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
    render(<ResumePage resume={resume} />);

    expect(screen.getByText("MODEL_TEXT_exp1")).toBeInTheDocument();
  });
});
