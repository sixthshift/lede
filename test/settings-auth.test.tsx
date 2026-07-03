// @vitest-environment jsdom
// LoginGate + SettingsView/ApiKeyForm/ProviderPicker/ModelPicker (ticket
// E2-E, spec.md §7/§8/§13). RED-TEAM focus: the key form never renders a key
// value (there is none to render — GET /api/settings never sends one), and a
// 401 from the app's own ping routes to LoginGate instead of the app.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import { App } from "../src/client/App";
import { LoginGate } from "../src/client/components/LoginGate";
import { SettingsView } from "../src/client/components/SettingsView";
import { ApiKeyForm } from "../src/client/components/ApiKeyForm";

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

type ServerState = {
  configured: boolean;
  authed: boolean;
  keySet: boolean;
  provider: string;
  model: string;
};

function mockFetch(initial: Partial<ServerState> = {}) {
  const state: ServerState = {
    configured: false,
    authed: true,
    keySet: false,
    provider: "anthropic",
    model: "claude-opus-4-8",
    ...initial,
  };

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function settingsPayload() {
    return {
      keySet: state.keySet,
      provider: state.provider,
      model: state.model,
      baseUrl: null,
      layout: [],
    };
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/settings") {
      return state.authed ? json(settingsPayload()) : json({ error: "unauthorized" }, 401);
    }
    if (method === "POST" && url === "/api/auth/setup") {
      const body = JSON.parse(String(init?.body));
      if (!body.password) return json({ error: "invalid_body" }, 400);
      if (state.configured) return json({ error: "already_configured" }, 409);
      state.configured = true;
      return json({ ok: true });
    }
    if (method === "POST" && url === "/api/auth/login") {
      const body = JSON.parse(String(init?.body));
      if (!state.configured || body.password === "wrong")
        return json({ error: "invalid_credentials" }, 401);
      state.authed = true;
      return json({ ok: true });
    }
    if (method === "POST" && url === "/api/auth/logout") {
      state.authed = false;
      return json({ ok: true });
    }
    if (method === "PUT" && url === "/api/settings/key") {
      state.keySet = true;
      return json({ keySet: true });
    }
    if (method === "DELETE" && url === "/api/settings/key") {
      state.keySet = false;
      return json({ keySet: false });
    }
    if (method === "PUT" && url === "/api/settings") {
      const body = JSON.parse(String(init?.body));
      Object.assign(state, body);
      return json(settingsPayload());
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, state };
}

function withClient(children: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function putCallsTo(fetchMock: ReturnType<typeof vi.fn>, url: string, method: string) {
  return fetchMock.mock.calls.filter(
    ([u, init]) => u === url && ((init as RequestInit | undefined)?.method ?? "GET") === method,
  );
}

describe("LoginGate — 401 routes to the login/setup form", () => {
  it("a 401 from the app's own ping shows the form instead of the app", async () => {
    mockFetch({ authed: false });
    render(withClient(<LoginGate>{"APP CONTENT"}</LoginGate>));

    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByText("APP CONTENT")).not.toBeInTheDocument();
  });

  it("first-run: submitting a password sets it up, logs in, and renders the app", async () => {
    const { fetchMock } = mockFetch({ authed: false, configured: false });
    render(withClient(<LoginGate>{"APP CONTENT"}</LoginGate>));

    const input = await screen.findByLabelText("Password");
    fireEvent.change(input, { target: { value: "correct horse" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(screen.getByText("APP CONTENT")).toBeInTheDocument());
    expect(putCallsTo(fetchMock, "/api/auth/setup", "POST")).toHaveLength(1);
    expect(putCallsTo(fetchMock, "/api/auth/login", "POST")).toHaveLength(1);
  });

  it("returning user: setup 409s, falls back to login, and renders the app", async () => {
    const { fetchMock } = mockFetch({ authed: false, configured: true });
    render(withClient(<LoginGate>{"APP CONTENT"}</LoginGate>));

    const input = await screen.findByLabelText("Password");
    fireEvent.change(input, { target: { value: "correct horse" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(screen.getByText("APP CONTENT")).toBeInTheDocument());
    expect(putCallsTo(fetchMock, "/api/auth/setup", "POST")).toHaveLength(1);
    expect(putCallsTo(fetchMock, "/api/auth/login", "POST")).toHaveLength(1);
  });

  it("wrong password on a returning user shows an error and keeps the app hidden", async () => {
    mockFetch({ authed: false, configured: true });
    render(withClient(<LoginGate>{"APP CONTENT"}</LoginGate>));

    const input = await screen.findByLabelText("Password");
    fireEvent.change(input, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByText("invalid_credentials");
    expect(screen.queryByText("APP CONTENT")).not.toBeInTheDocument();
  });
});

describe("ApiKeyForm — write-only (RED-TEAM)", () => {
  it("keySet:true shows status + a blank replace input (never a key value); save PUTs, delete DELETEs", async () => {
    const { fetchMock } = mockFetch({ keySet: true });
    render(withClient(<ApiKeyForm keySet={true} />));

    expect(screen.getByText("A key is set.")).toBeInTheDocument();
    const input = screen.getByLabelText("Replace key") as HTMLInputElement;
    expect(input).toHaveValue("");

    fireEvent.change(input, { target: { value: "sk-new-key-value" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(putCallsTo(fetchMock, "/api/settings/key", "PUT")).toHaveLength(1));
    const [, putInit] = putCallsTo(fetchMock, "/api/settings/key", "PUT")[0];
    expect(JSON.parse(String((putInit as RequestInit).body))).toEqual({
      apiKey: "sk-new-key-value",
    });

    // the typed key is never re-rendered anywhere after save — there's nothing to display.
    expect(screen.queryByText("sk-new-key-value")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("sk-new-key-value")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(putCallsTo(fetchMock, "/api/settings/key", "DELETE")).toHaveLength(1),
    );
  });

  it("keySet:false shows 'no key' status and no Delete button", () => {
    mockFetch({ keySet: false });
    render(withClient(<ApiKeyForm keySet={false} />));

    expect(screen.getByText("No key set.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});

describe("ProviderPicker / ModelPicker — persisted via PUT /api/settings", () => {
  it("changing provider fires PUT with provider+model; changing model fires PUT with the new model", async () => {
    const { fetchMock } = mockFetch({ provider: "anthropic", model: "claude-opus-4-8" });
    render(withClient(<SettingsView />));

    await screen.findByRole("combobox", { name: "Provider" });

    fireEvent.click(screen.getByRole("combobox", { name: "Provider" }));
    fireEvent.click(await screen.findByRole("option", { name: "OpenAI" }));

    await waitFor(() => expect(putCallsTo(fetchMock, "/api/settings", "PUT")).toHaveLength(1));
    const firstPut = JSON.parse(
      String((putCallsTo(fetchMock, "/api/settings", "PUT")[0][1] as RequestInit).body),
    );
    expect(firstPut).toMatchObject({ provider: "openai", model: "gpt-5" });

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent("gpt-5"),
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Model" }));
    fireEvent.click(await screen.findByRole("option", { name: "gpt-5-mini" }));

    await waitFor(() => expect(putCallsTo(fetchMock, "/api/settings", "PUT")).toHaveLength(2));
    const secondPut = JSON.parse(
      String((putCallsTo(fetchMock, "/api/settings", "PUT")[1][1] as RequestInit).body),
    );
    expect(secondPut).toMatchObject({ model: "gpt-5-mini" });
  });
});

describe("App — LoginGate wraps the app; /settings uses the real SettingsView (not the E1-F1 stub)", () => {
  function renderApp(initialPath: string) {
    return render(
      withClient(
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/" element={<App />}>
              <Route path="tailor" element={<div>TAILOR STUB</div>} />
              <Route path="settings" element={<div>OLD SETTINGS STUB</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      ),
    );
  }

  it("unauthenticated: shows the login form, not the app shell", async () => {
    mockFetch({ authed: false });
    renderApp("/tailor");

    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByText("TAILOR STUB")).not.toBeInTheDocument();
  });

  it("authenticated at /settings: renders SettingsView, not the old stub", async () => {
    mockFetch({ authed: true });
    renderApp("/settings");

    expect(await screen.findByText("Provider & model")).toBeInTheDocument();
    expect(screen.queryByText("OLD SETTINGS STUB")).not.toBeInTheDocument();
  });
});
