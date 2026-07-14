// T007 (application-page-flow spec, Phase 2 "dashboard journey cards") — real
// chromium, real server, keyless FixtureEngine tailor (same "applications"
// project/server as applications.spec.ts/journey.spec.ts). The dashboard
// card's journey-stage pill (data-testid="application-card-stage-pill",
// ApplicationCard.tsx/GenStateBadge.tsx) REPLACED the old resume genState
// pill on the card; the Locked badge stands in as the final stage's display
// and the failed genState survives as a distinct destructive badge alongside
// (component coverage: test/application-card-journey.test.tsx). The migrated
// T030 card-content test in applications.spec.ts pins the same contract.
import { test, expect } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import {
  firstRunLogin,
  login,
  createApplication,
  tailor,
  lockFinal,
  ensureSectionExpanded,
} from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — keyless fixture replay
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

function stagePill(page: import("@playwright/test").Page, applicationId: string) {
  return page
    .locator(`[data-application-id="${applicationId}"]`)
    .getByTestId("application-card-stage-pill");
}

test("dashboard cards: journey-stage pill reads distinctly per state (untailored / tailored / locked)", async ({
  page,
}) => {
  await page.goto("/");
  await firstRunLogin(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const untailoredCompany = `E2E Journey Untailored ${runId}`;
  const tailoredCompany = `E2E Journey Tailored ${runId}`;
  const lockedCompany = `E2E Journey Locked ${runId}`;

  const untailoredId = await createApplication(page, { company: untailoredCompany, jd: JD });

  const tailoredId = await createApplication(page, { company: tailoredCompany, jd: JD });
  await page.goto(`/applications/${tailoredId}`);
  await tailor(page, tailoredId);
  await page.goto("/applications");

  const lockedId = await createApplication(page, { company: lockedCompany, jd: JD });
  await page.goto(`/applications/${lockedId}`);
  await tailor(page, lockedId);
  await lockFinal(page, lockedId);

  await page.goto("/applications");
  await expect(stagePill(page, untailoredId)).toHaveText("Not tailored");
  await expect(stagePill(page, tailoredId)).toHaveText("Tailored");

  // The locked stage reuses the pre-existing Locked badge as its pill
  // (avoids duplicating the literal text "Locked" alongside it — see
  // ApplicationCard.tsx's comment at the ternary) — no
  // application-card-stage-pill element renders for a locked card at all.
  await expect(stagePill(page, lockedId)).toHaveCount(0);
  await expect(
    page.locator(`[data-application-id="${lockedId}"]`).getByText("Locked", { exact: true }),
  ).toBeVisible();
});

test("stale hint preserved: editing the JD of an already-tailored application shows the stale hint on its dashboard card", async ({
  page,
}) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Journey Stale ${runId}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId);

  // Two independent collapse layers sit between the tailor and the JD field:
  // the rail's outer section-collapse fold (closed by the "review" stage
  // default — ensureSectionExpanded waits out its 200ms grid-rows transition
  // rather than racing it) and JobPanel's OWN inner accordion (independent,
  // defaults collapsed once `current` exists) — applications.spec.ts's own
  // T032 locked-sweep test expands both layers the same way.
  await ensureSectionExpanded(page, "job");
  const jobDetailsToggle = page
    .getByTestId("workspace-section-body-job")
    .getByRole("button", { name: "Job details", exact: true });
  if ((await jobDetailsToggle.getAttribute("aria-expanded")) === "false") {
    await jobDetailsToggle.click();
  }

  await page.getByLabel("Job description", { exact: true }).fill(`${JD}\n\nEdited for staleness.`);
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}`) && r.request().method() === "PUT",
    ),
    page.getByRole("button", { name: "Save", exact: true }).click(),
  ]);

  await page.goto("/applications");
  await expect(
    page
      .locator(`[data-application-id="${applicationId}"]`)
      .getByTestId("application-card-stale-hint"),
  ).toBeVisible();
});
