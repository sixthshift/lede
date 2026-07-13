// @vitest-environment jsdom
// T004 — ReasoningPanel's "uncovered signals" readout (honest, non-evaluative:
// signal-coverage.ts is the shared client-safe matcher; this file only proves
// the COMPONENT wires it up right — render + hide rules + verbatim copy).
// Model: test/reasoning-ui.test.tsx (same render-with-only-a-resume-prop shape).
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { TailoredResume } from "@shared/types";
import { ReasoningPanel } from "../src/client/components/ReasoningPanel";

afterEach(() => {
  cleanup();
});

// One weight covered (shares >=4-char tokens with the lede rationale below),
// one weight NOT covered, one hard requirement covered — mirrors the real
// shared-token matching rule in signal-coverage.ts.
function resumeWithOneUncovered(): TailoredResume {
  return {
    signals: {
      roleLevel: "SIGNAL_ROLE_LEVEL_STAFF",
      weights: ["Owns distributed tracing rollout", "Leads incident response training"],
      hardRequirements: ["Kubernetes certified operations lead"],
    },
    summary: "A track record of shipping backend systems.",
    sections: [
      {
        section: "experience",
        groups: [
          {
            heading: "Acme · Engineer · 2020-2023",
            leadRationale:
              "This entry directly owns the distributed tracing rollout and includes kubernetes certified operations lead work.",
            items: [{ entryId: "e1", text: "EXPERIENCE_ITEM_ONE" }],
          },
        ],
      },
    ],
    cut: [],
  };
}

// Same two candidate signals, but the lede rationale now covers BOTH — the
// uncovered set is empty, so the section must hide (hide case a).
function resumeWithAllCovered(): TailoredResume {
  return {
    signals: {
      roleLevel: "SIGNAL_ROLE_LEVEL_STAFF",
      weights: ["Owns distributed tracing rollout"],
      hardRequirements: ["Kubernetes certified operations lead"],
    },
    summary: "A track record of shipping backend systems.",
    sections: [
      {
        section: "experience",
        groups: [
          {
            heading: "Acme · Engineer · 2020-2023",
            leadRationale:
              "This entry directly owns the distributed tracing rollout and includes kubernetes certified operations lead work.",
            items: [{ entryId: "e1", text: "EXPERIENCE_ITEM_ONE" }],
          },
        ],
      },
    ],
    cut: [],
  };
}

// Non-empty signals, but ZERO ledes (no groups anywhere) — every signal would
// read uncovered, which is the forbidden "your resume lacks X" implication;
// the section must hide (hide case b), distinct fixture from case (a).
function resumeWithNoLedes(): TailoredResume {
  return {
    signals: {
      roleLevel: "SIGNAL_ROLE_LEVEL_STAFF",
      weights: ["Owns distributed tracing rollout", "Leads incident response training"],
      hardRequirements: ["Kubernetes certified operations lead"],
    },
    summary: "A track record of shipping backend systems.",
    sections: [{ section: "experience", groups: [] }],
    cut: [],
  };
}

describe("ReasoningPanel — uncovered signals", () => {
  it("renders the uncovered-signals section listing the exact uncovered signal(s)", () => {
    const { container } = render(<ReasoningPanel resume={resumeWithOneUncovered()} />);

    expect(screen.getByText(/no lede addresses/i)).toBeInTheDocument();

    // Scoped to the uncovered section's own text — WeightBar (elsewhere in
    // the panel) renders every candidate signal regardless of coverage, so
    // checking textContent here (rather than an unscoped screen query)
    // distinguishes "listed as uncovered" from "merely present in the panel."
    const uncoveredSection = container.querySelector(".reasoning-panel__uncovered");
    expect(uncoveredSection).toBeTruthy();
    expect(uncoveredSection!.textContent).toContain("Leads incident response training");
    // The covered weight/hard-requirement must NOT appear under the uncovered copy.
    expect(uncoveredSection!.textContent).not.toContain("Owns distributed tracing rollout");
    expect(uncoveredSection!.textContent).not.toContain("Kubernetes certified operations lead");
  });

  it("hides the section when every candidate signal is covered", () => {
    render(<ReasoningPanel resume={resumeWithAllCovered()} />);

    expect(screen.queryByText(/no lede addresses/i)).not.toBeInTheDocument();
  });

  it("hides the section when the resume has zero ledes, even with uncovered signals", () => {
    render(<ReasoningPanel resume={resumeWithNoLedes()} />);

    expect(screen.queryByText(/no lede addresses/i)).not.toBeInTheDocument();
  });
});
