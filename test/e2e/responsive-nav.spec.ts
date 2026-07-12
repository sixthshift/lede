// F301/T030 (spec.md Phase 2 + Locked "compact nav: bottom tab bar") — below
// `lg` (1024px) the rail is gone entirely (not merely CSS-hidden) and the
// global nav becomes a FIXED BOTTOM TAB BAR with the rail's own three
// destinations (icon+label, >=44px targets) — never a hamburger/drawer
// (red-team #2). The rail's per-surface "SECTIONS" nav folds into the
// editor pane so section-jumping stays reachable on the detail surface.
//
// Shares applications.spec.ts's "applications" project/server (real
// first-run set-password -> login, gate ON) — PASSWORD MUST match that
// file's exactly (single server-wide secret, playwright.config.ts).
import { test, expect, type Page, type Locator } from "@playwright/test";
import { login, createApplication } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = "Backend platform engineer role. Distributed systems, Go, Kubernetes.";
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const BOTTOM_BAR_MIN_SHORT_AXIS = 44;

const DRAWER_HAMBURGER_SELECTORS = [
  '[data-testid*="drawer"]',
  '[data-testid*="hamburger"]',
  '[aria-label*="menu" i]',
  'button[aria-haspopup="menu"]',
];

interface Surfaces {
  dashboard: string;
  detail: string;
  library: string;
  settings: string;
}

async function loginAndSeed(page: Page, marker: string): Promise<Surfaces> {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Responsive Nav Co ${runId}-${marker}`;
  const applicationId = await createApplication(page, { company, jd: JD });

  return {
    dashboard: "/applications",
    detail: `/applications/${applicationId}`,
    library: "/library",
    settings: "/settings",
  };
}

function bottomTabBar(page: Page): Locator {
  return page.getByTestId("bottom-tab-bar");
}

async function assertNoDrawerOrHamburger(page: Page): Promise<void> {
  for (const selector of DRAWER_HAMBURGER_SELECTORS) {
    expect(
      await page.locator(selector).count(),
      `no drawer/hamburger toggle matching "${selector}" may exist`,
    ).toBe(0);
  }
}

/** Every sampled point across the bottom bar's own three items clears >=44px on the short (height) axis, and each fires real navigation. */
async function assertBottomBarFunctional(page: Page, expectedRoutes: string[]): Promise<void> {
  const bar = bottomTabBar(page);
  await expect(bar).toBeVisible();

  const links = bar.getByRole("link");
  await expect(links).toHaveCount(3);

  for (let i = 0; i < 3; i++) {
    const link = links.nth(i);
    const box = await link.boundingBox();
    expect(box, `bottom tab ${i} must have a rendered bounding box`).not.toBeNull();
    expect(
      box!.height,
      `bottom tab ${i} short-axis (height) must be >= ${BOTTOM_BAR_MIN_SHORT_AXIS}px`,
    ).toBeGreaterThanOrEqual(BOTTOM_BAR_MIN_SHORT_AXIS);
    // Icon + label: an accessible name (the label) plus a decorative icon.
    await expect(link).not.toBeEmpty();
  }

  // Activation navigates to the right route — drive each tab in turn.
  await links.nth(1).click();
  await expect(page).toHaveURL(expectedRoutes[1]!);
  await links.nth(2).click();
  await expect(page).toHaveURL(expectedRoutes[2]!);
  await links.nth(0).click();
  await expect(page).toHaveURL(expectedRoutes[0]!);
}

/** The content area's bottom padding clears the bar, and a bottom-most interactive control inside it is still hit-testable. */
async function assertBarCoversNoInteractiveContent(page: Page): Promise<void> {
  const bar = bottomTabBar(page);
  const barBox = await bar.boundingBox();
  expect(barBox, "bottom bar must have a rendered bounding box").not.toBeNull();

  const editorPane = page.getByTestId("editor-pane");
  const paddingBottom = await editorPane.evaluate((el) =>
    Number.parseFloat(getComputedStyle(el).paddingBottom),
  );
  expect(
    paddingBottom,
    "editor pane's bottom padding must clear the bottom bar's height",
  ).toBeGreaterThanOrEqual(barBox!.height - 0.5);

  const interactive = page
    .locator('[data-testid="editor-pane"] button, [data-testid="editor-pane"] a')
    .last();
  if ((await interactive.count()) === 0) return;
  await interactive.scrollIntoViewIfNeeded();
  const box = await interactive.boundingBox();
  if (!box) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const resolvesToSelfOrDescendant = await interactive.evaluate(
    (el, [x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit != null && (el === hit || el.contains(hit) || hit.contains(el));
    },
    [cx, cy] as const,
  );
  expect(
    resolvesToSelfOrDescendant,
    "a bottom-most interactive control in the editor pane must be hit-testable (not covered by the bottom bar)",
  ).toBe(true);
}

async function assertRailAbsent(page: Page): Promise<void> {
  expect(await page.getByTestId("rail-pane").count(), "rail must be gone, not hidden").toBe(0);
}

async function assertBottomBarAbsent(page: Page): Promise<void> {
  expect(
    await bottomTabBar(page).count(),
    "bottom tab bar must be gone (not merely hidden) at >=lg",
  ).toBe(0);
}

const COMPACT_VIEWPORTS = [
  { width: 375, height: 812, label: "375x812" },
  { width: 768, height: 1024, label: "768x1024" },
];

for (const viewport of COMPACT_VIEWPORTS) {
  test.describe(`compact nav (below lg) @ ${viewport.label}`, () => {
    test(`bottom tab bar replaces the rail on all four surfaces, no drawer/hamburger, and covers no interactive content`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      const surfaces = await loginAndSeed(page, `${viewport.width}-${testInfo.retry}`);
      const routes = [surfaces.dashboard, surfaces.library, surfaces.settings];

      for (const [name, path] of Object.entries(surfaces)) {
        await page.goto(path);
        await expect(page.getByTestId("workspace-shell")).toBeVisible();

        await assertRailAbsent(page);
        await assertNoDrawerOrHamburger(page);
        await expect(bottomTabBar(page), `${name}: bottom tab bar must render`).toBeVisible();
        await assertBarCoversNoInteractiveContent(page);
      }

      // Activation navigates to the right route — driven once, from the
      // dashboard, cycling through all three destinations.
      await page.goto(surfaces.dashboard);
      await assertBottomBarFunctional(page, routes);
    });

    test(`section nav is reachable inside the editor pane on the detail surface`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      const surfaces = await loginAndSeed(page, `sections-${viewport.width}-${testInfo.retry}`);

      await page.goto(surfaces.detail);
      await expect(page.getByTestId("workspace-shell")).toBeVisible();
      await assertRailAbsent(page);

      const editorSectionNav = page.getByTestId("editor-section-nav");
      await expect(editorSectionNav).toBeVisible();
      for (const key of ["job", "letter", "design"]) {
        await expect(page.getByTestId(`editor-section-nav-${key}`)).toBeVisible();
      }

      // The nav is genuinely operable: clicking a row scrolls its section
      // into view (the same navigateToSection behavior the rail's own copy
      // drives, per scroll-spy.spec.ts).
      const editorPane = page.getByTestId("editor-pane");
      await editorPane.evaluate((el) => {
        el.scrollTop = 0;
      });
      const designHeading = page.getByTestId("workspace-section-heading-design");
      await expect(designHeading).not.toBeInViewport();
      await page.getByTestId("editor-section-nav-design").click();
      await expect(designHeading).toBeInViewport();
    });
  });
}

test.describe("desktop regime regression guard (>=lg)", () => {
  test("at 1280px the rail is present and the bottom tab bar is absent from the DOM on all four surfaces", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const surfaces = await loginAndSeed(page, `desktop-${testInfo.retry}`);

    for (const [name, path] of Object.entries(surfaces)) {
      await page.goto(path);
      await expect(page.getByTestId("workspace-shell")).toBeVisible();
      await expect(page.getByTestId("rail-pane"), `${name}: rail must be present`).toBeVisible();
      await assertBottomBarAbsent(page);
    }
  });
});
