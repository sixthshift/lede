// Cohesion sweep (v3-T050, spec.md Phase 5, red-team L4/M2) — cross-cutting
// contracts the now-hoisted, persistent WorkspaceShell (App.tsx) must hold
// across every surface, not just what each earlier phase's own spec already
// covers in isolation (applications.spec.ts's rail-nav test, settings.spec.ts/
// library-crud.spec.ts's degrade checks, etc.):
//   - PRESENCE: the shell exists on all four routes.
//   - PERSISTENCE (the actual "persistent" claim — element existence alone
//     proves nothing): an expando marker set on the workspace-shell node
//     survives a CLIENT-SIDE nav to another route, including a
//     document<->non-document pair — proof it's the SAME DOM node, never a
//     remount. Never page.goto/reload for the nav step itself — that would
//     manufacture a fresh node and the marker would trivially vanish either
//     way, proving nothing.
//   - FUNCTIONAL RAIL per surface: an outcome-level check (URL change /
//     scroll-into-view), not just "the rail renders something" — a rail
//     that renders but does nothing must fail this.
//   - DEGRADE: no preview-pane element at all off the one document surface;
//     present and co-visible on it.
//
// Shares applications.spec.ts's "applications" project/server (real
// first-run set-password -> login, gate ON; LEDE_TAILOR_ENGINE=fixture) —
// PASSWORD MUST match that file's exactly (single server-wide secret,
// playwright.config.ts). Never touches the Library (LibraryView) so the
// keyless tailor fixture's hash — recorded against the server's default
// SEED_ENTRIES — never drifts (see applications.spec.ts's header for the
// full rationale); none of these tests tailor at all, so that's moot here,
// but createApplication's JD is still CONTRAST_JDS[0].jd for consistency.
import { test, expect, type Page } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { login, createApplication } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — same recorded fixture as applications.spec.ts

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// The global nav (App.tsx's persistent rail, ABOVE whatever per-route
// section-nav content portals in below it) — scoped to its own
// aria-label="Primary" nav landmark (NavTabs.tsx, unchanged by this ticket)
// so it's never confused with ApplicationDetail's OWN "Applications"
// back-link, which shares the same accessible name.
function globalNavLink(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name, exact: true });
}

test.describe("Cohesion sweep: the shell is genuinely persistent, and its rail is functional everywhere", () => {
  test("PRESENCE: workspace-shell renders on all four surfaces", async ({ page }, testInfo) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const company = `E2E Cohesion Presence Co ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: JD });

    await expect(page.getByTestId("workspace-shell")).toBeVisible();

    await page.goto("/library");
    await expect(page.getByTestId("workspace-shell")).toBeVisible();

    await page.goto("/settings");
    await expect(page.getByTestId("workspace-shell")).toBeVisible();

    await page.goto(`/applications/${applicationId}`);
    await expect(page.getByTestId("workspace-shell")).toBeVisible();
  });

  test("PERSISTENCE: the workspace-shell DOM node survives client-side navigation, including a document<->non-document pair", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const company = `E2E Cohesion Persistence Co ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: JD });

    await page.goto(`/applications/${applicationId}`);
    const shell = page.getByTestId("workspace-shell");
    await expect(shell).toBeVisible();

    const marker = `t050-${runId}-${testInfo.retry}`;
    await shell.evaluate((el, value) => {
      (el as unknown as Record<string, string>).__t050PersistenceMarker = value;
    }, marker);

    async function expectMarkerSurvived(): Promise<void> {
      const value = await page
        .getByTestId("workspace-shell")
        .evaluate(
          (el) => (el as unknown as Record<string, string>).__t050PersistenceMarker ?? null,
        );
      expect(value, "workspace-shell must be the SAME DOM node — the expando must survive").toBe(
        marker,
      );
    }

    // (1) document -> non-document: /applications/:id -> /library, via a
    // CLIENT-SIDE click on the persistent rail's global nav.
    await globalNavLink(page, "Library").click();
    await expect(page).toHaveURL(/\/library$/);
    await expectMarkerSurvived();

    // (2) non-document -> non-document: /library -> /settings.
    await globalNavLink(page, "Settings").click();
    await expect(page).toHaveURL(/\/settings$/);
    await expectMarkerSurvived();

    // (3) non-document -> non-document (dashboard): /settings -> /applications.
    await globalNavLink(page, "Applications").click();
    await expect(page).toHaveURL(/\/applications$/);
    await expectMarkerSurvived();

    // (4) non-document -> document: back into the SAME application via its
    // own card's Open action, closing the loop across every pair.
    await page
      .locator("[data-application-id]")
      .filter({ hasText: company })
      .getByTestId("application-card-open")
      .click();
    await expect(page).toHaveURL(new RegExp(`/applications/${applicationId}$`));
    await expectMarkerSurvived();
  });

  test("FUNCTIONAL RAIL: global nav activates on the dashboard/library/settings; the section rail activates on application detail", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    // Dashboard's rail is global-nav only (spec.md Phase 5/M2, no section
    // nav of its own) — its one functional item routes to Library.
    await globalNavLink(page, "Library").click();
    await expect(page).toHaveURL(/\/library$/);

    // Library's rail carries the same global nav (plus its own section nav
    // over entry groups, covered by library-crud.spec.ts) — routes to
    // Settings.
    await globalNavLink(page, "Settings").click();
    await expect(page).toHaveURL(/\/settings$/);

    // Settings' rail, symmetrically — routes back to the dashboard.
    await globalNavLink(page, "Applications").click();
    await expect(page).toHaveURL(/\/applications$/);

    // Application detail's rail carries the SAME global nav, plus its own
    // SECTION rail (WORKSPACE_SECTIONS) — activating "Design" (the last,
    // out-of-view section) scrolls/focuses it into the viewport without
    // touching the URL, the outcome that rail is FOR (applications.spec.ts's
    // own "rail nav (v3-T013)" test covers the full contract; this reuses
    // just the observable-activation slice).
    const company = `E2E Cohesion Rail Co ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: JD });
    await page.goto(`/applications/${applicationId}`);

    const editorPane = page.getByTestId("editor-pane");
    await editorPane.evaluate((el) => {
      el.scrollTop = 0;
    });
    const designHeading = page.getByTestId("workspace-section-heading-design");
    await expect(designHeading).not.toBeInViewport();
    const urlBefore = page.url();

    await page.getByTestId("rail-nav-design").click();

    await expect(designHeading).toBeInViewport();
    expect(page.url()).toBe(urlBefore);
  });

  test("DEGRADE: no preview-pane off the one document surface; present and co-visible on application detail at 1280x720", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    await expect(page.getByTestId("preview-pane")).toHaveCount(0);

    await page.goto("/library");
    await expect(page.getByTestId("preview-pane")).toHaveCount(0);

    await page.goto("/settings");
    await expect(page.getByTestId("preview-pane")).toHaveCount(0);

    const company = `E2E Cohesion Degrade Co ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: JD });
    await page.goto(`/applications/${applicationId}`);

    const editorPane = page.getByTestId("editor-pane");
    const previewPane = page.getByTestId("preview-pane");
    await expect(editorPane).toBeVisible();
    await expect(previewPane).toBeVisible();

    const [editorBox, previewBox] = await Promise.all([
      editorPane.boundingBox(),
      previewPane.boundingBox(),
    ]);
    expect(editorBox, "editor-pane must have a real box").toBeTruthy();
    expect(previewBox, "preview-pane must have a real box").toBeTruthy();
    expect(previewBox!.width).toBeGreaterThanOrEqual(320);
    // Co-visible means genuinely side-by-side, not one occluding the other —
    // the preview pane starts at/after the editor pane's right edge.
    expect(previewBox!.x).toBeGreaterThanOrEqual(editorBox!.x + editorBox!.width - 1);
  });
});
