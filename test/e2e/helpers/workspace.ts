// Page-object/helper layer over the applications workspace UI (spec.md
// §27/§28) — Phase 0 of the UI-redesign campaign. Purpose: LATER phases that
// change markup/selectors edit these functions once, instead of hunting
// scattered raw locators across every spec file. Everything here is a
// mechanical lift of flows that already existed, verbatim, in
// applications.spec.ts / design.spec.ts — no new behavior, no new
// assertions.
import { expect, type Locator, type Page } from "@playwright/test";
import { ensureFirstRunPassword, login } from "./session";

// ── Login ── thin wrapper over helpers/session.ts (the actual submit flow
// lives there; this just names+asserts the pre-condition each caller already
// checked inline: the password form must be up before driving it).
export { login };

/** Drives a fresh boot's first-run flow: asserts the password form is up, then sets+signs in. */
export async function firstRunLogin(page: Page, password: string): Promise<void> {
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await ensureFirstRunPassword(page, password);
}

// ── Rail chrome (v4-T020, single-chrome merge) ── the header (AppShell) is
// deleted; the wordmark now lives at the rail's top anchor and the theme
// toggle + logout live in its bottom cluster (App.tsx). Both are hoisted,
// persistent rail content — reachable on every shell route exactly like the
// old header was — so these locators don't scope to any particular surface.
// Centralized here per the ticket's mandate: re-home selectors in the helper
// layer, never scatter a rail-relative locator across spec files.
export function railWordmark(page: Page): Locator {
  return page.getByRole("link", { name: "Lede", exact: true });
}

export function themeToggleButton(page: Page): Locator {
  return page.getByRole("button", { name: /Switch to (dark|light) mode/ });
}

export async function toggleTheme(page: Page): Promise<void> {
  await themeToggleButton(page).click();
}

export function railLogoutButton(page: Page): Locator {
  return page.getByRole("button", { name: "Log out", exact: true });
}

/** Clicks the rail's logout control and waits for the server round-trip to settle. */
export async function logoutViaRail(page: Page): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/auth/logout") && r.request().method() === "POST",
    ),
    railLogoutButton(page).click(),
  ]);
}

// ── Create application ── the "New application" -> panel -> fill -> submit
// flow, identical across every call site (the main lifecycle test, T24's
// letter tests, and design.spec.ts's own setup). Since v3-T020, the panel is
// a non-modal `role="dialog"` (Radix `modal={false}`, no overlay/focus-trap)
// rather than a modal Dialog — same accessible role/labels/button text, so
// this helper's selectors are unchanged; only the underlying surface is.
export interface CreateApplicationParams {
  company: string;
  role?: string;
  jd: string;
}

// T006: a successful create now navigates straight to the new application's
// detail page (/applications/:id) instead of closing back onto the
// dashboard — the id is read off that URL, then this helper navigates back
// to the dashboard itself, so the ~72 existing call sites keep their
// original post-condition (on the dashboard, new card present) without
// editing any of them.
export async function createApplication(
  page: Page,
  { company, role, jd }: CreateApplicationParams,
): Promise<string> {
  await page.getByRole("button", { name: "New application" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^Company/).fill(company);
  if (role) await dialog.getByLabel(/^Role/).fill(role);
  await dialog.getByLabel("Job description", { exact: true }).fill(jd);
  await dialog.getByRole("button", { name: "Create application" }).click();
  await page.waitForURL(/\/applications\/[^/]+$/);

  const applicationId = page.url().split("/applications/")[1];
  expect(applicationId, "navigation must land on the created application's id").toBeTruthy();

  await page.goto("/");
  const card = page.locator(`[data-application-id="${applicationId}"]`);
  await expect(card).toBeVisible();
  return applicationId;
}

// ── Tailor / Lock ── click + wait-for-the-matching-response pattern, repeated
// verbatim at every call site across both specs.
export async function tailor(
  page: Page,
  applicationId: string,
): Promise<import("@playwright/test").Response> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/tailor`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Tailor", exact: true }).click(),
  ]);
  return response;
}

export async function retailor(
  page: Page,
  applicationId: string,
): Promise<import("@playwright/test").Response> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/tailor`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Re-tailor", exact: true }).click(),
  ]);
  return response;
}

export async function lockFinal(
  page: Page,
  applicationId: string,
): Promise<import("@playwright/test").Response> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/lock`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Lock final", exact: true }).click(),
  ]);
  return response;
}

// ── Letter generation ── "Generate letter"/"Regenerate letter". The status
// filter is optional: one spec (the failed-generation case) needs the raw
// non-200 response, so a caller omits `status` to get whatever comes back —
// every passing-case caller still passes `{ status: 200 }`, preserving the
// original filtered wait exactly.
export async function generateLetter(
  page: Page,
  applicationId: string,
  opts: { status?: number } = {},
): Promise<import("@playwright/test").Response> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/generate-letter`) &&
        (opts.status === undefined || r.status() === opts.status),
    ),
    page.getByRole("button", { name: "Generate letter", exact: true }).click(),
  ]);
  return response;
}

export async function regenerateLetter(
  page: Page,
  applicationId: string,
  opts: { status?: number } = {},
): Promise<import("@playwright/test").Response> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/generate-letter`) &&
        (opts.status === undefined || r.status() === opts.status),
    ),
    page.getByRole("button", { name: "Regenerate letter", exact: true }).click(),
  ]);
  return response;
}

// ── WorkspaceShell preview pane (v3-T011) ── the in-pane resume/letter
// switch scoped to the preview pane itself (never a bare `getByRole`), since
// nothing else on the page carries these exact accessible names.
export async function switchPreviewDoc(page: Page, doc: "resume" | "letter"): Promise<void> {
  const label = doc === "resume" ? "Resume" : "Letter";
  await page.getByTestId("preview-pane").getByRole("button", { name: label, exact: true }).click();
}

// ── Cover-letter editor-pane fields (T050/OQ5/F501) ── paragraph-level
// letter editing moved OUT of the (now view-only) preview-pane canvas and
// INTO the editor pane's own Cover-letter section — every locator below is
// scoped to that section's body (`workspace-section-body-letter`, the same
// testid EditorSection already emits) so a match can never land on a stray
// element elsewhere on the page, and so a regression that puts editing back
// in the preview pane fails these locators outright rather than silently
// still matching.
export function letterEditorSection(page: Page): Locator {
  return page.getByTestId("workspace-section-body-letter");
}

export function letterGreetingField(page: Page): Locator {
  return letterEditorSection(page).getByTestId("letter-edit-greeting");
}

export function letterClosingField(page: Page): Locator {
  return letterEditorSection(page).getByTestId("letter-edit-closing");
}

export function letterParagraphField(page: Page, index: number): Locator {
  return letterEditorSection(page).getByTestId(`letter-edit-paragraph-${index}`);
}

export function letterInsertParagraphButton(page: Page, position: number): Locator {
  return letterEditorSection(page).getByTestId(`letter-insert-paragraph-${position}`);
}

export function letterRemoveParagraphButton(page: Page, index: number): Locator {
  return letterEditorSection(page).getByTestId(`letter-remove-paragraph-${index}`);
}

// ── Preview canvases ── `.document-preview` hosts the resume's pdf.js
// canvas (single-page in the application detail view, N pages in the design
// view's multi-page host — `.first()` is correct, and a harmless no-op, in
// both cases). `[data-testid="letter-preview"]` is the DELIBERATELY separate
// letter canvas — never the same locator as the resume, so a letter paint
// can never be mistaken for a resume paint.
export function resumePreviewCanvas(page: Page): Locator {
  return page.locator(".document-preview canvas").first();
}

export function letterPreviewCanvas(page: Page): Locator {
  return page.locator('[data-testid="letter-preview"] canvas');
}

// ── Canvas-painted oracle ── "some non-white pixel exists" — the shared
// proof that a react-pdf -> pdf.js render pipeline actually painted
// something, not just mounted in a loading state. Lifted verbatim from
// applications.spec.ts's own inline `expectLocatorCanvasPainted`.
export async function expectLocatorCanvasPainted(canvas: Locator): Promise<void> {
  await expect(canvas).toBeVisible();
  await expect
    .poll(() =>
      canvas.evaluate((el: HTMLCanvasElement) => {
        const ctx = el.getContext("2d");
        if (!ctx || el.width === 0) return false;
        const { data } = ctx.getImageData(0, 0, el.width, el.height);
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) return true;
        }
        return false;
      }),
    )
    .toBe(true);
}

export async function expectResumeCanvasPainted(page: Page): Promise<void> {
  await expectLocatorCanvasPainted(resumePreviewCanvas(page));
}

export async function expectLetterCanvasPainted(page: Page): Promise<void> {
  await expectLocatorCanvasPainted(letterPreviewCanvas(page));
}

/** Captures a canvas's current pixels as a comparable snapshot (toDataURL). */
export async function canvasSnapshot(canvas: Locator): Promise<string> {
  return canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL());
}

// ── Pixel-diff / color-readback helpers ── not yet consumed by
// applications.spec.ts/design.spec.ts (both currently compare toDataURL
// snapshots with plain string (in)equality), but real and correct for later
// phases that need an actual pixel-level magnitude rather than a boolean.

/**
 * Counts pixels (RGBA-channel compare) that differ between two canvases.
 * Mismatched dimensions count as a full diff (every pixel of the larger
 * canvas) rather than throwing, since a later phase may legitimately compare
 * canvases that resized between captures.
 */
export async function pixelDiff(canvasA: Locator, canvasB: Locator): Promise<number> {
  const [a, b] = await Promise.all([
    canvasA.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext("2d");
      const data = ctx ? Array.from(ctx.getImageData(0, 0, el.width, el.height).data) : [];
      return { width: el.width, height: el.height, data };
    }),
    canvasB.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext("2d");
      const data = ctx ? Array.from(ctx.getImageData(0, 0, el.width, el.height).data) : [];
      return { width: el.width, height: el.height, data };
    }),
  ]);

  if (a.width !== b.width || a.height !== b.height) {
    return Math.max(a.width * a.height, b.width * b.height);
  }

  let diffPixels = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      a.data[i] !== b.data[i] ||
      a.data[i + 1] !== b.data[i + 1] ||
      a.data[i + 2] !== b.data[i + 2] ||
      a.data[i + 3] !== b.data[i + 3]
    ) {
      diffPixels++;
    }
  }
  return diffPixels;
}

/**
 * Fraction (0..1) of pixels that differ between a canvas's CURRENT live
 * pixels and a snapshot captured earlier via `canvasSnapshot` — the temporal
 * counterpart to `pixelDiff` (which compares two canvases at the same
 * instant). Needed because a canvas can remount between captures (e.g. a
 * repaint triggered by a query invalidation), so "before" pixels have to be
 * captured into a portable string up front rather than read from a second
 * Locator reference at diff time.
 */
export async function pixelDiffFraction(canvas: Locator, beforeDataUrl: string): Promise<number> {
  return canvas.evaluate(
    (el: HTMLCanvasElement, before: string) =>
      new Promise<number>((resolve, reject) => {
        const ctx = el.getContext("2d");
        if (!ctx || el.width === 0 || el.height === 0) {
          resolve(1);
          return;
        }
        const img = new Image();
        img.onload = () => {
          const off = document.createElement("canvas");
          off.width = el.width;
          off.height = el.height;
          const octx = off.getContext("2d");
          if (!octx) {
            resolve(1);
            return;
          }
          octx.drawImage(img, 0, 0, el.width, el.height);
          const beforeData = octx.getImageData(0, 0, el.width, el.height).data;
          const afterData = ctx.getImageData(0, 0, el.width, el.height).data;
          let diff = 0;
          for (let i = 0; i < afterData.length; i += 4) {
            if (
              beforeData[i] !== afterData[i] ||
              beforeData[i + 1] !== afterData[i + 1] ||
              beforeData[i + 2] !== afterData[i + 2] ||
              beforeData[i + 3] !== afterData[i + 3]
            ) {
              diff++;
            }
          }
          resolve(diff / (el.width * el.height));
        };
        img.onerror = () => reject(new Error("pixelDiffFraction: failed to decode snapshot image"));
        img.src = before;
      }),
    beforeDataUrl,
  );
}

/** Counts distinct RGBA colors painted onto a canvas. */
export async function distinctColorCount(canvas: Locator): Promise<number> {
  return canvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext("2d");
    if (!ctx || el.width === 0 || el.height === 0) return 0;
    const { data } = ctx.getImageData(0, 0, el.width, el.height);
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      colors.add(((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0);
    }
    return colors.size;
  });
}

// ── DesignPanel collapsible groups (F505/T041a) ── DesignPanel's ~16 internal
// control groups default COLLAPSED: a control inside a folded group is present
// in the DOM but its region is `overflow-hidden` at 0 height, so a direct
// `.click()` on it lands on the group wrapper ("intercepts pointer events").
// Opening the owning group first is the redesigned UX's real interaction (a
// user expands a group to reach its controls) and persists across reloads via
// the group's own localStorage key. Idempotent — a no-op when already
// expanded. Read-only checks (toBeDisabled/toHaveText) don't need this; only
// click targets do.
export async function expandDesignGroup(page: Page, groupKey: string): Promise<void> {
  const toggle = page.getByTestId(`design-group-toggle-${groupKey}`);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  }
}

// ── Journey-stage disclosure (T002) ── the three top-level editor sections
// (job/letter/design) default open/closed per the journey stage
// (deriveJourneyStage/resolveDisclosure): setup/tailoring folds Letter+Design,
// review folds Job, final folds all three. A spec that drives a control
// inside a stage-folded section body (a click can't land inside the 0-height
// grid-rows-[0fr] fold) expands the section first via its own header toggle —
// the redesigned UX's real interaction. Idempotent — a no-op when already
// expanded. NOTE: a manual expand writes a user override to localStorage BY
// DESIGN (override precedence, journey-stage.ts) — don't follow it with
// assertions about stage-default disclosure or store purity on the same
// application.
export async function ensureSectionExpanded(
  page: Page,
  key: "job" | "letter" | "design",
): Promise<void> {
  const toggle = page.getByTestId(`section-collapse-${key}`);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    // Settle the 200ms grid-rows transition (F403/T043) before returning, so
    // callers that measure editor-pane geometry right after (scroll-spy's
    // overflow precondition, viewport checks) read the expanded layout, not
    // a mid-transition height.
    await page
      .getByTestId(`section-collapse-track-${key}`)
      .evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  }
}

// ── Modality ban ── the shared "non-modal" oracle: no aria-modal, and no
// fixed/absolute-positioned element covers more than half the viewport.
// Ported from applications.spec.ts's own local assertNoModalOverlay (the
// definition v3-T020 established for NewApplication) so library-crud.spec.ts
// can hold EntryEditor (v3-T021) to the identical bar.
export async function assertNoModalOverlay(page: Page): Promise<void> {
  expect(await page.locator('[aria-modal="true"]').count()).toBe(0);
  const viewport = page.viewportSize();
  expect(viewport, "viewport size must be known").toBeTruthy();
  const oversizedOverlayCount = await page.evaluate((viewportArea) => {
    const elements = Array.from(document.querySelectorAll("body *"));
    return elements.filter((el) => {
      const style = getComputedStyle(el);
      if (style.position !== "fixed" && style.position !== "absolute") return false;
      const rect = el.getBoundingClientRect();
      return (rect.width * rect.height) / viewportArea > 0.5;
    }).length;
  }, viewport!.width * viewport!.height);
  expect(
    oversizedOverlayCount,
    "no fixed/absolute-positioned element may cover more than half the viewport",
  ).toBe(0);
}

// ── v4-T060: app-wide modality sweep + overflow walk ── two helpers factored
// out of the per-file patterns responsive-nav.spec.ts/phone-overflow.spec.ts/
// pane-arbitration.spec.ts already established, so cohesion.spec.ts's
// final-tree, app-wide re-sweep doesn't reinvent them.

/**
 * Counts fixed/absolute-positioned elements covering >50% of the viewport —
 * the same oracle assertNoModalOverlay uses, but with an optional `exclude`
 * subtree (identified by its own live DOM node, not a class of selectors, so
 * exactly one element is exempted — never a whole `[role=dialog]` category).
 * Needed for the below-`lg` SANCTIONED sheets (OQ2/T033 preview-sheet;
 * T062 Library panel sheets): "no OTHER modality besides THIS sheet" has to
 * count everything BUT the one sheet the caller already verified sanctioned.
 */
export async function countOversizedOverlays(page: Page, exclude?: Locator): Promise<number> {
  const viewport = page.viewportSize();
  expect(viewport, "viewport size must be known").toBeTruthy();
  const excludeHandle = exclude ? await exclude.elementHandle() : null;
  const count = await page.evaluate(
    ({ viewportArea, excludeNode }) => {
      const elements = Array.from(document.querySelectorAll("body *"));
      return elements.filter((el) => {
        if (excludeNode && (el === excludeNode || excludeNode.contains(el))) return false;
        const style = getComputedStyle(el);
        if (style.position !== "fixed" && style.position !== "absolute") return false;
        const rect = el.getBoundingClientRect();
        return (rect.width * rect.height) / viewportArea > 0.5;
      }).length;
    },
    { viewportArea: viewport!.width * viewport!.height, excludeNode: excludeHandle },
  );
  await excludeHandle?.dispose();
  return count;
}

/**
 * Verifies a below-`lg` full-width panel is a SANCTIONED sheet per the pinned
 * modality taxonomy (oracle.md / OQ2 / T062), then closes it. A sanctioned
 * sheet may cover ~100% of the viewport WITHOUT being modality precisely
 * because it is: role="dialog", NO `aria-modal="true"`, full-width (inset ~0,
 * width/height ~= viewport — a merely-relabeled `w-[30rem]` floating overlay
 * fails this geometry), focus-managed (focus lands inside), and dismissible
 * via a visible "Close" control. It ALSO asserts the taxonomy's REJECT half:
 * apart from this one verified sheet, NOTHING ELSE oversized (>50%) is
 * fixed/absolute (a scrim, a partial floating overlay, a second panel) and
 * NO `aria-modal="true"` exists anywhere. `outsideReachable` is deliberately
 * NOT asserted here — a sanctioned sheet is allowed to fully cover the
 * surface beneath (that's what makes it a sheet, not a docked panel); its
 * escape valve is dismissibility + focus management, checked above.
 */
export async function assertSanctionedSheetAndClose(page: Page, dialog: Locator): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport, "viewport size must be known").toBeTruthy();
  await expect(dialog).toBeVisible();
  // Let the T043 entrance zoom settle before measuring — a box captured
  // mid-animation drifts a pixel or two (panel-sheet.spec.ts's own rationale).
  await dialog.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
  );

  const box = await dialog.boundingBox();
  expect(box, "sanctioned sheet must have a rendered bounding box").toBeTruthy();
  expect(box!.x, "sanctioned sheet left inset must be ~0 (full-width)").toBeLessThanOrEqual(1);
  expect(box!.y, "sanctioned sheet top inset must be ~0 (full-width)").toBeLessThanOrEqual(1);
  expect(
    box!.width,
    `sanctioned sheet width must be ~= viewport width (${viewport!.width})`,
  ).toBeGreaterThanOrEqual(viewport!.width - 2);
  expect(
    box!.height,
    `sanctioned sheet height must be ~= viewport height (${viewport!.height})`,
  ).toBeGreaterThanOrEqual(viewport!.height - 2);

  const ariaModal = await dialog.getAttribute("aria-modal");
  expect(ariaModal, "a sanctioned sheet must carry no aria-modal").not.toBe("true");
  expect(
    await page.locator('[aria-modal="true"]').count(),
    "no aria-modal anywhere while a sanctioned sheet is open",
  ).toBe(0);

  const focusInside = await dialog.evaluate((el) => el.contains(document.activeElement));
  expect(focusInside, "a sanctioned sheet must be focus-managed (focus lands inside)").toBe(true);

  const closeControl = dialog.getByRole("button", { name: "Close" });
  await expect(closeControl, "a sanctioned sheet must have a visible Close control").toBeVisible();

  // REJECT half: apart from THIS verified sheet, nothing else oversized/fixed
  // exists (no scrim, no partial floating overlay covering >50%).
  expect(
    await countOversizedOverlays(page, dialog),
    "no oversized (>50%) fixed/absolute overlay OTHER than the sanctioned sheet itself",
  ).toBe(0);

  await closeControl.click();
  await expect(dialog).toBeHidden();
}

/**
 * Proves an element OUTSIDE an open non-modal panel stays genuinely
 * reachable: `document.body` isn't `inert`, and the element itself resolves
 * via `elementFromPoint` at its own center (no invisible focus-trap/backdrop
 * intercepting the hit) — the pinned modality taxonomy's (oracle.md)
 * "underlying surface stays in tab order" clause, applied to whichever
 * anchor the caller considers reliably present (the rail wordmark at >=lg,
 * a bottom-tab-bar link below it).
 */
export async function assertOutsideElementReachable(page: Page, outside: Locator): Promise<void> {
  const bodyInert = await page.evaluate(
    () => (document.body as HTMLElement & { inert?: boolean }).inert === true,
  );
  expect(bodyInert, "document.body must not be inert while a de-modal panel is open").toBe(false);
  await expect(outside).toBeVisible();
  const box = await outside.boundingBox();
  expect(box, "outside element must have a rendered bounding box").toBeTruthy();
  const hitTestPasses = await outside.evaluate(
    (el, [x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit != null && (el === hit || el.contains(hit) || hit.contains(el));
    },
    [box!.x + box!.width / 2, box!.y + box!.height / 2] as const,
  );
  expect(
    hitTestPasses,
    "an element outside the open panel must remain hit-testable — no focus-trap/backdrop covering it",
  ).toBe(true);
}

// The deliberate horizontal-scroll allowlist — FROZEN (oracle.md Phase-5
// oracle: "any addition is a flagged change, not silent"), lifted byte-for-
// byte from phone-overflow.spec.ts's own DELIBERATE_SCROLL_SELECTORS /
// assertNoHorizontalOverflow (T031/F302, red-team #13) so this app-wide
// re-sweep holds the identical bar rather than a laxer copy.
const DELIBERATE_SCROLL_SELECTORS = [
  '[data-testid="editor-pane"]',
  '[data-testid="preview-pane"]',
  ".overflow-x-auto",
  ".overflow-x-scroll",
  ".ats-view__text",
];

/**
 * The red-team #13 strict walk: `document.documentElement.scrollWidth` must
 * exactly equal the viewport width, and no descendant may have
 * `scrollWidth > clientWidth + 1` unless it's BOTH in the frozen whitelist
 * above AND genuinely `overflow-x: auto|scroll` (an `overflow:hidden` clipper
 * never qualifies — its own scrollWidth==clientWidth while it silently clips
 * a child) — walks EVERY descendant, not just the root.
 */
export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const documentScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const viewport = page.viewportSize();
  expect(viewport, "viewport size must be known").toBeTruthy();
  expect(
    documentScrollWidth,
    "document.documentElement.scrollWidth must exactly equal the viewport width",
  ).toBe(viewport!.width);

  const violations = await page.evaluate((whitelistSelectors: string[]) => {
    const whitelisted = new Set<Element>();
    for (const selector of whitelistSelectors) {
      for (const el of Array.from(document.querySelectorAll(selector))) whitelisted.add(el);
    }

    const EXCLUDED_TAGS = new Set(["input", "textarea", "select"]);
    const results: {
      tag: string;
      testId: string | null;
      className: string;
      scrollWidth: number;
      clientWidth: number;
      overflowX: string;
      matchesWhitelistSelector: boolean;
    }[] = [];

    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (EXCLUDED_TAGS.has(el.tagName.toLowerCase())) continue;
      const scrollWidth = el.scrollWidth;
      const clientWidth = el.clientWidth;
      // A <=1px-wide element (the standard `.sr-only` visually-hidden-but-
      // focusable technique: 1px box + overflow:hidden + nowrap text) cannot
      // itself be the source of a VISIBLE page overflow — its own footprint
      // never renders wide. This app-wide sweep is the first cohesion pass to
      // walk surfaces (Settings/Library controls) that carry sr-only labels
      // the narrower, detail-only phone-overflow.spec.ts walk never exercised
      // — same "not a real layout bug" category the EXCLUDED_TAGS list above
      // already carves out for native text controls, not a loosening of the
      // FROZEN scroll-container whitelist below.
      if (clientWidth <= 1) continue;
      if (scrollWidth <= clientWidth + 1) continue;

      const overflowX = getComputedStyle(el).overflowX;
      const isWhitelisted = whitelisted.has(el);
      const isGenuinelyScrollable = overflowX === "auto" || overflowX === "scroll";
      if (isWhitelisted && isGenuinelyScrollable) continue;

      results.push({
        tag: el.tagName.toLowerCase(),
        testId: el.getAttribute("data-testid"),
        className: typeof el.className === "string" ? el.className : String(el.className),
        scrollWidth,
        clientWidth,
        overflowX,
        matchesWhitelistSelector: isWhitelisted,
      });
    }
    return results;
  }, DELIBERATE_SCROLL_SELECTORS);

  expect(
    violations,
    `found element(s) with scrollWidth > clientWidth outside the deliberate-scroll whitelist (or whitelisted but not actually overflow-x:auto|scroll — an overflow:hidden clipper never qualifies): ${JSON.stringify(violations, null, 2)}`,
  ).toEqual([]);
}

// ── Library CRUD ── LibraryView's add/edit-entry panel flow (spec.md §13),
// lifted verbatim from library-crud.spec.ts. Edit's entry point is a
// `${section label}: ${entry.facts[0]}` picker option, since EntryCard's own
// Edit button is a disabled stub. Since v3-T021, the panel is a non-modal
// `role="dialog"` (Radix `modal={false}`, no overlay/focus-trap — see
// EntryEditor.tsx) rather than the former modal Dialog; same accessible
// role/labels/button text, so these selectors are unchanged.
export async function openAddEntry(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Add entry" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function selectSection(dialog: Locator, page: Page, label: string): Promise<void> {
  await dialog.getByRole("combobox", { name: "Section" }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

export async function submitAndClose(dialog: Locator, buttonName: string): Promise<void> {
  await dialog.getByRole("button", { name: buttonName }).click();
  await expect(dialog).toBeHidden();
}

// F502/T051: editing is a per-row EntryCard control now — no more
// "Choose entry to edit" combobox + "Edit selected" pair. Callers still pass
// the old `"<Section label>: <fact>"` shape (e.g. "Experience: rules engine
// …") because that's what uniquely identified an entry before; this strips
// the section-label prefix and uses the remaining fact text to find that
// row's card (via `cardFor`, the same row-matching this file already uses
// for delete), then clicks that row's own Edit button — one activation.
export async function openEditFor(page: Page, optionLabel: string): Promise<Locator> {
  const sep = optionLabel.indexOf(": ");
  const rowText = sep === -1 ? optionLabel : optionLabel.slice(sep + 2);
  await cardFor(page, rowText).getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

export function cardFor(page: Page, text: string): Locator {
  return page.locator("[data-entry-id]").filter({ hasText: text });
}

// ── Not-a-tracker allowlist (T032, red-team H8) ── a dashboard card's DOM
// may contain ONLY the four quick actions (Open/Duplicate/Delete/Download)
// as interactive elements; status pills/badges are display-only. This is the
// shared "what counts as interactive" oracle, scoped per-card, so a future
// pill/badge that's accidentally made clickable (e.g. a <button> instead of
// a <div>) shows up as a count regression rather than passing silently.
const INTERACTIVE_DESCENDANTS_SELECTOR =
  'button, a, input, select, [role="button"], [tabindex]:not([tabindex="-1"])';

export function interactiveDescendants(card: Locator): Locator {
  return card.locator(INTERACTIVE_DESCENDANTS_SELECTOR);
}
