// @vitest-environment jsdom
// ResultView split — ResumePage | ReasoningPanel (ticket E3-A, spec.md §11/§10).
// RED-TEAM focus: reasoning strings (leadRationale, cut reasons) must never
// enter the .resume-page (print-target) subtree, by DOM absence — not
// display:none. A panel nested inside ResumePage must fail this.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { TailoredResume } from "@shared/types";
import { ResultView } from "../src/client/components/ResultView";
import { ReasoningPanel } from "../src/client/components/ReasoningPanel";
import { WeightBar } from "../src/client/components/WeightBar";
import { CutList } from "../src/client/components/CutList";

afterEach(cleanup);

function fixture(): TailoredResume {
  return {
    signals: {
      roleLevel: "SIGNAL_ROLE_LEVEL_STAFF",
      weights: ["SIGNAL_WEIGHT_ALPHA", "SIGNAL_WEIGHT_BETA", "SIGNAL_WEIGHT_GAMMA"],
      hardRequirements: ["SIGNAL_HARDREQ_ONE"],
    },
    summary: "A track record of shipping backend systems.",
    sections: [
      {
        section: "project",
        groups: [
          {
            heading: "cloudcase-platform-sdk",
            leadRationale: "SENTINEL_RATIONALE_PROJECT",
            items: [
              { entryId: "p1", text: "PROJECT_ITEM_ONE" },
              { entryId: "p2", text: "PROJECT_ITEM_TWO" },
            ],
          },
        ],
      },
      {
        section: "experience",
        groups: [
          {
            heading: "Acme · Engineer · 2020-2023",
            leadRationale: "SENTINEL_RATIONALE_EXPERIENCE",
            items: [
              { entryId: "e1", text: "EXPERIENCE_ITEM_ONE" },
              { entryId: "e2", text: "EXPERIENCE_ITEM_TWO" },
            ],
          },
        ],
      },
    ],
    cut: [
      { entryId: "c1", reason: "SENTINEL_CUT_REASON_ONE" },
      { entryId: "c2", reason: "SENTINEL_CUT_REASON_TWO" },
    ],
  };
}

describe("WeightBar", () => {
  it("renders roleLevel, each weight in order, and hardRequirements", () => {
    const resume = fixture();
    render(<WeightBar signals={resume.signals} />);

    expect(screen.getByText("SIGNAL_ROLE_LEVEL_STAFF")).toBeInTheDocument();
    expect(screen.getByText("SIGNAL_HARDREQ_ONE")).toBeInTheDocument();

    const html = document.body.innerHTML;
    const alphaIdx = html.indexOf("SIGNAL_WEIGHT_ALPHA");
    const betaIdx = html.indexOf("SIGNAL_WEIGHT_BETA");
    const gammaIdx = html.indexOf("SIGNAL_WEIGHT_GAMMA");
    expect(alphaIdx).toBeGreaterThan(-1);
    expect(betaIdx).toBeGreaterThan(alphaIdx);
    expect(gammaIdx).toBeGreaterThan(betaIdx);
  });
});

describe("CutList", () => {
  it("renders one row per cut entry with its reason", () => {
    const resume = fixture();
    render(<CutList cut={resume.cut} />);

    expect(screen.getByText("SENTINEL_CUT_REASON_ONE")).toBeInTheDocument();
    expect(screen.getByText("SENTINEL_CUT_REASON_TWO")).toBeInTheDocument();
  });
});

describe("ReasoningPanel", () => {
  it("renders signals via WeightBar, each group's leadRationale via Callout, and cut reasons via CutList", () => {
    const resume = fixture();
    render(<ReasoningPanel resume={resume} />);

    expect(screen.getByText("SIGNAL_ROLE_LEVEL_STAFF")).toBeInTheDocument();
    expect(screen.getByText("SIGNAL_WEIGHT_ALPHA")).toBeInTheDocument();
    expect(screen.getByText("SIGNAL_HARDREQ_ONE")).toBeInTheDocument();
    expect(screen.getByText("SENTINEL_RATIONALE_PROJECT")).toBeInTheDocument();
    expect(screen.getByText("SENTINEL_RATIONALE_EXPERIENCE")).toBeInTheDocument();
    expect(screen.getByText("SENTINEL_CUT_REASON_ONE")).toBeInTheDocument();
    expect(screen.getByText("SENTINEL_CUT_REASON_TWO")).toBeInTheDocument();
  });
});

describe("ResultView", () => {
  it("renders both ResumePage and ReasoningPanel as siblings", () => {
    const { container } = render(<ResultView resume={fixture()} />);

    const resumePage = container.querySelector(".resume-page");
    const reasoningPanel = container.querySelector(".reasoning-panel");
    expect(resumePage).toBeTruthy();
    expect(reasoningPanel).toBeTruthy();

    // sibling, never nested: neither contains the other
    expect(resumePage!.contains(reasoningPanel!)).toBe(false);
    expect(reasoningPanel!.contains(resumePage!)).toBe(false);
  });

  it("CONTRAST: leadRationale and cut reasons are DOM-absent from .resume-page, present in the reasoning subtree", () => {
    const { container } = render(<ResultView resume={fixture()} />);

    const resumePage = container.querySelector(".resume-page")!;
    const reasoningPanel = container.querySelector(".reasoning-panel")!;

    const sentinels = [
      "SENTINEL_RATIONALE_PROJECT",
      "SENTINEL_RATIONALE_EXPERIENCE",
      "SENTINEL_CUT_REASON_ONE",
      "SENTINEL_CUT_REASON_TWO",
    ];

    for (const sentinel of sentinels) {
      expect(resumePage.textContent).not.toContain(sentinel);
      expect(reasoningPanel.textContent).toContain(sentinel);
    }
  });
});

describe("print.css (§11 reasoning never on paper)", () => {
  it("hides .reasoning-panel inside @media print", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const css = await fs.readFile(
      path.resolve(__dirname, "../src/client/styles/print.css"),
      "utf-8",
    );

    const printBlockMatch = css.match(/@media\s+print\s*{([\s\S]*)}\s*$/);
    expect(printBlockMatch).toBeTruthy();
    const printBlock = printBlockMatch![1];
    expect(printBlock).toMatch(/\.reasoning-panel\s*[,{][\s\S]*display:\s*none/);
  });
});
