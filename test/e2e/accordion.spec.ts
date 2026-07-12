// F505 single-presentation contract (v4-T041b) — the Design card once showed
// the template roster TWICE: an inline `<TemplatePicker>` AND a
// `<TemplateGallery>` popover behind a "Browse templates" trigger. T041b
// consolidates to ONE inline presentation. This spec proves the
// consolidation held: the popover trigger is GONE from the DOM, the template
// cards appear EXACTLY ONCE per preset (no duplication between two surfaces),
// and that single surviving picker sits within the editor pane.
//
// Shares the "applications" project/server (real first-run set-password ->
// login, gate ON, LEDE_TAILOR_ENGINE=fixture) — PASSWORD MUST match that
// file's exactly (single server-wide secret, playwright.config.ts).
import { test, expect } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { PRESET_MANIFESTS } from "../../src/client/document/registry";
import { firstRunLogin, createApplication } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd;
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe("F505 single template-choice presentation (v4-T041b)", () => {
  test("the Browse templates popover is gone; exactly one inline picker, within the editor pane", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await firstRunLogin(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const company = `E2E Accordion Co ${runId}`;
    const applicationId = await createApplication(page, { company, jd: JD });
    await page.goto(`/applications/${applicationId}`);
    await expect(page.getByRole("heading", { name: "Design" })).toBeVisible();

    // (1) The "Browse templates" popover trigger is GONE from the DOM — not
    // merely hidden. A querySelector-null-level check: zero matching buttons.
    await expect(page.getByRole("button", { name: "Browse templates" })).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          Array.from(document.querySelectorAll("button")).filter(
            (b) => b.textContent?.trim() === "Browse templates",
          ).length,
      ),
      "no 'Browse templates' trigger anywhere in the DOM",
    ).toBe(0);

    // (2) Exactly ONE template-choice presentation: each preset's
    // [data-template-id] card appears ONCE, not twice (an inline picker + a
    // popover would have duplicated every card). The total count equals the
    // number of built-in presets, not 2x.
    const presetCount = Object.keys(PRESET_MANIFESTS).length;
    await expect(page.locator("[data-template-id]")).toHaveCount(presetCount);
    for (const id of Object.keys(PRESET_MANIFESTS)) {
      await expect(page.locator(`[data-template-id="${id}"]`)).toHaveCount(1);
    }

    // (3) The single surviving picker sits within the editor pane's HORIZONTAL
    // bounds — every card's left+right edges are inside the pane (never under
    // the rail, never spilling into the preview pane). Vertical is NOT
    // asserted: the editor pane is a vertically-scrolling column, so tiles
    // legitimately extend past the viewport's bottom edge (that's scrolling,
    // not clipping).
    const editorPaneBox = await page.getByTestId("editor-pane").boundingBox();
    expect(editorPaneBox, "editor pane must have a rendered box").not.toBeNull();
    for (const id of Object.keys(PRESET_MANIFESTS)) {
      const card = page.locator(`[data-template-id="${id}"]`);
      await card.scrollIntoViewIfNeeded();
      const box = await card.boundingBox();
      expect(box, `${id} card must have a rendered box`).not.toBeNull();
      expect(box!.x, `${id} left edge inside the pane`).toBeGreaterThanOrEqual(
        editorPaneBox!.x - 0.5,
      );
      expect(box!.x + box!.width, `${id} right edge inside the pane`).toBeLessThanOrEqual(
        editorPaneBox!.x + editorPaneBox!.width + 0.5,
      );
    }
  });
});
