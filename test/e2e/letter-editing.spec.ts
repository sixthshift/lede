// T50/OQ5/F501 — red-team #17. Before this ticket, paragraph editing lived
// INSIDE LetterPreview, which renders in the narrow (v3-T011) preview pane
// column — the same column, the same scroll container, as the letter's own
// canvas. Reaching a paragraph field meant scrolling that column, which
// scrolled the canvas you were supposedly editing right out of view. This
// spec proves the fix structurally, not just behaviorally: the paragraph
// fields now live in the WIDE editor pane's Cover-letter section (its own,
// separate scroll container), so scrolling to reach one never touches the
// preview pane at all — the letter canvas stays on-screen, at its real
// (un-shrunk) scale, the whole time.
//
// Red-team #17's specific bar: "≥50% of the canvas visible while editing" is
// a claim a cheat could satisfy by shrinking the canvas until it trivially
// fits — so this also pins an ABSOLUTE floor on the canvas's rendered width
// (the resume preview's own canvas width at the same viewport, since both
// share the identical `max-width:100%` scaling rule off the identical
// preview-pane column — see app.css) that such a shrink would fail.
//
// Own server/project — shares the "applications" project's server (real
// first-run password + LEDE_TAILOR_ENGINE=fixture), same rationale every
// other spec registered in that project already documents in
// playwright.config.ts.
import { test, expect } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import {
  login,
  createApplication,
  tailor,
  generateLetter,
  switchPreviewDoc,
  resumePreviewCanvas,
  letterPreviewCanvas,
  expectResumeCanvasPainted,
  expectLetterCanvasPainted,
  letterParagraphField,
} from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — same fixture-keyed JD applications.spec.ts uses.
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test("red-team #17: paragraph editing lives in the editor pane (not the preview), and the letter canvas stays ≥50% in-viewport at real scale while a paragraph field is focused", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Letter Editing Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);

  // A real tailored resume gives this spec its own un-gameable floor below —
  // the resume canvas's rendered width at this exact viewport, off the exact
  // same preview-pane scaling rule the letter canvas uses.
  await tailor(page, applicationId);
  await expectResumeCanvasPainted(page);
  const resumeCanvasBox = await resumePreviewCanvas(page).boundingBox();
  expect(resumeCanvasBox, "resume canvas must have a real layout box").toBeTruthy();

  await generateLetter(page, applicationId, { status: 200 });
  await switchPreviewDoc(page, "letter");
  await expectLetterCanvasPainted(page);

  // ── Structural half: editing is IN the editor pane, the preview is
  // VIEW-ONLY. `letterParagraphField` is itself scoped to
  // `workspace-section-body-letter` (the Cover-letter editor section), so
  // its mere visibility already proves containment — pinned again here
  // explicitly against `editor-pane` for a locator-independent second proof.
  const paragraphField = letterParagraphField(page, 0);
  await expect(paragraphField).toBeVisible();
  await expect(
    page.getByTestId("editor-pane").locator('[data-testid="letter-edit-paragraph-0"]'),
  ).toHaveCount(1);

  expect(
    await page.getByTestId("letter-preview").locator("textarea").count(),
    "the preview pane's letter host must be view-only — no textarea anywhere inside it",
  ).toBe(0);

  // ── Behavioral half: reach the field the way a real user would — click
  // (which scrolls the editor pane's OWN scroll container as needed) rather
  // than a bare, scroll-skipping .focus().
  await paragraphField.click();
  await expect(paragraphField).toBeFocused();

  const letterCanvas = letterPreviewCanvas(page);
  const letterCanvasBox = await letterCanvas.boundingBox();
  expect(
    letterCanvasBox,
    "letter canvas must have a real layout box while the paragraph field is focused",
  ).toBeTruthy();

  const viewport = page.viewportSize();
  expect(viewport, "viewport size must be known").toBeTruthy();

  const visibleWidth = Math.max(
    0,
    Math.min(letterCanvasBox!.x + letterCanvasBox!.width, viewport!.width) -
      Math.max(letterCanvasBox!.x, 0),
  );
  const visibleHeight = Math.max(
    0,
    Math.min(letterCanvasBox!.y + letterCanvasBox!.height, viewport!.height) -
      Math.max(letterCanvasBox!.y, 0),
  );
  const visibleArea = visibleWidth * visibleHeight;
  const totalArea = letterCanvasBox!.width * letterCanvasBox!.height;
  const visibleFraction = visibleArea / totalArea;

  expect(
    visibleFraction,
    `at least 50% of the letter canvas's own boundingBox must stay within the viewport while the paragraph field is focused (got ${(visibleFraction * 100).toFixed(1)}%)`,
  ).toBeGreaterThanOrEqual(0.5);

  // ── The un-gameable half: the ≥50% claim above means nothing if the
  // canvas rendered shrunk down to fit trivially. Its width must match the
  // resume preview's own canvas width at this exact viewport (both scaled
  // by the identical `max-width:100%` rule off the identical preview-pane
  // column) — a cheat that shrinks the letter canvas specifically fails
  // this floor even though it would still "pass" the ≥50% check above.
  expect(
    letterCanvasBox!.width,
    `letter canvas width (${letterCanvasBox!.width}px) must match the resume preview canvas's real, un-zoomed scale (${resumeCanvasBox!.width}px) — not a shrunk stand-in`,
  ).toBeGreaterThanOrEqual(resumeCanvasBox!.width - 1);
});
