// T031/F302 (spec.md Phase 2 + Locked "phone layout") — at 375px width the
// application-detail surface must NOT overflow horizontally, and its detail
// content (job/letter/design sections) must be reachable, stacked
// vertically, in a single column. Prior to this ticket, WorkspaceShell's
// preview drawer (a fixed `w-96` aside) could be toggled open into the same
// row-flex as the editor pane even below `lg`, forcing the editor pane down
// to ~29px and pushing the drawer itself off-viewport — a genuine layout
// bug, not a missed CSS-hidden case. The fix (WorkspaceShell.tsx) withholds
// the drawer/toggle entirely below `lg`; the drawer's full-width-SHEET
// presentation below `lg` is a LATER ticket's job (T033) — this spec only
// proves the overflow is gone and the editor content stacks, never that a
// phone user can reach the preview (that's explicitly out of scope here).
//
// Red-team #13 (the "inner-clip-wrapper cheat"): "no overflow" must not be
// satisfiable by wrapping wide content in a non-scrollable
// `overflow:hidden|clip` element — its own scrollWidth==clientWidth while it
// silently clips descendants, and clipped content could still force an
// ancestor wider. assertNoHorizontalOverflow below walks EVERY descendant,
// not just the root, and only exempts an oversized element if it is BOTH in
// the explicit deliberate-scroll whitelist AND genuinely scrollable
// (overflow-x auto/scroll) — an `overflow:hidden` clipper never qualifies.
//
// Shares applications.spec.ts's "applications" project/server (real
// first-run set-password -> login, gate ON) — PASSWORD MUST match that
// file's exactly (single server-wide secret, playwright.config.ts). No
// tailoring needed: the sections under test (job/letter/design cards) all
// render for an untailored application, and the preview pane most at risk
// of forcing width is hidden outright below `lg` by this ticket's fix
// regardless of tailor state.
import { test, expect, type Page } from "@playwright/test";
import { login, createApplication } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = "Backend platform engineer role. Distributed systems, Go, Kubernetes.";
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// The deliberate horizontal-scroll containers this app is known to have —
// enumerated explicitly (red-team #13 demands this be a real allowlist, not
// "anything that happens to overflow"). Each entry is checked by CSS
// selector AND must independently pass the overflow-x:auto|scroll test
// below — an entry here that ISN'T actually scrollable does not get a free
// pass, so a future regression that turns a real scroll container into an
// `overflow:hidden` clipper still fails loudly.
const DELIBERATE_SCROLL_SELECTORS = [
  '[data-testid="editor-pane"]',
  '[data-testid="preview-pane"]',
  ".overflow-x-auto",
  ".overflow-x-scroll",
  ".ats-view__text",
];

interface OverflowViolation {
  tag: string;
  testId: string | null;
  className: string;
  scrollWidth: number;
  clientWidth: number;
  overflowX: string;
  matchesWhitelistSelector: boolean;
}

/**
 * Walks every element in the document and fails if any has
 * `scrollWidth > clientWidth + 1` UNLESS it matches one of
 * `DELIBERATE_SCROLL_SELECTORS` AND its own computed `overflow-x` is
 * `auto`/`scroll` (never `hidden`/`clip`/`visible`) — the red-team #13 double
 * check.
 */
async function assertNoHorizontalOverflow(page: Page): Promise<void> {
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

    const results: {
      tag: string;
      testId: string | null;
      className: string;
      scrollWidth: number;
      clientWidth: number;
      overflowX: string;
      matchesWhitelistSelector: boolean;
    }[] = [];

    // input/textarea/select are excluded from the walk: a native text
    // control's scrollWidth legitimately exceeds its clientWidth whenever
    // its OWN value/placeholder text is wider than the box (that's how
    // browsers implement the internal caret-scroll every text input has —
    // unrelated to CSS layout, and not fixable/relevant at any container
    // level). That's a different thing from red-team #13's "clip-wrapper
    // cheat", which is about an AUTHORED div/section hiding a CHILD
    // element's overflow — never about a leaf form control's own text.
    const EXCLUDED_TAGS = new Set(["input", "textarea", "select"]);

    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (EXCLUDED_TAGS.has(el.tagName.toLowerCase())) continue;
      const scrollWidth = el.scrollWidth;
      const clientWidth = el.clientWidth;
      if (scrollWidth <= clientWidth + 1) continue;

      const overflowX = getComputedStyle(el).overflowX;
      const isWhitelisted = whitelisted.has(el);
      const isGenuinelyScrollable = overflowX === "auto" || overflowX === "scroll";

      if (isWhitelisted && isGenuinelyScrollable) continue; // legitimate scroll container

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
    violations as OverflowViolation[],
    `found element(s) with scrollWidth > clientWidth outside the deliberate-scroll whitelist (or whitelisted but not actually overflow-x:auto|scroll — an overflow:hidden clipper never qualifies): ${JSON.stringify(violations, null, 2)}`,
  ).toEqual([]);
}

async function setupApplication(page: Page, company: string): Promise<string> {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);
  return createApplication(page, { company, jd: JD });
}

test.describe("Phone-width detail layout: stacked, zero horizontal overflow (F302)", () => {
  test("at 375x812 the detail surface has zero horizontal overflow anywhere outside the deliberate-scroll whitelist", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const company = `E2E Phone Overflow Co ${runId}-${testInfo.retry}`;
    const applicationId = await setupApplication(page, company);

    await page.goto(`/applications/${applicationId}`);
    await expect(page.getByTestId("workspace-shell")).toBeVisible();
    await expect(page.getByTestId("editor-pane")).toBeVisible();

    await assertNoHorizontalOverflow(page);
  });

  test("at 375x812 the major detail regions (job/letter/design) stack vertically and are fully inside the 375px viewport", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const company = `E2E Phone Stack Co ${runId}-${testInfo.retry}`;
    const applicationId = await setupApplication(page, company);

    await page.goto(`/applications/${applicationId}`);
    await expect(page.getByTestId("workspace-shell")).toBeVisible();

    // Measure ALL three headings at ONE fixed scroll position (the editor
    // pane pinned to its top) — never scrollIntoView per-heading, which
    // would land each at roughly the same viewport y and make the stacking
    // comparison vacuous. getBoundingClientRect returns a valid box even for
    // a heading scrolled below the fold, so a single reading captures the
    // real document order and the real horizontal extent at once.
    await page.getByTestId("editor-pane").evaluate((el) => {
      el.scrollTop = 0;
    });

    const sectionKeys = ["job", "letter", "design"] as const;
    const boxes: { key: string; left: number; right: number; top: number }[] = [];
    for (const key of sectionKeys) {
      const heading = page.getByTestId(`workspace-section-heading-${key}`);
      await expect(heading, `${key} section heading must be present`).toBeAttached();
      const rect = await heading.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top };
      });
      expect(
        rect.left,
        `${key} heading's left edge must be within the viewport`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        rect.right,
        `${key} heading's right edge must be within the 375px viewport`,
      ).toBeLessThanOrEqual(375 + 1);
      boxes.push({ key, left: rect.left, right: rect.right, top: rect.top });
    }

    // Vertically stacked (single column): each later section's top edge is
    // strictly below the previous one's — never side-by-side. Measured at a
    // single scroll offset, so these viewport-relative tops are directly
    // comparable as document order.
    for (let i = 1; i < boxes.length; i++) {
      expect(
        boxes[i]!.top,
        `${boxes[i]!.key} must be stacked below ${boxes[i - 1]!.key}, not beside it`,
      ).toBeGreaterThan(boxes[i - 1]!.top);
    }

    // No side-by-side preview pane competing for width — it's withheld
    // entirely below `lg` by this ticket's fix (the sheet mechanics that
    // reveal it at phone width are T033's job, not this one's).
    await expect(page.getByTestId("preview-pane")).toBeHidden();
    await expect(page.getByRole("button", { name: "Show preview" })).toHaveCount(0);
  });
});

test.describe("Desktop regime regression guard (>=lg) — detail surface unchanged", () => {
  test("at 1280x800 editor-pane and preview-pane are still both visible and side-by-side", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const company = `E2E Phone Overflow Desktop Co ${runId}-${testInfo.retry}`;
    const applicationId = await setupApplication(page, company);

    await page.goto(`/applications/${applicationId}`);
    await expect(page.getByTestId("workspace-shell")).toBeVisible();

    const editorPane = page.getByTestId("editor-pane");
    const previewPane = page.getByTestId("preview-pane");
    await expect(editorPane).toBeVisible();
    // At >=xl (1280) the preview pane is always co-visible, no toggle
    // involved (WorkspaceShell's own documented >=1280 rule) — unaffected
    // by this ticket's below-`lg` change.
    await expect(previewPane).toBeVisible();

    const [editorBox, previewBox] = await Promise.all([
      editorPane.boundingBox(),
      previewPane.boundingBox(),
    ]);
    expect(editorBox, "editor-pane must have a real box").toBeTruthy();
    expect(previewBox, "preview-pane must have a real box").toBeTruthy();
    expect(
      previewBox!.x,
      "preview pane must sit beside, not atop, the editor pane",
    ).toBeGreaterThanOrEqual(editorBox!.x + editorBox!.width - 1);

    await assertNoHorizontalOverflow(page);
  });
});
