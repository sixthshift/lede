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

// MUST match applications.spec.ts's PASSWORD exactly (playwright.config.ts:
// this spec shares that file's "applications" server/project, and the auth
// gate's password is a single server-wide secret). Whichever of the two
// spec files runs first sets it via LoginForm's real first-run flow; the
// other's identical ensureFirstRunPassword call then hits the SAME
// setup-409-then-login fallback LoginForm always runs, succeeding because
// the value matches what's already set.
const PASSWORD = "correct horse battery staple e2e applications";
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

// Pixel-diff pattern (E8-B1, applications.spec.ts's thumbnailDataUrl) applied
// to the pinned main preview canvas rather than a template-card thumbnail —
// a snapshot of the actual painted pixels, compared before/after a Sections
// control change to prove the change repainted the real PDF rather than
// just flipping a control's own on-screen state.
function previewDataUrl(page: Page): Promise<string> {
  return page
    .locator(".document-preview canvas")
    .first()
    .evaluate((el: HTMLCanvasElement) => el.toDataURL());
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

  // (5) change a DesignPanel control (body font) — debounced ~300ms, then a
  // PUT that persists across reload.
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

  // (6) reload — the body-font change persists. This freshly mounts the
  // pinned preview at the persisted format (arimo, experience title-first —
  // the seed default, [v3-076]), which is the baseline for the Sections
  // pixel-diff below.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Body font" })).toHaveText(/Arimo/);
  await expectCanvasPainted(page);
  const previewBeforeOrderChange = await previewDataUrl(page);

  // (6b) a new "Sections" control (E9-F4d) drives the rendered artifact AND
  // persists. sectionDisplay.experience.order is the axis exercised: the §22
  // seed profile this fresh server tailors is entirely Experience entries, so
  // it is the one Sections axis guaranteed to relayout the rendered page —
  // its title/employer swap is the same reorder engine-section-order.test.ts
  // asserts at the byte level.
  //
  // The proof is a LIVE pixel-diff (E8-B1's toDataURL pattern) taken with NO
  // reload in between (E9-F4d2 repair): the pinned preview repaints in place
  // on a format change — DocumentPreview re-renders the PDF bytes in an
  // effect keyed on resume/format/density and re-paints the same canvas,
  // rather than requiring a remount. Asserting the diff live (not just after
  // (6c)'s reload below) is what actually proves that repaint wiring, with
  // the body font held fixed so only experience.order differs between the
  // two captures.
  //
  // The full-page preview canvas renders at its native ~918px width, wider
  // than its half of the max-w-5xl (1024px) two-column grid, so it overflows
  // its centered column back over the RIGHT portion of the control panel.
  // The Sections group sits low in that panel, so its full-width combobox is
  // partly under that overflow. Both nudges below keep this a real user
  // interaction (never a forced click): center it vertically to clear the
  // sticky header, then click its LEFT edge, which is clear of the overflow.
  const experienceOrderCombobox = page.getByRole("combobox", { name: "Experience order" });
  await experienceOrderCombobox.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await experienceOrderCombobox.click({ position: { x: 8, y: 8 } });
  // default experience order is now "title-first" ([v3-076]) — pick the OTHER value so
  // this is a real change that fires a PUT (selecting the current value is a no-op).
  const [orderPutResponse] = await Promise.all([
    page.waitForResponse(applicationPut),
    page.getByRole("option", { name: "Employer first" }).click(),
  ]);
  expect(orderPutResponse.status()).toBe(200);
  expect((await orderPutResponse.json()).format.sectionDisplay.experience.order).toBe(
    "employer-first",
  );

  // LIVE repaint — no reload since previewBeforeOrderChange was captured.
  // The pinned preview must have already repainted with the flipped order by
  // the time the PUT above resolves; expect.poll gives the async
  // render-then-paint pipeline room to finish without a fixed sleep.
  await expect
    .poll(() => previewDataUrl(page), { timeout: 15000 })
    .not.toBe(previewBeforeOrderChange);

  // (6c) reload — the Sections change persists AND the reloaded (freshly
  // mounted) preview still paints the flipped order: its page-1 pixels still
  // differ from the pre-change baseline, with the body font unchanged
  // between the two.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Body font" })).toHaveText(/Arimo/);
  await expect(page.getByRole("combobox", { name: "Experience order" })).toHaveText(
    /Employer first/,
  );
  await expectCanvasPainted(page);
  await expect
    .poll(() => previewDataUrl(page), { timeout: 15000 })
    .not.toBe(previewBeforeOrderChange);

  // (7) the deep URL, opened by a FRESH server round-trip (not client-side
  // router push), resolves to the SAME design view via the SPA fallback —
  // never the catch-all's redirect to /applications.
  await page.goto(`/applications/${applicationId}/design`);
  await expect(page).toHaveURL(`/applications/${applicationId}/design`);
  await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Body font" })).toBeVisible();

  // (7b) E9-F5d — save-current-as-preset -> saved-presets gallery round trip.
  // Design at this point is arimo + Employer first (persisted by (5)/(6b));
  // that full snapshot is what gets saved and, later below, re-applied.
  const settingsPut = (r: import("@playwright/test").Response) =>
    r.url().endsWith("/api/settings") && r.request().method() === "PUT";

  const PRESET_NAME = `E2E Preset ${runId}`;
  page.once("dialog", (dialog) => dialog.accept(PRESET_NAME));
  const [savePutResponse] = await Promise.all([
    page.waitForResponse(settingsPut),
    page.getByRole("button", { name: "Save current design as preset" }).click(),
  ]);
  expect(savePutResponse.status()).toBe(200);
  const savedPresetsAfterSave = (await savePutResponse.json()).presets as Array<{
    name: string;
    format: { fonts: { body: string } };
  }>;
  const savedEntry = savedPresetsAfterSave.find((p) => p.name === PRESET_NAME);
  expect(savedEntry, "the new preset must be in the persisted presets[]").toBeTruthy();
  expect(savedEntry?.format.fonts.body).toBe("arimo");

  // The saved preset appears in the gallery immediately (same settings query
  // cache the mutation just invalidated), with its ATS grade badge.
  await page.getByRole("button", { name: "Browse templates" }).click();
  await expect(page.getByRole("heading", { name: "Browse templates" })).toBeVisible();
  await expect(page.getByText("Your saved presets")).toBeVisible();
  const savedPresetButton = page.getByRole("button", { name: new RegExp(`^${PRESET_NAME}`) });
  await expect(savedPresetButton).toBeVisible();
  await expect(savedPresetButton.getByText(/^ATS: (strict|good)$/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // Diverge the live design AWAY from the saved snapshot — a different body
  // font — so re-applying the preset below is an observable change.
  await page.getByRole("combobox", { name: "Body font" }).click();
  const [divergePutResponse] = await Promise.all([
    page.waitForResponse(applicationPut),
    page.getByRole("option", { name: "Roboto" }).click(),
  ]);
  expect(divergePutResponse.status()).toBe(200);
  expect((await divergePutResponse.json()).format.fonts.body).toBe("roboto");
  await expectCanvasPainted(page);

  // Reload — both the diverged application format AND the saved preset
  // (persisted server-side via settings) survive a fresh mount.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Body font" })).toHaveText(/Roboto/);
  await expectCanvasPainted(page);

  await page.getByRole("button", { name: "Browse templates" }).click();
  await expect(page.getByText("Your saved presets")).toBeVisible();
  const savedPresetButtonAfterReload = page.getByRole("button", {
    name: new RegExp(`^${PRESET_NAME}`),
  });
  await expect(savedPresetButtonAfterReload).toBeVisible();

  // Selecting it applies its stored format DIRECTLY — the body font flips
  // back to arimo (the format it held at save time), proving the round trip.
  const [applyPutResponse] = await Promise.all([
    page.waitForResponse(applicationPut),
    savedPresetButtonAfterReload.click(),
  ]);
  expect(applyPutResponse.status()).toBe(200);
  expect((await applyPutResponse.json()).format.fonts.body).toBe("arimo");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("combobox", { name: "Body font" })).toHaveText(/Arimo/);
  await expectCanvasPainted(page);

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
  // Locked read-only reaches the new Sections group too.
  await expect(page.getByRole("combobox", { name: "Skills & languages layout" })).toBeDisabled();
  await expect(page.getByLabel("Group promotions")).toBeDisabled();
  await expectCanvasPainted(page);

  expect(pageErrors, `unexpected page errors: ${pageErrors.join(", ")}`).toHaveLength(0);
  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join(", ")}`).toHaveLength(0);
});
