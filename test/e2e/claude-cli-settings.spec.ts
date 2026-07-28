// T008 — the keyless provider, end to end in a real chromium tab: pick Claude
// Code (CLI) in Settings, prove there is no key field to fill, test the
// connection, then tailor an application with NO key ever entered and none
// stored. The point of doing it here rather than at the route level is the
// pairing: no client-side key gating AND the keyless server path, observed in
// the same run.
//
// This spec owns its own server instead of using the project's baseURL. It has
// to: the fake `claude` must sit on the SERVER's PATH, and no global config may
// prepend it (a config-level prepend would put the stub in front of every other
// project's server too, and this container ships a REAL claude — a test that
// merely hoped otherwise would spend a subscription call). A fourth webServer
// in playwright.config.ts was rejected for the reason recorded there: three
// concurrent tsx+sqlite servers already sit at this box's ceiling.
//
// The filename matches the "chromium" project's existing testMatch
// (/(library-crud|settings)\.spec\.ts/), so the campaign gate picks it up with
// no config change — the project's baseURL is simply never used here; every
// navigation is absolute against the server below.
//
// One continuous test: each step's assertions depend on the previous step's
// server state (provider must be claude-cli before the probe means anything,
// and before tailoring routes through the CLI at all).
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";

import { PROVIDERS } from "../../src/shared/providers";
import { installClaudeStub, pathWithStub, type ClaudeStub } from "../helpers/claude-stub";

const BOOT_TIMEOUT_MS = 60_000;

// Bind :0, read the port, release it — the alternative (deriving from PORT like
// playwright.config.ts does) would collide with the three servers the config
// already boots for this same run.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

let server: ChildProcess | undefined;
let stub: ClaudeStub | undefined;
let dataDir: string | undefined;
let baseUrl: string;

test.beforeAll(async () => {
  test.setTimeout(120_000);

  stub = installClaudeStub();
  dataDir = mkdtempSync(path.join(os.tmpdir(), "lede-claude-cli-e2e-"));
  // library-derived never reads the payload file, but the stub's other modes do
  // and the engine's env passes straight through — writing it keeps the
  // variable meaningful rather than dangling.
  const payloadPath = path.join(stub.dir, "payload.json");
  writeFileSync(payloadPath, "{}", "utf-8");

  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;

  let bootLog = "";
  server = spawn("bun", ["run", "start"], {
    // Own process group: `bun run` forks a tsx child, so only a group kill
    // (negative pid, afterAll below) actually reaps the listener.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      LEDE_MASTER_KEY: randomBytes(32).toString("base64"),
      LEDE_SESSION_SECRET: "playwright-claude-cli-settings-session-secret-at-least-32-chars",
      // The UI, not the auth gate, is what this spec is about.
      LEDE_AUTH_DISABLED: "true",
      // "live" so tailoring reaches a real engine — for provider claude-cli
      // that is ClaudeCliEngine, i.e. the stub on PATH below. Not "fixture":
      // a replayed decision would prove nothing about the keyless CLI path.
      LEDE_TAILOR_ENGINE: "live",
      PATH: pathWithStub(stub.dir),
      LEDE_STUB_MODE: "library-derived",
      LEDE_STUB_PAYLOAD: payloadPath,
      LEDE_STUB_RECORD: stub.recordPath,
    },
  });
  server.stdout?.on("data", (chunk: Buffer) => {
    bootLog = `${bootLog}${chunk.toString()}`.slice(-4000);
  });
  server.stderr?.on("data", (chunk: Buffer) => {
    bootLog = `${bootLog}${chunk.toString()}`.slice(-4000);
  });

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  for (;;) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      throw new Error(`claude-cli e2e server never became healthy. Last output:\n${bootLog}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
});

test.afterAll(async () => {
  if (server?.pid !== undefined) {
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  stub?.cleanup();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

test("Claude Code (CLI): no key field, a real Test connection, and a keyless tailor", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // ── 1. select the keyless provider ──
  await page.goto(`${baseUrl}/settings`);
  const providerCombo = page.getByRole("combobox", { name: "Provider" });
  await expect(providerCombo).toBeVisible();
  // The BYOK key form is what the surface starts with (default provider).
  await expect(page.locator("#api-key-input")).toBeVisible();

  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT" && r.ok(),
    ),
    (async () => {
      await providerCombo.click();
      await page.getByRole("option", { name: PROVIDERS["claude-cli"].label, exact: true }).click();
    })(),
  ]);
  await expect(providerCombo).toHaveText(PROVIDERS["claude-cli"].label);

  // ── 2. the note replaces the key form, in place ──
  await expect(page.getByTestId("claude-cli-auth-note")).toBeVisible();
  await expect(page.getByTestId("claude-cli-auth-note")).toContainText("CLAUDE_CODE_OAUTH_TOKEN");
  // Absent, not disabled — there is nothing here that could take a token.
  await expect(page.locator("#api-key-input")).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  // The pre-existing three-card bound (test/e2e/settings.spec.ts) still holds
  // with the keyless affordance rendered.
  await expect(page.getByTestId("settings-card")).toHaveCount(3);

  // ── 3. Test connection spends a real round trip through the stub ──
  const [probeResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/settings/test-connection") && r.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Test connection" }).click(),
  ]);
  expect(probeResponse.status()).toBe(200);
  await expect(page.getByTestId("test-connection-success")).toBeVisible();
  await expect(page.getByTestId("test-connection-error")).toHaveCount(0);
  // The 200 was earned by an actual invocation, not asserted client-side.
  expect(stub!.readRecords().length).toBeGreaterThanOrEqual(1);

  // ── 4. tailor with no key: create an application, press Tailor ──
  await page.goto(`${baseUrl}/`);
  await page.getByRole("button", { name: "New application" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^Company/).fill("Keyless CLI Co");
  await dialog.getByLabel(/^Role/).fill("Principal Engineer");
  await dialog
    .getByLabel("Job description", { exact: true })
    .fill(
      "Principal engineer for a platform team: own the SDK surface, the component library, and the migration of a legacy front end onto it.",
    );
  await dialog.getByRole("button", { name: "Create application" }).click();
  await page.waitForURL(/\/applications\/[^/]+$/);
  const applicationId = page.url().split("/applications/")[1];
  expect(applicationId, "create must land on the new application's id").toBeTruthy();

  const [tailorResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`/api/applications/${applicationId}/tailor`)),
    page.getByRole("button", { name: "Tailor", exact: true }).click(),
  ]);
  expect(tailorResponse.status()).toBe(200);
  const tailored = (await tailorResponse.json()) as {
    genState: string;
    currentMeta: { provider: string; model: string };
  };
  expect(tailored.genState).toBe("tailored");
  expect(tailored.currentMeta.provider).toBe("claude-cli");
  expect(tailored.currentMeta.model).toBe(PROVIDERS["claude-cli"].default);
  // Two invocations now: the readiness probe and this tailor. Nothing was ever
  // typed into the UI to make either possible.
  expect(stub!.readRecords().length).toBeGreaterThanOrEqual(2);

  // ── 5. and no key was stored along the way ──
  const settings = await page.request.get(`${baseUrl}/api/settings`);
  expect(settings.ok()).toBe(true);
  expect((await settings.json()).keySet).toBe(false);

  // ── 6. back to a BYOK provider: the key block returns unchanged ──
  await page.goto(`${baseUrl}/settings`);
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT" && r.ok(),
    ),
    (async () => {
      await page.getByRole("combobox", { name: "Provider" }).click();
      await page.getByRole("option", { name: PROVIDERS.anthropic.label, exact: true }).click();
    })(),
  ]);
  await expect(page.locator("#api-key-input")).toBeVisible();
  await expect(page.getByText("No key set.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Test connection" })).toHaveCount(0);
  await expect(page.getByTestId("claude-cli-auth-note")).toHaveCount(0);
});
