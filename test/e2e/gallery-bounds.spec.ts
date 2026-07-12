// F102 (spec.md, .ailoop/oracle.md Phase 0 gate) — RE-HOMED (v4-T041b): the
// original `TemplateGallery` "Browse templates" popover is deleted; its inline
// counterpart, `TemplatePicker`, is now the single template-choice surface on
// the detail route. This file's F102 intent survives verbatim, re-targeted
// onto that inline picker: the template roster must sit fully WITHIN the
// editor pane at 1280x720, at real (non-degenerate) size, with the FULL
// roster present — never clipped, never shrunk to fit, never spilling under
// the rail or the preview pane.
//
// Anti-gaming (oracle.md's protocols + this ticket's own acceptance): a
// near-zero, corner-tucked set of tiles would also satisfy naive
// containment, so this asserts each tile has nonzero rendered size AND
// individually sits inside the pane, AND that every template card (full
// count, full name + description text) survives un-shrunk — not just the
// first one.
import { test, expect, type Page } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { PRESET_MANIFESTS } from "../../src/client/document/registry";
import { firstRunLogin, createApplication, assertNoModalOverlay } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd;
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

function requireBox(box: { x: number; y: number; width: number; height: number } | null) {
  expect(box, "element must have a rendered bounding box").not.toBeNull();
  return box!;
}

// boundingBox() HORIZONTAL containment: `inner`'s left+right edges sit inside
// `outer`'s box (equality allowed — sitting flush against an edge isn't
// clipping). This is the F102 axis: the deleted popover's bug was hanging off
// the LEFT of its anchor and sliding UNDER THE RAIL (horizontal clip); the
// inline picker lives in the editor pane's own vertically-SCROLLING column,
// so its tiles legitimately extend past the viewport's bottom edge — vertical
// overflow is by design (that's what scrolling is for) and is NOT clipping.
function expectHorizontallyContained(
  inner: { x: number; width: number },
  outer: { x: number; width: number },
) {
  expect(inner.x, "left edge inside the pane").toBeGreaterThanOrEqual(outer.x - 0.5);
  expect(inner.x + inner.width, "right edge inside the pane").toBeLessThanOrEqual(
    outer.x + outer.width + 0.5,
  );
}

async function openDetail(page: Page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await firstRunLogin(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Gallery Bounds Co ${runId}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();
}

test.describe("F102 inline template picker bounds (v4-T041b — re-homed from the deleted gallery popover)", () => {
  test("the inline template picker is fully within the editor pane at 1280x720, non-degenerate, full roster", async ({
    page,
  }) => {
    await openDetail(page);

    const editorPane = requireBox(await page.getByTestId("editor-pane").boundingBox());

    // Full tile roster preserved — un-shrunk, not truncated to fit.
    const expectedIds = Object.keys(PRESET_MANIFESTS);
    const tiles = page.locator("[data-template-id]");
    await expect(tiles).toHaveCount(expectedIds.length);

    // Every card: NON-degenerate (real rendered size, rules out a near-zero
    // corner-tucked tile that would pass naive containment) AND fully inside
    // the editor pane (never clipped under the rail or preview pane).
    for (const manifest of Object.values(PRESET_MANIFESTS)) {
      const card = page.locator(`[data-template-id="${manifest.id}"]`);
      await card.scrollIntoViewIfNeeded();
      const cardBox = requireBox(await card.boundingBox());
      expect(cardBox.width, `${manifest.id} tile has real width`).toBeGreaterThan(50);
      expect(cardBox.height, `${manifest.id} tile has real height`).toBeGreaterThan(50);
      expectHorizontallyContained(cardBox, editorPane);

      // Name + description render at full text, not truncated to fit.
      await expect(card.getByText(manifest.name, { exact: true })).toBeVisible();
      await expect(card.getByText(manifest.description)).toBeVisible();
    }

    // De-modal ban (CLAUDE.md, oracle.md): the inline picker is in normal
    // flow — no aria-modal, no scrim covering >50% of the viewport, at >=lg.
    await assertNoModalOverlay(page);
  });
});
