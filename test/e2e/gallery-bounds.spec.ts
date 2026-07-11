// F102/T013 (spec.md, .ailoop/oracle.md Phase 0 gate) — TEMPORARY: Phase 4/
// T041 deletes the whole `TemplateGallery` popover and re-targets this
// containment assertion onto whatever inline presentation survives, so this
// file's only job is proving the Phase-0 reposition and staying out of the
// way once that happens.
//
// TemplateGallery.tsx:105 used `absolute right-0`, anchored to the "Browse
// templates" trigger's own box — but that trigger sits wherever the
// right-justified Design-card button row places it, not at the editor
// pane's edge, so a 42rem-wide panel hung 49px off the LEFT of that anchor
// and opened under the rail with its title and first tile column cut. The
// fix repositions it (`fixed left-56 top-16`, pinned to the SAME width
// tokens WorkspaceShell already defines for its rail/preview panes) so its
// box sits fully inside the editor pane at 1280x720 — this spec proves that
// geometrically, not just "a dialog opened".
//
// Anti-gaming (oracle.md's protocols + this ticket's own acceptance): a
// corner-tucked, near-zero popover would also satisfy naive containment, so
// this asserts the title AND first tile each have nonzero rendered size and
// individually sit inside the pane, AND that every template card (full
// count, full name text) survives un-shrunk — not just the first one.
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

// boundingBox() containment: `inner` fully inside `outer`'s box, on all four
// edges (equality allowed — sitting flush against an edge isn't clipping).
function expectContained(
  inner: { x: number; y: number; width: number; height: number },
  outer: { x: number; y: number; width: number; height: number },
) {
  expect(inner.x, "left edge inside the pane").toBeGreaterThanOrEqual(outer.x - 0.5);
  expect(inner.y, "top edge inside the pane").toBeGreaterThanOrEqual(outer.y - 0.5);
  expect(inner.x + inner.width, "right edge inside the pane").toBeLessThanOrEqual(
    outer.x + outer.width + 0.5,
  );
  expect(inner.y + inner.height, "bottom edge inside the pane").toBeLessThanOrEqual(
    outer.y + outer.height + 0.5,
  );
}

async function openGallery(page: Page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await firstRunLogin(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Gallery Bounds Co ${runId}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);

  await page.getByRole("button", { name: "Browse templates" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("F102 template gallery reposition (v4-T013, TEMPORARY — Phase 4/T041 re-targets)", () => {
  test("gallery boundingBox is fully within the editor pane at 1280x720, non-degenerate", async ({
    page,
  }) => {
    const dialog = await openGallery(page);

    const editorPane = requireBox(await page.getByTestId("editor-pane").boundingBox());
    const dialogBox = requireBox(await dialog.boundingBox());

    // The whole panel is inside the editor pane — not just "some dialog
    // opened somewhere on the page".
    expectContained(dialogBox, editorPane);

    // NOT degenerate: title and first tile each render at real size AND
    // individually sit inside the pane (rules out a near-zero, corner-tucked
    // popover that would also pass a naive box-containment check).
    const title = page.getByRole("heading", { name: "Browse templates" });
    const titleBox = requireBox(await title.boundingBox());
    expect(titleBox.width).toBeGreaterThan(20);
    expect(titleBox.height).toBeGreaterThan(8);
    expectContained(titleBox, editorPane);

    const firstTile = page.locator("[data-template-id]").first();
    const firstTileBox = requireBox(await firstTile.boundingBox());
    expect(firstTileBox.width).toBeGreaterThan(50);
    expect(firstTileBox.height).toBeGreaterThan(50);
    expectContained(firstTileBox, editorPane);

    // Full tile roster preserved — un-shrunk, not truncated to fit. Scoped
    // to the dialog: the inline TemplatePicker below shares the same
    // data-template-id attributes and stays mounted underneath.
    const expectedIds = Object.keys(PRESET_MANIFESTS);
    const tiles = dialog.locator("[data-template-id]");
    await expect(tiles).toHaveCount(expectedIds.length);

    for (const manifest of Object.values(PRESET_MANIFESTS)) {
      const card = dialog.locator(`[data-template-id="${manifest.id}"]`);
      await expect(card.getByText(manifest.name, { exact: true })).toBeVisible();
      await expect(card.getByText(manifest.description)).toBeVisible();
    }

    // De-modal ban (CLAUDE.md, oracle.md): no aria-modal, no scrim covering
    // >50% of the viewport, at >=lg.
    await assertNoModalOverlay(page);
  });
});
