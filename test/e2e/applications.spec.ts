// Applications full-lifecycle, driven in a real chromium tab against the
// real server (spec.md §27) — the "applications" project's own webServer
// (playwright.config.ts): auth gate ON (so first-run set-password -> login
// is real, not bypassed like library-crud.spec.ts's server) and
// LEDE_TAILOR_ENGINE=fixture (so tailoring replays a recorded decision, no
// API key — FixtureEngine, src/server/tailor/engine.ts).
//
// Keyless replay is exact-match: FixtureEngine's key is hashKey(jd, entries)
// (src/server/tailor/evalcore.ts) over the JD verbatim AND the full entries
// array, so this spec (a) uses CONTRAST_JDS[0].jd byte-for-byte — the
// "platform-sdk" scenario — imported straight from evalcore rather than
// retyped, so it can never drift from the recorded fixture's key, and
// (b) never touches the Library (LibraryView), since the fixture at
// test/fixtures/decisions/platform-sdk.json was recorded against the
// server's default SEED_ENTRIES (src/server/seed.ts) — editing the library
// would change the entries side of the hash and the fixture would 404 as
// "no recorded fixture" instead of replaying.
//
// RESUME_TOKEN is a verbatim substring of that fixture's leading item text
// (rank 1, entryId "cloudcase-platform-sdk") — RED-TEAM #8: proves the
// specific recorded content rendered, not just that *some* non-empty resume
// appeared.
//
// One continuous test rather than several independent ones: it's a single
// lifecycle (create -> tailor -> persist -> re-tailor -> lock) where each
// step's assertions depend on the previous step's state, and the
// console/pageerror listeners have to be registered before the one
// first-run goto() every step shares (same rationale as docker-spa.spec.ts).
import { test, expect } from "@playwright/test";
import { ensureFirstRunPassword } from "./helpers/session";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario
const RESUME_TOKEN =
  "Built a platform SDK that programmatically exposed the platform for the first time";

// Unique per test run so the created card is unambiguously findable in a
// list that (on a reused dev server) may carry rows from a previous run.
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const COMPANY_MARKER = `E2E Applications Co ${runId}`;

test("create -> tailor -> render(token) -> reload-persist -> re-tailor -> lock", async ({
  page,
}) => {
  // Registered before the first navigation so it captures the LoginGate
  // ping (see below) alongside anything a real break would produce.
  const pageErrors: unknown[] = [];
  const consoleErrors: string[] = [];
  let loggedIn = false;
  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // EXACT-MATCH allowlist, one entry, scoped to before sign-in only:
    // LoginGate (src/client/components/LoginGate.tsx) only swaps in the
    // password form once its own auth ping (GET /api/settings) has RESOLVED
    // 401 — while that ping is still in flight, `unauthorized` is false and
    // LoginGate renders the real app underneath it, so whatever route is
    // current (ApplicationsView, GET /api/applications) fires its own query
    // in the same unauthenticated window and 401s too. Both are the same
    // expected pre-session race, not a bug — Chromium logs this exact text
    // for any non-2xx fetch response regardless of the app catching it. Once
    // `loggedIn` flips true (post sign-in), this text is no longer excused:
    // a real break here still fails the test.
    if (
      !loggedIn &&
      msg.text() ===
        "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
    ) {
      return;
    }
    consoleErrors.push(msg.text());
  });

  const tailorRequests: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && /\/api\/applications\/[^/]+\/tailor$/.test(req.url())) {
      tailorRequests.push(req.url());
    }
  });

  // (1) fresh boot -> set-password -> logged in -> lands on /applications
  // (main.tsx's index route, post E6-B2's nav cutover — not /tailor, which
  // that ticket removed).
  await page.goto("/");
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await ensureFirstRunPassword(page, PASSWORD);
  loggedIn = true;
  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.getByRole("button", { name: "New application" })).toBeVisible();

  // (2) create an Application with the exact recorded fixture JD.
  await page.getByRole("button", { name: "New application" }).click();
  const createDialog = page.getByRole("dialog");
  await expect(createDialog).toBeVisible();
  await createDialog.getByLabel(/^Company/).fill(COMPANY_MARKER);
  await createDialog.getByLabel("Job description", { exact: true }).fill(JD);
  await createDialog.getByRole("button", { name: "Create application" }).click();
  await expect(createDialog).toBeHidden();

  const card = page.locator("[data-application-id]").filter({ hasText: COMPANY_MARKER });
  await expect(card).toBeVisible();
  const applicationId = await card.getAttribute("data-application-id");
  expect(applicationId, "created card must carry a data-application-id").toBeTruthy();

  // (3) navigate to the detail page (no in-app link from the list to a
  // detail route exists yet — same direct-navigation approach auth.spec.ts
  // uses for its protected-route check) and drive Tailor.
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByRole("button", { name: "Tailor", exact: true })).toBeVisible();

  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/tailor`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Tailor", exact: true }).click(),
  ]);
  expect(tailorRequests).toHaveLength(1);

  // (4) current renders: ResumePage root non-empty, ReasoningPanel present,
  // and the specific fixture token in the DOM (RED-TEAM #8).
  await expect(page.getByRole("button", { name: "Re-tailor", exact: true })).toBeVisible();
  const resumePage = page.locator(".resume-page");
  await expect(resumePage).toBeVisible();
  expect((await resumePage.innerText()).trim().length).toBeGreaterThan(0);
  await expect(page.locator(".reasoning-panel")).toBeVisible();
  await expect(resumePage).toContainText(RESUME_TOKEN);

  // (5) full reload -> the same token still renders, with NO re-tailor
  // (persistence: genState stays 'tailored', current was persisted by (3),
  // not re-derived on load).
  await page.reload();
  await expect(page.getByRole("button", { name: "Re-tailor", exact: true })).toBeVisible();
  await expect(page.locator(".resume-page")).toContainText(RESUME_TOKEN);
  expect(tailorRequests, "reload must not trigger a re-tailor").toHaveLength(1);

  // (6) re-tailor.
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/tailor`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Re-tailor", exact: true }).click(),
  ]);
  expect(tailorRequests).toHaveLength(2);
  await expect(page.locator(".resume-page")).toContainText(RESUME_TOKEN);

  // (7) lock final -> `locked` renders: the lock/unlock toggle (JobPanel's
  // only locked-state UI, src/client/components/JobPanel.tsx) flips to
  // "Unlock", and the resume content (still driven by `current`, which lock
  // deep-copies rather than replaces) stays visible.
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/lock`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Lock final", exact: true }).click(),
  ]);
  await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();
  await expect(page.locator(".resume-page")).toContainText(RESUME_TOKEN);

  expect(pageErrors, `unexpected page errors: ${pageErrors.join(", ")}`).toHaveLength(0);
  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join(", ")}`).toHaveLength(0);
});
