// T062/OQ2 — below-`lg` (1024px) sanctioned sheet exception for the three
// Library docked panels (EntryEditor/LayoutEditor/ProfileEditor). The P5
// app-wide modality sweep (cohesion.spec.ts) flagged a real regression: at
// 375px, the docked panel's `bottom-6 right-6 w-[30rem] max-w-[90vw]
// max-h-[85vh]` box is ~70-76% of the viewport as a FLOATING overlay — the
// pinned modality taxonomy counts an overlay >50% of the viewport as
// MODALITY, even with `modal={false}` (no aria-modal). The fix: below `lg`,
// the panel becomes a FULL-WIDTH SHEET (`inset-0`, no floating gap, no
// partial-cover) — the OQ2-sanctioned below-lg exception. At `lg`+ the panel
// is unchanged (docked, <50% of viewport).
//
// Anti-gaming: a `bottom-6 right-6 w-[30rem]` floating box is NARROWER than
// the viewport and INSET from the edges — this spec asserts the geometry
// (inset ~0, width ~= full viewport) that distinguishes a real sheet from a
// merely-relabeled floating overlay. At 1280x720 the inverse is asserted:
// docked width (NOT full viewport width, inset from edges) — proving desktop
// wasn't accidentally turned into a sheet too.
//
// Shares the "applications" project's server/PASSWORD, same rationale as
// docked-panel-bounds.spec.ts/panel-craft.spec.ts (see playwright.config.ts).
import { test, expect, type Page, type Locator } from "@playwright/test";
import { firstRunLogin } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";

const MOBILE = { width: 375, height: 812 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 720 };

interface PanelSpec {
  name: string;
  trigger: string;
  dockedWidthPx: number; // 30rem = 480px, 26rem = 416px at the default 16px root
}

const PANELS: PanelSpec[] = [
  { name: "EntryEditor", trigger: "Add entry", dockedWidthPx: 480 },
  { name: "LayoutEditor", trigger: "Edit layout", dockedWidthPx: 416 },
  { name: "ProfileEditor", trigger: "Edit profile", dockedWidthPx: 480 },
];

async function loginAndOpenLibrary(
  page: Page,
  viewport: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await firstRunLogin(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();
}

// Let the T043 entrance animation settle before measuring geometry — a box
// captured mid-zoom drifts a pixel or two, which is animation noise, not a
// layout shift (same rationale as panel-craft.spec.ts's own helper).
async function settleAnimations(scope: Locator): Promise<void> {
  await scope.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
  );
}

async function requireBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} must have a rendered bounding box`).not.toBeNull();
  return box!;
}

for (const viewport of [MOBILE, TABLET]) {
  test.describe(`T062 below-lg sheet regime at ${viewport.width}x${viewport.height}`, () => {
    for (const panel of PANELS) {
      test(`${panel.name}: full-width sheet, no aria-modal, dismissible (Escape + Close), focus-managed`, async ({
        page,
      }) => {
        await loginAndOpenLibrary(page, viewport);

        const trigger = page.getByRole("button", { name: panel.trigger });
        await trigger.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await settleAnimations(dialog);

        // SANCTIONED SHEET geometry: inset ~0, full viewport width/height — a
        // `bottom-6 right-6 w-[30rem]` floating box (narrower than the
        // viewport, inset from its edges) fails these bounds.
        const box = await requireBox(dialog, `${panel.name} panel`);
        expect(box.x, `${panel.name} left inset must be ~0 (full-width sheet)`).toBeLessThanOrEqual(
          1,
        );
        expect(box.y, `${panel.name} top inset must be ~0 (full-width sheet)`).toBeLessThanOrEqual(
          1,
        );
        expect(
          box.width,
          `${panel.name} width must be ~= viewport width (${viewport.width})`,
        ).toBeGreaterThanOrEqual(viewport.width - 2);
        expect(
          box.height,
          `${panel.name} height must be ~= viewport height (${viewport.height})`,
        ).toBeGreaterThanOrEqual(viewport.height - 2);

        // role="dialog" with NO aria-modal="true" — a sanctioned non-modal
        // sheet, not a modal.
        const ariaModal = await dialog.getAttribute("aria-modal");
        expect(
          ariaModal === null || ariaModal !== "true",
          `${panel.name} must not carry aria-modal="true"`,
        ).toBe(true);

        // FOCUS-MANAGED on open: focus lands inside the panel.
        const focusInsidePanel = await dialog.evaluate((el) => el.contains(document.activeElement));
        expect(focusInsidePanel, `${panel.name} must receive focus on open`).toBe(true);

        // DISMISSIBLE via Escape.
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();

        // Re-open, dismiss via the visible Close (X) control, and confirm
        // focus returns to the trigger that opened it.
        await trigger.click();
        const reopened = page.getByRole("dialog");
        await expect(reopened).toBeVisible();
        await settleAnimations(reopened);

        await reopened.getByRole("button", { name: "Close" }).click();
        await expect(reopened).toBeHidden();
        await expect(trigger).toBeFocused();
      });
    }
  });
}

test.describe("T062 docked panels unchanged at 1280x720 (>= lg)", () => {
  for (const panel of PANELS) {
    test(`${panel.name}: docked, NOT a full-width sheet`, async ({ page }) => {
      await loginAndOpenLibrary(page, DESKTOP);

      const trigger = page.getByRole("button", { name: panel.trigger });
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await settleAnimations(dialog);

      const box = await requireBox(dialog, `${panel.name} panel`);

      // Docked width unchanged (30rem/26rem), well short of the viewport —
      // rules out accidentally making desktop a sheet too.
      expect(
        box.width,
        `${panel.name} docked width must stay ~${panel.dockedWidthPx}px`,
      ).toBeGreaterThan(panel.dockedWidthPx - 20);
      expect(
        box.width,
        `${panel.name} docked width must stay ~${panel.dockedWidthPx}px`,
      ).toBeLessThan(panel.dockedWidthPx + 20);
      expect(box.width, `${panel.name} must not be full-width at 1280`).toBeLessThan(
        DESKTOP.width - 50,
      );

      // Inset from both edges (bottom-6 right-6), not flush like a sheet.
      expect(box.x, `${panel.name} must be inset from the left edge`).toBeGreaterThan(10);
      expect(box.x + box.width, `${panel.name} must be inset from the right edge`).toBeLessThan(
        DESKTOP.width - 10,
      );
    });
  }
});
