// Mutation probe (T003, red-team C2): proves the shared canvas-painted
// oracle (test/e2e/helpers/workspace.ts expectResumeCanvasPainted /
// expectLocatorCanvasPainted) actually CAN fail — a check that can never go
// red is worthless as a measuring instrument for every later UI phase that
// leans on it. Pure e2e test: the injection that breaks the canvas is
// test-side only (page.addStyleTag), never an app/src edit.
//
// Reuses the same "applications" project server/fixture/login as
// applications.spec.ts (PASSWORD MUST match exactly — single server-wide
// password, playwright.config.ts) so create+tailor produces a real painted
// resume preview keylessly (LEDE_TAILOR_ENGINE=fixture).
import { test, expect } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import {
  firstRunLogin,
  createApplication,
  tailor,
  expectResumeCanvasPainted,
} from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — same recorded fixture

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const COMPANY_MARKER = `E2E Mutation Probe Co ${runId}`;

test("expectResumeCanvasPainted fails on a hidden canvas and passes once restored", async ({
  page,
}) => {
  await page.goto("/");
  await firstRunLogin(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const applicationId = await createApplication(page, { company: COMPANY_MARKER, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId);

  // Sanity: the oracle passes on the real, unmodified painted preview
  // before we break anything — otherwise a failure below would prove
  // nothing about the injection.
  await expectResumeCanvasPainted(page);

  // (1) BROKEN STATE — test-side-only injection, never an app/src edit.
  const styleTag = await page.addStyleTag({
    content: ".document-preview canvas { display: none; }",
  });
  console.log("injected: canvas hidden");

  let caughtMessage: string | undefined;
  await expect(expectResumeCanvasPainted(page)).rejects.toThrow();
  try {
    // Re-run once more, outside the matcher, purely to capture and log the
    // actual error message as auditable evidence (the line above already
    // proved rejection; this doesn't change pass/fail).
    await expectResumeCanvasPainted(page);
  } catch (err) {
    caughtMessage = err instanceof Error ? err.message : String(err);
  }
  expect(caughtMessage, "must have caught a real error from the broken-state check").toBeTruthy();
  console.log(`caught error: ${caughtMessage}`);

  // (2) RESTORED STATE — remove the injection, the oracle passes again.
  await styleTag.evaluate((el) => el.remove());
  await expectResumeCanvasPainted(page);
  console.log("restored: canvas repainted");
});
