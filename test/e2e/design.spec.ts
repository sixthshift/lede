// Design controls — v3-T012, folded into the workspace's Design card
// (ApplicationDetail, spec.md §27/§28.3) rather than a dedicated
// /applications/:id/design route (E9-F1a, now dropped). Follows
// applications.spec.ts's own conventions (same "applications" project/
// server: real first-run set-password -> login, LEDE_TAILOR_ENGINE=fixture
// so tailoring replays a recorded decision with no API key) — see that
// file's header comment for why CONTRAST_JDS[0].jd is used byte-for-byte
// rather than retyped.
//
// This spec is scoped to what design.spec.ts always covered, re-homed onto
// the workspace: reaching the design controls WITHOUT leaving
// /applications/:id, the debounced-then-persisted format PUT, the preview
// host (now always an allPages host, folded in rather than lost), locked
// read-only controls with a still-live preview, and the stale
// /applications/:id/design deep link now REDIRECTING to the same
// application's workspace instead of 404ing. The full tailor/lock/download
// lifecycle is already covered by applications.spec.ts — this file drives
// just enough of that lifecycle to reach a tailored (and, later, locked)
// application.
import { test, expect } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import {
  firstRunLogin,
  createApplication,
  tailor,
  lockFinal,
  resumePreviewCanvas,
  expectResumeCanvasPainted,
  canvasSnapshot,
  assertNoModalOverlay,
} from "./helpers/workspace";

// MUST match applications.spec.ts's PASSWORD exactly (playwright.config.ts:
// this spec shares that file's "applications" server/project, and the auth
// gate's password is a single server-wide secret). Whichever of the two
// spec files runs first sets it via LoginForm's real first-run flow; the
// other's identical firstRunLogin call then hits the SAME setup-409-then-login
// fallback LoginForm always runs, succeeding because the value matches what's
// already set.
const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — same recorded fixture applications.spec.ts uses

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const COMPANY_MARKER = `E2E Design Co ${runId}`;

// expectResumeCanvasPainted (test/e2e/helpers/workspace.ts) is the same
// non-white-pixel oracle applications.spec.ts uses — its `.first()` on
// `.document-preview canvas` is what makes it correct here too, against the
// preview pane's (now always allPages) host.

// Pixel-diff pattern (E8-B1, applications.spec.ts's thumbnailDataUrl) applied
// to the pinned preview canvas rather than a template-card thumbnail — a
// snapshot of the actual painted pixels (canvasSnapshot, workspace.ts),
// compared before/after a Sections control change to prove the change
// repainted the real PDF rather than just flipping a control's own on-screen
// state.
function previewDataUrl(page: import("@playwright/test").Page): Promise<string> {
  return canvasSnapshot(resumePreviewCanvas(page));
}

const expectCanvasPainted = expectResumeCanvasPainted;

// DesignPanel's internal control groups default COLLAPSED (F505/T041a —
// design-accordion.spec.ts): a control inside a folded group is present in the
// DOM but its region is `overflow-hidden` at 0 height, so a direct `.click()`
// on it lands on the group wrapper instead ("intercepts pointer events").
// Opening the owning group first is the redesigned UX's real interaction (a
// user expands the group to reach its controls) and persists across this
// test's reloads via the group's own localStorage key. Idempotent: a no-op
// when the group is already expanded. (Read-only assertions like
// toBeDisabled/toHaveText don't need this — only click targets do.)
async function expandDesignGroup(
  page: import("@playwright/test").Page,
  key: string,
): Promise<void> {
  const toggle = page.getByTestId(`design-group-toggle-${key}`);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  }
}

test("design controls: reachable in-workspace, debounced persistence, preview host, locked read-only", async ({
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
    // host is the SAME usePDF -> pdf.js pipeline (now painting every page,
    // not just the first, since the design view's allPages host folded
    // into this one).
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

  await page.setViewportSize({ width: 1280, height: 900 });

  // (1) fresh boot -> set-password -> logged in.
  await page.goto("/");
  await firstRunLogin(page, PASSWORD);
  loggedIn = true;
  await expect(page).toHaveURL(/\/applications$/);

  // (2) create + tailor an application (same recorded fixture as
  // applications.spec.ts — see that file's header for why this exact JD).
  const applicationId = await createApplication(page, { company: COMPANY_MARKER, jd: JD });

  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId);
  await expect(page.getByRole("button", { name: "Re-tailor", exact: true })).toBeVisible();

  // (3) the design controls are reachable WITHOUT leaving /applications/:id
  // — the Design card's own heading/controls, never a separate route.
  await expect(page).toHaveURL(`/applications/${applicationId}`);
  await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();
  // Open the Typography group so its Body font control is reachable for the
  // click below (default-collapsed since T041a; localStorage-persisted, so
  // this one open holds through every reload in this test).
  await expandDesignGroup(page, "typography");
  await expect(page.getByRole("combobox", { name: "Body font" })).toBeVisible();

  // (4) the co-visible preview host painted a real PDF.
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

  // (6) reload — the body-font change persists, still without ever having
  // left /applications/:id. This freshly mounts the pinned preview at the
  // persisted format (arimo, experience title-first — the seed default,
  // [v3-076]), which is the baseline for the Sections pixel-diff below.
  await page.reload();
  await expect(page).toHaveURL(`/applications/${applicationId}`);
  await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Body font" })).toHaveText(/Arimo/);
  await expectCanvasPainted(page);
  const previewBeforeOrderChange = await previewDataUrl(page);

  // (6b) the "Sections" control (E9-F4d) drives the rendered artifact AND
  // persists. sectionDisplay.experience.order is the axis exercised: the §22
  // seed profile this fresh server tailors is entirely Experience entries, so
  // it is the one Sections axis guaranteed to relayout the rendered page —
  // its title/employer swap is the same reorder engine-section-order.test.ts
  // asserts at the byte level.
  //
  // The proof is a LIVE pixel-diff (E8-B1's toDataURL pattern) taken with NO
  // reload in between: the pinned preview repaints in place on a format
  // change — DocumentPreview re-renders the PDF bytes in an effect keyed on
  // resume/format/density and re-paints the same canvas, rather than
  // requiring a remount. Asserting the diff live (not just after (6c)'s
  // reload below) is what actually proves that repaint wiring, with the body
  // font held fixed so only experience.order differs between the two
  // captures. The workspace's editor/preview panes are separate columns
  // (never overlapping, unlike the former dedicated design view's two-column
  // grid), so this is a plain click — no scroll/position workaround needed.
  // Open the Sections › Experience group so its "Experience order" control is
  // reachable for the click below (same default-collapse as Typography above).
  await expandDesignGroup(page, "sectionsExperience");
  const experienceOrderCombobox = page.getByRole("combobox", { name: "Experience order" });
  await experienceOrderCombobox.scrollIntoViewIfNeeded();
  await experienceOrderCombobox.click();
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
  await expect(page).toHaveURL(`/applications/${applicationId}`);
  await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Body font" })).toHaveText(/Arimo/);
  await expect(page.getByRole("combobox", { name: "Experience order" })).toHaveText(
    /Employer first/,
  );
  await expectCanvasPainted(page);
  await expect
    .poll(() => previewDataUrl(page), { timeout: 15000 })
    .not.toBe(previewBeforeOrderChange);

  // (7) a stale deep link to the FORMER dedicated design route, opened by a
  // FRESH server round-trip (not client-side router push), REDIRECTS to the
  // SAME application's workspace — never a 404, never the generic
  // /applications catch-all — and the workspace's real content is there.
  await page.goto(`/applications/${applicationId}/design`);
  await expect(page).toHaveURL(`/applications/${applicationId}`);
  await expect(page.getByTestId("workspace-shell")).toBeVisible();
  await expect(page.getByText(COMPANY_MARKER)).toBeVisible();
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

  // The saved preset appears in the inline template picker immediately (same
  // settings query cache the mutation just invalidated), with its ATS grade
  // badge. v4-T041b: the "Browse templates" popover is deleted — the inline
  // picker (TemplatePicker's "Your saved presets" block) is now the single
  // template-choice surface, so this reads it in-flow with no dialog to open.
  await expect(page.getByText("Your saved presets")).toBeVisible();
  const savedPresetButton = page.getByRole("button", { name: new RegExp(`^${PRESET_NAME}`) });
  await savedPresetButton.scrollIntoViewIfNeeded();
  await expect(savedPresetButton).toBeVisible();
  await expect(savedPresetButton.getByText(/^ATS: (strict|good)$/)).toBeVisible();

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

  await expect(page.getByText("Your saved presets")).toBeVisible();
  const savedPresetButtonAfterReload = page.getByRole("button", {
    name: new RegExp(`^${PRESET_NAME}`),
  });
  await savedPresetButtonAfterReload.scrollIntoViewIfNeeded();
  await expect(savedPresetButtonAfterReload).toBeVisible();

  // Selecting it applies its stored format DIRECTLY — the body font flips
  // back to arimo (the format it held at save time), proving the round trip.
  const [applyPutResponse] = await Promise.all([
    page.waitForResponse(applicationPut),
    savedPresetButtonAfterReload.click(),
  ]);
  expect(applyPutResponse.status()).toBe(200);
  expect((await applyPutResponse.json()).format.fonts.body).toBe("arimo");
  await expect(page.getByRole("combobox", { name: "Body font" })).toHaveText(/Arimo/);
  await expectCanvasPainted(page);

  // (8) lock the application — right here, without navigating anywhere —
  // every design control goes read-only, but the preview stays live.
  await lockFinal(page, applicationId);
  await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Body font" })).toBeDisabled();
  await expect(page.getByLabel("Show photo on resume")).toBeDisabled();
  for (const button of await page.getByRole("button", { name: /ATS:/ }).all()) {
    await expect(button).toBeDisabled();
  }
  // Locked read-only reaches the Sections group too.
  await expect(page.getByRole("combobox", { name: "Skills & languages layout" })).toBeDisabled();
  await expect(page.getByLabel("Group promotions")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save current design as preset" })).toBeDisabled();
  await expectCanvasPainted(page);

  expect(pageErrors, `unexpected page errors: ${pageErrors.join(", ")}`).toHaveLength(0);
  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join(", ")}`).toHaveLength(0);
});

// ── v4-T041b: inline template-apply (re-homed from v3-T024's de-modal
// TemplateGallery) ── the "Browse templates" popover is deleted, so the
// popover-panel-only modality/Escape/focus-into-panel assertions are gone
// with it (there is no panel to open). What SURVIVES is the behavioral core
// v3-T024 also proved: selecting a BUILT-IN template from the (now inline)
// picker applies it — observed as the real format PUT round trip, not a no-op
// click on the already-selected card. Reuses this file's own PASSWORD/JD
// (firstRunLogin's setup-409-then-login fallback makes a second first-run
// call safe — see that const's comment above) so this test is fully
// self-contained rather than depending on state left by the test above.
test.describe("inline template picker applies a built-in template (v4-T041b)", () => {
  test("selecting a built-in template card applies it (format PUT round trip), no popover", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/");
    await firstRunLogin(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const COMPANY = `E2E Inline Template Co ${runId}`;
    const applicationId = await createApplication(page, { company: COMPANY, jd: JD });
    await page.goto(`/applications/${applicationId}`);
    await tailor(page, applicationId);
    await expect(page.getByRole("button", { name: "Re-tailor", exact: true })).toBeVisible();

    // The template roster is present INLINE (no "Browse templates" trigger to
    // open) — the picker's real cards, not an empty shell.
    await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();
    const firstCard = page.locator("[data-template-id]").first();
    await expect(firstCard).toBeVisible();

    // The inline picker is in normal flow — no aria-modal, no oversized scrim.
    await assertNoModalOverlay(page);

    // Selecting a built-in template applies it — observed as the format PUT
    // round trip (the same oracle design.spec.ts's saved-preset case uses
    // above), rather than a no-op click on the already-selected card.
    const applicationPut = (r: import("@playwright/test").Response) =>
      r.url().endsWith(`/api/applications/${applicationId}`) && r.request().method() === "PUT";
    const compactCard = page.locator('[data-template-id="compact"]');
    await compactCard.scrollIntoViewIfNeeded();
    await expect(compactCard).toBeVisible();
    const [applyPutResponse] = await Promise.all([
      page.waitForResponse(applicationPut),
      compactCard.click(),
    ]);
    expect(applyPutResponse.status()).toBe(200);
    expect((await applyPutResponse.json()).format.presetId).toBe("compact");
    await expect(compactCard).toHaveAttribute("aria-pressed", "true");
    await expectResumeCanvasPainted(page);
  });
});
