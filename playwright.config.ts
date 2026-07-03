// Playwright scaffold (E5-A) — chromium only, drives the REAL UI against a
// REAL server boot (`bun run start`, which runs under Node/tsx per
// [v2-017]), not a mock. The webServer supplies the operator secrets
// (LEDE_MASTER_KEY, LEDE_SESSION_SECRET) config.ts fail-fasts on, a fresh
// per-run DATA_DIR (see ./test/e2e/helpers/tmpdata), and LEDE_AUTH_DISABLED
// so Phase 1 specs reach the UI unauthenticated — Phase 2 proves the auth
// gate itself, separately, with the guard enabled.
import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { createTmpDataDir } from "./test/e2e/helpers/tmpdata";

const PORT = process.env.PORT ?? "8787";
const BASE_URL = `http://localhost:${PORT}`;

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
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
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
});
