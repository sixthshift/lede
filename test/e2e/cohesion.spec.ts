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
import {
  login,
  createApplication,
  assertNoModalOverlay,
  openAddEntry,
  openEditFor,
} from "./helpers/workspace";

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

    await page.goto("/applications");
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

// ── v3-T051: app-wide modality sweep ── the cross-cutting proof that the
// T050 hoist (single persistent WorkspaceShell above <Outlet/>) regressed
// modality nowhere. Each de-modal flow already has its OWN phase-scoped
// non-modal test (T020/T021/T022/T023/T024, in applications/library-crud/
// design.spec.ts) — this sweep is not a duplicate of those; it's the
// same bar (assertNoModalOverlay: 0 aria-modal + no >50%-viewport
// fixed/absolute overlay) applied ONCE MORE, on the FINAL hoisted-shell
// tree, across every surface in the same run. A closed-state 0-count would
// be a cheat (an unopened dialog trivially has 0 aria-modal too) — every
// case below asserts the panel is actually OPEN and VISIBLE first.
test.describe("SWEEP 1 — app-wide modality: every de-modal panel stays non-modal on the final hoisted-shell tree (v3-T051)", () => {
  test("NewApplication panel is non-modal (dashboard, /applications)", async ({ page }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const trigger = page.getByRole("button", { name: "New application" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/^Company/)).toBeVisible();

    await assertNoModalOverlay(page);
  });

  test("EntryEditor via Add entry is non-modal (library, /library)", async ({ page }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await page.goto("/library");
    await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();

    const dialog = await openAddEntry(page);
    await expect(dialog.getByLabel(/^Company/)).toBeVisible();

    await assertNoModalOverlay(page);
  });

  test("EntryEditor via editing an existing entry is non-modal (library, /library)", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await page.goto("/library");
    await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();

    // SEED_ENTRIES (src/server/seed.ts) always ships this experience entry —
    // no need to create one first just to have something to edit.
    const dialog = await openEditFor(
      page,
      "Experience: rules engine ~30k lines of unstructured rules",
    );
    await expect(dialog.getByLabel(/^Company/)).toBeVisible();

    await assertNoModalOverlay(page);
  });

  test("LayoutEditor is non-modal (library, /library)", async ({ page }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await page.goto("/library");
    await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();

    const trigger = page.getByRole("button", { name: "Edit layout" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-layout-row]").first()).toBeVisible();

    await assertNoModalOverlay(page);
  });

  test("ProfileEditor is non-modal (library, /library)", async ({ page }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await page.goto("/library");
    await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();

    const trigger = page.getByRole("button", { name: "Edit profile" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Name", { exact: true })).toBeVisible();

    await assertNoModalOverlay(page);
  });

  test("TemplateGallery via Browse templates is non-modal (application detail, /applications/:id)", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const company = `E2E Sweep Gallery Co ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: JD });
    await page.goto(`/applications/${applicationId}`);

    const trigger = page.getByRole("button", { name: "Browse templates" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.locator("[data-template-id]").first()).toBeVisible();

    await assertNoModalOverlay(page);
  });
});

// ── v3-T051: co-visibility re-run ── the DEGRADE test above already proves
// side-by-side co-visibility as PART of a broader test; this re-runs the
// same "genuinely side-by-side, not occluding" box assertion as its own,
// explicitly-named check on the final tree — the sweep spec.md Phase 5 calls
// for, independent of whatever else DEGRADE happens to cover. Only
// /applications/:id is a document surface (dashboard/library/settings
// degrade to no preview pane by design — not asserted here).
test.describe("SWEEP 2 — co-visibility re-run: editor and preview panes are genuinely side-by-side on the final tree (v3-T051)", () => {
  test("editor-pane and preview-pane are both visible and side-by-side at 1280x720", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const company = `E2E Sweep CoVisibility Co ${runId}-${testInfo.retry}`;
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
    expect(previewBox!.x).toBeGreaterThanOrEqual(editorBox!.x + editorBox!.width - 1);
  });
});
