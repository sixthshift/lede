// v4-T020 (single-chrome merge, OQ1; spec.md "Locked decisions" + Phase 1;
// .ailoop/oracle.md red-team #2/#3/#4) — the header bar (AppShell) is
// deleted outright: the wordmark moves to the rail's top anchor, theme
// toggle + logout move to the rail's bottom cluster (App.tsx), and the login
// page (LoginGate, which renders OUTSIDE the shell) gets its own standalone
// mini-chrome so it doesn't lose these when the header dies.
//
// This is Phase 1's campaign-core-risk ticket, so every assertion here is
// GEOMETRIC/BEHAVIORAL per oracle.md's anti-gaming protocols, never a
// tag-name or class-presence check:
//  - "no header" = no full-width fixed/sticky bar OUTSIDE the rail-pane,
//    measured by boundingBox/computed style — a renamed same-size bar fails
//    this exactly like a literal <header> would.
//  - "theme toggle operable" = the root class flips AND a computed
//    background actually changes on two unrelated surfaces (a per-theme
//    resolution, not a hardcoded literal).
//  - "logout operable" = a real server session invalidation (a subsequent
//    full navigation / direct API call still refuses), not a client-only
//    route push.
//
// Reuses the "applications" project's shared server/password (PASSWORD MUST
// match applications.spec.ts's — see playwright.config.ts's rationale for
// why these specs share one server).
import { test, expect, type Page } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import {
  login,
  createApplication,
  railWordmark,
  themeToggleButton,
  toggleTheme,
  logoutViaRail,
} from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd;
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const VIEWPORT = { width: 1280, height: 720 };

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function requireBox(box: Box | null, label: string): Box {
  expect(box, `${label} must have a rendered bounding box`).not.toBeNull();
  return box!;
}

async function loginOnly(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);
}

async function loginAndSeed(page: Page, marker: string): Promise<{ applicationId: string }> {
  await loginOnly(page);
  const company = `E2E Chrome Merge Co ${runId}-${marker}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  return { applicationId };
}

// Geometric "no header" oracle (red-team #2/#3): any element ANYWHERE in the
// DOM, outside the rail-pane, that is position fixed/sticky AND spans at
// least 90% of the viewport's width. A bar this wide can never be a rail
// descendant (the rail itself is a fixed 224px-ish column), so no separate
// "outside the rail" containment math is needed — width alone disqualifies
// it from being rail content. Measured by computed style + geometry, never
// tag name: a `<div>` painted to the old header's exact size/position fails
// this identically to a literal `<header>`.
async function assertNoFullWidthBarOutsideRail(page: Page, surface: string): Promise<void> {
  const offenders = await page.evaluate((viewportWidth) => {
    const rail = document.querySelector('[data-testid="rail-pane"]');
    const elements = Array.from(document.querySelectorAll("body *"));
    return elements
      .filter((el) => {
        if (rail && (el === rail || rail.contains(el))) return false;
        const style = getComputedStyle(el);
        if (style.position !== "fixed" && style.position !== "sticky") return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        return rect.width >= viewportWidth * 0.9;
      })
      .map((el) => `${el.tagName.toLowerCase()}.${Array.from(el.classList).join(".")}`);
  }, VIEWPORT.width);
  expect(
    offenders,
    `${surface}: no full-width fixed/sticky bar may exist outside the rail (found: ${offenders.join(", ")})`,
  ).toEqual([]);
  expect(await page.locator("header").count(), `${surface}: no <header> element`).toBe(0);
}

test.describe("chrome merge (v4-T020, single-chrome, OQ1)", () => {
  test("AppShell is removed from the DOM (not CSS-hidden); no full-width fixed bar exists outside the rail on any shell surface", async ({
    page,
  }) => {
    const { applicationId } = await loginAndSeed(page, "no-header");

    await assertNoFullWidthBarOutsideRail(page, "/applications (dashboard)");

    await page.goto(`/applications/${applicationId}`);
    await expect(page.getByTestId("workspace-shell")).toBeVisible();
    await assertNoFullWidthBarOutsideRail(page, "/applications/:id (detail)");

    await page.goto("/library");
    await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();
    await assertNoFullWidthBarOutsideRail(page, "/library");

    await page.goto("/settings");
    await expect(page.getByTestId("workspace-shell")).toBeVisible();
    await assertNoFullWidthBarOutsideRail(page, "/settings");
  });

  test("the wordmark's boundingBox is geometrically contained within the rail's boundingBox", async ({
    page,
  }) => {
    await loginOnly(page);

    const railBox = requireBox(await page.getByTestId("rail-pane").boundingBox(), "rail-pane");
    const wordmarkBox = requireBox(await railWordmark(page).boundingBox(), "wordmark");

    expect(wordmarkBox.x, "wordmark left edge inside the rail").toBeGreaterThanOrEqual(
      railBox.x - 0.5,
    );
    expect(wordmarkBox.y, "wordmark top edge inside the rail").toBeGreaterThanOrEqual(
      railBox.y - 0.5,
    );
    expect(
      wordmarkBox.x + wordmarkBox.width,
      "wordmark right edge inside the rail",
    ).toBeLessThanOrEqual(railBox.x + railBox.width + 0.5);
    expect(
      wordmarkBox.y + wordmarkBox.height,
      "wordmark bottom edge inside the rail",
    ).toBeLessThanOrEqual(railBox.y + railBox.height + 0.5);
  });

  test("the rail's theme toggle is operable: flips the root theme class AND repaints two unrelated surfaces (canvas + a card)", async ({
    page,
  }) => {
    await loginAndSeed(page, "theme-toggle");

    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);
    await expect(themeToggleButton(page)).toBeVisible();

    const canvas = page.getByTestId("workspace-shell");
    const card = page.locator("[data-application-id]").first();

    const canvasBefore = await canvas.evaluate((el) => getComputedStyle(el).backgroundColor);
    const cardBefore = await card.evaluate((el) => getComputedStyle(el).backgroundColor);

    await toggleTheme(page);
    await expect(html).toHaveClass(/dark/);

    const canvasAfter = await canvas.evaluate((el) => getComputedStyle(el).backgroundColor);
    const cardAfter = await card.evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(canvasAfter, "canvas background must actually repaint on theme flip").not.toBe(
      canvasBefore,
    );
    expect(cardAfter, "card background must actually repaint on theme flip").not.toBe(cardBefore);

    // toggling back is a real, reversible effect, not one-directional.
    await toggleTheme(page);
    await expect(html).not.toHaveClass(/dark/);
  });

  test("the rail's logout is operable and INVALIDATES the session (server round-trip, not just a client-side route push)", async ({
    page,
  }) => {
    await loginOnly(page);

    await logoutViaRail(page);
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible({ timeout: 15000 });

    // A fresh FULL navigation to a protected route must ALSO show the gate —
    // proves the SERVER session was invalidated, not merely the client's
    // query cache/route state (a client-only logout would still let a full
    // reload of a protected route through).
    await page.goto("/library");
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add entry" })).toHaveCount(0);

    // And a direct API call now 401s.
    const response = await page.request.get("/api/settings");
    expect(response.status()).toBe(401);

    // Restore a valid session so subsequent tests in this file (which don't
    // depend on execution order, but share this server/password) aren't
    // affected by this test's logout.
    await login(page, PASSWORD);
  });

  test.describe("login page's standalone mini-chrome (renders outside the shell, never inherits rail/header chrome)", () => {
    for (const viewport of [
      { width: 375, height: 812, label: "375px (phone)" },
      { width: 1280, height: 720, label: "1280px (desktop)" },
    ]) {
      test(`wordmark + theme toggle render at ${viewport.label}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto("/");

        await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
        await expect(page.getByText("Lede", { exact: true })).toBeVisible();
        await expect(themeToggleButton(page)).toBeVisible();

        // Never inherits shell/rail chrome (Locked decisions: compact chrome).
        await expect(page.getByTestId("rail-pane")).toHaveCount(0);
        await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
      });
    }
  });
});
