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
import { test, expect, type Page, type Locator } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import {
  login,
  createApplication,
  assertNoModalOverlay,
  openAddEntry,
  openEditFor,
  railWordmark,
  tailor,
  expectResumeCanvasPainted,
  countOversizedOverlays,
  assertOutsideElementReachable,
  assertSanctionedSheetAndClose,
  assertNoHorizontalOverflow,
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

// ── v4-T060: cohesion suite extended with v4 invariants ── the P1-P4
// tickets each proved their own contract in isolation (rail-collapse.spec.ts,
// scroll-spy.spec.ts, route-transitions.spec.ts, responsive-nav.spec.ts,
// phone-overflow.spec.ts, pane-arbitration.spec.ts); this section re-asserts
// the same bars APP-WIDE on the FINAL tree, the way the v3-T051 sweeps above
// already did for the shell hoist + modality. Five invariants, per spec.md
// Phase 5 + oracle.md's Phase 5 oracle:
//   (1) app-wide MODALITY SWEEP at 375/768/1024/1280 under the pinned
//       taxonomy: >=1024 zero modality (absolute ban); below-lg the preview
//       SHEET (T033/OQ2) is the one sanctioned exception; the bottom tab bar
//       + toasts are non-modal persistent chrome, never modality.
//   (2) no horizontal overflow at 375/768/1023/1024/1280/1512, all four
//       surfaces, via the SAME frozen whitelist phone-overflow.spec.ts
//       established (oracle.md: "any addition is a flagged change").
//   (3) scroll restoration (F203) re-verified on the final tree.
//   (4) rail collapse (F207, view-state, network-zero) re-verified app-wide.
//   (5) scroll-spy active-section rule (F202) re-verified on the final tree.
//
// Breakpoints are PINNED (oracle.md): sm=640, lg=1024, xl=1280; 1023 and 1024
// are different regimes, never conflated. The de-modal ban is ABSOLUTE at
// >=lg; below lg, ONLY the full-width preview sheet is sanctioned, and only
// when dismissible + focus-managed + carrying no aria-modal.
function bottomTabBar(page: Page): Locator {
  return page.getByTestId("bottom-tab-bar");
}

// createApplication (and duplicate) fire their own success toast (T040/F401)
// — sonner's default bottom-right position means an un-cleared toast can
// visually sit over the bottom-tab-bar's own right-hand links on a narrow
// viewport, an incidental collision from THIS suite's own setup calls, not a
// product modality bug. Draining it first (the same park-mouse-then-wait
// pattern toasts.spec.ts uses, since hover pauses sonner's auto-dismiss
// timer) keeps the modality-sweep's outside-reachability checks free of that
// unrelated noise.
async function waitForNoToasts(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15000 });
}

/** Logs in, creates + tailors an application, and lands on its detail route — the shared precondition scroll-restoration/scroll-spy need for real scroll room. */
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

/** Opens a de-modal panel already visible as a `role="dialog"`, asserts the pinned zero-modality bar, then closes it via its "Close" control. */
async function assertPanelNonModalAndClose(page: Page, outsideAnchor: Locator): Promise<void> {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await assertNoModalOverlay(page);
  await assertOutsideElementReachable(page, outsideAnchor);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
}

const GE_LG_MODALITY_WIDTHS = [1024, 1280] as const;
const BELOW_LG_MODALITY_WIDTHS = [375, 768] as const;

test.describe("SWEEP 3 — app-wide modality taxonomy at 375/768/1024/1280 (v4-T060, red-team #14/#23)", () => {
  for (const width of GE_LG_MODALITY_WIDTHS) {
    test(`>=lg @ ${width}: zero modality across every de-modal panel and the preview`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await login(page, PASSWORD);
      await expect(page).toHaveURL(/\/applications$/);

      const company = `E2E Modality GE Co ${width}-${runId}-${testInfo.retry}`;
      const applicationId = await createApplication(page, { company, jd: JD });
      await waitForNoToasts(page);
      const outsideAnchor = railWordmark(page);

      // NewApplication (dashboard) — rendered in-flow, never fixed/absolute,
      // so it can never itself register as an oversized overlay; still holds
      // the same zero-modality + outside-reachable bar as every other panel.
      await page.getByRole("button", { name: "New application" }).click();
      await assertPanelNonModalAndClose(page, outsideAnchor);

      // Library's three docked panels.
      await page.goto("/library");
      await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();

      await openAddEntry(page);
      await assertPanelNonModalAndClose(page, outsideAnchor);

      await page.getByRole("button", { name: "Edit layout" }).click();
      await assertPanelNonModalAndClose(page, outsideAnchor);

      await page.getByRole("button", { name: "Edit profile" }).click();
      await assertPanelNonModalAndClose(page, outsideAnchor);

      // The preview, at this regime's own rules: 1280 is always co-visible
      // (no toggle involved); 1024 is the lg..xl SWAP regime — opening it is
      // a real layout swap (T035/oracle.md: "a pane swap is not modality"),
      // never covered by a scrim, so it must clear the SAME zero-modality bar.
      await page.goto(`/applications/${applicationId}`);
      if (width === 1280) {
        await expect(page.getByTestId("preview-pane")).toBeVisible();
        await assertNoModalOverlay(page);
      } else {
        await expect(page.getByTestId("preview-swap-toggle")).toBeVisible();
        await page.getByTestId("preview-swap-toggle").click();
        await expect(page.getByTestId("preview-pane")).toBeVisible();
        await assertNoModalOverlay(page);
        await page.getByTestId("preview-swap-toggle").click();
        await expect(page.getByTestId("preview-pane")).toHaveCount(0);
      }
    });
  }

  for (const width of BELOW_LG_MODALITY_WIDTHS) {
    test(`<lg @ ${width}: NewApplication in-flow non-modal; Library panels + preview are SANCTIONED sheets (not modality); nothing else oversized`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 1024 });
      await page.goto("/");
      await login(page, PASSWORD);
      await expect(page).toHaveURL(/\/applications$/);
      await expect(page.getByTestId("rail-pane")).toHaveCount(0);

      const company = `E2E Modality Below Co ${width}-${runId}-${testInfo.retry}`;
      const applicationId = await createApplication(page, { company, jd: JD });
      await waitForNoToasts(page);
      const dashboardAnchor = bottomTabBar(page).getByRole("link", {
        name: "Library",
        exact: true,
      });

      // NewApplication is the OUTLIER below `lg`: it's an in-flow inline
      // panel (T032/OQ7/F304 — no fixed/absolute positioning at all), NOT a
      // sheet, so it never covers the surface and the underlying dashboard
      // stays reachable. It holds the SAME absolute bar as at >=lg.
      await page.getByRole("button", { name: "New application" }).click();
      await assertPanelNonModalAndClose(page, dashboardAnchor);

      // Library's three panels are the T062 SANCTIONED SHEETS below `lg`:
      // full-width `fixed inset-0` `role="dialog"`, no aria-modal,
      // focus-managed, dismissible via a visible Close. Per the pinned
      // taxonomy a below-lg sheet is NOT modality even at ~100% coverage —
      // so the sweep must RECOGNIZE (not reject) them as sheets, while still
      // rejecting any NON-sheet oversized overlay (checked inside the helper).
      await page.goto("/library");
      await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();

      await openAddEntry(page);
      await assertSanctionedSheetAndClose(page, page.getByRole("dialog"));

      await page.getByRole("button", { name: "Edit layout" }).click();
      await assertSanctionedSheetAndClose(page, page.getByRole("dialog"));

      await page.getByRole("button", { name: "Edit profile" }).click();
      await assertSanctionedSheetAndClose(page, page.getByRole("dialog"));

      // The preview SHEET — T033/OQ2's sanctioned below-lg exception: role
      // ="dialog", explicitly no aria-modal, dismissible (Escape AND a
      // visible Close control) and focus-managed both ways. While it's open,
      // nothing ELSE registers as modality (sitewide aria-modal stays 0, and
      // no oversized overlay exists OUTSIDE the sheet's own sanctioned span).
      await page.goto(`/applications/${applicationId}`);
      await expect(page.getByTestId("preview-sheet-trigger")).toBeVisible();
      await expect(page.getByTestId("preview-sheet")).toHaveCount(0);

      await page.getByTestId("preview-sheet-trigger").click();
      const sheet = page.getByTestId("preview-sheet");
      await expect(sheet).toBeVisible();
      await expect(sheet).toHaveAttribute("role", "dialog");
      expect(
        await sheet.getAttribute("aria-modal"),
        "the sanctioned sheet must carry no aria-modal",
      ).toBeNull();
      await expect(page.getByTestId("preview-sheet-close")).toBeFocused();
      expect(
        await page.locator('[aria-modal="true"]').count(),
        "no aria-modal anywhere while the sheet is open",
      ).toBe(0);
      expect(
        await countOversizedOverlays(page, page.getByTestId("preview-sheet")),
        "no oversized overlay OTHER than the sanctioned sheet itself",
      ).toBe(0);

      // Dismissal path 1: Escape closes it and returns focus to the trigger.
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("preview-sheet")).toHaveCount(0);
      await expect(page.getByTestId("preview-sheet-trigger")).toBeFocused();

      // Dismissal path 2: the visible Close control, same focus-return.
      await page.getByTestId("preview-sheet-trigger").click();
      await expect(page.getByTestId("preview-sheet")).toBeVisible();
      await page.getByTestId("preview-sheet-close").click();
      await expect(page.getByTestId("preview-sheet")).toHaveCount(0);
      await expect(page.getByTestId("preview-sheet-trigger")).toBeFocused();
    });
  }

  test("bottom tab bar + toasts classify as NON-modal persistent chrome, not modality", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    // Persistent chrome: always present, no scrim, no aria-modal/role=dialog.
    const bar = bottomTabBar(page);
    await expect(bar).toBeVisible();
    expect(await bar.getAttribute("aria-modal")).toBeNull();
    expect(await bar.getAttribute("role")).not.toBe("dialog");
    await assertNoModalOverlay(page);

    const company = `E2E Toast NonModal Co ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: JD });
    await waitForNoToasts(page);
    const card = page.locator(`[data-application-id="${applicationId}"]`);
    await expect(card).toBeVisible();

    // Fire a real toast (duplicate). Clicking its trigger scrolls that card
    // into view (this whole file's earlier tests accumulate dashboard cards
    // with no cleanup, so the target card can sit far down a long list) —
    // pin the editor pane back to its top afterward so the page's own h1 is
    // a deterministic anchor, since sonner's default bottom-RIGHT toast
    // (measured: ~343px wide at 375px viewport, i.e. nearly edge-to-edge)
    // can span the ENTIRE bottom tab bar's width, so no bottom-bar link is a
    // safe "definitely outside the toast" anchor at this width. Assert no
    // modality: no aria-modal sitewide, no oversized (>50%-viewport) overlay
    // (the toast itself is ~6% of the viewport — nowhere close), and content
    // clearly OUTSIDE the toast's own small footprint stays hit-testable. (A
    // toast's own small visible footprint DOES intercept a click aimed
    // exactly at it — same as any other small on-screen control, not
    // modality; what WOULD be is a persistent block of something OUTSIDE it,
    // which the transience check below rules out.)
    await card.getByTestId("application-card-duplicate").click();
    const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Application duplicated" });
    await expect(toast).toBeVisible();
    expect(await page.locator('[aria-modal="true"]').count()).toBe(0);
    await assertNoModalOverlay(page);
    const toastBox = await toast.boundingBox();
    expect(toastBox, "toast must have a rendered bounding box").toBeTruthy();
    expect(
      (toastBox!.width * toastBox!.height) / (375 * 812),
      "the toast's own footprint must be nowhere near the 50%-viewport modality threshold",
    ).toBeLessThan(0.15);

    await page.getByTestId("editor-pane").evaluate((el) => {
      el.scrollTop = 0;
    });
    await assertOutsideElementReachable(page, page.getByRole("heading", { name: "Applications" }));

    // Auto-dismisses — the transient half of "non-modal chrome": whatever
    // sliver of the bottom bar the toast happened to sit over is reachable
    // again the moment it clears, proving no PERSISTENT block ever occurred.
    await waitForNoToasts(page);
    await assertOutsideElementReachable(
      page,
      bar.getByRole("link", { name: "Library", exact: true }),
    );
  });
});

test.describe("SWEEP 4 — no horizontal overflow at 375/768/1023/1024/1280/1512, all four surfaces (v4-T060, red-team #13)", () => {
  test("document.documentElement.scrollWidth matches the viewport, and no non-whitelisted descendant overflows, at every named width on every surface", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const company = `E2E Overflow Sweep Co ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: JD });

    const surfaces: Record<string, string> = {
      dashboard: "/applications",
      library: "/library",
      settings: "/settings",
      detail: `/applications/${applicationId}`,
    };

    for (const width of [375, 768, 1023, 1024, 1280, 1512]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, path] of Object.entries(surfaces)) {
        await page.goto(path);
        await expect(
          page.getByTestId("workspace-shell"),
          `${name} @ ${width}: workspace-shell must render`,
        ).toBeVisible();
        await assertNoHorizontalOverflow(page);
      }
    }
  });
});

test.describe("Re-verified on the final tree (v4-T060)", () => {
  test("scroll restoration (F203): browser-BACK restores the editor pane's scrollTop within +/-24px; a fresh forward nav starts at top", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    const company = `E2E Cohesion Scroll Restore Co ${runId}-${testInfo.retry}`;
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

    await globalNavLink(page, "Library").click();
    await expect(page).toHaveURL(/\/library$/);
    const libraryScrollTop = await page.getByTestId("editor-pane").evaluate((el) => el.scrollTop);
    expect(libraryScrollTop).toBe(0);
  });

  test("rail collapse (F207): toggling transitions expanded (~224px) <-> the 40-64px collapsed band, survives reload, and is network-zero", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const railPane = page.getByTestId("rail-pane");
    const toggle = page.getByTestId("rail-collapse-toggle");

    async function railWidth(): Promise<number> {
      const box = await railPane.boundingBox();
      expect(box, "rail-pane must have a boundingBox").toBeTruthy();
      return box!.width;
    }

    const expandedWidth = await railWidth();
    expect(expandedWidth).toBeGreaterThan(200);
    expect(expandedWidth).toBeLessThan(240);

    await page.waitForLoadState("networkidle");
    const requests: Array<{ method: string; url: string }> = [];
    page.on("request", (req) => {
      requests.push({ method: req.method(), url: req.url() });
    });

    await toggle.click();
    await expect.poll(() => railWidth()).toBeLessThanOrEqual(64);
    const collapsedWidth = await railWidth();
    expect(collapsedWidth).toBeGreaterThanOrEqual(40);
    await page.waitForTimeout(300);
    expect(requests, `toggle fired network requests: ${JSON.stringify(requests)}`).toHaveLength(0);
    expect(
      requests.some(
        (r) => /\/api\/settings/.test(r.url) && (r.method === "PATCH" || r.method === "PUT"),
      ),
      "toggle must never write settings/sectionDisplay",
    ).toBe(false);

    // Survives a full reload (localStorage, not server state).
    await page.reload();
    await expect(railPane).toHaveAttribute("data-collapsed", "true");
    const reloadedWidth = await railWidth();
    expect(reloadedWidth).toBeGreaterThanOrEqual(40);
    expect(reloadedWidth).toBeLessThanOrEqual(64);

    // A real two-way toggle.
    await toggle.click();
    await expect.poll(() => railWidth()).toBeGreaterThan(200);
  });

  test("scroll-spy (F202): active section tracks scroll position across independently-computed positions, with the short-last-section escape at the bottom", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    const company = `E2E Cohesion Scroll Spy Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);

    const editorPane = page.getByTestId("editor-pane");
    const railNav = page.getByTestId("rail-nav");
    const SECTION_KEYS = ["job", "letter", "design"] as const;

    function currentRailItem(): Locator {
      return railNav.locator('[aria-current="true"]');
    }

    async function activeSectionKey(): Promise<string | null> {
      const current = currentRailItem();
      if ((await current.count()) === 0) return null;
      const testId = await current.getAttribute("data-testid");
      return testId?.replace("rail-nav-", "") ?? null;
    }

    async function expectedActiveSection(): Promise<string> {
      return editorPane.evaluate(
        (container, keys) => {
          const atBottom =
            container.scrollTop + container.clientHeight >= container.scrollHeight - 1;
          if (atBottom) return keys[keys.length - 1]!;
          const lineY = container.getBoundingClientRect().top + container.clientHeight * 0.3;
          let active = keys[0]!;
          for (const key of keys) {
            const el = document.querySelector(`[data-testid="workspace-section-heading-${key}"]`);
            if (el && el.getBoundingClientRect().top <= lineY) active = key;
          }
          return active;
        },
        SECTION_KEYS as unknown as string[],
      );
    }

    const { scrollHeight, clientHeight } = await editorPane.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(
      scrollHeight,
      "editor pane must genuinely overflow for this test to mean anything",
    ).toBeGreaterThan(clientHeight + 500);

    const seenActive = new Set<string>();
    for (const fraction of [0, 0.4, 0.8]) {
      const target = Math.round((scrollHeight - clientHeight) * fraction);
      await editorPane.evaluate((el, top) => {
        el.scrollTop = top;
      }, target);

      const expected = await expectedActiveSection();
      await expect
        .poll(() => activeSectionKey(), {
          message: `at scroll fraction ${fraction}, expected "${expected}" to become current`,
        })
        .toBe(expected);
      seenActive.add(expected);
    }
    expect(
      seenActive.size,
      "the active marker must provably move across sampled scroll positions",
    ).toBeGreaterThan(1);

    await editorPane.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect.poll(() => activeSectionKey()).toBe("design");
    await expect(currentRailItem()).toHaveCount(1);
    await expect(currentRailItem()).toHaveAttribute("data-testid", "rail-nav-design");
  });
});
