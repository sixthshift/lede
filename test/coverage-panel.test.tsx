// @vitest-environment jsdom
// T003 acceptance (SPEC.md "Content-ATS Coverage" Phase 1): CoveragePanel's
// OWN gating (degenerate hides) and its bucket/copy/provenance honesty.
//
// Mirrors test/ats-view.test.tsx's mockFontFetch for real render→blob→
// extractPdfText extraction. Most cases use the REAL useExtractedText hook
// (via a pass-through wrapper below) so bucket logic is proven against a
// genuinely rendered PDF, not a stub. Only the "ready but empty items" case
// overrides the hook's return value directly — that state can't be reliably
// engineered by starving a real PDF of text, and useExtractedText's own
// correctness is T002's job, not this component's.
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import type { Entry, Profile, TailoredResume } from "@shared/types";
import { DEFAULT_FORMAT_V2 } from "@shared/format-v2";

let hookOverride: import("../src/client/document/useExtractedText").ExtractedTextState | null =
  null;

vi.mock("../src/client/document/useExtractedText", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/client/document/useExtractedText")>();
  return {
    ...actual,
    // Calls the real hook UNCONDITIONALLY every render (rules-of-hooks: no
    // branch skips it) and only substitutes its result for the override
    // when a test has set one — mockFontFetch is stubbed in every test
    // below (including override ones) so this background real render
    // always has real font bytes to work with, never a broken fetch.
    useExtractedText: (...args: Parameters<typeof actual.useExtractedText>) => {
      const real = actual.useExtractedText(...args);
      return hookOverride ?? real;
    },
  };
});

import { CoveragePanel } from "../src/client/components/CoveragePanel";
import { useExtractedText } from "../src/client/document/useExtractedText";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  hookOverride = null;
});

// ── font mock (verbatim rationale from ats-view.test.tsx) ──
function fontResponse(url: string): Response {
  const pathname = new URL(url).pathname;
  const bytes = readFileSync(join(process.cwd(), pathname));
  return new Response(bytes, { status: 200 });
}

function mockFontFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/node_modules/@fontsource/")) return fontResponse(url);
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

// Independently observable extraction-readiness signal, so "hides even once
// data has arrived" tests wait for a REAL settled hook state rather than
// asserting absence while still mid-load (which would pass trivially).
// Mirrors the SAME defaults CoveragePanel applies (format/paper) so the
// probe observes the exact same extraction CoveragePanel is running.
function ExtractionProbe({
  resume,
  profile,
}: Pick<Parameters<typeof useExtractedText>[0], "resume" | "profile">) {
  const state = useExtractedText({ resume, profile, format: DEFAULT_FORMAT_V2, paper: "letter" });
  return <div data-testid="probe" data-status={state.status} />;
}

function profileFixture(): Profile {
  return {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    links: [{ type: "github", label: "github.com/jordan", url: "https://github.com/jordan" }],
  };
}

// Two library entries. Only entry-alpha's facts contain "terraform" +
// "provisioning" — entry-beta is a deliberate decoy so entryIds pin to
// exactly one id, never "all entries."
function entriesFixture(): Entry[] {
  return [
    {
      id: "entry-alpha",
      section: "experience",
      meta: {
        section: "experience",
        company: "Initech",
        role: "Platform Engineer",
        period: "2020-2022",
      },
      facts: ["Owned Terraform provisioning for multi-region infrastructure."],
      tags: [],
      sortKey: 202201,
    },
    {
      id: "entry-beta",
      section: "experience",
      meta: {
        section: "experience",
        company: "Globex",
        role: "Support Engineer",
        period: "2015-2018",
      },
      facts: ["Provided customer support across time zones."],
      tags: [],
      sortKey: 201801,
    },
  ];
}

// HEALTHY fixture — hand-derived bucket outcomes (verify before trusting the
// assertions below):
// - signal "Kubernetes" (hardRequirements): the rendered item text literally
//   says "Kubernetes" → on-page → filtered out of the actionable list.
// - signal "Terraform provisioning" (weights): "terraform"/"provisioning"
//   appear nowhere in the rendered profile/summary/heading/item text, but
//   BOTH tokens appear in entry-alpha's facts → in-facts, entryIds ==
//   ["entry-alpha"] only (entry-beta's facts contain neither token).
// - raw-JD bigram "snowflake pipelines" (from the JD, stop-word-filtered,
//   not deduped against any signal): neither token appears on the page nor
//   in any entry's facts → unsupported.
function healthyResumeFixture(): TailoredResume {
  return {
    signals: {
      roleLevel: "senior",
      weights: ["Terraform provisioning"],
      hardRequirements: ["Kubernetes"],
    },
    summary: "SUMMARY_SENTINEL_TEXT describes a proven delivery record.",
    sections: [
      {
        section: "experience",
        groups: [
          {
            heading: "Acme · Staff Developer · 2020-2023",
            items: [
              {
                entryId: "resume-item-1",
                text: "Ran production workloads on Kubernetes clusters daily.",
              },
            ],
          },
        ],
      },
    ],
    cut: [],
  };
}

const HEALTHY_JD =
  "Senior platform engineer role. Kubernetes and Terraform provisioning required. Snowflake pipelines are a plus.";

// ALL-ON-PAGE fixture — every candidate token the JD/signals can produce
// ("kubernetes", "terraform", "provisioning") is present verbatim in the
// summary, so classifyCoverage buckets every row on-page → zero actionable
// rows → the panel's own "all on-page" gate must fire.
function allOnPageResumeFixture(): TailoredResume {
  return {
    signals: {
      roleLevel: "mid",
      weights: ["Terraform provisioning"],
      hardRequirements: ["Kubernetes"],
    },
    summary: "Owned Terraform infrastructure and Kubernetes provisioning end to end.",
    sections: [],
    cut: [],
  };
}

const ALL_ON_PAGE_JD = "Kubernetes and Terraform provisioning are required.";

// NO-CANDIDATES fixture — every token in this JD is in the committed
// STOP_WORDS set, and signals carry no weights/hardRequirements, so
// assembleCandidates returns []. Signals/entries/resume are otherwise
// realistic, non-empty objects — the emptiness is in the DERIVED candidate
// list, not the inputs.
function noCandidatesResumeFixture(): TailoredResume {
  return {
    signals: { roleLevel: "mid", weights: [], hardRequirements: [] },
    summary: "SUMMARY_SENTINEL_TEXT describes a proven delivery record.",
    sections: healthyResumeFixture().sections,
    cut: [],
  };
}

const NO_CANDIDATES_JD =
  "The team is looking for a strong candidate with great experience and excellent skills using our environment.";

describe("CoveragePanel — degenerate hides", () => {
  it("hides when signals+JD yield no candidates (component's own gate, not upstream emptiness)", () => {
    mockFontFetch();
    hookOverride = { status: "loading" }; // extraction result is irrelevant here — assert before it can matter
    const { container } = render(
      <CoveragePanel
        resume={noCandidatesResumeFixture()}
        profile={profileFixture()}
        jd={NO_CANDIDATES_JD}
        entries={entriesFixture()}
      />,
    );
    expect(container.querySelector('[data-testid="coverage-panel"]')).toBeNull();
  });

  it("hides when extraction errors", async () => {
    // useExtractedText's own error path (a fetch rejection inside the
    // render→blob chain) is T002's concern; @react-pdf/renderer's font
    // loading tolerates a rejected font fetch by falling back rather than
    // rejecting the whole render, so a genuine error state can't be forced
    // through the real pipeline here. This test isolates CoveragePanel's
    // OWN branch on the hook's documented `{ status: "error" }` shape.
    mockFontFetch();
    hookOverride = { status: "error" };
    const { container } = render(
      <CoveragePanel
        resume={healthyResumeFixture()}
        profile={profileFixture()}
        jd={HEALTHY_JD}
        entries={entriesFixture()}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-testid="coverage-panel"]')).toBeNull();
    });
  });

  it("hides when extraction is ready but items are empty/whitespace", async () => {
    mockFontFetch();
    hookOverride = { status: "ready", items: ["   ", ""] };
    const { container } = render(
      <CoveragePanel
        resume={healthyResumeFixture()}
        profile={profileFixture()}
        jd={HEALTHY_JD}
        entries={entriesFixture()}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-testid="coverage-panel"]')).toBeNull();
    });
  });

  it("hides when candidates+extraction are healthy but every row lands on-page", async () => {
    mockFontFetch();
    const resume = allOnPageResumeFixture();
    const profile = profileFixture();
    const { container } = render(
      <>
        <CoveragePanel
          resume={resume}
          profile={profile}
          jd={ALL_ON_PAGE_JD}
          entries={entriesFixture()}
        />
        <ExtractionProbe resume={resume} profile={profile} />
      </>,
    );
    // Wait for extraction to genuinely settle before trusting the absence —
    // otherwise "still loading" would pass this assertion for free.
    await waitFor(() => {
      expect(screen.getByTestId("probe")).toHaveAttribute("data-status", "ready");
    });
    expect(container.querySelector('[data-testid="coverage-panel"]')).toBeNull();
  });
});

describe("CoveragePanel — healthy shows (real bucket logic)", () => {
  it("in-facts names the grounding entry's human label; unsupported states the fabrication boundary; on-page terms are absent; provenance is legible", async () => {
    mockFontFetch();
    const entries = entriesFixture();
    const { container } = render(
      <CoveragePanel
        resume={healthyResumeFixture()}
        profile={profileFixture()}
        jd={HEALTHY_JD}
        entries={entries}
      />,
    );

    const panel = await waitFor(() => {
      const el = container.querySelector('[data-testid="coverage-panel"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });

    // On-page signal ("Kubernetes") never appears — the specific-flip
    // discriminator: a hardcoded/always-render impl can't distinguish this
    // from the in-facts/unsupported rows below.
    expect(panel.textContent).not.toContain("Kubernetes");

    // in-facts: the specific signal "Terraform provisioning" is grounded to
    // entry-alpha, named by its HUMAN label — never the raw id slug.
    const inFactsRow = panel.querySelector('[data-term="Terraform provisioning"]');
    expect(inFactsRow).toBeTruthy();
    expect(inFactsRow!.getAttribute("data-bucket")).toBe("in-facts");
    expect(inFactsRow!.getAttribute("data-provenance")).toBe("signal");
    expect(inFactsRow!.textContent).toContain("Initech · Platform Engineer");
    expect(panel.textContent).not.toContain("entry-alpha");
    expect(panel.textContent).not.toContain("entry-beta"); // decoy never cited
    // signal rows carry no best-effort marker
    expect(inFactsRow!.querySelector(".coverage-panel__badge")).toBeNull();

    // unsupported: a raw-JD term absent from both the page and every
    // entry's facts, carrying the visible/accessible best-effort marker.
    const unsupportedRow = panel.querySelector('[data-term="snowflake pipelines"]');
    expect(unsupportedRow).toBeTruthy();
    expect(unsupportedRow!.getAttribute("data-bucket")).toBe("unsupported");
    expect(unsupportedRow!.getAttribute("data-provenance")).toBe("raw-jd");
    const badge = unsupportedRow!.querySelector(".coverage-panel__badge");
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toMatch(/best-effort/i);

    const unsupportedCopy =
      unsupportedRow!.querySelector(".coverage-panel__copy")!.textContent ?? "";
    expect(unsupportedCopy).toContain("No entry supports this");
    expect(unsupportedCopy).toContain("accept the gap");
    const bannedImperatives = [
      "add",
      "insert",
      "include",
      "put",
      "list",
      "attach",
      "incorporate",
      "mention",
    ];
    for (const word of bannedImperatives) {
      expect(unsupportedCopy.toLowerCase()).not.toContain(word);
    }
  });
});

describe("CoveragePanel — extraction & module neutrality (source checks)", () => {
  const source = readFileSync(
    join(process.cwd(), "src/client/components/CoveragePanel.tsx"),
    "utf8",
  );

  it("never imports/uses @react-pdf/renderer for its own content", () => {
    expect(source).not.toContain("@react-pdf/renderer");
    expect(source).not.toMatch(/<Document[\s>]/);
    expect(source).not.toMatch(/<Page[\s>]/);
  });

  it("imports classifyCoverage/assembleCandidates from @shared/content-coverage and defines no local tokenize/match", () => {
    expect(source).toMatch(/from ["']@shared\/content-coverage["']/);
    expect(source).toContain("assembleCandidates");
    expect(source).toContain("classifyCoverage");
    expect(source).not.toMatch(/function\s+tokenize\s*\(/);
    expect(source).not.toMatch(/function\s+matchesText\s*\(/);
  });
});
