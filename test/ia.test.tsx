// @vitest-environment jsdom
// IA / nav structural invariants — ticket E6-B2, spec.md §26.
// NavTabs order/labels/active-state, plus RED-TEAM #2: an unknown path must
// redirect to a KNOWN destination (/applications) — never a blank/404 or a
// bespoke fallback component.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, RouterProvider, createMemoryRouter, Navigate } from "react-router-dom";

import { NavTabs } from "../src/client/components/NavTabs";
import { App } from "../src/client/App";
import { ApplicationsView } from "../src/client/components/ApplicationsView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/settings") {
      return new Response(
        JSON.stringify({
          keySet: false,
          provider: "anthropic",
          model: "claude-opus-4-8",
          baseUrl: null,
          layout: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url === "/api/applications") {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderNavTabs(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <NavTabs />
    </MemoryRouter>,
  );
}

describe("NavTabs", () => {
  it("lists Applications | Library | Settings in that order, each a working link", () => {
    renderNavTabs("/applications");
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const links = nav.querySelectorAll("a");

    expect(links).toHaveLength(3);
    expect(links[0]).toHaveTextContent("Applications");
    expect(links[0]).toHaveAttribute("href", "/applications");
    expect(links[1]).toHaveTextContent("Library");
    expect(links[1]).toHaveAttribute("href", "/library");
    expect(links[2]).toHaveTextContent("Settings");
    expect(links[2]).toHaveAttribute("href", "/settings");
  });

  it("active state reflects the current route — contrast Applications vs Library", () => {
    renderNavTabs("/applications");
    let nav = screen.getByRole("navigation", { name: "Primary" });
    expect(screen.getByRole("link", { name: "Applications" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Library" })).not.toHaveAttribute("aria-current");
    expect(nav.querySelectorAll("a[aria-current='page']")).toHaveLength(1);
    cleanup();

    renderNavTabs("/library");
    nav = screen.getByRole("navigation", { name: "Primary" });
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Applications" })).not.toHaveAttribute("aria-current");
    expect(nav.querySelectorAll("a[aria-current='page']")).toHaveLength(1);
  });
});

// Mirrors main.tsx's real route tree (index/applications/library/settings +
// catch-all), but with real components only where a test needs their actual
// content — library/settings stay markers since only ApplicationsView's
// content is asserted here (RED-TEAM #2).
function renderAppAt(initialPath: string) {
  mockFetch();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <App />,
        children: [
          { index: true, element: <Navigate to="/applications" replace /> },
          { path: "applications", element: <ApplicationsView /> },
          { path: "library", element: <div>LIBRARY_MARKER</div> },
          { path: "settings", element: <div>SETTINGS_MARKER</div> },
          { path: "*", element: <Navigate to="/applications" replace /> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("IA: unknown routes resolve to a known destination", () => {
  it.each([
    ["/tailor"],
    ["/nonsense"],
  ])("RED-TEAM #2: unknown path %s redirects to /applications and renders the same content", async (unknownPath) => {
    const router = renderAppAt(unknownPath);

    expect(await screen.findByRole("heading", { name: "Applications" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/applications");

    // exactly one NavTabs item active, and it matches the resolved route
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const active = nav.querySelectorAll("a[aria-current='page']");
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent("Applications");
    expect(active[0]).not.toHaveTextContent("Library");
  });

  it("visiting /applications directly renders the same known-destination content", async () => {
    const router = renderAppAt("/applications");

    expect(await screen.findByRole("heading", { name: "Applications" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/applications");
  });

  it("contrast: on /library, Library is active and Applications is not", async () => {
    renderAppAt("/library");

    await screen.findByText("LIBRARY_MARKER");
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const active = nav.querySelectorAll("a[aria-current='page']");
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent("Library");
    expect(screen.getByRole("link", { name: "Applications" })).not.toHaveAttribute("aria-current");
  });
});
