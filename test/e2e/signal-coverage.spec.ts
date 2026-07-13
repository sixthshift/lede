// T004 — ReasoningPanel's "uncovered signals" readout against REAL decision
// data. Drives the same "platform-sdk" recorded fixture (CONTRAST_JDS[0])
// applications.spec.ts/ats-view.spec.ts already reuse: login -> create ->
// tailor -> assemble -> uncoveredSignals(resume) at render time. No injected
// prop — the assertions below are DERIVED at build time from
// test/fixtures/decisions/platform-sdk.json's own signals.weights and its
// single lede's leadRationale, using the same >=4-char shared-token rule as
// src/shared/signal-coverage.ts:
//
//   weight                                                                | covered?
//   "Designing and shipping a public-facing developer surface"            | yes ("designing"/"shipping"/"public"/"facing")
//   "Creating stable contracts, versioning, and documentation"            | NO  (no shared token with the rationale)
//   "Building a client library for external partners"                    | yes ("client"/"external")
//   "Collaborating with solutions engineering for early adopter onboarding" | yes ("with")
//   "Partnering with product on capability exposure"                      | yes ("with")
//
// hardRequirements is [] in this fixture, so the derived uncovered set is
// exactly the one weight above — the fixture DOES yield >=1 covered AND >=1
// uncovered, as required.
//
// Shares applications.spec.ts's "applications" project/server (real
// first-run set-password -> login, gate ON; LEDE_TAILOR_ENGINE=fixture) so
// PASSWORD matches that file's exactly — same rationale as ats-view.spec.ts's
// identical header comment.
import { test, expect } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { login, createApplication, tailor } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — same recorded fixture as applications.spec.ts

const UNCOVERED_SIGNAL = "Creating stable contracts, versioning, and documentation";
const COVERED_SIGNAL = "Designing and shipping a public-facing developer surface";

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test("ReasoningPanel lists the real uncovered signal(s) from a live-tailored resume, honestly framed", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Signal Coverage Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplication(page, { company, jd: JD });

  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId);

  const reasoningPanel = page.locator(".reasoning-panel");
  await expect(reasoningPanel).toBeVisible();

  const uncoveredSection = reasoningPanel.locator(".reasoning-panel__uncovered");
  await expect(uncoveredSection).toBeVisible();
  await expect(uncoveredSection).toContainText(/no lede addresses/i);

  // Exact identity, not cardinality: the specific uncovered signal renders
  // in the uncovered copy...
  await expect(uncoveredSection).toContainText(UNCOVERED_SIGNAL);
  // ...and the specific covered signal is ABSENT from that copy (WeightBar,
  // elsewhere in the same panel, legitimately renders it — scoped to
  // uncoveredSection's own text so that doesn't false-positive this check).
  const uncoveredText = await uncoveredSection.textContent();
  expect(uncoveredText).not.toContain(COVERED_SIGNAL);
});
