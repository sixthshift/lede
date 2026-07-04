// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Entry } from "@shared/types";

import { LibraryView } from "../src/client/components/LibraryView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const entryA: Entry = {
  id: "skill-typescript",
  section: "skill",
  meta: { section: "skill", category: "languages" },
  facts: ["TypeScript"],
  tags: ["languages"],
  sortKey: 1,
};

const entryB: Entry = {
  id: "cert-aws",
  section: "certification",
  meta: { section: "certification", name: "AWS Solutions Architect" },
  facts: ["AWS Certified Solutions Architect"],
  tags: ["cloud"],
  sortKey: 2,
};

// Stateful fetch mock: GET reflects whatever DELETE has removed so far, so
// the post-invalidation refetch actually proves the delete round-tripped.
function mockFetch(seed: Entry[]) {
  let state = [...seed];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (method === "GET" && url.startsWith("/api/entries")) {
      return new Response(JSON.stringify(state), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (method === "DELETE" && url.startsWith("/api/entries/")) {
      const id = url.split("/").pop()!;
      state = state.filter((e) => e.id !== id);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderLibrary(seed: Entry[]) {
  const fetchMock = mockFetch(seed);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/library"]}>
        <LibraryView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetchMock, queryClient };
}

describe("LibraryView", () => {
  it("renders entries grouped by section using registry labels; shows facts + tag chips", async () => {
    renderLibrary([entryA, entryB]);

    expect(await screen.findByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Certifications")).toBeInTheDocument();

    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("AWS Certified Solutions Architect")).toBeInTheDocument();

    expect(screen.getByText("languages")).toBeInTheDocument();
    expect(screen.getByText("cloud")).toBeInTheDocument();
  });

  it("delete e2e: DELETE fires, ['entries'] invalidates+refetches, only the deleted card is removed", async () => {
    const { fetchMock } = renderLibrary([entryA, entryB]);

    await screen.findByText("TypeScript");

    const cardA = screen.getByText("TypeScript").closest("[data-entry-id]") as HTMLElement;
    fireEvent.click(within(cardA).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("TypeScript")).not.toBeInTheDocument());
    expect(screen.getByText("AWS Certified Solutions Architect")).toBeInTheDocument();

    const deleteCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
    );
    expect(String(deleteCall?.[0])).toBe(`/api/entries/${entryA.id}`);

    // the refetch triggered by invalidation re-GETs the list (proves invalidation, not just local removal)
    const getCallsAfterDelete = fetchMock.mock.calls.filter(
      ([, init]) => ((init as RequestInit | undefined)?.method ?? "GET") === "GET",
    );
    expect(getCallsAfterDelete.length).toBeGreaterThanOrEqual(2);
  });
});

// NavTabs' labels/order/active-state and full-App routing now live in
// test/ia.test.tsx (spec.md §26) — this file stays scoped to LibraryView.
