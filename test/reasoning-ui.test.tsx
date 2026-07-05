// @vitest-environment jsdom
// ResultView split — DocumentPreview | ReasoningPanel (ticket E3-A, updated
// E7-A4, spec.md §11/§28.0). RED-TEAM focus: reasoning strings (leadRationale,
// cut reasons) must never enter the rendered-document (print-target) subtree,
// by DOM absence — not display:none. A panel nested inside the preview must
// fail this.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Profile, TailoredResume } from "@shared/types";
import { ResultView } from "../src/client/components/ResultView";
import { ReasoningPanel } from "../src/client/components/ReasoningPanel";
import { WeightBar } from "../src/client/components/WeightBar";
import { CutList } from "../src/client/components/CutList";
import type { SettingsResponse } from "../src/client/api";

// DocumentPreview's real render (usePDF -> pdf.js canvas) needs a browser
// bundle/worker vitest's jsdom env doesn't provide (§28.0's real coverage is
// the playwright applications e2e) — stubbed to its documented loading shape
// so ResultView can mount here.
vi.mock("@react-pdf/renderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@react-pdf/renderer")>();
  return {
    ...actual,
    usePDF: () => [{ loading: true, blob: null, url: null, error: null }, vi.fn()],
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function profileFixture(): Profile {
  return { name: "Jordan Rivera", email: "jordan@example.com", links: [] };
}

function settingsFixture(): SettingsResponse {
  return {
    keySet: false,
    provider: "anthropic",
    model: "claude-opus-4-8",
    baseUrl: null,
    layout: [],
    paper: "letter",
  };
}

function renderResultView(resume: TailoredResume) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/profile") {
        return new Response(JSON.stringify(profileFixture()), { status: 200 });
      }
      if (url === "/api/settings") {
        return new Response(JSON.stringify(settingsFixture()), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResultView resume={resume} />
    </QueryClientProvider>,
  );
}

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
  it("renders both DocumentPreview and ReasoningPanel as siblings, never the legacy .resume-page", async () => {
    const { container } = renderResultView(fixture());

    const preview = await waitFor(() => {
      const el = container.querySelector(".document-preview");
      expect(el).toBeTruthy();
      return el!;
    });
    const reasoningPanel = container.querySelector(".reasoning-panel");
    expect(reasoningPanel).toBeTruthy();
    expect(container.querySelector(".resume-page")).toBeFalsy();

    // sibling, never nested: neither contains the other
    expect(preview.contains(reasoningPanel!)).toBe(false);
    expect(reasoningPanel!.contains(preview)).toBe(false);
  });

  it("CONTRAST: leadRationale and cut reasons are DOM-absent from the preview, present in the reasoning subtree", async () => {
    const { container } = renderResultView(fixture());

    const preview = await waitFor(() => {
      const el = container.querySelector(".document-preview");
      expect(el).toBeTruthy();
      return el!;
    });
    const reasoningPanel = container.querySelector(".reasoning-panel")!;

    const sentinels = [
      "SENTINEL_RATIONALE_PROJECT",
      "SENTINEL_RATIONALE_EXPERIENCE",
      "SENTINEL_CUT_REASON_ONE",
      "SENTINEL_CUT_REASON_TWO",
    ];

    for (const sentinel of sentinels) {
      expect(preview.textContent).not.toContain(sentinel);
      expect(reasoningPanel.textContent).toContain(sentinel);
    }
  });
});
