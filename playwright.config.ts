// Playwright scaffold (E5-A) — chromium only, drives the REAL UI against a
// REAL server boot (`bun run start`, which runs under Node/tsx per
// [v2-017]), not a mock. The webServer supplies the operator secrets
// (LEDE_MASTER_KEY, LEDE_SESSION_SECRET) config.ts fail-fasts on, a fresh
// per-run DATA_DIR (see ./test/e2e/helpers/tmpdata), and LEDE_AUTH_DISABLED
// so Phase 1 specs reach the UI unauthenticated — Phase 2 proves the auth
// gate itself, separately, with the guard enabled.
//
// Two servers, two projects (E5-B): library-crud.spec.ts needs the gate OFF
// (Phase 1 CRUD isn't what's under test); auth.spec.ts needs the gate ON
// (that IS what's under test). One `playwright test` run can't have both on
// one server, so it runs two: server A (BASE_URL, gate disabled) for the
// "chromium" project, server B (AUTH_BASE_URL, gate enabled, its own fresh
// DATA_DIR) for the "auth" project — each project scoped via testMatch so
// specs never hit the wrong server. Both ports derive from PORT so a
// non-default PORT still works.
import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { createTmpDataDir } from "./test/e2e/helpers/tmpdata";

const PORT = process.env.PORT ?? "8787";
const BASE_URL = `http://localhost:${PORT}`;

const AUTH_PORT = String(Number(PORT) + 1);
const AUTH_BASE_URL = `http://localhost:${AUTH_PORT}`;

export default defineConfig({
  testDir: "test/e2e",
  timeout: 60000,
  fullyParallel: false,
  use: {
    baseURL: BASE_URL,
  },
  projects: [
    {
      name: "chromium",
      testMatch: /library-crud\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "auth",
      testMatch: /auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: AUTH_BASE_URL },
    },
  ],
  webServer: [
    {
      command: "bun run start",
      url: `${BASE_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: {
        PORT,
        DATA_DIR: createTmpDataDir(),
        LEDE_MASTER_KEY: randomBytes(32).toString("base64"),
        LEDE_SESSION_SECRET: "playwright-e2e-session-secret-at-least-32-characters",
        LEDE_AUTH_DISABLED: "true",
      },
    },
    {
      command: "bun run start",
      url: `${AUTH_BASE_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: {
        PORT: AUTH_PORT,
        DATA_DIR: createTmpDataDir(),
        LEDE_MASTER_KEY: randomBytes(32).toString("base64"),
        LEDE_SESSION_SECRET: "playwright-e2e-auth-session-secret-at-least-32-chars",
        // No LEDE_AUTH_DISABLED here — the whole point of this server is to
        // exercise the real guard (registerAuthGuard, src/server/auth.ts).
      },
    },
  ],
});
