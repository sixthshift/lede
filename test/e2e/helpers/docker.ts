// Boots/tears down the production image (Dockerfile + docker-compose.yml,
// spec.md §19) around the "docker" project's one spec (../docker-spa.spec.ts)
// — the only way to prove the SPA baked into dist/ and served by the
// Node/tsx runtime [v2-017] actually mounts and talks to /api/* from
// *inside a container*, not just under Playwright's own tsx webServer.
//
// Wired as a single `globalSetup` module (playwright.config.ts) rather than
// a separate globalSetup+globalTeardown pair: Playwright treats a function
// returned from globalSetup as globalTeardown, so one lifecycle stays in one
// place instead of split across two exports that have to stay in sync.
//
// Gated on LEDE_E2E_DOCKER=1 (set only by the `test:docker` package.json
// script) so every other `playwright test` invocation — including the
// default composite run's chromium+auth projects — no-ops here instead of
// touching Docker.
//
// Reachability surprise this file works around: Playwright (and this whole
// repo checkout) runs inside its OWN container — a devcontainer that shares
// the host's docker socket (docker-outside-of-docker) but NOT its network
// namespace. `docker compose up` here creates a real SIBLING container next
// to that devcontainer, and that sibling's published host port is only
// reachable from the actual docker host — invisible from inside our own
// devcontainer's netns, where "localhost" means our own container. `docker
// network connect` onto the compose network makes the sibling addressable
// by its service DNS name instead, which *is* visible from in here. `docker
// compose down` can't fully remove that network while we're still attached
// to it ("resource is still in use"), so teardown disconnects first.
// existsSync("/.dockerenv") is the cheap, synchronous, standard signal for
// "this process is itself inside a container" — deciding the reachability
// strategy at import time (before any async work) keeps DOCKER_BASE_URL a
// plain constant that playwright.config.ts's docker project can use as-is.
import { existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FullConfig } from "@playwright/test";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const COMPOSE_PROJECT = "lede-e2e";
const COMPOSE_NETWORK = `${COMPOSE_PROJECT}_default`;
const SERVICE_NAME = "lede"; // docker-compose.yml's service key
const INTERNAL_PORT = 8787; // the container's own port — docker-compose.yml sets PORT=8787 inside unconditionally

// Fixed and independent of the chromium/auth projects' PORT (playwright.config.ts):
// 8787 is already occupied on this box by an unrelated dev server, and the
// docker project runs as its own separate `playwright test` invocation, so
// there's no shared-env value to derive from — a hardcoded, documented port
// is simpler than plumbing one through two independent CLI invocations.
export const DOCKER_PORT = 8899;

const RUNNING_NESTED = existsSync("/.dockerenv");

// Nested: address the sibling container by its compose service DNS name on
// its own internal port (globalSetup joins COMPOSE_NETWORK below, which is
// what makes that name resolvable from in here). Otherwise: the published
// host port works directly, as it would for anyone running this outside a
// container.
export const DOCKER_BASE_URL = RUNNING_NESTED
  ? `http://${SERVICE_NAME}:${INTERNAL_PORT}`
  : `http://localhost:${DOCKER_PORT}`;

// TEST-ONLY — hardcoded rather than randomBytes(32)-per-invocation
// (config.ts fail-fasts on anything but exactly 32 raw bytes, base64-encoded,
// for the master key, which this satisfies) so repeated `docker compose up`
// calls pass Compose an *identical* environment. That's not just tidiness:
// Compose recreates a service whenever its resolved config changes, so a
// randomized secret would force a fresh container (and a clean filesystem)
// on every invocation — silently undoing an in-container change (e.g. the
// deliberate-break procedure that exec's in and corrupts a served asset)
// before the next `playwright test --project=docker` run ever saw it.
const TEST_MASTER_KEY = "tJO5hwMGJaWt7vQuYkKVsQrv2zfMTDHx8qyeC6RJ/jA=";
const TEST_SESSION_SECRET = "TEST-ONLY-lede-e2e-docker-session-secret-32-chars-min";

function compose(...args: string[]) {
  return spawnSync("docker", ["compose", "-p", COMPOSE_PROJECT, ...args], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(DOCKER_PORT),
      LEDE_MASTER_KEY: TEST_MASTER_KEY,
      LEDE_SESSION_SECRET: TEST_SESSION_SECRET,
    },
  });
}

// Best-effort: only meaningful when RUNNING_NESTED. Errors (e.g. already
// connected, from a previous run's leftover state) are logged, not thrown —
// the health poll below is the real signal of whether this worked.
function joinComposeNetwork(): void {
  const result = spawnSync("docker", ["network", "connect", COMPOSE_NETWORK, hostname()], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.warn(`docker network connect ${COMPOSE_NETWORK} exited ${result.status} (continuing)`);
  }
}

function leaveComposeNetwork(): void {
  spawnSync("docker", ["network", "disconnect", COMPOSE_NETWORK, hostname()], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}

// Image build (bun install + vite build, then a second npm install in the
// runtime stage) routinely takes well past a minute on a cold cache — this
// polls generously rather than racing it.
async function waitForHealth(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${DOCKER_BASE_URL}/api/health`);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`docker container never answered GET /api/health: ${String(lastErr)}`);
}

function runningContainerNames(): string {
  return execFileSync(
    "docker",
    ["ps", "-a", "--filter", `name=${COMPOSE_PROJECT}`, "--format", "{{.Names}}"],
    { cwd: REPO_ROOT },
  )
    .toString()
    .trim();
}

export default async function globalSetup(
  _config: FullConfig,
): Promise<(() => Promise<void>) | undefined> {
  if (process.env.LEDE_E2E_DOCKER !== "1") return undefined;

  const up = compose("up", "--build", "-d");
  if (up.status !== 0) {
    throw new Error(`docker compose up --build failed (exit ${up.status})`);
  }

  if (RUNNING_NESTED) joinComposeNetwork();

  try {
    await waitForHealth(180_000);
  } catch (err) {
    if (RUNNING_NESTED) leaveComposeNetwork();
    compose("down", "-v");
    throw err;
  }

  return async () => {
    if (RUNNING_NESTED) leaveComposeNetwork();
    compose("down", "-v");
    const orphans = runningContainerNames();
    if (orphans.length > 0) {
      throw new Error(`orphan ${COMPOSE_PROJECT} container(s) left after teardown: ${orphans}`);
    }
  };
}
