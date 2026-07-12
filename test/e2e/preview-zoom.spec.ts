// Preview zoom (v4-T054, spec.md OQ6/F507) — the >=xl co-visible preview
// pane's own zoom control (WorkspaceShell's `CoVisiblePreviewPane`,
// data-testid "preview-zoom-toggle") plus DocumentPreview's frame-on-rerender
// fix.
//
// Three behaviors under test:
//   - Part 1: zoom is a REAL layout width change (the preview aside gets a
//     wider clamp, the editor's `flex-1` absorbs the difference and shrinks)
//     — never `transform: scale`, which would leave the editor's own layout
//     width untouched. Only exists at >=xl (1280); below it the pane-swap
//     (T033) already hands the preview the full width, so the control must be
//     ABSENT from the DOM entirely (`querySelector === null`), not merely
//     hidden.
//   - Part 2: zoom state is EPHEMERAL — plain `useState` local to a subtree
//     that unmounts whenever `preview` goes away (any non-document route),
//     so it resets on navigate-away-and-back for free, with NO
//     localStorage/sessionStorage write ever (contrast: rail collapse IS
//     persisted, F207/T022 — zoom deliberately is not).
//   - Part 3: DocumentPreview's re-render (e.g. a format-axis change) keeps
//     the page FRAME in place — usePDF's own state (see @react-pdf/renderer)
//     keeps the PRIOR `url` around while `loading` flips true for the
//     update, so the fix is asserting `!instance.url` (not
//     `instance.loading`) is what gates the bare-text state — no drop to
//     bare "Rendering preview…" text, no big layout jump.
//
// Shares applications.spec.ts's "applications" project/server (real
// first-run set-password -> login, gate ON; LEDE_TAILOR_ENGINE=fixture) —
// PASSWORD MUST match that file's exactly (single server-wide secret,
// playwright.config.ts). Tailors with CONTRAST_JDS[0] (the same recorded
// fixture other specs in this project reuse) so the preview pane has a real
// react-pdf canvas to sample pixels/dimensions from.
import { test, expect, type Page, type Locator } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import {
  login,
  createApplication,
  tailor,
  resumePreviewCanvas,
  expectResumeCanvasPainted,
  expandDesignGroup,
  assertNoModalOverlay,
} from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — byte-for-byte, see applications.spec.ts

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function requireBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} must have a rendered bounding box`).not.toBeNull();
  return box!;
}

/** Logs in, creates + tailors an application at 1280 (the co-visible/zoom regime), lands on its detail route. */
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

test.describe("Zoom control absent below xl, present at the xl edge (F507)", () => {
  test("1279 the zoom toggle is not in the DOM at all; 1280 it is", async ({ page }, testInfo) => {
    const company = `E2E Zoom Edge Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);

    await page.setViewportSize({ width: 1279, height: 800 });
    // Settle the regime switch (matchMedia listeners fire a tick behind
    // setViewportSize — pane-arbitration.spec.ts's own convention) before the
    // raw, non-auto-retrying querySelector read below.
    await expect(page.getByTestId("preview-swap-toggle")).toBeVisible();
    expect(
      await page.evaluate(() => document.querySelector('[data-testid="preview-zoom-toggle"]')),
      "zoom toggle must be genuinely ABSENT (null), not just hidden, below xl",
    ).toBeNull();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId("preview-swap-toggle")).toHaveCount(0);
    await expect(page.getByTestId("preview-pane")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.querySelector('[data-testid="preview-zoom-toggle"]') !== null,
      ),
      "zoom toggle must exist at the xl edge (1280)",
    ).toBe(true);
  });
});

test.describe("Zoom: real reflow, editor stays usable, non-modal, exact restore (F507)", () => {
  test("activating zoom widens the preview >=1.5x via real layout, shrinks the editor (still >=240px), stays non-modal; toggling off restores prior widths", async ({
    page,
  }, testInfo) => {
    const company = `E2E Zoom Reflow Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);

    const previewPane = page.getByTestId("preview-pane");
    const editorPane = page.getByTestId("editor-pane");
    const canvas = resumePreviewCanvas(page);
    const zoomToggle = page.getByTestId("preview-zoom-toggle");

    await expect(zoomToggle).toHaveAttribute("aria-pressed", "false");

    const previewBoxBefore = await requireBox(previewPane, "preview pane (pre-zoom)");
    const editorBoxBefore = await requireBox(editorPane, "editor pane (pre-zoom)");
    const canvasBoxBefore = await requireBox(canvas, "preview canvas (pre-zoom)");

    await zoomToggle.click();
    await expect(zoomToggle).toHaveAttribute("aria-pressed", "true");

    // (a) the editor's REAL layout width shrank, and stays >=240px.
    const editorBoxZoomed = await requireBox(editorPane, "editor pane (zoomed)");
    expect(editorBoxZoomed.width, "editor pane must actually shrink once zoomed").toBeLessThan(
      editorBoxBefore.width,
    );
    expect(editorBoxZoomed.width, "editor pane must stay usable (>=240px)").toBeGreaterThanOrEqual(
      240,
    );

    // (b) the preview page canvas's real rendered width is >=1.5x pre-zoom.
    const canvasBoxZoomed = await requireBox(canvas, "preview canvas (zoomed)");
    expect(
      canvasBoxZoomed.width,
      "the painted page canvas must render at least 1.5x wider once zoomed",
    ).toBeGreaterThanOrEqual(canvasBoxBefore.width * 1.5);

    // (c) it's a genuine REFLOW, not `transform: scale` (which would leave
    // the editor's own layout width untouched): the preview pane's own real
    // layout width grew too, and a hit-test at the editor's NEW (narrower)
    // box still resolves to editor content — proving the editor's box
    // itself moved/shrank rather than something merely painting over it.
    const previewBoxZoomed = await requireBox(previewPane, "preview pane (zoomed)");
    expect(
      previewBoxZoomed.width,
      "preview pane's own layout width must have grown",
    ).toBeGreaterThan(previewBoxBefore.width);

    const hitPoint = {
      x: editorBoxZoomed.x + editorBoxZoomed.width - 2,
      y: editorBoxZoomed.y + editorBoxZoomed.height / 2,
    };
    const hitsEditor = await page.evaluate(({ x, y }) => {
      const editor = document.querySelector('[data-testid="editor-pane"]');
      const hit = document.elementFromPoint(x, y);
      return editor != null && hit != null && (editor === hit || editor.contains(hit));
    }, hitPoint);
    expect(
      hitsEditor,
      "a point inside the editor's new (narrower) box must still hit-test to editor content",
    ).toBe(true);

    // (d) zero modality — zoom never introduces an overlay/scrim.
    await assertNoModalOverlay(page);

    // Toggle off — prior widths restored exactly (no residual drift).
    await zoomToggle.click();
    await expect(zoomToggle).toHaveAttribute("aria-pressed", "false");
    const previewBoxRestored = await requireBox(previewPane, "preview pane (restored)");
    const editorBoxRestored = await requireBox(editorPane, "editor pane (restored)");
    expect(Math.abs(previewBoxRestored.width - previewBoxBefore.width)).toBeLessThan(1);
    expect(Math.abs(editorBoxRestored.width - editorBoxBefore.width)).toBeLessThan(1);
  });
});

test.describe("Zoom is ephemeral: no storage write, resets on SPA navigate-away-and-back (F507/OQ6)", () => {
  test("toggling zoom writes no localStorage/sessionStorage key; navigating away and back un-zooms", async ({
    page,
  }, testInfo) => {
    const company = `E2E Zoom Ephemeral Co ${runId}-${testInfo.retry}`;
    const applicationId = await setupTailoredApplication(page, company);

    const snapshotStorage = () =>
      page.evaluate(() => ({
        local: { ...window.localStorage },
        session: { ...window.sessionStorage },
      }));

    const before = await snapshotStorage();

    const zoomToggle = page.getByTestId("preview-zoom-toggle");
    await zoomToggle.click();
    await expect(zoomToggle).toHaveAttribute("aria-pressed", "true");
    const zoomedWidth = (
      await requireBox(page.getByTestId("preview-pane"), "preview pane (zoomed)")
    ).width;

    const after = await snapshotStorage();
    expect(
      after,
      "activating zoom must write no new localStorage/sessionStorage key and change no existing key's value",
    ).toEqual(before);

    // SPA navigate away (client-side route change, not a reload) and back.
    await page.getByRole("link", { name: "Library" }).click();
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByTestId("preview-pane")).toHaveCount(0);

    // Back to the dashboard (the card only exists there), then reopen the
    // same application's detail route.
    await page.getByRole("link", { name: "Applications" }).click();
    await expect(page).toHaveURL(/\/applications$/);
    await page
      .locator(`[data-application-id="${applicationId}"]`)
      .getByTestId("application-card-open")
      .click();
    await expect(page).toHaveURL(`/applications/${applicationId}`);

    const zoomToggleAfterReturn = page.getByTestId("preview-zoom-toggle");
    await expect(zoomToggleAfterReturn).toBeVisible();
    await expect(
      zoomToggleAfterReturn,
      "zoom must have reset to un-zoomed after navigating away and back",
    ).toHaveAttribute("aria-pressed", "false");
    const widthAfterReturn = (
      await requireBox(page.getByTestId("preview-pane"), "preview pane (after return)")
    ).width;
    expect(widthAfterReturn, "the pane must be back at its narrower, un-zoomed width").toBeLessThan(
      zoomedWidth,
    );

    const afterReturn = await snapshotStorage();
    expect(afterReturn, "the navigate-away-and-back reset must also write no storage key").toEqual(
      before,
    );
  });
});

test.describe("Preview frame survives a re-render — no drop to bare loading text (F507)", () => {
  test("changing a format axis (Body font) keeps the page frame in place, no bare-text collapse, no big layout jump", async ({
    page,
  }, testInfo) => {
    const company = `E2E Zoom Frame Co ${runId}-${testInfo.retry}`;
    const applicationId = await setupTailoredApplication(page, company);

    const frame = page.locator(".document-preview__frame").first();
    await expect(frame).toBeVisible();
    const frameBoxBefore = await requireBox(frame, "preview frame (pre-rerender)");

    await expandDesignGroup(page, "typography");
    const bodyFontCombobox = page.getByRole("combobox", { name: "Body font" });
    await bodyFontCombobox.click();

    const applicationPut = (r: import("@playwright/test").Response) =>
      r.url().endsWith(`/api/applications/${applicationId}`) && r.request().method() === "PUT";
    const [putResponse] = await Promise.all([
      page.waitForResponse(applicationPut),
      page.getByRole("option", { name: "Arimo (Arial)" }).click(),
    ]);
    expect(putResponse.status()).toBe(200);

    // No bare-text collapse: the frame stayed mounted throughout, never
    // replaced by ".document-preview__loading".
    await expect(page.locator(".document-preview__loading")).toHaveCount(0);
    await expect(frame).toBeVisible();

    // No big layout jump: the frame's box is still roughly the same page
    // size (a font swap doesn't change the physical page dimensions).
    const frameBoxAfter = await requireBox(frame, "preview frame (post-rerender)");
    expect(Math.abs(frameBoxAfter.width - frameBoxBefore.width)).toBeLessThan(20);
    expect(Math.abs(frameBoxAfter.height - frameBoxBefore.height)).toBeLessThan(20);

    // And the canvas underneath actually did repaint (the font really
    // changed the artifact), not merely a no-op — sanity, not the focus of
    // this spec (design.spec.ts owns the full pixel-diff proof).
    await expectResumeCanvasPainted(page);
  });
});
