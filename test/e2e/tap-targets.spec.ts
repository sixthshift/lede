// T034 (F305) — coarse-pointer 44px tap targets, enumerated audited set, at
// 375x812 + `(pointer: coarse)`. Playwright/Chromium reports a coarse
// pointer when the browser context carries `hasTouch`/`isMobile` (there is
// no `page.emulateMedia` support for the `pointer` media feature itself) —
// asserted explicitly below rather than assumed, per the ticket's own
// caution that a runner that can't force coarse must fail loudly rather than
// silently pass.
//
// Reuses the "applications" project's shared server/password — PASSWORD
// MUST match every other spec in this project exactly (single server-wide
// secret, playwright.config.ts). Tailors with CONTRAST_JDS[0], the same
// recorded fixture other specs in this project reuse, wherever a real
// `application.current` is needed (the detail action strip, the preview
// sheet).
//
// ANTI-GAMING (red-team #34): a container-level blanket `min-height: 44px`
// would bump excluded controls too. Guard: at least one EXCLUDED control (a
// listbox option, ui/select.tsx — a file this ticket doesn't own and doesn't
// touch) is asserted to stay UNDER 44px. Guard 2, "not a padded
// non-interactive wrapper": every locator below resolves the ACTUAL
// interactive element (`getByRole("button"/"link", ...)` or a testid on the
// real <button>/<a>, never a wrapper div) — boundingBox() on that locator IS
// the real functional target's own box, by construction, so there is no
// separate "is this a wrapper" runtime check to perform. (An elementFromPoint
// hit-test at the box's corners was tried and dropped: because a wrapper
// always CONTAINS its real control, `wrapper.contains(realButton)` is true
// regardless of tap position, so that check can't actually distinguish the
// wrapper-cheat from the real thing — and it separately produced false
// negatives from this app's fixed bottom-tab-bar legitimately overlapping
// unrelated content lower on a long scrollable page, which is a pre-existing
// clearance characteristic, not a tap-target sizing regression.)
import { test, expect, type Locator, type Page } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { login, createApplication, tailor } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const MATCHED_JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — recorded fixture, byte-for-byte

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

function shortAxis(box: { width: number; height: number }): number {
  return Math.min(box.width, box.height);
}

/** Chromium reports `(pointer: coarse)` for a context with hasTouch/isMobile emulation — confirmed, not assumed. */
async function assertCoarsePointer(page: Page): Promise<void> {
  const isCoarse = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);
  expect(
    isCoarse,
    "test context must report a coarse pointer (hasTouch/isMobile emulation) — every tap-target floor this spec checks is gated to `pointer: coarse`",
  ).toBe(true);
}

/**
 * The tap-target oracle: `locator` must resolve to the actual functional
 * control (see the file header on why that's what makes this "functional,
 * not a wrapper" rather than a separate runtime check) — its own rendered
 * short axis must be >=44px at coarse pointer.
 */
async function assertTapTarget44(locator: Locator, label: string): Promise<void> {
  await expect(locator, `${label} must be visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} must have a rendered bounding box`).not.toBeNull();
  expect(
    shortAxis(box!),
    `${label} short axis (min(width,height)) must be >=44px at coarse pointer — got ${JSON.stringify(box)}`,
  ).toBeGreaterThanOrEqual(44);
}

function newApplicationTrigger(page: Page): Locator {
  return page.getByRole("button", { name: "New application" });
}

function closeButton(scope: Locator): Locator {
  return scope.getByRole("button", { name: "Close" });
}

test.describe("Coarse-pointer 44px tap targets (T034/F305)", () => {
  test.beforeEach(async ({ page }) => {
    await assertCoarsePointer(page);
  });

  test("1. bottom tab bar: all three primary nav items are >=44px on their short axis", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const bar = page.getByTestId("bottom-tab-bar");
    await expect(bar).toBeVisible();
    const links = await bar.getByRole("link").all();
    expect(links.length).toBe(3);
    for (const [i, link] of links.entries()) {
      await assertTapTarget44(link, `bottom tab bar item #${i}`);
    }
  });

  test("2. New application: trigger, submit, and close controls are all >=44px", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const trigger = newApplicationTrigger(page);
    await assertTapTarget44(trigger, "New application trigger");

    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await assertTapTarget44(closeButton(dialog), "New application panel Close");

    const company = `E2E Tap Targets New App Co ${runId}-${testInfo.retry}`;
    await dialog.getByLabel(/^Company/).fill(company);
    await dialog
      .getByLabel("Job description", { exact: true })
      .fill(`Tap-targets create-flow JD ${runId}-${testInfo.retry}`);

    await assertTapTarget44(
      dialog.getByRole("button", { name: "Create application" }),
      "New application submit",
    );
  });

  test("3. tailor-failure retry affordance (the Tailor/Re-tailor button) is >=44px", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const company = `E2E Tap Targets Fail Co ${runId}-${testInfo.retry}`;
    const unmatchedJd = `An entirely unrecorded job description, never fixture-matched, tap-targets ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: unmatchedJd });
    await page.goto(`/applications/${applicationId}`);
    await expect(page).toHaveURL(new RegExp(`/applications/${applicationId}$`));

    const tailorButton = page.getByTestId("tailor-button");
    const [failResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith(`/api/applications/${applicationId}/tailor`) && r.status() === 422,
      ),
      tailorButton.click(),
    ]);
    expect(failResponse.status()).toBe(422);
    await expect(page.getByTestId("tailor-error")).toBeVisible();

    await assertTapTarget44(tailorButton, "tailor-failure retry (Tailor/Re-tailor button)");
  });

  test("4. letter/preview sheet: open trigger and Close control are both >=44px", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const company = `E2E Tap Targets Sheet Co ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: MATCHED_JD });
    await page.goto(`/applications/${applicationId}`);
    await tailor(page, applicationId);

    const trigger = page.getByTestId("preview-sheet-trigger");
    await assertTapTarget44(trigger, "preview-sheet-trigger");

    await trigger.click();
    const sheet = page.getByTestId("preview-sheet");
    await expect(sheet).toBeVisible();
    await assertTapTarget44(page.getByTestId("preview-sheet-close"), "preview-sheet-close");
  });

  test("4b. lg..xl swap toggle (preview-swap-toggle) is >=44px (already h-11 w-11 — verified, not just asserted from source)", async ({
    page,
  }, testInfo) => {
    // The swap toggle only renders in the lg..xl regime (1024-1279px) — it
    // structurally cannot appear at 375px width. hasTouch/isMobile are
    // context-level (unaffected by resizing the page), so coarse pointer
    // still holds after resizing.
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const company = `E2E Tap Targets Swap Co ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: MATCHED_JD });
    await page.goto(`/applications/${applicationId}`);
    await tailor(page, applicationId);

    await page.setViewportSize({ width: 1100, height: 800 });
    await assertCoarsePointer(page);
    await assertTapTarget44(page.getByTestId("preview-swap-toggle"), "preview-swap-toggle");
  });

  test("5. dashboard card actions (Duplicate/Download/Delete) are all >=44px", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const company = `E2E Tap Targets Card Co ${runId}-${testInfo.retry}`;
    await createApplication(page, {
      company,
      jd: `Card-actions tap-targets JD ${runId}-${testInfo.retry}`,
    });

    const card = page.locator("[data-application-id]").filter({ hasText: company });
    await expect(card).toBeVisible();

    await assertTapTarget44(card.getByTestId("application-card-duplicate"), "card Duplicate");
    await assertTapTarget44(card.getByTestId("application-card-download"), "card Download PDF");
    await assertTapTarget44(card.getByTestId("application-card-delete"), "card Delete");
  });

  test("6. detail action strip (Lock final/Download PDF/Plain text/voice-source) are all >=44px", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const company = `E2E Tap Targets Strip Co ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: MATCHED_JD });
    await page.goto(`/applications/${applicationId}`);
    await tailor(page, applicationId);

    await assertTapTarget44(page.getByRole("button", { name: "Lock final" }), "Lock final");
    await assertTapTarget44(page.getByTestId("tailor-button"), "Re-tailor (action strip)");
    await assertTapTarget44(page.getByRole("button", { name: "Download PDF" }), "Download PDF");
    await assertTapTarget44(page.getByRole("button", { name: "Plain text" }), "Plain text");
    await assertTapTarget44(
      page.getByTestId("flag-voice-resume"),
      "Use as a voice source (resume)",
    );
  });

  test("7. EntryEditor panel save/close controls are >=44px", async ({ page }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await page.goto("/library");

    await page.getByRole("button", { name: "Add entry" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await assertTapTarget44(closeButton(dialog), "EntryEditor panel Close");
    await assertTapTarget44(
      dialog.getByRole("button", { name: "Create entry" }),
      "EntryEditor submit (Create entry)",
    );
  });

  test("excluded set: a listbox option (ui/select.tsx, not owned by this ticket) stays UNDER 44px — proves no blanket bump", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await page.goto("/library");

    await page.getByRole("button", { name: "Add entry" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("combobox", { name: "Section" }).click();
    const option = page.getByRole("option").first();
    await expect(option).toBeVisible();
    const box = await option.boundingBox();
    expect(box, "listbox option must have a rendered bounding box").not.toBeNull();
    expect(
      shortAxis(box!),
      "an excluded control (a listbox option) must stay well under the 44px floor — a container-level blanket bump would fail this",
    ).toBeLessThan(44);
  });

  test("EntryEditor fields render single-column below sm (F305), and restore multi-column at/above sm", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await page.goto("/library");

    await page.getByRole("button", { name: "Add entry" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Default section is "experience" (4 meta fields: Company/Role/Period/
    // Location) — SectionMetaFields.tsx's own grid container carries the
    // testid directly (grid-cols-1 sm:grid-cols-2).
    const grid = page.getByTestId("entry-meta-fields-grid");
    await expect(grid).toBeVisible();

    const columnsBelowSm = await grid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length,
    );
    expect(columnsBelowSm, "field grid must render a single column below sm (375px)").toBe(1);

    // Field boxes stack (each spans full width, left edges aligned) — the
    // ticket's alternative phrasing of the same requirement.
    const fieldBoxes = await grid
      .locator("> div")
      .evaluateAll((divs) => divs.map((d) => d.getBoundingClientRect().x));
    expect(fieldBoxes.length).toBeGreaterThan(1);
    const firstX = fieldBoxes[0]!;
    for (const x of fieldBoxes) {
      expect(
        Math.abs(x - firstX),
        "stacked single-column fields must share the same left edge",
      ).toBeLessThan(1);
    }

    // Bonus (not required by the ticket, cheap to confirm): the 2-column
    // desktop layout is unchanged at/above sm — proves this is a genuine
    // breakpoint swap, not an accidental permanent collapse to 1 column.
    await page.setViewportSize({ width: 900, height: 800 });
    const columnsAtSm = await grid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length,
    );
    expect(columnsAtSm, "field grid must restore 2 columns at/above sm (640px)").toBe(2);
  });
});
