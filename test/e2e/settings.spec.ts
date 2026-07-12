// SettingsView, driven in a real chromium tab against the real server
// (Phase 1, spec.md §9/§4.2/§8) — same "chromium" project/server as
// library-crud.spec.ts (auth disabled, so /settings loads directly).
//
// v3-T041: /settings is housed inside WorkspaceShell (rail | editor) same as
// /library (v3-T040), but as a non-doc surface it DEGRADES — no preview pane
// (§locked constraints). Every settings section enumerated from the live
// SettingsView (Provider & model / API key / Default document format) gets
// its own change -> PUT -> reload round-trip proof.
import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { PROVIDERS } from "../../src/shared/providers";

// Stands in for a real BYOK provider (spec.md §8: PUT /api/settings/key
// validates the key with one live call BEFORE ever persisting it —
// keyvalidation.ts). A genuinely fake key always 400s there, and this repo
// is keyless-by-default (no real provider key/network in CI), so the API-key
// round-trip test below points settings.provider/baseUrl at THIS local
// OpenAI-compatible stub instead of a real provider — same route, same
// validate-then-encrypt code path, no outbound network required.
function startFakeOpenAiServer(): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      // Minimal OpenAI Responses API shape (@ai-sdk/openai's default model,
      // as of the pinned SDK version, posts to /responses rather than the
      // legacy /chat/completions) — just enough for doGenerate to parse a
      // successful reply.
      res.end(
        JSON.stringify({
          id: "resp_stub",
          output: [
            {
              type: "message",
              id: "msg_stub",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: "pong", annotations: [] }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        }),
      );
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("combobox", { name: "Provider" })).toBeVisible();
});

test("workspace shell: /settings renders inside the shell with no preview pane (degrade)", async ({
  page,
}) => {
  await expect(page.getByTestId("workspace-shell")).toBeVisible();
  await expect(page.getByTestId("preview-pane")).toHaveCount(0);
});

test("rail: one nav item per settings section, in the same order as the cards below", async ({
  page,
}) => {
  const rail = page.getByTestId("rail-nav");
  await expect(rail.getByTestId("rail-nav-provider")).toHaveText("Provider & model");
  await expect(rail.getByTestId("rail-nav-apiKey")).toHaveText("API key");
  await expect(rail.getByTestId("rail-nav-format")).toHaveText("Default document format");

  // Clicking a rail item scrolls its card into view without touching the URL
  // (same nav-without-reorder contract as LibraryView's rail).
  await rail.getByTestId("rail-nav-format").click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Default document format" })).toBeVisible();
});

test("Provider & model: changing provider and model round-trips and survives reload", async ({
  page,
}) => {
  const providerCombo = page.getByRole("combobox", { name: "Provider" });
  const modelCombo = page.getByRole("combobox", { name: "Model" });

  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT" && r.ok(),
    ),
    (async () => {
      await providerCombo.click();
      // exact:true — "OpenAI" is otherwise a substring match of the
      // "OpenAI-compatible" option too.
      await page.getByRole("option", { name: PROVIDERS.openai.label, exact: true }).click();
    })(),
  ]);
  await expect(providerCombo).toHaveText(PROVIDERS.openai.label);
  await expect(modelCombo).toHaveText(PROVIDERS.openai.default);

  const targetModel = PROVIDERS.openai.models.find((m) => m !== PROVIDERS.openai.default)!;
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT" && r.ok(),
    ),
    (async () => {
      await modelCombo.click();
      await page.getByRole("option", { name: targetModel, exact: true }).click();
    })(),
  ]);
  await expect(modelCombo).toHaveText(targetModel);

  await page.reload();
  await expect(page.getByRole("combobox", { name: "Provider" })).toHaveText(PROVIDERS.openai.label);
  await expect(page.getByRole("combobox", { name: "Model" })).toHaveText(targetModel);
});

test("API key: setting a key round-trips server-side (keySet reflects it after reload)", async ({
  page,
}) => {
  const { server, baseUrl } = await startFakeOpenAiServer();
  try {
    // Point provider/baseUrl at the local stub so the real validate-before-
    // store call (keyvalidation.ts) succeeds without a real provider key.
    await page.request.put("/api/settings", {
      data: { provider: "openai-compatible", model: "stub-model", baseUrl },
    });
    await page.goto("/settings");
    await expect(page.getByRole("combobox", { name: "Provider" })).toHaveText(
      PROVIDERS["openai-compatible"].label,
    );

    await page.locator("#api-key-input").fill(`sk-e2e-${Date.now()}`);
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith("/api/settings/key") && r.request().method() === "PUT" && r.ok(),
      ),
      page.getByRole("button", { name: "Save" }).click(),
    ]);
    await expect(page.getByText("A key is set.")).toBeVisible();

    await page.reload();
    await expect(page.getByText("A key is set.")).toBeVisible();
  } finally {
    server.close();
  }
});

test("Default document format: changing an axis round-trips and survives reload", async ({
  page,
}) => {
  // T041a defaults every DesignPanel control group COLLAPSED, so the Heading
  // weight control (in the Typography group) has zero rendered height until
  // its group is expanded — expand it before interacting. This is a selector/
  // interaction update only; the SAVE -> PUT -> RELOAD round-trip below is
  // unchanged.
  // Zero out the group's 200ms grid-rows expand (CollapsibleGroup honors
  // motion-reduce) so the control snaps to full height instantly — otherwise
  // the Radix Select can open item-aligned against a still-animating trigger.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("design-group-toggle-typography").click();
  const weightCombo = page.getByRole("combobox", { name: "Heading weight" });
  await expect(weightCombo).toBeVisible();
  await weightCombo.scrollIntoViewIfNeeded();
  const current = (await weightCombo.textContent())?.trim();
  const target = current === "Bold" ? "Normal" : "Bold";

  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT" && r.ok(),
    ),
    (async () => {
      await weightCombo.click();
      await page.getByRole("option", { name: target }).click();
    })(),
  ]);
  await expect(weightCombo).toHaveText(target);

  await page.reload();
  await expect(page.getByRole("combobox", { name: "Heading weight" })).toHaveText(target);
});

// F506/T053 — the ≤1200px bound (red-team #22). At default load every
// DesignPanel control group is collapsed (T041a), so the format card is its
// header + collapsed group toggles, well under the bound; the assertion
// measures REAL rendered boundingBox height (no scroller hides an oversized
// monolith).
test("no Settings card exceeds 1200px rendered height", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  await page.goto("/settings");
  await expect(page.getByRole("combobox", { name: "Provider" })).toBeVisible();

  const cards = page.getByTestId("settings-card");
  const count = await cards.count();
  expect(count).toBe(3);
  for (let i = 0; i < count; i++) {
    const box = await cards.nth(i).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThanOrEqual(1200);
  }
});

// F506/T053 — the column is CENTERED, not left-anchored with a large right
// dead-space. The persistent rail offsets the editor pane from the viewport's
// left edge, so "centered" is measured within the pane (the column's actual
// scroll container): the left and right margins between the column and its
// pane are roughly equal, and neither collapses to the near-zero left gap a
// left-anchored column would show.
test("the settings column is centered in the editor pane, not left-anchored", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  await page.goto("/settings");
  await expect(page.getByRole("combobox", { name: "Provider" })).toBeVisible();

  const columnBox = await page.getByTestId("settings-column").boundingBox();
  const paneBox = await page.getByTestId("editor-pane").boundingBox();
  expect(columnBox).not.toBeNull();
  expect(paneBox).not.toBeNull();

  const leftGap = columnBox!.x - paneBox!.x;
  const rightGap = paneBox!.x + paneBox!.width - (columnBox!.x + columnBox!.width);

  // Symmetric within a few px of subpixel rounding — real mx-auto centering,
  // not a left-pinned column.
  expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(8);
  // And genuinely inset on BOTH sides — a left-anchored column's left gap is
  // just the container's own padding (~24px), far below this.
  expect(leftGap).toBeGreaterThan(100);
  expect(rightGap).toBeGreaterThan(100);
});
