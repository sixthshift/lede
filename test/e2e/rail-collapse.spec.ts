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
import { login } from "./helpers/workspace";

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
