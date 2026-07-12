// F105 (T015): a tailor 422 must surface INLINE next to the Tailor/Re-tailor
// button on the SAME screen — no navigation — and the failure badge must
// reflect immediately (useTailorApplication invalidates onSettled, not just
// onSuccess; ApplicationDetail now reads tailorApplication.isError).
//
// Driven keylessly via the FixtureEngine's 422 ("no_fixture") path: an
// unmatched JD (never a recorded CONTRAST_JDS fixture) makes
// FixtureEngine.decide throw NoFixtureError, same deterministic mechanism
// applications.spec.ts's own letter-generation failure test already uses for
// the letter side (see its "a failed generation surfaces a distinct failed
// badge" test) — this is the resume-tailor mirror of that, minus the reload
// it relies on (this ticket's whole point is that no reload should be
// needed).
//
// Reuses the "applications" project's shared server/password (single
// server-wide password — PASSWORD MUST match applications.spec.ts exactly).
//
// ANTI-GAMING: after the inline error appears, the test edits the JD to the
// recorded fixture (CONTRAST_JDS[0].jd) via JobPanel and retries — a
// SUCCESSFUL tailor must both clear the inline error AND flip the badge to
// "Tailored", proving the fix invalidates onSettled (both branches), not
// onError-only (which would never clear on success) or onSuccess-only
// (which would never show the failure in the first place).
import { test, expect } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { login, createApplication } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const MATCHED_JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — recorded fixture

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test("tailor failure (F105): 422 renders an inline error + failure badge without navigation, and a successful retry clears both", async ({
  page,
}, testInfo) => {
  const marker = `${runId}-${testInfo.retry}`;
  const company = `E2E Tailor Fail Co ${marker}`;
  const unmatchedJd = `An entirely unrecorded job description, never fixture-matched ${marker}`;

  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const applicationId = await createApplication(page, { company, jd: unmatchedJd });
  await page.goto(`/applications/${applicationId}`);
  await expect(page).toHaveURL(new RegExp(`/applications/${applicationId}$`));

  const tailorButton = page.getByTestId("tailor-button");
  const tailorError = page.getByTestId("tailor-error");
  await expect(tailorButton).toHaveText("Tailor", { exact: true });
  await expect(tailorError).toHaveCount(0);
  await expect(page.getByText("Failed", { exact: true })).toHaveCount(0);

  // (1) RED — the fixture engine 422s on the unmatched JD.
  const [failResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/tailor`) && r.status() === 422,
    ),
    tailorButton.click(),
  ]);
  expect(failResponse.status()).toBe(422);
  expect((await failResponse.json()).error).toBe("no_fixture");

  // No navigation: still on the same detail route.
  await expect(page).toHaveURL(new RegExp(`/applications/${applicationId}$`));

  // Inline error renders next to the Tailor button, on the same screen —
  // no reload driving this (unlike the letter test's own asymmetry, which
  // this ticket does NOT touch).
  await expect(tailorError).toBeVisible();
  await expect(tailorError).toHaveText(
    "No recorded fixture matches this job description — couldn't tailor.",
  );

  // Failure badge reflects immediately (onSettled invalidation), and the
  // button label already flipped to "Re-tailor" (genState left "untailored"
  // for "failed").
  await expect(page.getByText("Failed", { exact: true })).toBeVisible();
  await expect(tailorButton).toHaveText("Re-tailor", { exact: true });

  // (2) GREEN — edit the JD to the recorded fixture via JobPanel, save, then
  // retry. The Job details panel starts open (no `current` resume exists
  // yet — the failed attempt never produced one).
  await page.getByLabel("Job description", { exact: true }).fill(MATCHED_JD);
  const [saveResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}`) && r.request().method() === "PUT",
    ),
    page.getByRole("button", { name: "Save", exact: true }).click(),
  ]);
  expect(saveResponse.status()).toBe(200);

  const [successResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/tailor`) && r.status() === 200,
    ),
    tailorButton.click(),
  ]);
  expect(successResponse.status()).toBe(200);

  // The SAME transition, same DOM, no reload: the inline error clears AND
  // the badge flips to success — not two independent before/after
  // snapshots, but one continuous page asserted twice.
  await expect(tailorError).toHaveCount(0);
  await expect(page.getByText("Failed", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Tailored", { exact: true })).toBeVisible();
  await expect(tailorButton).toHaveText("Re-tailor", { exact: true });
});
