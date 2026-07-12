// Route-level scroll restoration + focus management (v4-T024, spec.md
// "Scroll restoration" / "Route-level focus management" + oracle.md
// F203/F208).
//
// Four contracts under test:
//   - SCROLL RESTORATION: the editor-pane's OWN scrollTop (never the
//     window's — it's its own scroll container) is stored per
//     `location.key`, restored on a browser-BACK (POP), and reset to the
//     top on a fresh forward navigation.
//   - LOCATION-KEY INDEPENDENCE: two client-side visits to the SAME
//     pathname, scrolled to different positions, restore independently —
//     proof the store is keyed by `location.key`, never `pathname` (a
//     pathname-keyed store would let the second visit's restore leak into
//     the first, or vice versa).
//   - FOCUS: after a rail navigation, `document.activeElement` is the new
//     surface's own `<h1>` (the one-title convention's element).
//   - SINGLE MAIN + HEADING ORDER: exactly one `<main>` landmark exists in
//     the DOM on every shell surface (T020 already removed AppShell's; this
//     re-asserts WorkspaceShell's is the sole survivor), and heading levels
//     never skip (no H1->H3) on a surface.
//
// Heading order is fixed on all four surfaces. The shared root cause was
// CardTitle (ui/card.tsx) hardcoding <h3>: every card-based surface placed a
// card/group title directly under its editor h1, skipping h2. CardTitle now
// takes an optional `as` level (default h3 — the other card usages are
// unchanged), and the four surfaces' top-level titles pass `as="h2"`:
// Application detail's Cover-letter/Design cards, the dashboard's
// application cards (ApplicationCard.tsx), the library's per-section groups
// (SectionAccordion.tsx), and Settings' three cards (SettingsView.tsx).
// Nested titles a level deeper (the template-picker cards under Design's h2)
// keep the default h3, which stays sequential.
//
// Shares applications.spec.ts's "applications" project/server (real
// first-run set-password -> login, gate ON; LEDE_TAILOR_ENGINE=fixture) —
// PASSWORD MUST match that file's exactly (single server-wide secret,
// playwright.config.ts), and JD reuses the SAME recorded fixture
// (CONTRAST_JDS[0]) so tailoring replays keylessly.
import { test, expect, type Page } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { login, createApplication, tailor, expectResumeCanvasPainted } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — byte-for-byte, see applications.spec.ts

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

function globalNavLink(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name, exact: true });
}

async function setupTailoredApplication(page: Page, company: string): Promise<string> {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId);
  await expectResumeCanvasPainted(page);
  return applicationId;
}

test.describe("Scroll restoration (F203) + focus management (F208)", () => {
  test("browser-BACK restores the editor pane's scrollTop within +/-24px; a fresh forward nav starts at top", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    const company = `E2E Scroll Restore Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);

    const editorPane = page.getByTestId("editor-pane");
    const { scrollHeight, clientHeight } = await editorPane.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(
      scrollHeight - clientHeight,
      "precondition: the editor pane must overflow by >= 1000px for this test to mean anything",
    ).toBeGreaterThanOrEqual(1000);

    const targetY = 1000;
    await editorPane.evaluate((el, top) => {
      el.scrollTop = top;
    }, targetY);
    await expect
      .poll(() => editorPane.evaluate((el) => el.scrollTop))
      .toBeGreaterThanOrEqual(targetY - 24);

    // Navigate away (client-side), then browser-BACK (POP).
    await globalNavLink(page, "Applications").click();
    await expect(page).toHaveURL(/\/applications$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/applications\/[^/]+$/);
    await expect
      .poll(() => page.getByTestId("editor-pane").evaluate((el) => el.scrollTop), {
        message: "scrollTop must be restored within +/-24px of the pre-navigation position",
      })
      .toBeGreaterThanOrEqual(targetY - 24);
    const restored = await page.getByTestId("editor-pane").evaluate((el) => el.scrollTop);
    expect(restored).toBeLessThanOrEqual(targetY + 24);

    // A fresh forward navigation (not a POP) lands at the top.
    await globalNavLink(page, "Library").click();
    await expect(page).toHaveURL(/\/library$/);
    const libraryScrollTop = await page.getByTestId("editor-pane").evaluate((el) => el.scrollTop);
    expect(libraryScrollTop).toBe(0);
  });

  test("keyed by location.key, not pathname: two visits to the SAME pathname with different scroll targets restore independently", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    const company = `E2E Location Key Co ${runId}-${testInfo.retry}`;
    const applicationId = await setupTailoredApplication(page, company);

    const editorPane = page.getByTestId("editor-pane");
    const { scrollHeight, clientHeight } = await editorPane.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight - clientHeight).toBeGreaterThanOrEqual(1000);

    const firstY = 1000;
    const secondY = Math.min(scrollHeight - clientHeight, 2200);
    expect(
      secondY - firstY,
      "the two sampled targets must be genuinely distinct",
    ).toBeGreaterThanOrEqual(500);

    // First visit to /applications/:id, scrolled to firstY.
    await editorPane.evaluate((el, top) => {
      el.scrollTop = top;
    }, firstY);
    await expect
      .poll(() => editorPane.evaluate((el) => el.scrollTop))
      .toBeGreaterThanOrEqual(firstY - 24);

    // Leave, then return via a SECOND client-side navigation to the SAME
    // pathname (a fresh location.key) — a fresh visit starts at top, never
    // inheriting the first visit's scrollTop.
    await globalNavLink(page, "Applications").click();
    await expect(page).toHaveURL(/\/applications$/);
    await page
      .locator("[data-application-id]")
      .filter({ hasText: company })
      .getByTestId("application-card-open")
      .click();
    await expect(page).toHaveURL(new RegExp(`/applications/${applicationId}$`));
    const secondVisitInitialScrollTop = await page
      .getByTestId("editor-pane")
      .evaluate((el) => el.scrollTop);
    expect(
      secondVisitInitialScrollTop,
      "a fresh navigation to the same pathname must start at top, not inherit the prior visit's scrollTop",
    ).toBe(0);

    // Scroll the SECOND visit to a different target.
    await page.getByTestId("editor-pane").evaluate((el, top) => {
      el.scrollTop = top;
    }, secondY);

    // Leave, then BACK — restores the SECOND visit's target, not the first's.
    await globalNavLink(page, "Applications").click();
    await expect(page).toHaveURL(/\/applications$/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/applications/${applicationId}$`));
    await expect
      .poll(() => page.getByTestId("editor-pane").evaluate((el) => el.scrollTop))
      .toBeGreaterThanOrEqual(secondY - 24);
    let restored = await page.getByTestId("editor-pane").evaluate((el) => el.scrollTop);
    expect(restored).toBeLessThanOrEqual(secondY + 24);

    // BACK again — past the intermediate /applications listing — restores
    // the FIRST visit's target, proving the two visits' records never
    // cross-contaminated each other.
    await page.goBack();
    await expect(page).toHaveURL(/\/applications$/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/applications/${applicationId}$`));
    await expect
      .poll(() => page.getByTestId("editor-pane").evaluate((el) => el.scrollTop))
      .toBeGreaterThanOrEqual(firstY - 24);
    restored = await page.getByTestId("editor-pane").evaluate((el) => el.scrollTop);
    expect(restored).toBeLessThanOrEqual(firstY + 24);
  });

  test("focus: after a rail navigation, document.activeElement is the new surface's h1", async ({
    page,
  }, testInfo) => {
    const company = `E2E Focus Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);

    async function expectFocusOnSurfaceH1(): Promise<void> {
      await expect
        .poll(() =>
          page.evaluate(() => {
            const h1 = document.querySelector('[data-testid="editor-pane"] h1');
            return h1 !== null && document.activeElement === h1;
          }),
        )
        .toBe(true);
    }

    await globalNavLink(page, "Library").click();
    await expect(page).toHaveURL(/\/library$/);
    await expectFocusOnSurfaceH1();

    await globalNavLink(page, "Settings").click();
    await expect(page).toHaveURL(/\/settings$/);
    await expectFocusOnSurfaceH1();

    await globalNavLink(page, "Applications").click();
    await expect(page).toHaveURL(/\/applications$/);
    await expectFocusOnSurfaceH1();

    await page
      .locator("[data-application-id]")
      .filter({ hasText: company })
      .getByTestId("application-card-open")
      .click();
    await expect(page).toHaveURL(/\/applications\/[^/]+$/);
    await expectFocusOnSurfaceH1();
  });
});

test.describe("Single main landmark + sequential heading order (F208), all four shell surfaces", () => {
  async function expectExactlyOneMain(page: Page): Promise<void> {
    await expect(page.locator("main")).toHaveCount(1);
  }

  /** Returns the heading levels (1-6) in DOM document order, e.g. [1, 3, 3]. */
  async function headingLevels(page: Page): Promise<number[]> {
    return page.evaluate(() =>
      Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((el) =>
        Number(el.tagName[1]),
      ),
    );
  }

  function expectNoSkippedLevel(levels: number[]): void {
    for (let i = 1; i < levels.length; i++) {
      expect(
        levels[i]! - levels[i - 1]!,
        `heading levels must never skip: saw ${levels.join(" -> ")}`,
      ).toBeLessThanOrEqual(1);
    }
  }

  test("dashboard: exactly one <main>; heading order sequential", async ({ page }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);
    await expectExactlyOneMain(page);
    expectNoSkippedLevel(await headingLevels(page));
  });

  test("library: exactly one <main>; heading order sequential", async ({ page }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await page.goto("/library");
    await expectExactlyOneMain(page);
    expectNoSkippedLevel(await headingLevels(page));
  });

  test("settings: exactly one <main>; heading order sequential", async ({ page }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await page.goto("/settings");
    await expectExactlyOneMain(page);
    expectNoSkippedLevel(await headingLevels(page));
  });

  test("application detail: exactly one <main>; heading order sequential", async ({
    page,
  }, testInfo) => {
    const company = `E2E Heading Order Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);
    await expectExactlyOneMain(page);
    expectNoSkippedLevel(await headingLevels(page));
  });
});
