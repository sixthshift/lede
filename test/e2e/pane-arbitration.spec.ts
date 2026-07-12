// Pane arbitration below `xl` + proportional preview width (v4-T033,
// spec.md F303/F306/F207).
//
// Three viewport regimes on WorkspaceShell's editor/preview pair:
//   - >=xl (1280): co-visible, no toggle — the preview's width is now
//     PROPORTIONAL (a clamped viewport fraction), not a fixed 384px, so a
//     wide screen genuinely grows the artifact.
//   - lg..xl (1024-1279): SWAP — opening the preview un-renders the editor
//     (a real layout change, never opacity/transform) and the preview takes
//     the full main-area width; a slim always-present toggle strip
//     (`preview-swap-toggle`) survives both directions of the swap.
//   - <lg (below 1024): the SAME swap, but the preview becomes a FULL-WIDTH
//     SHEET (OQ2's sanctioned below-`lg` de-modal exception) — dismissible
//     via Escape AND a visible Close control, focus-managed both ways, no
//     `aria-modal`, and it must not exist at all at >=lg.
//
// Shares applications.spec.ts's "applications" project/server (real
// first-run set-password -> login, gate ON; LEDE_TAILOR_ENGINE=fixture) —
// PASSWORD MUST match that file's exactly (single server-wide secret,
// playwright.config.ts). Tailors with CONTRAST_JDS[0] (the same recorded
// fixture other specs in this project reuse) so the preview pane has a real
// react-pdf canvas to sample pixels from.
import { test, expect, type Page } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { login, createApplication, tailor, expectResumeCanvasPainted } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — byte-for-byte, see applications.spec.ts

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Logs in, creates + tailors an application at a wide (unambiguously co-visible) viewport, and lands on its detail route. */
async function setupTailoredApplication(page: Page, company: string): Promise<string> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId);
  await expectResumeCanvasPainted(page);
  return applicationId;
}

test.describe("Below-lg: full-width preview sheet swaps out the editor (F303/F207)", () => {
  test("768x1024: opening the sheet removes the editor, the preview fills >=60% of the viewport and paints; closing restores the editor", async ({
    page,
  }, testInfo) => {
    const company = `E2E Pane Arb Sheet Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);

    await page.setViewportSize({ width: 768, height: 1024 });
    const editorPane = page.getByTestId("editor-pane");
    await expect(editorPane).toBeVisible();
    expect(
      await editorPane.evaluate((el) => (el as HTMLElement & { inert: boolean }).inert),
      "editor must not start out of tab order",
    ).toBe(false);
    expect(
      await page.getByTestId("preview-sheet").count(),
      "sheet must not exist before it's opened",
    ).toBe(0);

    await page.getByTestId("preview-sheet-trigger").click();

    // "Gone" here is proven the swap regime's way: a genuine zero-width
    // layout change (not opacity/visibility) AND out of tab order (native
    // `inert`) — the editor's own DOM node stays mounted because it hosts
    // ApplicationDetail, the component that portals the preview's content
    // into the sheet in the first place (un-rendering it would kill that
    // source, per WorkspaceShell.tsx's own comment on this). Read the rect
    // via a raw `evaluate` rather than Locator.boundingBox(): that method's
    // own actionability wait requires a non-empty box before it resolves, so
    // it would hang forever against an element that's DELIBERATELY 0-wide.
    const editorRectWidth = await editorPane.evaluate((el) => el.getBoundingClientRect().width);
    expect(editorRectWidth, "editor must be genuinely zero-width when swapped away").toBe(0);
    expect(
      await editorPane.evaluate((el) => (el as HTMLElement & { inert: boolean }).inert),
      "editor must be out of tab order (inert) when swapped away",
    ).toBe(true);

    const sheet = page.getByTestId("preview-sheet");
    await expect(sheet).toBeVisible();
    const viewport = page.viewportSize();
    expect(viewport, "viewport size must be known").toBeTruthy();
    const sheetBox = await sheet.boundingBox();
    expect(sheetBox, "sheet must have a rendered bounding box").not.toBeNull();
    expect(sheetBox!.width / viewport!.width).toBeGreaterThanOrEqual(0.6);

    await expectResumeCanvasPainted(page);

    await page.getByTestId("preview-sheet-close").click();
    await expect(editorPane).toBeVisible();
    expect(
      await editorPane.evaluate((el) => (el as HTMLElement & { inert: boolean }).inert),
      "editor must be back in tab order once the sheet closes",
    ).toBe(false);
    const restoredBox = await editorPane.boundingBox();
    expect(
      restoredBox!.width,
      "editor must regain real width once the sheet closes",
    ).toBeGreaterThan(0);
    expect(await page.getByTestId("preview-sheet").count()).toBe(0);
  });

  test("sheet dismissal: Escape and the visible Close control both close it, restore the editor, and return focus to the trigger", async ({
    page,
  }, testInfo) => {
    const company = `E2E Pane Arb Dismiss Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);
    await page.setViewportSize({ width: 768, height: 1024 });

    const trigger = page.getByTestId("preview-sheet-trigger");
    await trigger.click();
    await expect(page.getByTestId("preview-sheet")).toBeVisible();
    await expect(page.getByTestId("preview-sheet-close")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("preview-sheet")).toHaveCount(0);
    await expect(page.getByTestId("editor-pane")).toBeVisible();
    await expect(page.getByTestId("preview-sheet-trigger")).toBeFocused();

    await page.getByTestId("preview-sheet-trigger").click();
    await expect(page.getByTestId("preview-sheet")).toBeVisible();
    await page.getByTestId("preview-sheet-close").click();
    await expect(page.getByTestId("preview-sheet")).toHaveCount(0);
    await expect(page.getByTestId("editor-pane")).toBeVisible();
    await expect(page.getByTestId("preview-sheet-trigger")).toBeFocused();
  });
});

test.describe(">=xl: proportional preview width (red-team #10)", () => {
  test("1512x900 the preview is measurably wider than the old fixed 384px, within a sane clamp; 1280x800 it's still >=384px; the editor stays usable at both", async ({
    page,
  }, testInfo) => {
    const company = `E2E Pane Arb Proportional Co ${runId}-${testInfo.retry}`;
    await page.setViewportSize({ width: 1512, height: 900 });
    await setupTailoredApplication(page, company);
    // setupTailoredApplication pins its own 1280x800 viewport for the login/
    // create/tailor arc — resize back up to the wide viewport under test.
    await page.setViewportSize({ width: 1512, height: 900 });

    const previewPane = page.getByTestId("preview-pane");
    const editorPane = page.getByTestId("editor-pane");
    await expect(previewPane).toBeVisible();
    await expect(editorPane).toBeVisible();

    const wideBox = await previewPane.boundingBox();
    expect(wideBox, "preview must have a rendered bounding box").not.toBeNull();
    expect(
      wideBox!.width,
      "preview must be wider than the old fixed 384px at 1512",
    ).toBeGreaterThan(384);
    expect(
      wideBox!.width,
      "preview must stay within a sane clamp, not eat the screen",
    ).toBeLessThan(0.5 * 1512);
    const wideEditorBox = await editorPane.boundingBox();
    expect(wideEditorBox!.width).toBeGreaterThanOrEqual(240);

    await page.setViewportSize({ width: 1280, height: 800 });
    const narrowBox = await previewPane.boundingBox();
    expect(narrowBox!.width, "preview must be >=384px at 1280").toBeGreaterThanOrEqual(384);
    const narrowEditorBox = await editorPane.boundingBox();
    expect(narrowEditorBox!.width).toBeGreaterThanOrEqual(240);
  });
});

test.describe("Regime edges + no modality leak at >=lg", () => {
  test("1280 co-visible (no sheet, no swap toggle, no aria-modal); 1279 and 1024 both swap (rail + toggle strip); 1023 sheet regime (rail gone, bottom bar + trigger)", async ({
    page,
  }, testInfo) => {
    const company = `E2E Pane Arb Edges Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);

    // 1280: xl co-visible. Each viewport resize's matchMedia listeners fire
    // asynchronously, a tick behind `setViewportSize` — `toHaveCount`/
    // `toBeVisible` auto-retry until settled, a bare `count()` read right
    // after resizing does not, so every post-resize assertion below uses the
    // auto-waiting form.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId("preview-pane")).toBeVisible();
    await expect(page.getByTestId("preview-sheet")).toHaveCount(0);
    await expect(page.getByTestId("preview-swap-toggle")).toHaveCount(0);
    expect(await page.locator('[aria-modal="true"]').count(), "no aria-modal at 1280").toBe(0);

    // 1279: lg..xl swap regime.
    await page.setViewportSize({ width: 1279, height: 800 });
    await expect(page.getByTestId("rail-pane")).toBeVisible();
    await expect(page.getByTestId("preview-swap-toggle")).toBeVisible();
    await expect(page.getByTestId("preview-sheet")).toHaveCount(0);
    expect(await page.locator('[aria-modal="true"]').count(), "no aria-modal at 1279").toBe(0);

    // 1024: still lg..xl swap regime (the boundary's lg-inclusive edge).
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.getByTestId("rail-pane")).toBeVisible();
    await expect(page.getByTestId("preview-swap-toggle")).toBeVisible();
    await expect(page.getByTestId("preview-sheet")).toHaveCount(0);

    // 1023: below-lg sheet regime.
    await page.setViewportSize({ width: 1023, height: 800 });
    await expect(page.getByTestId("rail-pane")).toHaveCount(0);
    await expect(page.getByTestId("bottom-tab-bar")).toBeVisible();
    await expect(page.getByTestId("preview-sheet-trigger")).toBeVisible();
  });
});
