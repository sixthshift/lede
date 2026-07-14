// Journey-stage-driven section emphasis (T002, journey-stage.ts T001) — real
// chromium, real server, keyless FixtureEngine tailor (same "applications"
// project/server as applications.spec.ts, playwright.config.ts). Component
// coverage (muted computed-style contrast, muted-not-a-gate) lives in
// test/journey-emphasis.test.tsx; this file proves the parts a jsdom render
// can't: real localStorage store purity across the actual tailor/lock
// lifecycle, and override precedence surviving those same real mutations.
import { test, expect, type Page } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import {
  firstRunLogin,
  login,
  createApplication,
  tailor,
  retailor,
  lockFinal,
  expectResumeCanvasPainted,
  generateLetter,
  ensureSectionExpanded,
  countOversizedOverlays,
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

// T005 — Active reveal on the FIRST resume tailor only, across all three
// responsive regimes (WorkspaceShell.tsx's coVisible/swapRegime/sheetRegime).
// The discriminator is "no `current` existed before THIS tailor's mutation
// started" — never a session flag — so a re-tailor over a surviving current
// (including one freshly loaded from a hard reload) must never auto-reveal.
// Letter generation and failed tailors are untouched (out of scope for the
// reveal at all).
async function gotoDetail(page: Page, applicationId: string): Promise<void> {
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByRole("button", { name: "Tailor", exact: true })).toBeVisible();
}

test("active reveal — lg..xl swap regime: first tailor auto-switches to preview (toggle tracks it), one click restores the editor, and a re-tailor never re-switches", async ({
  page,
}) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `Journey Reveal Swap ${Date.now()}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.setViewportSize({ width: 1100, height: 800 });
  await gotoDetail(page, applicationId);

  const editorPane = page.getByTestId("editor-pane");
  const toggle = page.getByTestId("preview-swap-toggle");
  await expect(editorPane).toBeVisible();
  await expect(page.getByTestId("preview-pane")).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await tailor(page, applicationId);

  // Auto-switched with NO click: the preview pane is up and the toggle's own
  // state agrees with what's visible.
  await expect(page.getByTestId("preview-pane")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(
    await editorPane.evaluate((el) => el.getBoundingClientRect().width),
    "editor must be genuinely swapped away (zero-width), not merely covered",
  ).toBe(0);
  await expectResumeCanvasPainted(page);

  // One click returns to the editor AND flips aria-expanded back.
  await toggle.click();
  await expect(editorPane).toBeVisible();
  await expect(page.getByTestId("preview-pane")).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // From preview-hidden: a re-tailor must NOT auto-switch again.
  await retailor(page, applicationId);
  await expect(editorPane).toBeVisible();
  await expect(page.getByTestId("preview-pane")).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("active reveal — fresh-load discriminator: reloading an already-tailored app then re-tailoring never auto-reveals (fails under a session one-shot flag)", async ({
  page,
}) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `Journey Reveal FreshLoad ${Date.now()}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.setViewportSize({ width: 1100, height: 800 });
  await gotoDetail(page, applicationId);
  await tailor(page, applicationId);
  await expect(page.getByRole("button", { name: "Re-tailor", exact: true })).toBeVisible();

  // A genuinely fresh page load — zero session/render history — of an app
  // that already carries a `current`.
  await page.reload();
  await expect(page.getByRole("button", { name: "Re-tailor", exact: true })).toBeVisible();

  const editorPane = page.getByTestId("editor-pane");
  const toggle = page.getByTestId("preview-swap-toggle");
  await expect(editorPane).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await retailor(page, applicationId);

  await expect(editorPane).toBeVisible();
  await expect(page.getByTestId("preview-pane")).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("active reveal — below-lg sheet regime: first tailor opens the preview sheet, Escape dismisses with no aria-modal/scrim, and a re-tailor from sheet-closed never reopens it", async ({
  page,
}) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `Journey Reveal Sheet ${Date.now()}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.setViewportSize({ width: 800, height: 900 });
  await gotoDetail(page, applicationId);

  await expect(page.getByTestId("preview-sheet")).toHaveCount(0);
  await expect(page.getByTestId("preview-sheet-trigger")).toBeVisible();

  await tailor(page, applicationId);

  const sheet = page.getByTestId("preview-sheet");
  await expect(sheet).toBeVisible();
  await expectResumeCanvasPainted(page);
  expect(await page.locator('[aria-modal="true"]').count(), "no aria-modal anywhere").toBe(0);
  expect(
    await countOversizedOverlays(page, sheet),
    "no oversized overlay besides the sheet itself (no scrim)",
  ).toBe(0);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("preview-sheet")).toHaveCount(0);
  await expect(page.getByTestId("preview-sheet-trigger")).toBeVisible();

  // From sheet-closed: a re-tailor must not reopen it.
  await retailor(page, applicationId);
  await expect(page.getByTestId("preview-sheet")).toHaveCount(0);
  await expect(page.getByTestId("preview-sheet-trigger")).toBeVisible();
});

test("active reveal — co-visible (>=xl) regime: first tailor is a no-op layout-wise, both panes already visible before and after", async ({
  page,
}) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `Journey Reveal CoVisible ${Date.now()}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoDetail(page, applicationId);

  const editorPane = page.getByTestId("editor-pane");
  const previewPane = page.getByTestId("preview-pane");
  await expect(editorPane).toBeVisible();
  await expect(previewPane).toBeVisible();
  await expect(page.getByTestId("preview-swap-toggle")).toHaveCount(0);
  await expect(page.getByTestId("preview-sheet")).toHaveCount(0);

  await tailor(page, applicationId);

  await expect(editorPane).toBeVisible();
  await expect(previewPane).toBeVisible();
  await expect(page.getByTestId("preview-swap-toggle")).toHaveCount(0);
  await expect(page.getByTestId("preview-sheet")).toHaveCount(0);
  await expectResumeCanvasPainted(page);
});

test("active reveal — letter generation never triggers a pane switch", async ({ page }) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `Journey Reveal Letter ${Date.now()}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.setViewportSize({ width: 1100, height: 800 });
  await gotoDetail(page, applicationId);

  const editorPane = page.getByTestId("editor-pane");
  const toggle = page.getByTestId("preview-swap-toggle");
  await expect(editorPane).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await ensureSectionExpanded(page, "letter");
  await generateLetter(page, applicationId);

  await expect(editorPane).toBeVisible();
  await expect(page.getByTestId("preview-pane")).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});
