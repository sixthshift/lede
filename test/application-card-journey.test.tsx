// @vitest-environment jsdom
// T007 (application-page-flow spec, "Dashboard cards show journey position").
// Dashboard cards surface deriveJourneyStage (journey-stage.ts, T001, frozen)
// as a design-system status pill — 'Not tailored'/'Tailoring…'/'Tailored'/
// 'Locked' — which REPLACES the old resume genState pill on the card (a
// dual render would show "Tailored" twice — coordinator-rejected). The one
// genState survivor on the card is the FAILED treatment: a distinct
// destructive badge rendered alongside the stage pill, never erased by it.
// The detail page's GenStateBadge usage is untouched. The pill carries
// `data-testid="application-card-stage-pill"`.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ApplicationSummary } from "@shared/types";

import { ApplicationsView } from "../src/client/components/ApplicationsView";
import type { SettingsResponse } from "../src/client/api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The four locked stage-pill strings (application-page-flow spec, "Scope:
// dashboard cards") — the failure treatment's text must never coincide with
// any of these, so a stage pill can never be mistaken for the failure badge
// or vice versa.
const STAGE_PILL_STRINGS = ["Not tailored", "Tailoring…", "Tailored", "Locked"];

function summaryFixture(overrides: Partial<ApplicationSummary> = {}): ApplicationSummary {
  return {
    id: "app-1",
    company: "Acme",
    role: "Staff Engineer",
    jobDescription: "We need someone who can ship.",
    context: undefined,
    targetPages: 1,
    format: null,
    lockedFormat: null,
    genState: "untailored",
    currentMeta: null,
    letterCurrent: null,
    letterPrevious: null,
    letterGenState: "untailored",
    letterFailedReason: null,
    locked: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function profileFixture() {
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

function mockFetch(list: ApplicationSummary[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/profile") {
      return new Response(JSON.stringify(profileFixture()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url === "/api/settings") {
      return new Response(JSON.stringify(settingsFixture()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url === "/api/applications") {
      return new Response(JSON.stringify(list), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderApplications() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/applications"]}>
        <ApplicationsView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function cardFor(id: string): HTMLElement {
  const card = document.querySelector(`[data-application-id="${id}"]`);
  expect(card, `card for ${id} must render`).toBeTruthy();
  return card as HTMLElement;
}

function stagePillText(card: HTMLElement): string {
  return within(card).getByTestId("application-card-stage-pill").textContent ?? "";
}

describe("ApplicationCard journey-stage pill (T007)", () => {
  it("two synthetic tailoring apps (no current), differing in id/company, both render exactly 'Tailoring…' — kills fixture special-casing", async () => {
    mockFetch([
      summaryFixture({ id: "tailoring-a", company: "Umbrella Corp", genState: "tailoring" }),
      summaryFixture({ id: "tailoring-b", company: "Initech", genState: "tailoring" }),
    ]);
    renderApplications();
    await screen.findByText("Umbrella Corp", { exact: false });

    for (const id of ["tailoring-a", "tailoring-b"]) {
      const card = cardFor(id);
      expect(stagePillText(card)).toBe("Tailoring…");
      // Exactly ONE "Tailoring…" per card — the stage pill replaced the old
      // genState pill; a dual render (both taxonomies at once) fails here.
      expect(within(card).getAllByText("Tailoring…", { exact: true })).toHaveLength(1);
    }
  });

  it("genState='failed' + no current: the failure stays visible, distinct from every stage-pill string", async () => {
    mockFetch([summaryFixture({ id: "failed-no-current", genState: "failed" })]);
    renderApplications();
    await screen.findByText("Acme", { exact: false });

    const card = cardFor("failed-no-current");
    const failureBadge = within(card).getByText("Failed", { exact: true });
    expect(failureBadge).toBeVisible();
    expect(STAGE_PILL_STRINGS).not.toContain(failureBadge.textContent);

    // Stage is "setup" (no surviving current) — the stage pill says so, and
    // does NOT erase the failure treatment above.
    expect(stagePillText(card)).toBe("Not tailored");
  });

  it("genState='failed' + a surviving current: stage pill reads 'Tailored' AND the failure treatment stays visible alongside", async () => {
    mockFetch([
      summaryFixture({
        id: "failed-surviving-current",
        genState: "failed",
        currentMeta: { at: Date.now(), provider: "anthropic", model: "claude-opus-4-8" },
      }),
    ]);
    renderApplications();
    await screen.findByText("Acme", { exact: false });

    const card = cardFor("failed-surviving-current");
    expect(stagePillText(card)).toBe("Tailored");
    expect(within(card).getAllByText("Tailored", { exact: true })).toHaveLength(1);
    expect(within(card).getByText("Failed", { exact: true })).toBeVisible();
  });

  it("stale hint: present iff currentMeta is set", async () => {
    mockFetch([
      summaryFixture({
        id: "stale",
        company: "Stale Co",
        genState: "tailored",
        currentMeta: { at: Date.now(), provider: "anthropic", model: "claude-opus-4-8" },
      }),
      summaryFixture({ id: "fresh", company: "Fresh Co", genState: "untailored" }),
    ]);
    renderApplications();
    await screen.findByText("Stale Co", { exact: false });

    expect(
      within(cardFor("stale")).queryByTestId("application-card-stale-hint"),
    ).toBeInTheDocument();
    expect(
      within(cardFor("fresh")).queryByTestId("application-card-stale-hint"),
    ).not.toBeInTheDocument();
  });

  it("banned words: no hiring-tracker vocabulary anywhere on the cards", async () => {
    mockFetch([
      summaryFixture({ id: "a1", genState: "untailored" }),
      summaryFixture({ id: "a2", genState: "tailoring" }),
      summaryFixture({ id: "a3", genState: "tailored" }),
      summaryFixture({ id: "a4", genState: "failed" }),
      summaryFixture({ id: "a5", genState: "tailored", locked: true }),
    ]);
    renderApplications();
    await screen.findAllByTestId("application-card-stage-pill");

    const html = document.body.textContent ?? "";
    expect(html).not.toMatch(/applied|interview|offer|reminder/i);
  });
});
