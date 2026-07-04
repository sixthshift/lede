// @vitest-environment jsdom
// LibraryFilter (E6-C1, spec.md §26). RED-TEAM focus:
//  - progressive disclosure: tag/free-text controls absent below the
//    threshold, present at/above it (both sides asserted).
//  - each filter (section, tag, free-text) is bidirectional: a matching
//    entry stays, a non-matching one disappears.
//  - free-text searches facts/meta, never tags — proven with a term that
//    lives in one entry's FACT and another entry's TAG only.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Entry } from "@shared/types";

import { LibraryView } from "../src/client/components/LibraryView";

// Radix Select needs a few DOM APIs jsdom doesn't implement.
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Library at (or above) the progressive-disclosure threshold (8) — big
// enough that tag + free-text controls should render.
const bigLibrary: Entry[] = [
  {
    id: "skill-typescript",
    section: "skill",
    meta: { section: "skill", category: "languages" },
    facts: ["TypeScript"],
    tags: ["languages"],
    sortKey: 1,
  },
  {
    id: "skill-python",
    section: "skill",
    meta: { section: "skill", category: "languages" },
    facts: ["Python"],
    tags: ["languages"],
    sortKey: 2,
  },
  {
    id: "cert-aws",
    section: "certification",
    meta: { section: "certification", name: "AWS Certified Solutions Architect" },
    facts: ["AWS Certified Solutions Architect"],
    tags: ["cloud"],
    sortKey: 3,
  },
  {
    id: "cert-gcp",
    section: "certification",
    meta: { section: "certification", name: "GCP Professional Cloud Architect" },
    facts: ["GCP Professional Cloud Architect"],
    tags: ["cloud"],
    sortKey: 4,
  },
  {
    id: "exp-kube",
    section: "experience",
    meta: { section: "experience", company: "Acme", role: "SRE", period: "2020-2022" },
    // "Kubernetes" lives only in this entry's FACT.
    facts: ["Kubernetes cluster migration"],
    tags: ["cloud"],
    sortKey: 5,
  },
  {
    id: "exp-ci",
    section: "experience",
    meta: { section: "experience", company: "Globex", role: "Eng", period: "2018-2020" },
    facts: ["Led CI pipeline redesign"],
    // "kubernetes" lives only in this entry's TAG — must not match free-text search.
    tags: ["kubernetes"],
    sortKey: 6,
  },
  {
    id: "award-hack",
    section: "award",
    meta: { section: "award", title: "Hackathon winner 2022" },
    facts: ["Hackathon winner 2022"],
    tags: ["recognition"],
    sortKey: 7,
  },
  {
    id: "project-app",
    section: "project",
    meta: { section: "project", name: "Logistics App" },
    facts: ["Built mobile app for logistics"],
    tags: ["mobile"],
    sortKey: 8,
  },
];

// Below the threshold — tag/free-text controls should be absent.
const smallLibrary: Entry[] = bigLibrary.slice(0, 3);

function mockFetch(seed: Entry[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "GET" && url.startsWith("/api/entries")) {
      return new Response(JSON.stringify(seed), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderLibrary(seed: Entry[]) {
  mockFetch(seed);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/library"]}>
        <LibraryView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function selectOption(comboboxName: string, optionName: string) {
  fireEvent.click(screen.getByRole("combobox", { name: comboboxName }));
  fireEvent.click(await screen.findByRole("option", { name: optionName }));
}

describe("LibraryFilter — progressive disclosure", () => {
  it("hides tag/free-text controls below the threshold, shows them at/above it", async () => {
    renderLibrary(smallLibrary);
    await screen.findByText("TypeScript");

    // Section filter (baseline) is always present.
    expect(screen.getByRole("combobox", { name: "Filter by section" })).toBeInTheDocument();
    // Tag + free-text controls are absent for a small library.
    expect(screen.queryByRole("combobox", { name: "Filter by tag" })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Search library" })).not.toBeInTheDocument();
    cleanup();

    renderLibrary(bigLibrary);
    await screen.findByText("TypeScript");

    expect(screen.getByRole("combobox", { name: "Filter by section" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by tag" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search library" })).toBeInTheDocument();
  });
});

describe("LibraryFilter — filtering narrows the list (bidirectional)", () => {
  it("filters by section: matching entry stays, non-matching entry disappears", async () => {
    renderLibrary(bigLibrary);
    await screen.findByText("TypeScript");
    expect(screen.getByText("AWS Certified Solutions Architect")).toBeInTheDocument();

    await selectOption("Filter by section", "Certifications");

    await waitFor(() => expect(screen.queryByText("TypeScript")).not.toBeInTheDocument());
    expect(screen.getByText("AWS Certified Solutions Architect")).toBeInTheDocument();
    expect(screen.getByText("GCP Professional Cloud Architect")).toBeInTheDocument();
  });

  it("filters by tag: matching entry stays, non-matching entry disappears", async () => {
    renderLibrary(bigLibrary);
    await screen.findByText("TypeScript");

    await selectOption("Filter by tag", "cloud");

    await waitFor(() => expect(screen.queryByText("TypeScript")).not.toBeInTheDocument());
    expect(screen.getByText("AWS Certified Solutions Architect")).toBeInTheDocument();
    expect(screen.getByText("Kubernetes cluster migration")).toBeInTheDocument();
    // exp-ci is tagged "kubernetes", not "cloud" — must disappear too.
    expect(screen.queryByText("Led CI pipeline redesign")).not.toBeInTheDocument();
  });

  it("filters by free text over facts/meta — not tags", async () => {
    renderLibrary(bigLibrary);
    await screen.findByText("TypeScript");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search library" }), {
      target: { value: "kubernetes" },
    });

    // Matches because "Kubernetes" is in this entry's FACT.
    await waitFor(() =>
      expect(screen.getByText("Kubernetes cluster migration")).toBeInTheDocument(),
    );
    // Does NOT match — "kubernetes" is only this entry's TAG, not its fact/meta.
    expect(screen.queryByText("Led CI pipeline redesign")).not.toBeInTheDocument();
    // Unrelated entries also disappear.
    expect(screen.queryByText("TypeScript")).not.toBeInTheDocument();
  });
});
