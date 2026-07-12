// F103/T014 (spec.md, .ailoop/oracle.md Phase 0 gate) — CHROME-AGNOSTIC:
// EntryEditor/ProfileEditor/LayoutEditor (`fixed right-6 top-6 z-20`) used to
// open half-buried under the header (`z-40`) — title/close sliced, close
// hit-area partially blocked. The fix repositions each panel to dock
// `bottom-6 right-6` instead of `top-6`, clear of the one edge nothing in
// this app is fixed/sticky to, rather than hard-coding a top offset around
// the CURRENT header's height/z (which Phase 1/T020 deletes outright).
//
// Anti-gaming (oracle.md's protocols + this ticket's own acceptance): this
// spec asserts geometry, not "a dialog opened" — title AND close fully
// in-viewport, hit-testable via elementFromPoint (the point resolves to the
// panel's own element, not something painted over it), AND the title box
// does not intersect ANY OTHER fixed/sticky element found generically in the
// DOM. No selector here names the header — this assertion must survive
// Phase 1's chrome merge unchanged (pre-merge it catches a header collision;
// post-merge, with no header left, it's vacuously true).
import { test, expect, type Page, type Locator } from "@playwright/test";
import { firstRunLogin } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const VIEWPORT = { width: 1280, height: 720 };

async function requireBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} must have a rendered bounding box`).not.toBeNull();
  return box!;
}

function assertFullyInViewport(
  box: { x: number; y: number; width: number; height: number },
  label: string,
) {
  expect(box.x, `${label} left edge is within the viewport`).toBeGreaterThanOrEqual(-0.5);
  expect(box.y, `${label} top edge is within the viewport`).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width, `${label} right edge is within the viewport`).toBeLessThanOrEqual(
    VIEWPORT.width + 0.5,
  );
  expect(box.y + box.height, `${label} bottom edge is within the viewport`).toBeLessThanOrEqual(
    VIEWPORT.height + 0.5,
  );
}

// EVERY sampled point across `target`'s own box (all four corners, inset 1px,
// plus the center) must resolve, via elementFromPoint, to `target` itself or
// one of its descendants/ancestors — i.e. nothing else is painted on top of
// it ANYWHERE in its box. Center-only would miss a PARTIAL slice (exactly
// the F103 shape: title/close sliced along one edge, not fully covered) —
// the corners are what catch a control that's merely clipped along its top.
async function assertHitTestableAcrossOwnBox(target: Locator, label: string) {
  const box = await requireBox(target, label);
  const { x, y, width: w, height: h } = box;
  const points: Array<[number, number]> = [
    [x + 1, y + 1],
    [x + w - 1, y + 1],
    [x + 1, y + h - 1],
    [x + w - 1, y + h - 1],
    [x + w / 2, y + h / 2],
  ];
  for (const [px, py] of points) {
    const ok = await target.evaluate(
      (el, [hx, hy]) => {
        const hit = document.elementFromPoint(hx, hy);
        return hit != null && (el === hit || el.contains(hit) || hit.contains(el));
      },
      [px, py],
    );
    expect(
      ok,
      `${label} must be hit-testable at (${px}, ${py}) (elementFromPoint) — a control sliced along one edge fails here even though its center clears`,
    ).toBe(true);
  }
}

// Generic, chrome-agnostic anti-gaming check: no OTHER element anywhere in
// the DOM that is CAPABLE of painting over arbitrary same-page content —
// position fixed/sticky, OR a static-but-stacking-context-forming element
// (backdrop-filter/filter/transform/opacity/will-change/isolation) carrying
// an explicit z-index, the same mechanism that let this app's own header
// (position: static, but `backdrop-blur` + z-40) win over a plain `z-20`
// fixed sibling — may intersect the title's bounding box. Measured purely by
// computed style + getBoundingClientRect, never by tag name or a header
// reference: this is what rules out a diff that merely wins the stacking
// order (z-20 -> z-50) while leaving the panel physically under the header.
async function assertTitleClearOfOtherPersistentChrome(dialog: Locator, titleBox: DOMRectLike) {
  const offenders = await dialog.evaluate((dialogEl, box) => {
    function formsStackingContext(style: CSSStyleDeclaration): boolean {
      if (style.position !== "static") return true;
      if (style.opacity !== "1") return true;
      if (style.filter !== "none") return true;
      if (style.backdropFilter !== "none") return true;
      if (style.transform !== "none") return true;
      if (style.isolation === "isolate") return true;
      if (style.mixBlendMode !== "normal") return true;
      if (style.willChange !== "auto") return true;
      return false;
    }
    const all = Array.from(document.querySelectorAll("body *"));
    return all
      .filter((el) => {
        if (el === dialogEl || dialogEl.contains(el)) return false;
        const style = getComputedStyle(el);
        const canPaintOverAnything =
          style.position === "fixed" ||
          style.position === "sticky" ||
          (formsStackingContext(style) && style.zIndex !== "auto");
        if (!canPaintOverAnything) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const noOverlap =
          rect.right <= box.x ||
          rect.left >= box.x + box.width ||
          rect.bottom <= box.y ||
          rect.top >= box.y + box.height;
        return !noOverlap;
      })
      .map((el) => `${el.tagName.toLowerCase()}.${Array.from(el.classList).join(".")}`);
  }, titleBox);
  expect(
    offenders,
    `title box must not intersect any other persistent/stacking chrome element (found: ${offenders.join(", ")})`,
  ).toEqual([]);
}

interface DOMRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function assertPanelDocksCleanly(dialog: Locator, titleName: string): Promise<void> {
  await expect(dialog).toBeVisible();

  const title = dialog.getByText(titleName, { exact: true });
  const close = dialog.getByRole("button", { name: "Close" });

  const titleBox = await requireBox(title, `"${titleName}" title`);
  const closeBox = await requireBox(close, `"${titleName}" close control`);

  assertFullyInViewport(titleBox, `"${titleName}" title`);
  assertFullyInViewport(closeBox, `"${titleName}" close control`);

  await assertHitTestableAcrossOwnBox(title, `"${titleName}" title`);
  await assertHitTestableAcrossOwnBox(close, `"${titleName}" close control`);

  await assertTitleClearOfOtherPersistentChrome(dialog, titleBox);
}

async function loginAndOpenLibrary(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/");
  await firstRunLogin(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();
}

test.describe("F103 docked panels open fully within viewport (v4-T014, chrome-agnostic)", () => {
  test("EntryEditor ('Add entry'): title and close fully in-viewport, clear of other chrome", async ({
    page,
  }) => {
    await loginAndOpenLibrary(page);
    await page.getByRole("button", { name: "Add entry" }).click();
    const dialog = page.getByRole("dialog");
    await assertPanelDocksCleanly(dialog, "Add entry");
  });

  test("ProfileEditor ('Edit profile'): title and close fully in-viewport, clear of other chrome", async ({
    page,
  }) => {
    await loginAndOpenLibrary(page);
    await page.getByRole("button", { name: "Edit profile" }).click();
    const dialog = page.getByRole("dialog");
    await assertPanelDocksCleanly(dialog, "Edit profile");
  });

  test("LayoutEditor ('Edit layout'): title and close fully in-viewport, clear of other chrome", async ({
    page,
  }) => {
    await loginAndOpenLibrary(page);
    await page.getByRole("button", { name: "Edit layout" }).click();
    const dialog = page.getByRole("dialog");
    await assertPanelDocksCleanly(dialog, "Edit layout");
  });
});
