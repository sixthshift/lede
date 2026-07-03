// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Entry } from "@shared/types";

import { EntryEditor } from "../src/client/components/EntryEditor";
import { LibraryView } from "../src/client/components/LibraryView";
import { RepeatableList } from "../src/client/components/RepeatableList";
import { TagInput } from "../src/client/components/TagInput";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function withClient(children: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/library"]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

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
    if (method === "POST" && url === "/api/entries") {
      const body = JSON.parse(String(init?.body));
      const created: Entry = { id: `${body.section}-new`, ...body };
      state = [...state, created];
      return new Response(JSON.stringify(created), { status: 200 });
    }
    if (method === "PUT" && url.startsWith("/api/entries/")) {
      const id = url.split("/").pop()!;
      const body = JSON.parse(String(init?.body));
      const updated: Entry = { ...body, id };
      state = state.map((e) => (e.id === id ? updated : e));
      return new Response(JSON.stringify(updated), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("EntryEditor — registry-driven meta fields", () => {
  it("swaps meta fields when the section changes (experience -> skill)", () => {
    mockFetch([]);
    const { rerender } = render(
      withClient(<EntryEditor open onOpenChange={() => {}} defaultSection="experience" />),
    );

    expect(screen.getByLabelText(/^Company/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Role/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Period/)).toBeInTheDocument();
    expect(screen.getByLabelText("Facts 1")).toBeInTheDocument();

    rerender(withClient(<EntryEditor open onOpenChange={() => {}} defaultSection="skill" />));

    expect(screen.queryByLabelText(/^Company/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Role/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Period/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Facts 1")).not.toBeInTheDocument();

    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByLabelText("Level")).toBeInTheDocument();
    expect(screen.getByLabelText("Label")).toBeInTheDocument();
  });
});

describe("EntryEditor — create e2e via LibraryView", () => {
  it("Add entry -> fill experience -> save fires POST with entered data; new EntryCard appears", async () => {
    const fetchMock = mockFetch([]);
    render(withClient(<LibraryView />));

    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Company/), { target: { value: "Cloudcase" } });
    fireEvent.change(screen.getByLabelText(/^Role/), { target: { value: "Staff Engineer" } });
    fireEvent.change(screen.getByLabelText(/^Period/), { target: { value: "2024–Present" } });
    fireEvent.change(screen.getByLabelText("Facts 1"), {
      target: { value: "Shipped the tailoring pipeline" },
    });

    fireEvent.change(screen.getByLabelText("New tag"), { target: { value: "backend" } });
    fireEvent.click(screen.getByRole("button", { name: "Add tag" }));

    fireEvent.click(screen.getByRole("button", { name: "Create entry" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true);
    });

    const postCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    )!;
    expect(String(postCall[0])).toBe("/api/entries");
    const body = JSON.parse(String((postCall[1] as RequestInit).body));
    expect(body.section).toBe("experience");
    expect(body.meta).toMatchObject({
      section: "experience",
      company: "Cloudcase",
      role: "Staff Engineer",
      period: "2024–Present",
    });
    expect(body.facts).toEqual(["Shipped the tailoring pipeline"]);
    expect(body.tags).toEqual(["backend"]);

    expect(await screen.findByText("Shipped the tailoring pipeline")).toBeInTheDocument();
  });
});

describe("EntryEditor — edit", () => {
  const existing: Entry = {
    id: "cloudcase-staff-engineer",
    section: "experience",
    meta: {
      section: "experience",
      company: "Cloudcase",
      role: "Staff Engineer",
      period: "2023–2024",
    },
    facts: ["Built the rules engine"],
    tags: ["backend"],
    sortKey: 202301,
  };

  it("populates fields from the entry and fires PUT with the changed fact", async () => {
    const fetchMock = mockFetch([existing]);
    render(withClient(<EntryEditor open onOpenChange={() => {}} entry={existing} />));

    expect(screen.getByLabelText(/^Company/)).toHaveValue("Cloudcase");
    expect(screen.getByLabelText(/^Role/)).toHaveValue("Staff Engineer");
    expect(screen.getByLabelText("Facts 1")).toHaveValue("Built the rules engine");

    fireEvent.change(screen.getByLabelText("Facts 1"), {
      target: { value: "Rebuilt the rules engine from scratch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
        ),
      ).toBe(true);
    });

    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
    )!;
    expect(String(putCall[0])).toBe(`/api/entries/${existing.id}`);
    const body = JSON.parse(String((putCall[1] as RequestInit).body));
    expect(body.facts).toEqual(["Rebuilt the rules engine from scratch"]);
    expect(body.meta).toMatchObject({ company: "Cloudcase" });
  });
});

describe("RepeatableList", () => {
  it("disables Add once `max` rows are reached", () => {
    render(<RepeatableList label="Facts" values={["a", "b"]} onChange={() => {}} max={2} />);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });
});

describe("TagInput", () => {
  it("disables adding once `max` tags are reached", () => {
    render(<TagInput tags={["a", "b"]} onChange={() => {}} max={2} />);
    expect(screen.getByLabelText("New tag")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add tag" })).toBeDisabled();
  });
});
