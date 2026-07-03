// Reusable drivers for the Phase 2 password gate's UI (LoginGate.tsx /
// LoginForm), spec.md §7/§8. Shared by auth.spec.ts (E5-B) and E5-C.
//
// LoginForm is a SINGLE component for both first-run and returning-user
// login — it doesn't render differently depending on which case it is. It
// discovers which case it's in itself: POST /api/auth/setup first, and only
// falls back to /api/auth/login when setup 409s (password already exists).
// So "set a password" and "log in" are the same UI action from the caller's
// side; these two exports exist as distinct names for what the CALLER
// intends (first boot vs. a returning session), not because the underlying
// interaction differs.
import { expect, type Page } from "@playwright/test";

async function submitPassword(page: Page, password: string): Promise<void> {
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  // LoginForm unmounts once the ping (fetchSettings) succeeds post sign-in —
  // the one outcome common to both the first-run and returning-user paths.
  // Generous timeout: this crosses a network round-trip + React Query refetch +
  // re-render, which starves past the default 5s on a contended box (same
  // rationale as vite.config.ts's 30s vitest timeout); E5-C reuses this under
  // Docker, more contended still.
  await expect(page.getByLabel("Password", { exact: true })).toBeHidden({ timeout: 15000 });
}

/** Drives the gate's first-run flow: sets `password`, then signs in with it. */
export async function ensureFirstRunPassword(page: Page, password: string): Promise<void> {
  await submitPassword(page, password);
}

/** Drives the gate's returning-user flow: signs in with an already-set `password`. */
export async function login(page: Page, password: string): Promise<void> {
  await submitPassword(page, password);
}
