// @vitest-environment jsdom
// DesignPanel + TemplatePicker — ticket E7-B1e, spec.md §28.3/§31. Controls
// are bounded (select/stepper/palette-swatch), never free-form text; the ATS
// badge on TemplatePicker is effectiveAtsGrade(manifest, format)
// (../src/client/document/registry.ts) — a two-column layout OR a shown
// photo caps every preset's grade at 'good' and surfaces the Workday/Taleo
// left-to-right caveat, never the other way around.
//
// §31/E9-F0d1: reparameterized onto DocumentFormatV2 + presets.ts's
// applyPreset (see DesignPanel.tsx's/TemplatePicker.tsx's module comments for
// the v1->v2 field map and the "selecting a preset applies its composition,
// preserves the user's stylistic choices" contract this ticket establishes).
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { DEFAULT_FORMAT_V2 } from "../src/shared/format-v2";
import type { DocumentFormatV2 } from "../src/shared/format-v2";
import { FONT_FACES } from "../src/client/document/fonts";
import { applyPreset } from "../src/client/document/presets";
import { DesignPanel } from "../src/client/components/DesignPanel";
import { TemplatePicker } from "../src/client/components/TemplatePicker";
import { SettingsView } from "../src/client/components/SettingsView";

// Radix Select needs a few DOM APIs jsdom doesn't implement (same stubs as
// test/settings-auth.test.tsx, which exercises the same primitive).
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

// A controlled wrapper — DesignPanel itself is a pure controlled component
// (checked/value always derive from the `format` prop), so a test that wants
// to observe a click's effect needs something that actually re-renders it
// with the next format, the same way ApplicationDetail/SettingsView do.
function ControlledDesignPanel({ initial }: { initial: DocumentFormatV2 }) {
  const [format, setFormat] = useState(initial);
  return <DesignPanel format={format} onChange={setFormat} />;
}

describe("DesignPanel — controls are bounded, never free-form", () => {
  it("body font is a Select sourced from FONT_FACES; no free-form text input names a family/font field", async () => {
    render(<DesignPanel format={DEFAULT_FORMAT_V2} onChange={vi.fn()} />);

    const bodyFont = await screen.findByRole("combobox", { name: "Body font" });

    fireEvent.click(bodyFont);
    for (const face of Object.values(FONT_FACES)) {
      expect(await screen.findByRole("option", { name: face.label })).toBeInTheDocument();
    }

    // The only free-text inputs on the panel are the hex-color escape
    // hatches (Primary/Text color) — neither is a family/font control.
    for (const textbox of screen.queryAllByRole("textbox")) {
      const name = textbox.getAttribute("aria-label") ?? textbox.id;
      expect(String(name)).not.toMatch(/font|family/i);
    }
  });
});

describe("DesignPanel — photo toggle", () => {
  it("defaults to hidden; enabling it reveals the regional-norms note", () => {
    render(<ControlledDesignPanel initial={DEFAULT_FORMAT_V2} />);

    const toggle = screen.getByLabelText("Show photo on resume") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.queryByText(/DACH/)).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle.checked).toBe(true);
    expect(screen.getByText(/DACH/i)).toBeInTheDocument();
  });
});

describe("TemplatePicker — ATS badge CONTRAST (effectiveAtsGrade)", () => {
  it("the default strict/no-photo/single-column format shows 'ATS: strict' with no Workday/Taleo caveat", () => {
    render(<TemplatePicker format={DEFAULT_FORMAT_V2} onChange={vi.fn()} />);

    const strictCard = screen.getByText("Strict").closest("button") as HTMLElement;
    expect(within(strictCard).getByText("ATS: strict")).toBeInTheDocument();
    expect(within(strictCard).queryByText(/Workday|Taleo/)).not.toBeInTheDocument();
  });

  it("a two-column (sidebar) format shows 'ATS: good' + the Workday/Taleo caveat, even with the photo hidden", () => {
    const format = applyPreset(DEFAULT_FORMAT_V2, "sidebar-left");
    render(<TemplatePicker format={format} onChange={vi.fn()} />);

    const sidebarCard = screen.getByText("Sidebar").closest("button") as HTMLElement;
    expect(within(sidebarCard).getByText("ATS: good")).toBeInTheDocument();
    expect(within(sidebarCard).getByText(/Workday/)).toBeInTheDocument();
    expect(within(sidebarCard).getByText(/Taleo/)).toBeInTheDocument();

    // the single-column 'Strict' card is unaffected by the sidebar selection.
    const strictCard = screen.getByText("Strict").closest("button") as HTMLElement;
    expect(within(strictCard).getByText("ATS: strict")).toBeInTheDocument();
  });

  it("a shown photo caps every preset (including strict/single-column) at 'ATS: good' + the caveat", () => {
    const format: DocumentFormatV2 = {
      ...DEFAULT_FORMAT_V2,
      photo: { ...DEFAULT_FORMAT_V2.photo, hidden: false },
    };
    render(<TemplatePicker format={format} onChange={vi.fn()} />);

    const strictCard = screen.getByText("Strict").closest("button") as HTMLElement;
    expect(within(strictCard).getByText("ATS: good")).toBeInTheDocument();
    expect(within(strictCard).getByText(/Workday/)).toBeInTheDocument();
  });

  it("selecting a card fires onChange with applyPreset(format, presetId) — the preset's composition applied, stylistic axes preserved", () => {
    const onChange = vi.fn();
    render(<TemplatePicker format={DEFAULT_FORMAT_V2} onChange={onChange} />);

    fireEvent.click(screen.getByText("Sidebar").closest("button") as HTMLElement);

    expect(onChange).toHaveBeenCalledWith(applyPreset(DEFAULT_FORMAT_V2, "sidebar-left"));
  });
});

describe("SettingsView — settings.defaultFormat is editable and round-trips", () => {
  type SettingsState = {
    keySet: boolean;
    provider: string;
    model: string;
    baseUrl: string | null;
    layout: unknown[];
    paper: "letter" | "a4";
    defaultFormat: DocumentFormatV2;
  };

  function mockFetch(initial: SettingsState) {
    let state = initial;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (method === "GET" && url === "/api/settings") {
        return new Response(JSON.stringify(state), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "PUT" && url === "/api/settings") {
        const body = JSON.parse(String(init?.body));
        state = { ...state, ...body };
        return new Response(JSON.stringify(state), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function withClient(children: React.ReactNode) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  it("changing the default format's heading weight PUTs settings.defaultFormat, and the saved value round-trips back into the control", async () => {
    const fetchMock = mockFetch({
      keySet: false,
      provider: "anthropic",
      model: "claude-opus-4-8",
      baseUrl: null,
      layout: [],
      paper: "letter",
      defaultFormat: DEFAULT_FORMAT_V2,
    });

    render(withClient(<SettingsView />));

    // DEFAULT_FORMAT_V2.header.nameWeight is "bold" — migrateFormat's
    // baseFromV1 derives it from v1 DEFAULT_FORMAT.typography.heading.weight
    // (600), which the BOLD_WEIGHT_THRESHOLD (>=600) maps to "bold".
    const weightSelect = await screen.findByRole("combobox", { name: "Heading weight" });
    expect(weightSelect).toHaveTextContent("Bold");

    fireEvent.click(weightSelect);
    fireEvent.click(await screen.findByRole("option", { name: "Normal" }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([u, i]) => u === "/api/settings" && (i as RequestInit | undefined)?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
    });
    const [, putInit] = fetchMock.mock.calls.find(
      ([u, i]) => u === "/api/settings" && (i as RequestInit | undefined)?.method === "PUT",
    )!;
    const body = JSON.parse(String((putInit as RequestInit).body));
    expect(body.defaultFormat.header.nameWeight).toBe("normal");
    expect(body.defaultFormat.header.titleWeight).toBe("normal");

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Heading weight" })).toHaveTextContent("Normal"),
    );
  });
});
