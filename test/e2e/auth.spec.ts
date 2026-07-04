// Phase 2 password gate, driven in a real chromium tab against the real
// server (spec.md §7/§8) — the "auth" project's own webServer, gate ENABLED,
// fresh DATA_DIR (playwright.config.ts). Covers the full arc: fresh boot ->
// set-password -> logged in -> logout -> a protected route refuses an
// unauthenticated direct navigation -> login restores access.
//
// LoginGate (src/client/components/LoginGate.tsx) wraps the whole app and
// pings a protected endpoint (GET /api/settings via fetchSettings) on every
// mount; a 401 swaps the entire app out for LoginForm instead of routing to
// a distinct "/login" URL. So "refused, redirected to login" in this SPA
// means: the same URL renders the password form instead of app content —
// there's no separate login route to navigate to.
import { test, expect } from "@playwright/test";
import { ensureFirstRunPassword, login } from "./helpers/session";

const PASSWORD = "correct horse battery staple e2e";
// Any app route is behind the gate (App.tsx wraps everything in LoginGate);
// /library is used here because it has an unambiguous signed-in marker (the
// "Add entry" button, also relied on by library-crud.spec.ts's own server).
const PROTECTED_ROUTE = "/library";

test.describe("first-run set-password -> login -> protected route", () => {
  test("gates a fresh boot, then logout/login flips access", async ({ page, context }) => {
    // (1) fresh boot -> the set-password screen. Nothing distinguishes this
    // visually from a later login (see helpers/session.ts) — what makes it
    // "first-run" is that this DATA_DIR has never had a password set, so the
    // one form Playwright can see IS the set-password screen.
    await page.goto("/");
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
    await expect(page.getByText("First time here? This sets your password.")).toBeVisible();

    await ensureFirstRunPassword(page, PASSWORD);

    // (2) redirected to the logged-in app view (index route -> /applications,
    // main.tsx, §26 IA) with the primary nav now reachable.
    await expect(page).toHaveURL(/\/applications$/);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

    // Session cookie must be HttpOnly (spec.md §8/§17) — this is the whole
    // point of a server-side session over e.g. a JS-readable token.
    const cookiesAfterLogin = await context.cookies();
    const sessionCookie = cookiesAfterLogin.find((c) => c.name === "session");
    expect(sessionCookie, "expected a session cookie after login").toBeTruthy();
    expect(sessionCookie?.httpOnly).toBe(true);

    // (3) log out via the real UI action (SettingsView's "Log out" button,
    // which calls POST /api/auth/logout and invalidates the query cache).
    await page.goto("/settings");
    // Wait for the logout round-trip itself before asserting the form returns —
    // the cache invalidation + LoginGate's re-ping (/api/settings -> 401) + swap
    // to LoginForm otherwise races the default 5s timeout under composite load.
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/auth/logout") && r.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Log out" }).click(),
    ]);
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible({ timeout: 15000 });

    // (4) direct-navigate (full browser nav, not client-side routing) to a
    // protected route while logged out -> refused, gate shows the password
    // form instead of the route's content.
    await page.goto(PROTECTED_ROUTE);
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add entry" })).toHaveCount(0);

    // (5) log in with the previously-set password -> the protected route is
    // now reachable (still at PROTECTED_ROUTE; the gate just swaps content).
    await login(page, PASSWORD);
    await expect(page).toHaveURL(new RegExp(`${PROTECTED_ROUTE}$`));
    await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();
  });
});
