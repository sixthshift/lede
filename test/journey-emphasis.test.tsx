// @vitest-environment jsdom
// T002 — ApplicationDetail wired onto the journey resolver (journey-stage.ts,
// T001, frozen). Covers: stage-driven defaults (setup vs review contrast),
// muted header/rail-row treatment as a REAL computed style (not a bare data
// attribute), and "muted is never a gate" — a muted collapsed header still
// expands on click. Store-purity and override precedence get their FULL
// proof in test/e2e/journey.spec.ts (real localStorage, real reload); this
// file only needs enough of a fixture to render ApplicationDetail standalone,
// same pattern as test/applications-ui.test.tsx / application-detail-design.test.tsx.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Application, Profile, TailoredResume } from "@shared/types";

import { ApplicationDetail } from "../src/client/components/ApplicationDetail";
import type { SettingsResponse } from "../src/client/api";

vi.mock("@react-pdf/renderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@react-pdf/renderer")>();
  return {
    ...actual,
    usePDF: () => [{ loading: true, blob: null, url: null, error: null }, vi.fn()],
  };
});

// jsdom applies no real Tailwind cascade (no compiled CSS is ever loaded into
// its DOM) — a bare className check would just be re-asserting the same
// string the component already asserts, not a computed style. This injects
// the ONE utility rule under test (Tailwind's own `.opacity-50`, ripped
// verbatim rather than hand-picked) so getComputedStyle reports a REAL,
// distinct opacity, same minimal-stylesheet convention as
// test/ui-foundation.test.tsx's F109 suite.
beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = ".opacity-50 { opacity: 0.5; }";
  document.head.appendChild(style);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function resumeFixture(): TailoredResume {
  return {
    signals: { roleLevel: "staff", weights: [], hardRequirements: [] },
    summary: "SENTINEL",
    sections: [
      {
        section: "experience",
        groups: [{ heading: "Acme · Engineer", items: [{ entryId: "e1", text: "Shipped." }] }],
      },
    ],
    cut: [],
  };
}

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

function applicationFixture(overrides: Partial<Application>): Application {
  return {
    id: "app-1",
    company: "Acme",
    role: "Staff Engineer",
    jobDescription: "We need someone who can ship.",
    context: undefined,
    targetPages: 1,
    format: null,
    current: null,
    locked: null,
    lockedFormat: null,
    genState: "untailored",
    currentMeta: null,
    letterCurrent: null,
    letterPrevious: null,
    letterGenState: "untailored",
    letterFailedReason: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Application;
}

function mockFetch(app: Application) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/profile") {
      return new Response(JSON.stringify(profileFixture()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (method === "GET" && url === "/api/settings") {
      return new Response(JSON.stringify(settingsFixture()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (method === "GET" && url === "/api/entries") {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (method === "GET" && url.startsWith("/api/applications/")) {
      return new Response(JSON.stringify(app), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderDetail(app: Application) {
  mockFetch(app);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/applications/${app.id}`]}>
        <ApplicationDetail applicationId={app.id} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Section headers: `workspace-section-header-<key>`. Rail rows:
// `rail-nav-<key>`. Both computed-style checks read opacity directly rather
// than inspecting className, per the ticket's "computed-style real" bar.
function opacityOf(el: Element): number {
  const raw = getComputedStyle(el).opacity;
  // jsdom leaves the property unset (empty string) rather than filling in
  // CSS's own initial value (1) when no rule matches — treat unset as the
  // real default rather than as 0.
  return raw === "" ? 1 : Number(raw);
}

describe("journey-driven section emphasis (T002)", () => {
  it("setup: Letter + Design headers are muted (opacity<1), differing from Job's own header in the same render", async () => {
    const app = applicationFixture({ id: "setup-1", genState: "untailored", current: null });
    renderDetail(app);

    const jobHeader = await screen.findByTestId("workspace-section-header-job");
    const letterHeader = screen.getByTestId("workspace-section-header-letter");
    const designHeader = screen.getByTestId("workspace-section-header-design");

    const jobOpacity = opacityOf(jobHeader);
    const letterOpacity = opacityOf(letterHeader);
    const designOpacity = opacityOf(designHeader);

    expect(jobOpacity).toBe(1);
    expect(letterOpacity).toBeLessThan(1);
    expect(designOpacity).toBeLessThan(1);
    expect(letterOpacity).not.toBe(jobOpacity);
    expect(designOpacity).not.toBe(jobOpacity);
  });

  it("review: Job collapsed, Letter+Design expanded, and all three headers share the SAME (unmuted) computed style", async () => {
    const app = applicationFixture({
      id: "review-1",
      genState: "tailored",
      current: resumeFixture(),
    });
    renderDetail(app);

    const jobHeader = await screen.findByTestId("workspace-section-header-job");
    const letterHeader = screen.getByTestId("workspace-section-header-letter");
    const designHeader = screen.getByTestId("workspace-section-header-design");

    expect(opacityOf(jobHeader)).toBe(1);
    expect(opacityOf(letterHeader)).toBe(1);
    expect(opacityOf(designHeader)).toBe(1);

    expect(screen.getByTestId("section-collapse-job")).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("section-collapse-letter")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("section-collapse-design")).toHaveAttribute("aria-expanded", "true");
  });

  it("rail rows mirror the same directional contrast: unmuted Job in setup, all equal post-review", async () => {
    const setupApp = applicationFixture({ id: "setup-2", genState: "untailored", current: null });
    const { unmount } = renderDetail(setupApp);

    await screen.findByTestId("workspace-section-header-job");
    const jobRow = screen.getByTestId("rail-nav-job");
    const letterRow = screen.getByTestId("rail-nav-letter");
    const designRow = screen.getByTestId("rail-nav-design");

    expect(opacityOf(jobRow)).toBe(1);
    expect(opacityOf(letterRow)).toBeLessThan(1);
    expect(opacityOf(designRow)).toBeLessThan(1);

    unmount();

    const reviewApp = applicationFixture({
      id: "review-2",
      genState: "tailored",
      current: resumeFixture(),
    });
    renderDetail(reviewApp);

    await screen.findByTestId("workspace-section-header-job");
    const jobRow2 = screen.getByTestId("rail-nav-job");
    const letterRow2 = screen.getByTestId("rail-nav-letter");
    const designRow2 = screen.getByTestId("rail-nav-design");

    expect(opacityOf(jobRow2)).toBe(1);
    expect(opacityOf(letterRow2)).toBe(1);
    expect(opacityOf(designRow2)).toBe(1);
  });

  it("muted is never a gate: clicking a muted collapsed Letter header in setup expands it", async () => {
    const app = applicationFixture({ id: "setup-3", genState: "untailored", current: null });
    renderDetail(app);

    await screen.findByTestId("workspace-section-header-job");
    const letterToggle = screen.getByTestId("section-collapse-letter");
    expect(letterToggle).toHaveAttribute("aria-expanded", "false");
    expect(opacityOf(screen.getByTestId("workspace-section-header-letter"))).toBeLessThan(1);

    fireEvent.click(letterToggle);

    await waitFor(() => {
      expect(letterToggle).toHaveAttribute("aria-expanded", "true");
    });
    // An overridden section is never muted — the click both expands AND
    // unmutes in the same render.
    expect(opacityOf(screen.getByTestId("workspace-section-header-letter"))).toBe(1);
  });
});
