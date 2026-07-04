// Phase 4 (spec.md §19/§24) — proves the SPA and API are actually wired
// together *inside the shipped image*, not just under Playwright's own
// tsx webServer (library-crud.spec.ts / auth.spec.ts). Runs against the
// "docker" project (playwright.config.ts), whose baseURL is the container
// published by helpers/docker.ts's globalSetup — a real `docker compose up
// --build` of the repo's own Dockerfile/docker-compose.yml, not a mock.
//
// One continuous flow rather than several independent tests: steps 2-4 all
// share a single navigation/page (the pageerror/console listeners have to be
// registered before the same goto() the mount assertions run against, and
// step 4's login has to follow step 2's first-run gate before a password
// exists) — splitting them would either duplicate the listener setup or
// introduce a same-file test-order dependency neither Playwright nor a
// reader should have to rely on.
import { test, expect } from "@playwright/test";
import { ensureFirstRunPassword } from "./helpers/session";

const PASSWORD = "correct horse battery staple e2e docker";

test("dockerized SPA mounts and round-trips /api/* through the authed session", async ({
  page,
  request,
}) => {
  // (1) the container serves a real production bundle, not the dev
  // index.html (checked into the repo, pointing at unbundled
  // /src/client/main.tsx) or a bare static shell.
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('<div id="root">');
  expect(html).toMatch(/<script[^>]+src="\/assets\/[^"]+\.js"/);

  // (3) registered before the navigation in (2) so it captures anything the
  // bootstrap throws/logs on initial mount. One console error is EXPECTED
  // and benign here: LoginGate's own auth ping (GET /api/settings,
  // src/client/components/LoginGate.tsx) always fires on mount and always
  // 401s before sign-in — that's the mechanism the gate uses to detect
  // "not logged in," not a bug — and Chromium logs any non-2xx fetch to the
  // console regardless of the app catching it. Real breaks look different:
  // the deliberate-break console.error below has distinct text, and a
  // broken JS asset either throws (pageerror, still caught) or 404s a
  // different URL — so this allowlist stays narrow to exactly this one
  // known, expected request.
  const pageErrors: unknown[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // Pre-login, LoginGate optimistically renders the landing route while its
    // own auth ping is in flight, so both its /api/settings ping AND the
    // default route's (/applications, §26) eager data fetch fire before the
    // session exists and 401 — expected, not a break.
    if (
      msg.text().includes("401") &&
      (msg.location().url.includes("/api/settings") ||
        msg.location().url.includes("/api/applications"))
    )
      return;
    consoleErrors.push(msg.text());
  });

  // (2) React actually mounted: the root has real content (rules out a
  // built index.html shipped without its JS ever attaching), and that
  // content is specifically this app's first-run gate (LoginForm) — not
  // just a non-empty <title> or arbitrary markup.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000); // settle window for late console/page errors

  const rootHtml = await page.locator("#root").innerHTML();
  expect(rootHtml.length).toBeGreaterThan(200);
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByText("First time here? This sets your password.")).toBeVisible();

  expect(pageErrors, `unexpected page errors: ${pageErrors.join(", ")}`).toHaveLength(0);
  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join(", ")}`).toHaveLength(0);

  // (4) through the gate, the SPA's own fetch of GET /api/settings resolves
  // 200 against the API running in the same container — the actual
  // end-to-end proof, not just that the two are independently reachable.
  await ensureFirstRunPassword(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const [settingsResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/settings") && r.request().method() === "GET",
    ),
    page.goto("/settings"),
  ]);
  expect(settingsResponse.status()).toBe(200);
});
