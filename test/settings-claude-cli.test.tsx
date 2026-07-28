// @vitest-environment jsdom
// T008 — the keyless-provider affordance inside the "API key" card
// (SettingsView + ClaudeCliAuth). RED-TEAM focus: with provider claude-cli
// there is NO input that could take a token (not a disabled one — none), the
// probe's verdict is the server's and is rendered by cause rather than as one
// generic failure, and choosing a BYOK provider again restores the key block
// with the Test connection button gone from the DOM entirely.
//
// The fake server mirrors the real routes' contract: PUT /api/settings echoes
// the merged settings back (so the provider switch round-trips through the
// ['settings'] query the same way it does in production), and POST
// /api/settings/test-connection answers with whatever the scenario queued —
// 200 {ok:true} or the tailor route's verbatim 502 error strings.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { PROVIDERS } from "../src/shared/providers";
import { SettingsView } from "../src/client/components/SettingsView";

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

type TestConnectionOutcome = { status: 200 } | { status: 502; error: string; detail?: string };

function mockFetch(
  initial: { provider: string; model: string; keySet?: boolean },
  outcome: TestConnectionOutcome = { status: 200 },
) {
  const state = { keySet: false, ...initial };

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
      presets: [],
    };
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/settings") return json(settingsPayload());
    if (method === "PUT" && url === "/api/settings") {
      Object.assign(state, JSON.parse(String(init?.body)));
      return json(settingsPayload());
    }
    if (method === "POST" && url === "/api/settings/test-connection") {
      if (outcome.status === 200) return json({ ok: true });
      return json({ error: outcome.error, detail: outcome.detail }, 502);
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, state };
}

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SettingsView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function keyInput() {
  return document.querySelector("#api-key-input");
}

function testConnectionButton() {
  return screen.queryByRole("button", { name: "Test connection" });
}

async function renderWithClaudeCli(outcome?: TestConnectionOutcome) {
  const mocked = mockFetch(
    { provider: "claude-cli", model: PROVIDERS["claude-cli"].default },
    outcome,
  );
  renderSettings();
  await screen.findByTestId("claude-cli-auth-note");
  return mocked;
}

describe("SettingsView — provider claude-cli replaces the key form in place", () => {
  it("renders the static auth note and Test connection, and NO key input, Save, or Delete", async () => {
    await renderWithClaudeCli();

    const note = screen.getByTestId("claude-cli-auth-note");
    expect(note).toBeVisible();
    // The note names both server-side auth sources and nothing else — it is
    // text, not an affordance.
    expect(note).toHaveTextContent("claude");
    expect(note).toHaveTextContent("CLAUDE_CODE_OAUTH_TOKEN");
    expect(note).toHaveTextContent("There is no key to enter.");

    expect(testConnectionButton()).toBeInTheDocument();

    // Not "disabled" — absent. Nothing in this card can accept a token.
    expect(keyInput()).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(document.querySelectorAll('input[type="password"]')).toHaveLength(0);

    // The three-card bound the surface is held to stays three.
    expect(screen.getAllByTestId("settings-card")).toHaveLength(3);
  });

  it("Test connection against a 200 POSTs once and shows the success state", async () => {
    const { fetchMock } = await renderWithClaudeCli({ status: 200 });

    fireEvent.click(testConnectionButton()!);

    expect(await screen.findByTestId("test-connection-success")).toBeVisible();
    expect(screen.queryByTestId("test-connection-error")).not.toBeInTheDocument();

    const probeCalls = fetchMock.mock.calls.filter(
      ([url, init]) =>
        url === "/api/settings/test-connection" &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    expect(probeCalls).toHaveLength(1);
  });

  it("a 502 names the specific cause and never claims success", async () => {
    await renderWithClaudeCli({
      status: 502,
      error: "claude_cli_binary_missing",
      detail: "spawn claude ENOENT",
    });

    fireEvent.click(testConnectionButton()!);

    const error = await screen.findByTestId("test-connection-error");
    expect(error).toBeVisible();
    expect(error).toHaveAttribute("data-error-code", "claude_cli_binary_missing");
    expect(error).toHaveTextContent(/No claude binary on the server's PATH/);
    expect(screen.queryByTestId("test-connection-success")).not.toBeInTheDocument();
  });

  it("each failure code gets its own sentence, never one collapsed message", async () => {
    for (const [code, fragment] of [
      ["claude_cli_exit", /exited with an error/],
      ["claude_cli_timeout", /did not answer in time/],
      ["claude_cli_bad_output", /format Lede could not read/],
    ] as const) {
      await renderWithClaudeCli({ status: 502, error: code });
      fireEvent.click(testConnectionButton()!);

      const error = await screen.findByTestId("test-connection-error");
      expect(error, code).toHaveAttribute("data-error-code", code);
      expect(error.textContent ?? "", code).toMatch(fragment);
      cleanup();
    }
  });
});

describe("SettingsView — a BYOK provider keeps the key block, with no probe button at all", () => {
  it("provider anthropic: the key block renders and Test connection is absent from the DOM", async () => {
    mockFetch({ provider: "anthropic", model: PROVIDERS.anthropic.default });
    renderSettings();

    await waitFor(() => expect(keyInput()).not.toBeNull());
    expect(screen.getByText("No key set.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

    expect(testConnectionButton()).not.toBeInTheDocument();
    expect(screen.queryByTestId("claude-cli-auth-note")).not.toBeInTheDocument();
  });

  it("switching claude-cli -> Anthropic restores the key block and removes the probe button", async () => {
    const { fetchMock } = await renderWithClaudeCli();
    expect(keyInput()).toBeNull();

    fireEvent.click(screen.getByRole("combobox", { name: "Provider" }));
    fireEvent.click(await screen.findByRole("option", { name: PROVIDERS.anthropic.label }));

    await waitFor(() => expect(keyInput()).not.toBeNull());
    expect(screen.getByText("No key set.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(testConnectionButton()).not.toBeInTheDocument();
    expect(screen.queryByTestId("claude-cli-auth-note")).not.toBeInTheDocument();

    // The switch is a real server round-trip, provider AND its default model.
    const puts = fetchMock.mock.calls.filter(
      ([url, init]) =>
        url === "/api/settings" && (init as RequestInit | undefined)?.method === "PUT",
    );
    expect(puts).toHaveLength(1);
    expect(JSON.parse(String((puts[0][1] as RequestInit).body))).toMatchObject({
      provider: "anthropic",
      model: PROVIDERS.anthropic.default,
    });
  });
});
