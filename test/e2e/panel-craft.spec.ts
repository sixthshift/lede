// T055/F508 — docked-panel craft. Four things about EntryEditor /
// ProfileEditor / LayoutEditor that this spec pins by BEHAVIOR, not markup:
//
//  1. Sticky header — the title+close band stays put while the body scrolls
//     (the whole-panel scroll used to clip the title on autofocus/submit).
//     Asserted as geometry: the header's boundingBox is unchanged after the
//     body has actually scrolled (scrollTop > 0, real overflow proven first).
//  2. Close = X — the close control is the lucide `X` icon (SVG class carries
//     `lucide-x`), not a chevron. Anti-gaming: a chevron with
//     aria-label="Close" would pass an accessible-name-only check, so we
//     assert the icon IDENTITY (class token), not merely the name.
//  3. Reworded sort label — EntryEditor's raw "Sort key (YYYYMM…)" is now the
//     humanized "Sort date — newest first". Asserted by POSITIVE equality
//     (toHaveText exact), never by absence of the old string.
//  4. Facts auto-grow — a fact field grows in height as multi-line content is
//     typed (a fixed single-line input / fixed-rows textarea would not).
//
// Shares the "applications" project's server/PASSWORD (see playwright.config.ts)
// — a real first-run login -> /library round-trip, no tailor-fixture need of
// its own, same rationale as docked-panel-bounds.spec.ts.
import { test, expect, type Page } from "@playwright/test";
import { firstRunLogin } from "./helpers/workspace";
import type { Locator } from "@playwright/test";

const PASSWORD = "correct horse battery staple e2e applications";

// Let the T043 entrance animation (zoom-in-95/fade-in over ~200ms) settle
// before measuring geometry — a box captured mid-zoom drifts a pixel or two as
// the panel finishes scaling to 100%, which is animation noise, not a layout
// shift.
async function settleAnimations(scope: Locator): Promise<void> {
  await scope.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
  );
}

async function loginAndOpenLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await firstRunLogin(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();
}

const PANELS = [
  { open: "Add entry", title: "Add entry" },
  { open: "Edit profile", title: "Edit profile" },
  { open: "Edit layout", title: "Edit layout" },
] as const;

test.describe("F508 panel craft (v4-T055)", () => {
  for (const panel of PANELS) {
    test(`${panel.title}: close control is a lucide X named "Close" (not a chevron)`, async ({
      page,
    }) => {
      await loginAndOpenLibrary(page);
      await page.getByRole("button", { name: panel.open }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      const close = dialog.getByRole("button", { name: "Close" });
      await expect(close).toBeVisible();

      // Icon IDENTITY, not accessible name: lucide stamps `lucide-<kebab>` on
      // every icon's <svg>. `X` => `lucide-x`; a chevron => `lucide-chevron-*`,
      // which would fail here even while carrying aria-label="Close".
      const svgClass = (await close.locator("svg").getAttribute("class")) ?? "";
      expect(svgClass, `close icon svg class was "${svgClass}"`).toMatch(/\blucide-x\b/);
      expect(svgClass).not.toMatch(/chevron/i);
    });

    test(`${panel.title}: header stays put while the body scrolls`, async ({ page }) => {
      // Short viewport so the panel's max-h clamps below its content height and
      // the body genuinely overflows on all three panels.
      await page.setViewportSize({ width: 1280, height: 500 });
      await loginAndOpenLibrary(page);
      await page.getByRole("button", { name: panel.open }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await settleAnimations(dialog);

      const header = dialog.getByTestId("panel-header");
      const body = dialog.getByTestId("panel-body");
      await expect(header).toBeVisible();
      await expect(body).toBeVisible();

      // Prove the body is a real scroller (otherwise the stability assertion
      // below is vacuous).
      const overflow = await body.evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(
        overflow,
        "panel body must actually overflow to be a meaningful scroll test",
      ).toBeGreaterThan(0);

      const before = await header.boundingBox();
      expect(before).not.toBeNull();

      await body.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      const scrolled = await body.evaluate((el) => el.scrollTop);
      expect(scrolled, "body must have actually scrolled").toBeGreaterThan(0);

      const after = await header.boundingBox();
      expect(after).not.toBeNull();
      // Header must not move a pixel while the body scrolls underneath it.
      expect(after!.x).toBeCloseTo(before!.x, 0);
      expect(after!.y).toBeCloseTo(before!.y, 0);
      expect(after!.width).toBeCloseTo(before!.width, 0);
      expect(after!.height).toBeCloseTo(before!.height, 0);
    });
  }

  test("EntryEditor: sort label reads 'Sort date — newest first' (exact)", async ({ page }) => {
    await loginAndOpenLibrary(page);
    await page.getByRole("button", { name: "Add entry" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // POSITIVE equality — the label text IS the humanized copy. (Absence of the
    // old "Sort key (YYYYMM…)" string would pass for any other wording.)
    const label = dialog.locator('label[for="entry-sortkey"]');
    await expect(label).toHaveText("Sort date — newest first");
  });

  test("EntryEditor: a fact field grows in height with multi-line content", async ({ page }) => {
    await loginAndOpenLibrary(page);
    await page.getByRole("button", { name: "Add entry" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await settleAnimations(dialog);

    const fact = dialog.getByLabel("Facts 1", { exact: true });
    await expect(fact).toBeVisible();
    const initial = (await fact.boundingBox())!.height;

    await fact.fill(
      "Line one of a long multi-line fact\nLine two continues the thought\nLine three\nLine four",
    );

    // The auto-grow effect re-fits height to content on the next layout pass.
    await expect.poll(async () => (await fact.boundingBox())!.height).toBeGreaterThan(initial);
  });
});
