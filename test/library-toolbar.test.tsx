// @vitest-environment jsdom
// RED-TEAM #12: Import/Export are wired, not disabled stubs (spec.md §27).
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

import { LibraryToolbar } from "../src/client/components/LibraryToolbar";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const backup = {
  entries: [],
  profile: { name: "Ada Lovelace", email: "ada@example.com", links: [] },
  applications: [],
};

function mockFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/export") {
      return new Response(JSON.stringify(backup), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (method === "POST" && url === "/api/import") {
      return new Response(
        JSON.stringify({ imported: { entries: 0, profile: 1, applications: 0 } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });
  return fetchMock;
}

describe("LibraryToolbar", () => {
  it("Export button is enabled; clicking it calls exportAll (GET /api/export)", async () => {
    const fetchMock = mockFetch();
    render(<LibraryToolbar />);

    const exportButton = screen.getByRole("button", { name: "Export" });
    expect(exportButton).not.toBeDisabled();

    fireEvent.click(exportButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/export", undefined));
  });

  it("Import button is enabled; selecting a file calls importAll (POST /api/import)", async () => {
    const fetchMock = mockFetch();
    const { container } = render(<LibraryToolbar />);

    const importButton = screen.getByRole("button", { name: "Import" });
    expect(importButton).not.toBeDisabled();

    fireEvent.click(importButton);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([JSON.stringify(backup)], "lede-backup.json", {
      type: "application/json",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/import",
        expect.objectContaining({ method: "POST", body: JSON.stringify(backup) }),
      ),
    );
  });
});
