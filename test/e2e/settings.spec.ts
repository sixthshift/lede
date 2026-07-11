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
  const weightCombo = page.getByRole("combobox", { name: "Heading weight" });
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
