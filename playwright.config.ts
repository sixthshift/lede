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
//
// E6-B3 adds a third server/project ("applications", APPLICATIONS_BASE_URL):
// applications.spec.ts drives first-run set-password -> login (like
// auth.spec.ts, so the gate must be ON — it can't reuse the "chromium"
// server) AND needs the keyless tailor path (LEDE_TAILOR_ENGINE=fixture, so
// FixtureEngine's recorded CONTRAST_JDS fixtures replay with no API key —
// it can't reuse the "auth" server either, which leaves tailorEngine at its
// default "live"). Own fresh DATA_DIR so its seeded library entries hash to
// the fixtures' recorded key regardless of what the other two servers' data
// dirs accumulate.
import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { createTmpDataDir } from "./test/e2e/helpers/tmpdata";
import { DOCKER_BASE_URL } from "./test/e2e/helpers/docker";

const PORT = process.env.PORT ?? "8787";
const BASE_URL = `http://localhost:${PORT}`;

const AUTH_PORT = String(Number(PORT) + 1);
const AUTH_BASE_URL = `http://localhost:${AUTH_PORT}`;

const APPLICATIONS_PORT = String(Number(PORT) + 2);
const APPLICATIONS_BASE_URL = `http://localhost:${APPLICATIONS_PORT}`;

// E5-C's docker project runs a real container (helpers/docker.ts globalSetup)
// instead of a webServer, and is driven by its own `playwright test
// --project=docker` invocation (package.json test:docker / the composite
// `test` script's last step) with LEDE_E2E_DOCKER=1 set. The project is only
// *defined* when that flag is present, so a bare `playwright test` (the
// default run, and what `bun run test`'s middle step invokes) has no
// "docker" project to pick up at all — belt-and-braces with globalSetup's
// own flag check below, since globalSetup runs unconditionally for every
// invocation regardless of which projects are selected.
const dockerProject = process.env.LEDE_E2E_DOCKER === "1";

export default defineConfig({
  testDir: "test/e2e",
  timeout: 60000,
  fullyParallel: false,
  // One worker + retries: each project boots its own tsx+sqlite webServer, and
  // when the composite (`bun run test`) runs all projects together the first
  // specs to execute hit still-cold servers on this resource-constrained
  // container and time out (they pass in isolation once warm). Serial workers
  // reduce contention; retries absorb the cold-boot timing flake without hiding
  // real defects — a genuine failure fails all attempts. (ailoop [v3-008])
  workers: 1,
  retries: 2,
  use: {
    baseURL: BASE_URL,
  },
  globalSetup: "./test/e2e/helpers/docker.ts",
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
    {
      name: "applications",
      testMatch: /applications\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: APPLICATIONS_BASE_URL },
    },
    ...(dockerProject
      ? [
          {
            name: "docker",
            testMatch: /docker-spa\.spec\.ts/,
            use: { ...devices["Desktop Chrome"], baseURL: DOCKER_BASE_URL },
          },
        ]
      : []),
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
    {
      command: "bun run start",
      url: `${APPLICATIONS_BASE_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: {
        PORT: APPLICATIONS_PORT,
        DATA_DIR: createTmpDataDir(),
        LEDE_MASTER_KEY: randomBytes(32).toString("base64"),
        LEDE_SESSION_SECRET: "playwright-e2e-applications-session-secret-at-least-32-chars",
        // No LEDE_AUTH_DISABLED — applications.spec.ts drives the real
        // first-run set-password -> login arc, same as the "auth" server.
        LEDE_TAILOR_ENGINE: "fixture",
      },
    },
  ],
});
