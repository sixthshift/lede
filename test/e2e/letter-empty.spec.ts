// Letter-tab empty-state parity (F405/T044) — driven in a real chromium tab
// against the "applications" project's server (auth gate ON, fixture tailor
// engine, same PASSWORD applications.spec.ts sets). The letter preview's
// empty placeholder used to be bare text ("Nothing to preview yet.") while
// the resume side got a designed dashed-card + CTA. This asserts the letter
// tab now gets STRUCTURAL PARITY: a dashed-border card + a CTA whose arrow
// glyph (→) is present exactly once and stays on the same line-box as the
// CTA text (never wrapping to its own line).
//
// No letter is generated: an application with letterCurrent === null renders
// the empty branch of ApplicationDetail's docTab ternary, which is exactly
// the state under test. The Letter tab button exists before any letter, so
// switchPreviewDoc reaches the empty state directly.
import { test, expect } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { firstRunLogin, createApplication, switchPreviewDoc } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd;
const COMPANY = `LetterEmpty ${Date.now()}`;

test("letter empty state mirrors the resume dashed-card + CTA, arrow on the CTA line", async ({
  page,
}) => {
  await page.goto("/");
  await firstRunLogin(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const applicationId = await createApplication(page, { company: COMPANY, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByRole("button", { name: "Tailor", exact: true })).toBeVisible();

  // Switch the preview to the letter tab WITHOUT generating a letter.
  await switchPreviewDoc(page, "letter");

  const emptyCard = page.getByTestId("letter-empty");
  await expect(emptyCard).toBeVisible();

  // Structural parity #1: the card carries a dashed border (same token as the
  // resume empty state's `border-dashed`).
  const borderStyle = await emptyCard.evaluate((el) => getComputedStyle(el).borderStyle);
  expect(borderStyle).toContain("dashed");

  // Structural parity #2: a CTA is present.
  const ctaText = emptyCard.getByTestId("letter-cta-text");
  await expect(ctaText).toBeVisible();

  // Red-team: the arrow glyph is present EXACTLY once. Deleting the arrow to
  // stop it wrapping (the failure this guards against) drops the count to 0.
  const arrow = emptyCard.getByTestId("letter-cta-arrow");
  await expect(arrow).toHaveCount(1);
  await expect(arrow).toHaveText("→");

  // The arrow shares the CTA text's line-box: same vertical position (they are
  // on one line, not wrapped). ~2px tolerance for glyph-baseline differences.
  const textBox = await ctaText.boundingBox();
  const arrowBox = await arrow.boundingBox();
  expect(textBox, "CTA text must have a layout box").not.toBeNull();
  expect(arrowBox, "CTA arrow must have a layout box").not.toBeNull();
  expect(Math.abs(arrowBox!.y - textBox!.y)).toBeLessThanOrEqual(2);
});
