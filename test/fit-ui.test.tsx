// @vitest-environment jsdom
// E7-C1b acceptance: the fit UI (spec.md §28.4) — FitChip renders a
// FitResult verbatim, ApplicationDetail computes ONE FitResult and hands
// the SAME fitted format to the preview (ResultView) and to
// downloadResumePdf, and on overflow shows the TRUE page count plus the
// two honest actions — never a density control, never a persisted density.
// fitToPages runs for REAL here (renderToBuffer works fine in jsdom, per
// E7-C1a's fit.test.ts) — only usePDF's browser-only canvas path is
// out of reach under jsdom, and that lives inside ResultView, which this
// suite stubs out so it can assert on the props ApplicationDetail computed
// for it instead of fighting pdf.js/jsdom.
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Application, DocumentFormat, Profile, TailoredResume } from "@shared/types";
import { DEFAULT_FORMAT } from "@shared/format";

import { FitChip } from "../src/client/components/FitChip";
import { fitToPages } from "../src/client/document/fit";
import type { SettingsResponse } from "../src/client/api";

const previewProps: { format: DocumentFormat | null; resume: TailoredResume | null } = {
  format: null,
  resume: null,
};
const downloadCalls: Array<{ format?: DocumentFormat }> = [];

vi.mock("../src/client/components/ResultView", () => ({
  ResultView: (props: { resume: TailoredResume; format?: DocumentFormat }) => {
    previewProps.format = props.format ?? null;
    previewProps.resume = props.resume;
    return <div data-testid="result-view-stub" />;
  },
}));

vi.mock("../src/client/document/download", () => ({
  downloadResumePdf: vi.fn(async (args: { format?: DocumentFormat }) => {
    downloadCalls.push({ format: args.format });
  }),
}));

// vi.mock calls above are hoisted ahead of this import by vitest's transform.
import { ApplicationDetail } from "../src/client/components/ApplicationDetail";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  previewProps.format = null;
  previewProps.resume = null;
  downloadCalls.length = 0;
});

function profileFixture(): Profile {
  return { name: "Jordan Rivera", email: "jordan@example.com", links: [] };
}

// Same item SHAPE at every size — only the bullet count grows, mirroring
// fit.test.ts's fixture so the ladder walk/overflow behavior is proven
// elsewhere and just reused here for the UI wiring.
function resumeFixture(itemCount: number): TailoredResume {
  const filler =
    "Shipped and scaled backend systems handling millions of requests per day reliably.";
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "A track record of shipping backend systems at scale across multiple companies.",
    sections: [
      {
        section: "experience",
        groups: [
          {
            heading: "Acme · Engineer · 2020-2023",
            items: Array.from({ length: itemCount }, (_, i) => ({
              entryId: `e${i}`,
              text: `ITEM_${i} ${filler}`,
            })),
          },
        ],
      },
    ],
    cut: [],
  };
}

function settingsFixture(): SettingsResponse {
  return {
    keySet: true,
    provider: "anthropic",
    model: "claude-opus-4-8",
    baseUrl: null,
    layout: [],
    paper: "letter",
    defaultFormat: DEFAULT_FORMAT,
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
    current: null,
    locked: null,
    lockedFormat: null,
    genState: "tailored",
    currentMeta: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

// renderResumeToBuffer (via @react-pdf/renderer) fetches its font FACES at
// render time, not just at Font.register time — and under vitest's jsdom
// environment (import.meta.env.SSR === false, unlike node) fonts.ts resolves
// those to http(s) asset URLs rather than filesystem paths, exactly as it
// would for a real browser bundle. Real font bytes (not stubs) matter here:
// fitToPages picks a density by measuring actual rendered page count, so
// this reads the SAME on-disk @fontsource files the browser build would
// have fetched, keeping the "expected" fit and the component's fit identical.
function fontResponse(url: string): Response {
  const pathname = new URL(url).pathname;
  const bytes = readFileSync(join(process.cwd(), pathname));
  return new Response(bytes, { status: 200 });
}

function mockFetch(app: Application) {
  const putBodies: unknown[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (method === "GET" && url.includes("/node_modules/@fontsource/")) {
      return fontResponse(url);
    }
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
    if (method === "GET" && url === `/api/applications/${app.id}`) {
      return new Response(JSON.stringify(app), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (method === "PUT" && url === `/api/applications/${app.id}`) {
      putBodies.push(body);
      return new Response(JSON.stringify({ ...app, ...body }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, putBodies };
}

function renderDetail(applicationId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/applications/${applicationId}`]}>
        <ApplicationDetail applicationId={applicationId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FitChip", () => {
  it('renders "Fits <n> page(s) · <density>" from a FitResult', () => {
    render(<FitChip fit={{ density: "compact", pageCount: 1, fits: true }} />);
    expect(screen.getByText("Fits 1 page · compact")).toBeInTheDocument();
  });

  it("pluralizes pages when pageCount > 1", () => {
    render(<FitChip fit={{ density: "standard", pageCount: 2, fits: true }} />);
    expect(screen.getByText("Fits 2 pages · standard")).toBeInTheDocument();
  });
});

describe("ApplicationDetail fit wiring (§28.4)", () => {
  it("FITS: preview and download receive the SAME fitted format; no density control, nothing persisted", async () => {
    const resume = resumeFixture(20); // comfortable fits at targetPages=1, per fit.test.ts's ladder walk
    const profile = profileFixture();
    const app = applicationFixture({ id: "fits-1", current: resume, targetPages: 1 });
    mockFetch(app); // installed before fitToPages runs — it needs the font fetch handler too

    const expected = await fitToPages({
      resume,
      profile,
      format: DEFAULT_FORMAT,
      paper: "letter",
      targetPages: 1,
    });
    expect(expected.fits).toBe(true);

    renderDetail("fits-1");

    await screen.findByText(
      `Fits ${expected.pageCount} page${expected.pageCount === 1 ? "" : "s"} · ${expected.density}`,
    );

    // preview and download used the exact same fitted format
    expect(previewProps.format).toEqual(downloadCalls[0]?.format ?? previewProps.format);
    expect(previewProps.resume).toEqual(resume); // never truncated

    fireEvent.click(await screen.findByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(downloadCalls.length).toBeGreaterThan(0));
    expect(downloadCalls[0]?.format).toEqual(previewProps.format);

    // no density control anywhere
    expect(screen.queryByRole("combobox", { name: /density/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: /density/i })).not.toBeInTheDocument();
  });

  it("OVERFLOW: shows the TRUE page count and Allow-2-pages calls the update mutation with { targetPages: 2 }, never truncating items", async () => {
    const resume = resumeFixture(40); // overflows compact at targetPages=1, per fit.test.ts
    const profile = profileFixture();
    const app = applicationFixture({ id: "overflow-1", current: resume, targetPages: 1 });
    const { putBodies } = mockFetch(app); // installed before fitToPages runs, for the font fetch handler

    const expected = await fitToPages({
      resume,
      profile,
      format: DEFAULT_FORMAT,
      paper: "letter",
      targetPages: 1,
    });
    expect(expected.fits).toBe(false);
    expect(expected.pageCount).toBeGreaterThan(1);

    renderDetail("overflow-1");

    await screen.findByText(new RegExp(`renders at ${expected.pageCount} pages`));
    // the full, un-cut item set is still what's handed to the preview
    expect(previewProps.resume?.sections[0].groups[0].items).toHaveLength(40);

    fireEvent.click(await screen.findByRole("button", { name: "Allow 2 pages" }));

    await waitFor(() => {
      expect(putBodies).toContainEqual({ targetPages: 2 });
    });

    // the re-tailor action surfaces intent only — no budget logic here (E7-D1)
    expect(screen.getByRole("button", { name: "Re-tailor to a tighter budget" })).toBeDisabled();

    // no density CONTROL anywhere, and the persisted PUT body never carries density
    expect(screen.queryByRole("combobox", { name: /density/i })).not.toBeInTheDocument();
    expect(putBodies).toContainEqual({ targetPages: 2 });
    for (const putBody of putBodies) {
      expect(putBody).not.toHaveProperty("density");
    }
  });
});
