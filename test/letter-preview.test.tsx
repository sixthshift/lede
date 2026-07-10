// @vitest-environment jsdom
// LetterPreview (T23) — cover-letter analog of DocumentPreview, same
// "preview IS the artifact" contract (spec.md §11/§28.0): the same
// renderLetterDocument(...) call that export/lock would make must be the one
// feeding usePDF, and it must be recomputed (not just mounted once) whenever
// the letter or format prop changes — the exact usePDF empty-dep bug
// DocumentPreview's RenderedPreview documents fixing.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CoverLetter, Profile } from "@shared/types";
import { DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import type { SettingsResponse } from "../src/client/api";

const renderLetterDocumentMock = vi.fn(() => ({ SENTINEL_DOCUMENT: true }));

vi.mock("../src/client/document", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/client/document")>();
  return { ...actual, renderLetterDocument: renderLetterDocumentMock };
});

// A mutable, per-test-settable stand-in for usePDF's return shape — same
// convention as test/design-view.test.tsx: most tests want the perpetual
// "loading" state so jsdom never has to run a real pdf.js paint; the
// ready-state test below flips this to a fake url.
let usePdfState: { loading: boolean; url: string | null; error: unknown } = {
  loading: true,
  url: null,
  error: null,
};
const updateMock = vi.fn();

vi.mock("@react-pdf/renderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@react-pdf/renderer")>();
  return {
    ...actual,
    usePDF: () => [usePdfState, updateMock],
  };
});

// pdf.js touches browser-only globals the ready-state test's PdfCanvas paint
// would otherwise reach for — mocked the same minimal way
// test/design-view.test.tsx mocks it, so that test only proves the canvas
// mounts, not that pdf.js painted real pixels.
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn(async () => ({
        getViewport: () => ({ width: 120, height: 160 }),
        render: () => ({ promise: Promise.resolve() }),
      })),
    }),
  })),
}));

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ({}) as unknown as CanvasRenderingContext2D,
  ) as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  renderLetterDocumentMock.mockClear();
  updateMock.mockClear();
  usePdfState = { loading: true, url: null, error: null };
});

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

function letterFixture(overrides: Partial<CoverLetter> = {}): CoverLetter {
  return {
    greeting: "Dear Hiring Manager,",
    body: [{ text: "SENTINEL_BODY_ONE", groundedOn: ["e1"] }],
    closing: "Sincerely,",
    ...overrides,
  };
}

function formatFixture(overrides: Partial<DocumentFormatV2> = {}): DocumentFormatV2 {
  return { ...DEFAULT_FORMAT_V2, ...overrides };
}

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/profile") {
        return new Response(JSON.stringify(profileFixture()), { status: 200 });
      }
      if (url === "/api/settings") {
        return new Response(JSON.stringify(settingsFixture()), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

async function renderLetterPreview(letter: CoverLetter, format?: DocumentFormatV2) {
  mockFetch();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { LetterPreview } = await import("../src/client/components/LetterPreview");
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <LetterPreview letter={letter} format={format} />
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

describe("LetterPreview", () => {
  it("calls renderLetterDocument with the exact {letter, profile, paper, format} props it received", async () => {
    const letter = letterFixture();
    const format = formatFixture();
    renderLetterDocumentMock.mockClear();

    await renderLetterPreview(letter, format);

    await waitFor(() => expect(renderLetterDocumentMock).toHaveBeenCalled());
    expect(renderLetterDocumentMock).toHaveBeenCalledWith({
      letter,
      profile: profileFixture(),
      paper: "letter",
      format,
    });
  });

  it("calls renderLetterDocument again when the letter prop changes", async () => {
    const format = formatFixture();
    const letter1 = letterFixture({ greeting: "Dear Hiring Manager," });
    mockFetch();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { LetterPreview } = await import("../src/client/components/LetterPreview");
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <LetterPreview letter={letter1} format={format} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(renderLetterDocumentMock).toHaveBeenCalledWith(
        expect.objectContaining({ letter: letter1 }),
      ),
    );
    const callsBefore = renderLetterDocumentMock.mock.calls.length;

    const letter2 = letterFixture({ greeting: "Dear Ada," });
    rerender(
      <QueryClientProvider client={queryClient}>
        <LetterPreview letter={letter2} format={format} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(renderLetterDocumentMock.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    const lastCall = renderLetterDocumentMock.mock.calls.at(-1)![0];
    expect(lastCall).toMatchObject({ letter: letter2 });
  });

  it("calls renderLetterDocument again when the format prop changes", async () => {
    const letter = letterFixture();
    const format1 = formatFixture();
    mockFetch();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { LetterPreview } = await import("../src/client/components/LetterPreview");
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <LetterPreview letter={letter} format={format1} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(renderLetterDocumentMock).toHaveBeenCalledWith(
        expect.objectContaining({ format: format1 }),
      ),
    );
    const callsBefore = renderLetterDocumentMock.mock.calls.length;

    const format2 = formatFixture({
      colors: { ...DEFAULT_FORMAT_V2.colors, accent: "#123456" },
    });
    rerender(
      <QueryClientProvider client={queryClient}>
        <LetterPreview letter={letter} format={format2} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(renderLetterDocumentMock.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    const lastCall = renderLetterDocumentMock.mock.calls.at(-1)![0];
    expect(lastCall).toMatchObject({ format: format2 });
  });

  it("shows the loading state while usePDF is loading", async () => {
    usePdfState = { loading: true, url: null, error: null };
    await renderLetterPreview(letterFixture());

    expect(await screen.findByText("Rendering preview…")).toBeInTheDocument();
    expect(document.querySelector(".letter-preview__loading")).toBeTruthy();
  });

  it("paints a letter-scoped canvas once usePDF is ready with a url", async () => {
    usePdfState = { loading: false, url: "blob:fixture-letter", error: null };
    await renderLetterPreview(letterFixture());

    const canvas = await waitFor(() => {
      const el = document.querySelector(".letter-preview__canvas");
      expect(el).toBeTruthy();
      return el as HTMLCanvasElement;
    });
    expect(canvas.tagName).toBe("CANVAS");
  });
});
