// Journey-stage-driven section emphasis (T002, journey-stage.ts T001) — real
// chromium, real server, keyless FixtureEngine tailor (same "applications"
// project/server as applications.spec.ts, playwright.config.ts). Component
// coverage (muted computed-style contrast, muted-not-a-gate) lives in
// test/journey-emphasis.test.tsx; this file proves the parts a jsdom render
// can't: real localStorage store purity across the actual tailor/lock
// lifecycle, and override precedence surviving those same real mutations.
import { test, expect } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import {
  firstRunLogin,
  login,
  createApplication,
  tailor,
  lockFinal,
  expectResumeCanvasPainted,
} from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — keyless fixture replay

function sectionToggle(page: import("@playwright/test").Page, key: "job" | "letter" | "design") {
  return page.getByTestId(`section-collapse-${key}`);
}

async function isExpanded(
  page: import("@playwright/test").Page,
  key: "job" | "letter" | "design",
): Promise<boolean> {
  return (await sectionToggle(page, key).getAttribute("aria-expanded")) === "true";
}

/** Every `lede.workspace.*` localStorage key, sorted — the prefix-wide store-purity oracle. */
async function workspaceStorageKeys(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() =>
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith("lede.workspace."))
      .sort(),
  );
}

test("store purity: create -> tailor -> lock moves through stage defaults with ZERO localStorage writes under lede.workspace.", async ({
  page,
}) => {
  await page.goto("/");
  await firstRunLogin(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `Journey Purity ${Date.now()}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByRole("button", { name: "Tailor", exact: true })).toBeVisible();

  const keysBeforeTailor = await workspaceStorageKeys(page);

  // Setup stage default: Job open, Letter+Design closed.
  expect(await isExpanded(page, "job")).toBe(true);
  expect(await isExpanded(page, "letter")).toBe(false);
  expect(await isExpanded(page, "design")).toBe(false);

  await tailor(page, applicationId);
  await expect(page.getByRole("button", { name: "Re-tailor", exact: true })).toBeVisible();

  // Review stage default: Job closed, Letter+Design open — with NO manual
  // toggle ever clicked.
  await expect.poll(() => isExpanded(page, "job")).toBe(false);
  expect(await isExpanded(page, "letter")).toBe(true);
  expect(await isExpanded(page, "design")).toBe(true);

  const keysAfterTailor = await workspaceStorageKeys(page);
  expect(keysAfterTailor, "tailoring into review must write no lede.workspace. key").toEqual(
    keysBeforeTailor,
  );

  await lockFinal(page, applicationId);
  await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();

  // Final stage default: all three closed.
  await expect.poll(() => isExpanded(page, "job")).toBe(false);
  expect(await isExpanded(page, "letter")).toBe(false);
  expect(await isExpanded(page, "design")).toBe(false);

  const keysAfterLock = await workspaceStorageKeys(page);
  expect(keysAfterLock, "locking into final must write no lede.workspace. key").toEqual(
    keysBeforeTailor,
  );
});

test("user-wins: a net-closed override on Design in setup survives the stage flip to review's open default", async ({
  page,
}) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `Journey Override ${Date.now()}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByRole("button", { name: "Tailor", exact: true })).toBeVisible();

  // Setup default: Design closed. Expand it, then collapse it again — net
  // override is "closed", the SAME as the default, but now an explicit
  // override rather than an unset key.
  expect(await isExpanded(page, "design")).toBe(false);
  await sectionToggle(page, "design").click();
  await expect.poll(() => isExpanded(page, "design")).toBe(true);
  await sectionToggle(page, "design").click();
  await expect.poll(() => isExpanded(page, "design")).toBe(false);

  await tailor(page, applicationId);
  await expect(page.getByRole("button", { name: "Re-tailor", exact: true })).toBeVisible();

  // Review's stage default for Design is OPEN — the override must win and
  // keep it closed.
  await expect.poll(() => isExpanded(page, "letter")).toBe(true);
  expect(await isExpanded(page, "design")).toBe(false);
});

test("Job override vs legacy: a manual expand in review survives the lock into final", async ({
  page,
}) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `Journey Job Override ${Date.now()}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByRole("button", { name: "Tailor", exact: true })).toBeVisible();

  await tailor(page, applicationId);
  await expect(page.getByRole("button", { name: "Re-tailor", exact: true })).toBeVisible();

  // Review default: Job closed. Manually expand it.
  await expect.poll(() => isExpanded(page, "job")).toBe(false);
  await sectionToggle(page, "job").click();
  await expect.poll(() => isExpanded(page, "job")).toBe(true);

  await lockFinal(page, applicationId);
  await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();

  // Final's stage default for Job is closed — the override must beat it,
  // and neither JobPanel's own legacy auto-collapse nor a stage reset may
  // fight it back closed.
  expect(await isExpanded(page, "job")).toBe(true);
});

test("existing collapse persistence: a manual toggle survives a full reload", async ({ page }) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `Journey Reload ${Date.now()}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByRole("button", { name: "Tailor", exact: true })).toBeVisible();

  // Setup default: Design closed. Expand it — a genuine override, not a
  // no-op toggle-back-to-default (unlike the user-wins test above).
  expect(await isExpanded(page, "design")).toBe(false);
  await sectionToggle(page, "design").click();
  await expect.poll(() => isExpanded(page, "design")).toBe(true);

  await page.reload();
  await expect(page.getByRole("button", { name: "Tailor", exact: true })).toBeVisible();
  expect(await isExpanded(page, "design")).toBe(true);
});

// T003 — Tailor's variant is stage-driven (journeyStage, not raw genState):
// the sole primary-weighted action pre-current (setup/tailoring), flat with
// every other strip button once a `current` snapshot exists (review/final).
// Component coverage (all four stages, incl. the re-tailor-in-flight edge)
// lives in test/journey-emphasis.test.tsx; this proves it against the real
// compiled Tailwind cascade rather than an injected jsdom rule.
//
// The resolved `--accent`/`--primary` token (tokens.css §12: `#2643bd`) —
// the Button primitive's real "default" variant background.
const PRIMARY_BG = "rgb(38, 67, 189)";

async function primaryStyledStripButtonCount(page: import("@playwright/test").Page) {
  const backgrounds = await page
    .getByTestId("detail-action-strip")
    .locator("button")
    .evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).backgroundColor));
  return backgrounds.filter((bg) => bg === PRIMARY_BG).length;
}

test("action strip: Tailor is the sole primary-styled button pre-current, and the strip goes flat after tailoring", async ({
  page,
}) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `Journey Weighting ${Date.now()}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);

  const tailorButton = page.getByTestId("tailor-button");
  await expect(tailorButton).toHaveText("Tailor");
  await expect(tailorButton).toHaveCSS("background-color", PRIMARY_BG);
  expect(
    await primaryStyledStripButtonCount(page),
    "exactly one primary-styled button before a current exists",
  ).toBe(1);

  await tailor(page, applicationId);
  await expect(tailorButton).toHaveText("Re-tailor");

  await expect(tailorButton, "Tailor's own background must flip once current exists").not.toHaveCSS(
    "background-color",
    PRIMARY_BG,
  );
  expect(
    await primaryStyledStripButtonCount(page),
    "zero primary-styled buttons once a current exists",
  ).toBe(0);

  await expect(page.getByRole("button", { name: "Lock final" })).toBeEnabled();
  await expect(page.getByTestId("download-pdf-button")).toBeEnabled();
  await expect(page.getByTestId("download-text-button")).toBeEnabled();
});

// T004 — explainer empty state in the pre-tailor preview pane. Component
// coverage (three-beat structure, banned-claims sweep, post-tailor removal)
// lives in test/journey-emphasis.test.tsx; this proves it against the real
// preview pane (WorkspaceShell's `[data-testid="preview-pane"]`) and pins the
// locked "the pane itself stays, layout-stable" rationale with a real
// bounding-box measurement across the actual tailor round-trip.
test("explainer empty state: three beats + Library link pre-tailor, gone post-tailor, preview pane never resizes", async ({
  page,
}) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `Journey Explainer ${Date.now()}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByRole("button", { name: "Tailor", exact: true })).toBeVisible();

  const previewPane = page.getByTestId("preview-pane");
  await expect(previewPane.getByText("The tailored resume lands here.")).toBeVisible();
  await expect(previewPane.getByText(/Lede picks what leads from your Library/)).toBeVisible();
  await expect(
    previewPane.getByText("Every claim is grounded in your entries' facts."),
  ).toBeVisible();
  const libraryLink = previewPane.getByRole("link", { name: /Library/ });
  await expect(libraryLink).toHaveAttribute("href", "/library");

  const boxBeforeTailor = await previewPane.boundingBox();
  expect(boxBeforeTailor, "preview pane must have a rendered bounding box pre-tailor").toBeTruthy();

  await tailor(page, applicationId);
  await expect(page.getByRole("button", { name: "Re-tailor", exact: true })).toBeVisible();

  await expect(previewPane.getByText("The tailored resume lands here.")).not.toBeVisible();
  await expect(previewPane.getByText(/Lede picks what leads from your Library/)).not.toBeVisible();
  await expectResumeCanvasPainted(page);

  const boxAfterTailor = await previewPane.boundingBox();
  expect(boxAfterTailor, "preview pane must have a rendered bounding box post-tailor").toBeTruthy();
  expect(
    boxAfterTailor!.width,
    "preview pane width must stay stable across the pre/post-tailor swap",
  ).toBeCloseTo(boxBeforeTailor!.width, 0);
});
