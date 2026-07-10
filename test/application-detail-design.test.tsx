// @vitest-environment jsdom
// ApplicationDetail's Design card — v3-T012 folded the former dedicated
// design view (E9-F1a, spec.md §28.3) into this workspace card instead of a
// separate /applications/:id/design route. This file covers the THREE
// behaviors that view's own removed unit tests (test/design-view.test.tsx)
// proved and that folding must not lose: onChange DEBOUNCED before it
// reaches the network (rapid knob changes coalesce into one PUT), a locked
// application's design controls going fully read-only while the preview host
// still mounts and stays live, and an overflowing render painting one canvas
// per pdf.js page. The full e2e coverage (real pdf.js paint, deep-link
// redirect, persistence across reload) lives in test/e2e/design.spec.ts.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Application, Profile, TailoredResume } from "@shared/types";
import { DEFAULT_FORMAT_V2 } from "@shared/format-v2";

import { ApplicationDetail } from "../src/client/components/ApplicationDetail";
import type { SettingsResponse } from "../src/client/api";

// A mutable, per-test-settable stand-in for usePDF's return shape — most
// tests want the perpetual "loading" state (DocumentPreview mounting without
// jsdom having to run a real pdf.js paint, same convention
// test/applications-ui.test.tsx uses); the multi-page test below flips this
// to "ready" with a fake url so DocumentPreview's pdf.js branch (also
// mocked, below) actually runs.
let usePdfState: { loading: boolean; url: string | null; error: unknown } = {
  loading: true,
  url: null,
  error: null,
};

vi.mock("@react-pdf/renderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@react-pdf/renderer")>();
  return {
    ...actual,
    usePDF: () => [usePdfState, vi.fn()],
  };
});

// A fake 3-page document — enough to prove DocumentPreview's allPages host
// paints ONE canvas per pdf.js page, without depending on any real resume's
// content actually overflowing in a real react-pdf layout.
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: vi.fn(async () => ({
        getViewport: () => ({ width: 120, height: 160 }),
        render: () => ({ promise: Promise.resolve() }),
      })),
    }),
  })),
}));

// Radix Select needs a few DOM APIs jsdom doesn't implement (same stubs as
// test/design-panel.test.tsx, which exercises the same primitive).
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    // @ts-expect-error jsdom stub
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    // @ts-expect-error jsdom stub
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    // @ts-expect-error jsdom stub
    Element.prototype.scrollIntoView = () => {};
  }
  if (!("ResizeObserver" in globalThis)) {
    // @ts-expect-error jsdom stub
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // jsdom implements no canvas 2D backend (getContext returns null) — the
  // multi-page test below needs a truthy context so DocumentPreview's own
  // null-check doesn't skip appending pages; pdfjs-dist itself is mocked
  // above, so nothing here needs to draw anything real.
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ({}) as unknown as CanvasRenderingContext2D,
  ) as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  usePdfState = { loading: true, url: null, error: null };
});

function resumeFixture(): TailoredResume {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "SENTINEL_SUMMARY",
    sections: [
      {
        section: "experience",
        groups: [
          {
            heading: "Acme · Engineer · 2022–Present",
            items: [{ entryId: "e1", text: "Shipped." }],
          },
        ],
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
    defaultFormat: DEFAULT_FORMAT_V2,
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
    current: resumeFixture(),
    locked: null,
    lockedFormat: null,
    genState: "tailored",
    currentMeta: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Application;
}

function mockFetch(application: Application) {
  let current = application;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

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
    if (method === "GET" && url === `/api/applications/${current.id}`) {
      return new Response(JSON.stringify(current), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (method === "PUT" && url === `/api/applications/${current.id}`) {
      current = { ...current, ...body };
      return new Response(JSON.stringify(current), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderApplicationDetail(applicationId = "app-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/applications/${applicationId}`]}>
        <ApplicationDetail applicationId={applicationId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function putCalls(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls.filter(
    ([u, i]) => u === "/api/applications/app-1" && (i as RequestInit | undefined)?.method === "PUT",
  );
}

describe("ApplicationDetail — Design card (v3-T012 fold-in)", () => {
  it("renders DesignPanel's controls and the preview host in the same workspace, unlocked", async () => {
    mockFetch(applicationFixture({}));
    renderApplicationDetail();

    expect(await screen.findByRole("combobox", { name: "Body font" })).toBeInTheDocument();
    expect(document.querySelector(".document-preview")).toBeTruthy();
  });

  it("debounces onChange: N rapid changes within the 300ms window produce exactly ONE updateApplication PUT", async () => {
    const fetchMock = mockFetch(applicationFixture({}));
    renderApplicationDetail();

    await screen.findByRole("combobox", { name: "Body font" });
    vi.useFakeTimers();

    // Three rapid, distinct color picks — same control DesignPanel exposes
    // as a plain button (no Radix portal timing to fight with under fake
    // timers, unlike the Select-based Body font control).
    const primaryColorField = screen.getByText("Primary color", { exact: true }).parentElement!;
    fireEvent.click(within(primaryColorField).getByRole("button", { name: "#0f172a" }));
    fireEvent.click(within(primaryColorField).getByRole("button", { name: "#1e3a5f" }));
    fireEvent.click(within(primaryColorField).getByRole("button", { name: "#14532d" }));

    // Still inside the debounce window — nothing has been PUT yet.
    await vi.advanceTimersByTimeAsync(299);
    expect(putCalls(fetchMock)).toHaveLength(0);

    // Past the window — exactly one PUT, carrying the LAST of the three picks.
    // Async: react-query's mutate() defers the mutationFn call by a
    // microtask, which a synchronous advanceTimersByTime never drains.
    await vi.advanceTimersByTimeAsync(50);
    expect(putCalls(fetchMock)).toHaveLength(1);
    expect(JSON.parse(String(putCalls(fetchMock)[0]![1]!.body)).format.colors.accent).toBe(
      "#14532d",
    );
  });

  it("locked: every design control is disabled, but the preview host still mounts and stays live", async () => {
    mockFetch(
      applicationFixture({
        locked: resumeFixture(),
        lockedFormat: {
          format: DEFAULT_FORMAT_V2,
          resolvedDensity: "comfortable",
          paper: "letter",
        },
      }),
    );
    renderApplicationDetail();

    const bodyFont = await screen.findByRole("combobox", { name: "Body font" });
    expect(bodyFont).toBeDisabled();
    expect(screen.getByLabelText("Show photo on resume")).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: /ATS:/ })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Save current design as preset" })).toBeDisabled();

    // The preview host is still mounted and rendering (usePDF's stubbed
    // loading state, per this file's module-level mock) — locked freezes
    // editing, never the preview.
    expect(document.querySelector(".document-preview")).toBeTruthy();
  });

  it("an overflowing render (numPages > 1) paints one canvas per page, visibly separated", async () => {
    usePdfState = { loading: false, url: "blob:fixture-multipage", error: null };
    mockFetch(applicationFixture({}));
    renderApplicationDetail();

    await screen.findByRole("combobox", { name: "Body font" });

    const canvases = await waitFor(() => {
      const els = document.querySelectorAll(".document-preview canvas");
      expect(els.length).toBe(3);
      return Array.from(els);
    });
    expect(canvases).toHaveLength(3);

    // Visible separation between stacked pages, not one ambiguous strip —
    // the pages host carries its own gap/border styling (DocumentPreview.tsx).
    const pagesHost = document.querySelector(".document-preview__pages");
    expect(pagesHost?.className).toMatch(/gap-/);
  });
});
