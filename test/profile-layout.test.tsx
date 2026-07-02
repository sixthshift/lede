// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Profile } from "@shared/types";

import { LibraryView } from "../src/client/components/LibraryView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const profileSeed: Profile = {
  name: "Jane Doe",
  headline: "Principal Engineer",
  email: "jane@example.com",
  phone: "555-1234",
  location: "Remote",
  links: [{ type: "github", label: "GitHub", url: "https://github.com/jane" }],
  baseSummary: "Ships platform SDKs.",
};

const settingsSeed = {
  keySet: false,
  provider: "anthropic",
  model: "claude-opus-4-8",
  baseUrl: null,
  layout: [
    { section: "summary", enabled: true },
    { section: "experience", enabled: true },
    { section: "skill", enabled: true },
  ],
};

function mockFetch({ profile, settings }: { profile: Profile; settings: typeof settingsSeed }) {
  let profileState = { ...profile };
  let settingsState = { ...settings };

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (method === "GET" && url.startsWith("/api/entries")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (method === "GET" && url === "/api/profile") {
      return new Response(JSON.stringify(profileState), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (method === "PUT" && url === "/api/profile") {
      profileState = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(profileState), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (method === "GET" && url === "/api/settings") {
      return new Response(JSON.stringify(settingsState), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (method === "PUT" && url === "/api/settings") {
      const body = JSON.parse(String(init?.body));
      settingsState = { ...settingsState, ...body };
      return new Response(JSON.stringify(settingsState), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderLibrary(seed: { profile: Profile; settings: typeof settingsSeed }) {
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

describe("ProfileEditor — round-trip", () => {
  it("populates from GET /api/profile, edit + add link + save fires PUT with new values, reopen shows them", async () => {
    const { fetchMock } = renderLibrary({ profile: profileSeed, settings: settingsSeed });

    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Jane Doe"));
    expect(screen.getByLabelText("Email")).toHaveValue("jane@example.com");
    expect(screen.getByLabelText("Base summary")).toHaveValue("Ships platform SDKs.");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane R. Doe" } });
    fireEvent.change(screen.getByLabelText("Base summary"), { target: { value: "Builds resume tailoring tools." } });

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByLabelText("Link 2 label"), { target: { value: "Site" } });
    fireEvent.change(screen.getByLabelText("Link 2 url"), { target: { value: "https://jane.dev" } });

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/profile" && (init as RequestInit)?.method === "PUT")).toBe(
        true,
      );
    });

    const putCall = fetchMock.mock.calls.find(
      ([url, init]) => url === "/api/profile" && (init as RequestInit | undefined)?.method === "PUT",
    )!;
    const body = JSON.parse(String((putCall[1] as RequestInit).body));
    expect(body.name).toBe("Jane R. Doe");
    expect(body.baseSummary).toBe("Builds resume tailoring tools.");
    expect(body.links).toHaveLength(2);
    expect(body.links[1]).toMatchObject({ label: "Site", url: "https://jane.dev" });

    // dialog closed after save; reopening should reflect the saved state
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Jane R. Doe"));
    expect(screen.getByLabelText("Base summary")).toHaveValue("Builds resume tailoring tools.");
  });
});

describe("LayoutEditor — persist", () => {
  it("populates from GET /api/settings, reorder two sections + disable one, save fires PUT with reordered layout", async () => {
    const { fetchMock } = renderLibrary({ profile: profileSeed, settings: settingsSeed });

    fireEvent.click(screen.getByRole("button", { name: "Edit layout" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByLabelText("Enable Summary")).toBeInTheDocument());

    // reorder: move "Experience" up above "Summary"
    fireEvent.click(screen.getByRole("button", { name: "Move Experience up" }));

    // disable "Skills"
    fireEvent.click(screen.getByLabelText("Enable Skills"));

    fireEvent.click(screen.getByRole("button", { name: "Save layout" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url, init]) => url === "/api/settings" && (init as RequestInit)?.method === "PUT"),
      ).toBe(true);
    });

    const putCall = fetchMock.mock.calls.find(
      ([url, init]) => url === "/api/settings" && (init as RequestInit | undefined)?.method === "PUT",
    )!;
    const body = JSON.parse(String((putCall[1] as RequestInit).body));
    expect(body.layout).toEqual([
      { section: "experience", enabled: true },
      { section: "summary", enabled: true },
      { section: "skill", enabled: false },
    ]);
  });
});
