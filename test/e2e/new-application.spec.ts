// T032 (OQ7/F304, spec.md) — NewApplication used to be an ANCHORED POPOVER
// (`absolute right-0 top-full ... w-[28rem] max-w-[90vw]`, NewApplication.tsx
// pre-fix): off-screen at 375, floating OVER the card grid at desktop. The
// fix makes it a true IN-FLOW block inserted above the grid (ApplicationsView
// renders it as a normal sibling, not inside a `relative`-anchored wrapper),
// full-width below `sm` — same shared server/PASSWORD rationale as every
// other spec in the "applications" project (playwright.config.ts).
//
// Anti-gaming (red-team #11 + "gone means removed, not hidden"): the desktop
// case doesn't just check the panel is visible — it diffs the first card's
// boundingBox.y before/after open (must move DOWN, proving push-not-cover),
// hit-tests card corners via elementFromPoint (must resolve to the card, not
// the panel), and asserts no ancestor of the panel — nor the panel itself —
// is absolute/fixed-positioned. It also greps the DOM for the old popover's
// exact class combination, which must match zero elements now that the
// source no longer emits it.
import { test, expect, type Page } from "@playwright/test";
import { login, createApplication } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = "Inline create-panel regression role. React, TypeScript, accessibility.";
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function loginAndSeed(page: Page, marker: string): Promise<string> {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);
  const company = `E2E New Application Co ${runId}-${marker}`;
  await createApplication(page, { company, jd: JD });
  return company;
}

function trigger(page: Page) {
  return page.getByRole("button", { name: "New application" });
}

function panel(page: Page) {
  return page.getByRole("dialog");
}

function firstCard(page: Page) {
  return page.locator("[data-application-id]").first();
}

test.describe("NewApplication inline panel (T032/F304)", () => {
  test("desktop 1280: closed state is unaffected; opening pushes the grid down, covers no card, and the old anchored popover is gone from the DOM", async ({
    page,
  }, testInfo) => {
    // Tall enough that the panel + pushed-down card both stay fully
    // on-screen with no scroll (the hit-test below needs viewport-relative
    // coordinates that resolve to something).
    await page.setViewportSize({ width: 1280, height: 1600 });
    await loginAndSeed(page, `desktop-${testInfo.retry}`);

    // Regression: closed state renders the trigger; no panel; grid present
    // and undisturbed.
    await expect(trigger(page)).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    const card = firstCard(page);
    await expect(card).toBeVisible();
    const beforeBox = await card.boundingBox();
    expect(beforeBox, "card must have a rendered bounding box before opening").not.toBeNull();

    // Open the panel.
    await trigger(page).click();
    await expect(panel(page)).toBeVisible();

    // The old floating/anchored variant must be entirely gone from the DOM
    // (not merely hidden) — its exact former class combination now matches
    // nothing, and more generally no `.absolute` element exists in the
    // NewApplication/grid region acting as a popover host.
    expect(
      await page.locator(".absolute.right-0.top-full").count(),
      "the old anchored popover container must no longer exist in the DOM",
    ).toBe(0);

    // The card row is displaced DOWNWARD, not covered.
    const afterBox = await card.boundingBox();
    expect(afterBox, "card must have a rendered bounding box after opening").not.toBeNull();
    expect(
      afterBox!.y - beforeBox!.y,
      "opening the panel must push the card row down (in-flow displacement)",
    ).toBeGreaterThan(0);

    // Sample the (now-displaced) card's corners: elementFromPoint must
    // resolve to the card or a descendant of it, never the panel. The
    // viewport is tall enough (see setViewportSize below) that the pushed-down
    // card stays fully on-screen, so no scroll is needed to hit-test it.
    const corners: Array<[number, number]> = [
      [afterBox!.x + 4, afterBox!.y + 4],
      [afterBox!.x + afterBox!.width - 4, afterBox!.y + 4],
      [afterBox!.x + 4, afterBox!.y + afterBox!.height - 4],
    ];
    for (const [x, y] of corners) {
      const hitsCard = await card.evaluate(
        (el, [px, py]) => {
          const hit = document.elementFromPoint(px, py);
          return hit != null && (el === hit || el.contains(hit));
        },
        [x, y] as const,
      );
      expect(hitsCard, `card corner (${x}, ${y}) must resolve to the card, never the panel`).toBe(
        true,
      );
    }

    // The panel is genuinely in normal flow: neither it nor any ancestor up
    // to <body> is absolute/fixed-positioned.
    const flow = await panel(page).evaluate((el) => {
      const ownPosition = getComputedStyle(el).position;
      let node: Element | null = el.parentElement;
      let outOfFlowAncestor = false;
      while (node && node !== document.body) {
        const pos = getComputedStyle(node).position;
        if (pos === "absolute" || pos === "fixed") outOfFlowAncestor = true;
        node = node.parentElement;
      }
      return { ownPosition, outOfFlowAncestor };
    });
    expect(
      ["absolute", "fixed"].includes(flow.ownPosition),
      "the panel's own computed position must not be absolute/fixed",
    ).toBe(false);
    expect(
      flow.outOfFlowAncestor,
      "no ancestor of the panel may be absolute/fixed-positioned (floating it out of flow)",
    ).toBe(false);
  });

  test("below sm (375x812): the panel renders full-width and stays fully in-viewport", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAndSeed(page, `mobile-${testInfo.retry}`);

    await trigger(page).click();
    const box = await panel(page).boundingBox();
    expect(box, "panel must have a rendered bounding box").not.toBeNull();

    // Full in-viewport, never off-screen right like the old anchored popover.
    expect(box!.x, "panel left edge must be within the viewport").toBeGreaterThanOrEqual(0);
    expect(
      box!.x + box!.width,
      "panel right edge must not exceed the viewport",
    ).toBeLessThanOrEqual(376);

    // Full-width: spans nearly the whole viewport width (clearing only the
    // page's own padding), not a narrow fixed-width popover parked to one
    // side.
    expect(box!.x, "panel left edge must sit near the page's own left padding").toBeLessThanOrEqual(
      32,
    );
    expect(
      box!.x + box!.width,
      "panel right edge must reach near the page's own right padding",
    ).toBeGreaterThanOrEqual(343);
  });

  test("create still works end-to-end through the inline panel", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const company = `E2E New Application Create ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: JD });
    expect(applicationId).toBeTruthy();

    // Panel closes (unmounts) and the new card is present in the grid.
    await expect(panel(page)).toHaveCount(0);
    await expect(page.locator("[data-application-id]").filter({ hasText: company })).toBeVisible();
  });
});

// T006 — creation flow: navigate on success, no toast, honest failure.
test.describe("NewApplication creation flow (T006)", () => {
  test("success: navigates to the new application's own page, Job details expanded with the submitted JD, preview shows the explainer beats, no toast", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    // Seed a pre-existing application so the new id can be proven distinct.
    const preExistingId = await createApplication(page, {
      company: `E2E T006 Preexisting ${runId}-${testInfo.retry}`,
      jd: JD,
    });

    const toastRegion = page.locator("[data-sonner-toast]");
    await expect(toastRegion).toHaveCount(0);

    const newJd = `T006 success-path job description ${runId}-${testInfo.retry}. React, TypeScript.`;
    await trigger(page).click();
    const dialog = panel(page);
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/^Company/).fill(`E2E T006 New ${runId}-${testInfo.retry}`);
    await dialog.getByLabel("Job description", { exact: true }).fill(newJd);
    await dialog.getByRole("button", { name: "Create application" }).click();

    await page.waitForURL(/\/applications\/[^/]+$/);
    const newId = page.url().split("/applications/")[1];
    expect(newId).toBeTruthy();
    expect(newId, "the new application's id must differ from the pre-existing one").not.toBe(
      preExistingId,
    );

    // Job details section is expanded (setup stage) and carries the JD just
    // submitted through the dialog.
    await expect(page.getByTestId("section-collapse-job")).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("Job description", { exact: true })).toHaveValue(newJd);

    // Preview pane lands on the setup-stage explainer beats, not a document.
    await expect(page.getByTestId("preview-empty-beats")).toBeVisible();

    // No toast rendered anywhere during the flow.
    await expect(toastRegion).toHaveCount(0);
  });

  test("failure: a real server error leaves the URL/dialog/typed JD untouched and shows an inline error, never navigates", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    await page.route("**/api/applications", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal error" }),
      });
    });

    const typedJd = "This JD must survive a failed create untouched.";
    await trigger(page).click();
    const dialog = panel(page);
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Job description", { exact: true }).fill(typedJd);

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith("/api/applications") && r.request().method() === "POST",
      ),
      dialog.getByRole("button", { name: "Create application" }).click(),
    ]);
    expect(response.status()).toBe(500);

    // Never navigates away from the dashboard.
    await expect(page).toHaveURL(/\/applications$/);
    // Dialog stays open, un-torn-down.
    await expect(dialog).toBeVisible();
    // Typed input survives — never cleared on failure.
    await expect(dialog.getByLabel("Job description", { exact: true })).toHaveValue(typedJd);
    // Inline error is shown.
    await expect(dialog.getByRole("alert")).toBeVisible();
  });
});
