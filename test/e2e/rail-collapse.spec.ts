// Collapsible rail (v4-T022, spec.md "Collapsible rail" + oracle.md F207) —
// a toggle in the rail's own bottom chrome (WorkspaceShell.tsx) shrinks the
// rail from its expanded 224px to a 40-64px icon-only band. View-state only
// (standing v3 policy, carried into CLAUDE.md): localStorage at most, NEVER
// a server write, NEVER settings.layout/sectionDisplay — the toggle itself
// must be network-zero.
//
// Shares applications.spec.ts's "applications" project/server (real
// first-run set-password -> login, gate ON) — PASSWORD MUST match that
// file's exactly (single server-wide secret, playwright.config.ts).
import { test, expect, type Page } from "@playwright/test";
import { login, railLogoutButton, themeToggleButton, logoutViaRail } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";

function railPane(page: Page) {
  return page.getByTestId("rail-pane");
}

function railCollapseToggle(page: Page) {
  return page.getByTestId("rail-collapse-toggle");
}

async function railWidth(page: Page): Promise<number> {
  const box = await railPane(page).boundingBox();
  expect(box, "rail-pane must have a boundingBox").toBeTruthy();
  return box!.width;
}

test.describe("collapsible rail (v4-T022, F207)", () => {
  test("toggle transitions the rail's measured width between expanded (~224px) and the 40-64px collapsed band, and back", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const expandedWidth = await railWidth(page);
    expect(expandedWidth).toBeGreaterThan(200);
    expect(expandedWidth).toBeLessThan(240);

    await railCollapseToggle(page).click();
    await expect.poll(() => railWidth(page)).toBeLessThanOrEqual(64);
    const collapsedWidth = await railWidth(page);
    expect(collapsedWidth).toBeGreaterThanOrEqual(40);
    expect(collapsedWidth).toBeLessThanOrEqual(64);

    // A real two-way toggle, not one-directional.
    await railCollapseToggle(page).click();
    await expect.poll(() => railWidth(page)).toBeGreaterThan(200);
  });

  test("collapsed/icon-only mode: all three global nav items stay operable — activating each navigates", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    await railCollapseToggle(page).click();
    await expect(railPane(page)).toHaveAttribute("data-collapsed", "true");

    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const [name, urlPattern] of [
      ["Library", /\/library$/],
      ["Settings", /\/settings$/],
      ["Applications", /\/applications$/],
    ] as const) {
      await nav.getByRole("link", { name, exact: true }).click();
      await expect(page, `activating "${name}" must navigate there`).toHaveURL(urlPattern);
      // Collapse is shell-level view-state — it must survive the client-side
      // route change itself, not just the click that produced it.
      await expect(railPane(page)).toHaveAttribute("data-collapsed", "true");
    }
  });

  test("collapse state survives a full reload (localStorage)", async ({ page }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    await railCollapseToggle(page).click();
    await expect(railPane(page)).toHaveAttribute("data-collapsed", "true");

    await page.reload();
    await expect(railPane(page)).toBeVisible();
    await expect(railPane(page)).toHaveAttribute("data-collapsed", "true");
    const width = await railWidth(page);
    expect(width).toBeGreaterThanOrEqual(40);
    expect(width).toBeLessThanOrEqual(64);
  });

  test("the toggle is network-zero: no requests fire, and no settings/sectionDisplay write occurs", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);
    // Let the route's own initial fetches settle before observing — only
    // requests caused by the toggle click itself should land in the array.
    await page.waitForLoadState("networkidle");

    const requests: Array<{ method: string; url: string }> = [];
    page.on("request", (req) => {
      requests.push({ method: req.method(), url: req.url() });
    });

    await railCollapseToggle(page).click();
    await expect(railPane(page)).toHaveAttribute("data-collapsed", "true");
    // Give an accidental network call a moment to land before asserting zero.
    await page.waitForTimeout(300);

    expect(requests, `toggle fired network requests: ${JSON.stringify(requests)}`).toHaveLength(0);
    expect(
      requests.some(
        (r) => /\/api\/settings/.test(r.url) && (r.method === "PATCH" || r.method === "PUT"),
      ),
      "toggle must never write settings/sectionDisplay",
    ).toBe(false);
  });
});

// v5-T001 (Phase 0): the COLLAPSED rail's chrome is correct — the wordmark's
// text node is genuinely removed (not CSS-hidden) rather than clipped, the
// footer cluster becomes real icon-only controls (not overflowing 24px
// icons), and nothing in the 48px band overflows or masks that overflow with
// a clipper. Mirrors the v4-T022 block above: same login/PASSWORD, same
// poll-until-settled pattern for the width transition (reading
// boundingBox() synchronously right after the toggle click races the 200ms
// CSS transition and reads the pre-collapse ~224px width).
test.describe("v5-T001 — collapsed-rail chrome polish", () => {
  /**
   * Logs in, collapses the rail, and polls the measured width until the
   * 200ms transition has genuinely settled (not just dropped below 64 for
   * one instant) before handing back the settled width.
   */
  async function loginAndCollapse(page: Page): Promise<number> {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    await railCollapseToggle(page).click();
    await expect(railPane(page)).toHaveAttribute("data-collapsed", "true");

    await expect.poll(() => railWidth(page), { timeout: 5000 }).toBeLessThanOrEqual(64);
    // The poll above only proves the transition has REACHED the collapsed
    // band, not that it's done moving — wait out the remainder of the 200ms
    // transition before treating the measurement as final.
    await page.waitForTimeout(250);
    const width = await railWidth(page);
    expect(width).toBeGreaterThanOrEqual(40);
    expect(width).toBeLessThanOrEqual(64);
    return width;
  }

  test("settled collapsed width is in [40,64] and no rail-pane descendant overflows or masks it", async ({
    page,
  }) => {
    await loginAndCollapse(page);

    const violations = await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="rail-pane"]');
      if (!pane) return [{ tag: "MISSING", detail: "rail-pane not found" }];
      const masking = new Set(["hidden", "clip", "scroll"]);
      const found: { tag: string; className: string; detail: string }[] = [];
      for (const el of Array.from(pane.querySelectorAll("*"))) {
        const clientWidth = el.clientWidth;
        const scrollWidth = el.scrollWidth;
        const clientHeight = el.clientHeight;
        const scrollHeight = el.scrollHeight;
        const className = typeof el.className === "string" ? el.className : String(el.className);
        const widthOverflows = scrollWidth > clientWidth + 1;
        const heightOverflows = scrollHeight > clientHeight + 1;
        if (widthOverflows) {
          found.push({
            tag: el.tagName,
            className,
            detail: `scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`,
          });
        }
        // Only elements with GENUINE overflowing content can be "masking"
        // it — every <svg> carries a UA-stylesheet `overflow: hidden`
        // default regardless of whether it actually clips anything, so
        // checking overflow style unconditionally would flag every icon.
        if (widthOverflows || heightOverflows) {
          const style = getComputedStyle(el);
          if (masking.has(style.overflowX) || masking.has(style.overflowY)) {
            found.push({
              tag: el.tagName,
              className,
              detail: `masks real overflow (x=${style.overflowX}, y=${style.overflowY})`,
            });
          }
        }
      }
      return found;
    });

    expect(
      violations,
      `rail-pane overflow/masking violations: ${JSON.stringify(violations)}`,
    ).toEqual([]);
  });

  test("wordmark: collapsed removes the 'Lede' text node but keeps the 'L' box visible; expanded restores it", async ({
    page,
  }) => {
    await loginAndCollapse(page);

    await expect(page.getByText("Lede", { exact: true })).toHaveCount(0);

    const wordmarkLink = page.getByRole("link", { name: "Lede", exact: true });
    await expect(wordmarkLink).toBeVisible();
    const lBox = wordmarkLink.locator("span[aria-hidden]").first();
    await expect(lBox).toBeVisible();
    const box = await lBox.boundingBox();
    expect(box, "'L' box must have a bounding box").toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    // Expand back — the full "Lede" wordmark text returns.
    await railCollapseToggle(page).click();
    await expect(railPane(page)).toHaveAttribute("data-collapsed", "false");
    await expect(page.getByText("Lede", { exact: true })).toBeVisible();
  });

  test("theme + logout collapsed: icon-only, functionally live, named via a Radix tooltip (no native title)", async ({
    page,
  }) => {
    await loginAndCollapse(page);

    const theme = themeToggleButton(page);
    const logout = railLogoutButton(page);

    await expect(theme).toHaveText("");
    await expect(logout).toHaveText("");
    expect(await theme.getAttribute("title")).toBeNull();
    expect(await logout.getAttribute("title")).toBeNull();

    // Functionally live: clicking flips the documentElement class and swaps
    // the button's own aria-label (the accessible name a tooltip must echo).
    const initialLabel = await theme.getAttribute("aria-label");
    const wasDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    await theme.click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(!wasDark);
    await expect.poll(() => theme.getAttribute("aria-label")).not.toBe(initialLabel);
    const themeLabel = (await theme.getAttribute("aria-label"))!;

    // The click above leaves the pointer resting on the button already — a
    // `.hover()` from an unchanged pointer position fires no fresh
    // mouseenter, so Radix never opens. Move the mouse fully away first.
    await page.mouse.move(0, 0);
    await theme.hover();
    await expect(page.getByRole("tooltip", { name: themeLabel })).toBeVisible();

    // Close it before opening logout's — Escape is Radix's own dismissal
    // (closes regardless of whether the trigger is still focused from the
    // click above, unlike relying on mouse-leave/blur semantics) and keeps
    // this to the spec's actual requirement, not incidental Radix
    // open/close timing between controls.
    await page.keyboard.press("Escape");
    await expect.poll(() => page.getByRole("tooltip").count()).toBe(0);
    await page.mouse.move(0, 0);

    await logout.hover();
    await expect(page.getByRole("tooltip", { name: "Log out" })).toBeVisible();

    await logoutViaRail(page);
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  });

  test("every icon inside the collapsed rail renders at 16px", async ({ page }) => {
    await loginAndCollapse(page);

    const svgWidths = await page.$$eval('[data-testid="rail-pane"] svg', (svgs) =>
      svgs.map((svg) => svg.getBoundingClientRect().width),
    );
    expect(svgWidths.length).toBeGreaterThan(0);
    for (const width of svgWidths) {
      expect(Math.round(width)).toBe(16);
    }
  });

  test("collapsed nav icons and footer icons share the rail's horizontal center", async ({
    page,
  }) => {
    await loginAndCollapse(page);

    const paneBox = await railPane(page).boundingBox();
    expect(paneBox, "rail-pane must have a boundingBox").toBeTruthy();
    const paneCenterX = paneBox!.x + paneBox!.width / 2;

    const svgCenters = await page.$$eval('[data-testid="rail-pane"] svg', (svgs) =>
      svgs.map((svg) => {
        const rect = svg.getBoundingClientRect();
        return rect.x + rect.width / 2;
      }),
    );
    expect(svgCenters.length).toBeGreaterThan(0);
    for (const centerX of svgCenters) {
      expect(Math.abs(centerX - paneCenterX)).toBeLessThanOrEqual(2);
    }
  });
});
