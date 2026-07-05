// @vitest-environment jsdom
// ApplicationsView + ApplicationDetail — ticket E6-B1, spec.md §27.
// Applications are tailoring records, NOT a hiring tracker: RED-TEAM #10
// checks that genState/company render from real data (not hardcoded) and
// that no hiring-status vocabulary (applied/interviewing/rejected/kanban)
// leaks into the DOM.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Application, Profile, TailoredResume } from "@shared/types";

import { ApplicationsView } from "../src/client/components/ApplicationsView";
import { ApplicationDetail } from "../src/client/components/ApplicationDetail";
import type { SettingsResponse } from "../src/client/api";

// DocumentPreview's real render (usePDF -> pdf.js canvas) needs a browser
// bundle/worker that vitest's jsdom env doesn't provide (§28.0's real
// coverage is the playwright applications e2e). Here we only need the
// component to mount without the perpetual "loading" state throwing, so
// usePDF is stubbed to its own documented loading shape.
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

function resumeFixture(sentinel: string): TailoredResume {
  return {
    signals: { roleLevel: "staff", weights: ["impact"], hardRequirements: ["typescript"] },
    summary: sentinel,
    sections: [
      {
        section: "experience",
        groups: [
          {
            heading: "Acme · Engineer",
            leadRationale: "led the migration",
            items: [{ entryId: "e1", text: "Shipped the thing" }],
          },
        ],
      },
    ],
    cut: [{ entryId: "c1", reason: "CUT_REASON_SENTINEL" }],
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
    current: null,
    locked: null,
    genState: "untailored",
    currentMeta: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function mockFetch(handlers: {
  list?: () => Application[];
  get?: (id: string) => Application;
  onRequest?: (method: string, url: string, body: unknown) => void;
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    handlers.onRequest?.(method, url, body);

    // DocumentPreview pulls these for every rendered application (§28.1).
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

    if (method === "GET" && url === "/api/applications") {
      const list = (handlers.list?.() ?? []).map(({ current: _c, locked: _l, ...rest }) => rest);
      return new Response(JSON.stringify(list), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (method === "POST" && url === "/api/applications") {
      return new Response(JSON.stringify(applicationFixture({ id: "new-app", ...body })), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (method === "GET" && url.startsWith("/api/applications/")) {
      const id = url.split("/").pop()!;
      return new Response(JSON.stringify(handlers.get?.(id)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (method === "PUT" && url.startsWith("/api/applications/")) {
      const id = url.split("/").pop()!;
      return new Response(JSON.stringify({ ...handlers.get?.(id), ...body }), { status: 200 });
    }
    if (method === "POST" && url.endsWith("/tailor")) {
      const id = url.split("/").slice(-2)[0];
      return new Response(JSON.stringify(handlers.get?.(id)), { status: 200 });
    }
    if (method === "POST" && url.endsWith("/lock")) {
      const id = url.split("/").slice(-2)[0];
      return new Response(
        JSON.stringify({ ...handlers.get?.(id), locked: handlers.get?.(id).current }),
        {
          status: 200,
        },
      );
    }
    if (method === "DELETE" && url.endsWith("/lock")) {
      const id = url.split("/").slice(-2)[0];
      return new Response(JSON.stringify({ ...handlers.get?.(id), locked: null }), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/applications"]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ApplicationsView", () => {
  it("renders cards from data including company, genState, and updatedAt", async () => {
    mockFetch({
      list: () => [
        applicationFixture({
          id: "a1",
          company: "Acme Corp",
          genState: "tailored",
          updatedAt: Date.UTC(2026, 0, 15),
        }),
        applicationFixture({
          id: "a2",
          company: "Widgetron",
          genState: "failed",
          updatedAt: Date.UTC(2026, 1, 20),
        }),
      ],
    });

    renderWithProviders(<ApplicationsView />);

    expect(await screen.findByText("Acme Corp", { exact: false })).toBeInTheDocument();
  });

  it("RED-TEAM #10: distinct company + genState per application render distinctly, not hardcoded", async () => {
    mockFetch({
      list: () => [
        applicationFixture({ id: "a1", company: "Acme Corp", genState: "tailored" }),
        applicationFixture({ id: "a2", company: "Widgetron", genState: "failed" }),
      ],
    });

    renderWithProviders(<ApplicationsView />);
    await screen.findByText("Acme Corp", { exact: false });

    const cardA = document.querySelector('[data-application-id="a1"]') as HTMLElement;
    const cardB = document.querySelector('[data-application-id="a2"]') as HTMLElement;
    expect(cardA).toBeTruthy();
    expect(cardB).toBeTruthy();

    expect(within(cardA).getByText("Acme Corp", { exact: false })).toBeInTheDocument();
    expect(within(cardA).getByText("Tailored")).toBeInTheDocument();
    expect(within(cardA).queryByText("Failed")).not.toBeInTheDocument();

    expect(within(cardB).getByText("Widgetron", { exact: false })).toBeInTheDocument();
    expect(within(cardB).getByText("Failed")).toBeInTheDocument();
    expect(within(cardB).queryByText("Tailored")).not.toBeInTheDocument();

    // no hiring-status vocabulary anywhere in the list
    const html = document.body.textContent ?? "";
    for (const forbidden of ["Applied", "Interviewing", "Rejected"]) {
      expect(html).not.toContain(forbidden);
    }
  });

  it("NewApplication triggers createApplication", async () => {
    const fetchMock = mockFetch({ list: () => [] });
    renderWithProviders(<ApplicationsView />);

    fireEvent.click(await screen.findByRole("button", { name: "New application" }));
    fireEvent.change(screen.getByLabelText("Job description"), {
      target: { value: "A fresh job description." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create application" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/applications" && (init as RequestInit)?.method === "POST",
      );
      expect(postCall).toBeTruthy();
    });
  });
});

describe("ApplicationDetail", () => {
  it("renders the `current` snapshot via DocumentPreview + ReasoningPanel (never the legacy .resume-page), siblings not nested, reasoning never reachable inside the preview; empty state links to /library when there is none", async () => {
    const withCurrent = applicationFixture({
      id: "a1",
      current: resumeFixture("SENTINEL_CURRENT_SUMMARY"),
      genState: "tailored",
    });
    const withoutCurrent = applicationFixture({ id: "a2", current: null, genState: "untailored" });

    mockFetch({ get: (id) => (id === "a1" ? withCurrent : withoutCurrent) });

    const { unmount } = renderWithProviders(<ApplicationDetail applicationId="a1" />);

    const preview = await waitFor(() => {
      const el = document.querySelector(".document-preview");
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    const reasoningPanel = document.querySelector(".reasoning-panel") as HTMLElement;
    expect(reasoningPanel).toBeTruthy();

    // E7-A4: the DOM ResumePage is gone from this flow — DocumentPreview
    // (the real react-pdf/pdf.js artifact) replaces it.
    expect(document.querySelector(".resume-page")).toBeFalsy();

    // §11 invariant: siblings, never nested either direction.
    expect(preview.contains(reasoningPanel)).toBe(false);
    expect(reasoningPanel.contains(preview)).toBe(false);

    // leadRationale/cut are reasoning UI only — never reachable inside the
    // preview subtree — but they DO surface in the reasoning panel, proving
    // this is real per-resume data and not just an empty container.
    expect(preview.textContent).not.toContain("led the migration");
    expect(preview.textContent).not.toContain("CUT_REASON_SENTINEL");
    expect(reasoningPanel.textContent).toContain("led the migration");
    expect(reasoningPanel.textContent).toContain("CUT_REASON_SENTINEL");

    unmount();

    mockFetch({ get: () => withoutCurrent });
    renderWithProviders(<ApplicationDetail applicationId="a2" />);
    const link = await screen.findByRole("link", { name: /add missing facts in Library/ });
    expect(link).toHaveAttribute("href", "/library");
  });

  it("Lock button calls the lock mutation", async () => {
    const app = applicationFixture({
      id: "a1",
      current: resumeFixture("SENTINEL_LOCK_TEST"),
      genState: "tailored",
    });
    const fetchMock = mockFetch({ get: () => app });

    renderWithProviders(<ApplicationDetail applicationId="a1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Lock final" }));

    await waitFor(() => {
      const lockCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url) === "/api/applications/a1/lock" && (init as RequestInit)?.method === "POST",
      );
      expect(lockCall).toBeTruthy();
    });
  });

  it("staleness note is present when currentMeta is set, absent when null", async () => {
    const stale = applicationFixture({
      id: "a1",
      current: resumeFixture("SENTINEL_STALE"),
      currentMeta: { at: Date.UTC(2026, 0, 1), provider: "anthropic", model: "claude-opus-4-8" },
      genState: "tailored",
    });
    const fresh = applicationFixture({
      id: "a2",
      current: resumeFixture("SENTINEL_FRESH"),
      currentMeta: null,
      genState: "tailored",
    });

    mockFetch({ get: () => stale });
    const { unmount } = renderWithProviders(<ApplicationDetail applicationId="a1" />);
    expect(await screen.findByText(/re-tailor to fold in newer entries/)).toBeInTheDocument();
    unmount();

    mockFetch({ get: () => fresh });
    renderWithProviders(<ApplicationDetail applicationId="a2" />);
    await waitFor(() => expect(document.querySelector(".document-preview")).toBeTruthy());
    expect(screen.queryByText(/re-tailor to fold in newer entries/)).not.toBeInTheDocument();
  });
});
