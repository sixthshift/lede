// Design view shell — E9-F1a, spec.md §28.3. Follows applications.spec.ts's
// own conventions (same "applications" project/server: real first-run
// set-password -> login, LEDE_TAILOR_ENGINE=fixture so tailoring replays a
// recorded decision with no API key) — see that file's header comment for
// why CONTRAST_JDS[0].jd is used byte-for-byte rather than retyped.
//
// This spec is scoped to what's NEW here: the /applications/:id/design
// route resolving via a real page load (not the SPA fallback's redirect),
// the debounced-then-persisted format PUT, the multi-page preview host, and
// locked read-only controls with a still-live preview. The full
// tailor/lock/download lifecycle is already covered by applications.spec.ts
// — this file drives just enough of that lifecycle to reach a tailored
// (and, later, locked) application to open the design view against.
import { test, expect, type Page } from "@playwright/test";
import { ensureFirstRunPassword } from "./helpers/session";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";

const PASSWORD = "correct horse battery staple e2e design";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — same recorded fixture applications.spec.ts uses

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const COMPANY_MARKER = `E2E Design Co ${runId}`;

async function expectCanvasPainted(page: Page): Promise<void> {
  const canvas = page.locator(".document-preview canvas").first();
  await expect(canvas).toBeVisible();
  await expect
    .poll(() =>
      canvas.evaluate((el: HTMLCanvasElement) => {
        const ctx = el.getContext("2d");
        if (!ctx || el.width === 0) return false;
        const { data } = ctx.getImageData(0, 0, el.width, el.height);
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) return true;
        }
        return false;
      }),
    )
    .toBe(true);
}

test("design view: deep link, debounced persistence, multi-page host, locked read-only", async ({
  page,
}) => {
  const pageErrors: unknown[] = [];
  const consoleErrors: string[] = [];
  let loggedIn = false;
  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // Same three exact-match, pre-explained allowlist entries as
    // applications.spec.ts (LoginGate's pre-session 401 race, the
    // first-run-vs-returning-user setup 409 probe, and usePDF's dead
    // blob:url revocation race against a still-in-flight pdf.js range
    // fetch) — see that file's comments for the full rationale. This spec
    // hits the SAME races: it drives the SAME login arc, and its preview
    // host is the SAME usePDF -> pdf.js pipeline (now painting N pages
    // instead of one).
    if (
      !loggedIn &&
      msg.text() ===
        "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
    ) {
      return;
    }
    if (
      !loggedIn &&
      msg.text() === "Failed to load resource: the server responded with a status of 409 (Conflict)"
    ) {
      return;
    }
    if (msg.text() === "Failed to load resource: net::ERR_FILE_NOT_FOUND") {
      return;
    }
    consoleErrors.push(msg.text());
  });

  // (1) fresh boot -> set-password -> logged in.
  await page.goto("/");
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await ensureFirstRunPassword(page, PASSWORD);
  loggedIn = true;
  await expect(page).toHaveURL(/\/applications$/);

  // (2) create + tailor an application (same recorded fixture as
  // applications.spec.ts — see that file's header for why this exact JD).
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

  await page.goto(`/applications/${applicationId}`);
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/tailor`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Tailor", exact: true }).click(),
  ]);
  await expect(page.getByRole("button", { name: "Re-tailor", exact: true })).toBeVisible();

  // (3) entry point: the Design card's "Open design view" link lands on the
  // real route (client-side nav).
  await page.getByRole("link", { name: "Open design view" }).click();
  await expect(page).toHaveURL(`/applications/${applicationId}/design`);
  await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();

  // (4) the preview host painted a real PDF.
  await expectCanvasPainted(page);
  await expect(page.getByText(/^Fits \d+ pages? · (comfortable|standard|compact)$/)).toBeVisible();

  // (5) change a DesignPanel control — debounced ~300ms, then PUT — and the
  // preview repaints.
  const applicationPut = (r: import("@playwright/test").Response) =>
    r.url().endsWith(`/api/applications/${applicationId}`) && r.request().method() === "PUT";

  await page.getByRole("combobox", { name: "Body font" }).click();
  const [fontPutResponse] = await Promise.all([
    page.waitForResponse(applicationPut),
    page.getByRole("option", { name: "Arimo (Arial)" }).click(),
  ]);
  expect(fontPutResponse.status()).toBe(200);
  expect((await fontPutResponse.json()).format.fonts.body).toBe("arimo");
  await expectCanvasPainted(page);

  // (6) full reload of the deep URL — the changed format persists.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Body font" })).toHaveText(/Arimo/);
  await expectCanvasPainted(page);

  // (7) the deep URL, opened by a FRESH server round-trip (not client-side
  // router push), resolves to the SAME design view via the SPA fallback —
  // never the catch-all's redirect to /applications.
  await page.goto(`/applications/${applicationId}/design`);
  await expect(page).toHaveURL(`/applications/${applicationId}/design`);
  await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Body font" })).toBeVisible();

  // (8) lock the application (back on the detail page — DesignView itself
  // carries no lock/unlock action, spec.md §28.3) — every control on the
  // design view goes read-only, but the preview stays live.
  await page.goto(`/applications/${applicationId}`);
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/lock`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Lock final", exact: true }).click(),
  ]);
  await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();

  await page.goto(`/applications/${applicationId}/design`);
  await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Body font" })).toBeDisabled();
  await expect(page.getByLabel("Show photo on resume")).toBeDisabled();
  for (const button of await page.getByRole("button", { name: /ATS:/ }).all()) {
    await expect(button).toBeDisabled();
  }
  await expectCanvasPainted(page);

  expect(pageErrors, `unexpected page errors: ${pageErrors.join(", ")}`).toHaveLength(0);
  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join(", ")}`).toHaveLength(0);
});
