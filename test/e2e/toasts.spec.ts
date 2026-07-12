// T040/F401 — the feedback layer. Two locked rules under test:
//   (1) every named success mutation fires EXACTLY ONE auto-dismissing toast
//       (sonner's `<li data-sonner-toast>` region), enumerated across all 8
//       (red-team #15: asserted individually, never one loop that no-ops on a
//       missing one);
//   (2) a mutation FAILURE never toasts — it renders an inline error beside
//       its trigger (the flagVoice pattern) — and the failure is a REAL server
//       error, not a client-side short-circuit.
//
// Shares the "applications" project's server/password (single server-wide
// secret, fixture tailor engine) — PASSWORD MUST match applications.spec.ts
// exactly. See playwright.config.ts's applications-project comment.
import { test, expect, type Page } from "@playwright/test";
import { login, createApplication, openAddEntry, submitAndClose } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// sonner renders each toast as a `<li data-sonner-toast>` inside its region;
// counting these nodes (they're removed on auto-dismiss, unlike the always-
// present `<ol>` container) is the 0→1→0 oracle.
function toasts(page: Page) {
  return page.locator("[data-sonner-toast]");
}

// sonner PAUSES its auto-dismiss timer while the pointer is over the toaster
// region (onMouseEnter). Several triggers here (the bottom-right docked
// panels' Save buttons) leave the cursor exactly where the bottom-right toast
// paints, so the timer would stay paused forever. Parking the cursor at the
// top-left corner — off the toaster — before every dismissal wait is what
// makes the 1→0 transition deterministic rather than hover-dependent.
async function waitForNoToasts(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await expect(toasts(page)).toHaveCount(0, { timeout: 15000 });
}

/**
 * The shared success oracle: EXACTLY one toast carrying `message` appears
 * (0→1), no others ride alongside it (spam guard), then it auto-dismisses
 * (1→0). Matched by message so each named mutation is asserted individually.
 */
async function expectSingleToast(page: Page, message: string): Promise<void> {
  const all = toasts(page);
  await expect(all.filter({ hasText: message })).toBeVisible();
  await expect(all).toHaveCount(1);
  await waitForNoToasts(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);
});

// ── 8 named success mutations, each its own test (red-team #15) ──

test("create application → one 'Application created' toast", async ({ page }, testInfo) => {
  await expect(toasts(page)).toHaveCount(0);
  await createApplication(page, {
    company: `E2E Toast Create ${runId}-${testInfo.retry}`,
    jd: "A job description for the create-toast case.",
  });
  await expectSingleToast(page, "Application created");
});

test("duplicate application → one 'Application duplicated' toast", async ({ page }, testInfo) => {
  const id = await createApplication(page, {
    company: `E2E Toast Dup ${runId}-${testInfo.retry}`,
    jd: "A job description for the duplicate-toast case.",
  });
  await waitForNoToasts(page); // let the create toast clear before the duplicate one
  const card = page.locator(`[data-application-id="${id}"]`);
  await card.getByTestId("application-card-duplicate").click();
  await expectSingleToast(page, "Application duplicated");
});

test("delete application → one 'Application deleted' toast", async ({ page }, testInfo) => {
  const id = await createApplication(page, {
    company: `E2E Toast Del ${runId}-${testInfo.retry}`,
    jd: "A job description for the delete-toast case.",
  });
  await waitForNoToasts(page);
  const card = page.locator(`[data-application-id="${id}"]`);
  await card.getByTestId("application-card-delete").click(); // arm
  await card.getByTestId("application-card-delete").click(); // confirm
  await expectSingleToast(page, "Application deleted");
});

test("entry save → one 'Entry saved' toast", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();
  await expect(toasts(page)).toHaveCount(0);
  const dialog = await openAddEntry(page);
  await dialog.getByLabel(/^Company/).fill("Toast Entry Co");
  await dialog.getByLabel(/^Role/).fill("Staff Engineer");
  await dialog.getByLabel(/^Period/).fill("2020-2022");
  await dialog.getByLabel("Facts 1", { exact: true }).fill(`toast entry fact ${runId}`);
  await submitAndClose(dialog, "Create entry");
  await expectSingleToast(page, "Entry saved");
});

test("profile save → one 'Profile saved' toast", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Edit profile" })).toBeVisible();
  await expect(toasts(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Edit profile" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Name + email are the required fields — fill so the save is valid.
  await dialog.getByLabel("Name", { exact: true }).fill(`Toast User ${runId}`);
  await dialog.getByLabel("Email", { exact: true }).fill("toast@example.com");
  await dialog.getByRole("button", { name: "Save profile" }).click();
  await expectSingleToast(page, "Profile saved");
});

test("layout save → one 'Layout saved' toast (call-site, not the shared hook)", async ({
  page,
}) => {
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Edit layout" })).toBeVisible();
  await expect(toasts(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Edit layout" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Save layout" }).click();
  await expectSingleToast(page, "Layout saved");
});

test("import → one 'Library imported' toast", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Import" })).toBeVisible();
  await expect(toasts(page)).toHaveCount(0);
  // An empty-but-valid backup: the server accepts it (200), imports nothing.
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/import") && r.request().method() === "POST"),
    page.locator('input[type="file"]').setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({})),
    }),
  ]);
  expect(resp.status()).toBe(200);
  await expectSingleToast(page, "Library imported");
});

test("export → one 'Backup exported' toast", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
  await expect(toasts(page)).toHaveCount(0);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/export") && r.request().method() === "GET"),
    page.getByRole("button", { name: "Export" }).click(),
  ]);
  expect(resp.status()).toBe(200);
  await expectSingleToast(page, "Backup exported");
});

// ── Failure contrast (≥2): a real server error → inline error, NO toast ──

test("FAILURE CONTRAST — a failed duplicate (real 404) shows an inline error and NO toast", async ({
  page,
}, testInfo) => {
  const id = await createApplication(page, {
    company: `E2E Toast DupFail ${runId}-${testInfo.retry}`,
    jd: "A job description for the duplicate-failure case.",
  });
  await waitForNoToasts(page); // clear the create toast before the failing duplicate

  // Rewrite the duplicate POST to a non-existent id so the SERVER genuinely
  // 404s — a real server error the mutation's onError surfaces, not a
  // client-side short-circuit.
  const bogusId = "00000000-0000-4000-8000-000000000000";
  await page.route(`**/api/applications/${id}/duplicate`, (route) =>
    route.continue({ url: route.request().url().replace(`/${id}/`, `/${bogusId}/`) }),
  );

  const card = page.locator(`[data-application-id="${id}"]`);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/api/applications/${bogusId}/duplicate`)),
    card.getByTestId("application-card-duplicate").click(),
  ]);
  expect(resp.status()).toBe(404); // proof a real server error occurred

  await expect(card.getByTestId("application-card-error")).toHaveText(
    "Couldn't duplicate this application.",
  );
  await expect(toasts(page)).toHaveCount(0); // no success toast, ever
});

test("FAILURE CONTRAST — an invalid import file (real 400) shows an inline error and NO toast", async ({
  page,
}) => {
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Import" })).toBeVisible();
  await expect(toasts(page)).toHaveCount(0);

  // Valid JSON, schema-invalid backup (`entries` must be an array): parses
  // client-side, so it genuinely reaches the server — which rejects it 400.
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/import") && r.request().method() === "POST"),
    page.locator('input[type="file"]').setInputFiles({
      name: "bad-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ entries: 123 })),
    }),
  ]);
  expect(resp.status()).toBe(400); // proof a real server rejection occurred

  await expect(page.getByTestId("import-error")).toBeVisible();
  await expect(toasts(page)).toHaveCount(0); // no success toast on a bad import
});
