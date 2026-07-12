// Scroll-spy section nav (v4-T023, spec.md "Scroll-spy — active-section
// rule pinned" + oracle.md F202) + section-row clarity (F209) —
// ApplicationDetail.tsx's rail SECTIONS nav.
//
// The rule under test (pinned, not reinterpreted): active = the LAST
// section whose top edge has crossed a line 30% down from the editor pane's
// OWN viewport (it's its own scroll container, not the window), except when
// scrolled to the very bottom, where the FINAL section wins regardless (the
// short-last-section escape). Exactly one rail row carries `aria-current`
// AND the accent-pill treatment, on the SAME element. F209: the whole row
// navigates; there is no second chevron control in the rail (collapse moved
// to the editor's own section headers).
//
// Shares applications.spec.ts's "applications" project/server (real
// first-run set-password -> login, gate ON, LEDE_TAILOR_ENGINE=fixture) —
// PASSWORD MUST match that file's exactly (single server-wide secret,
// playwright.config.ts), and JD reuses the SAME recorded fixture (byte-for-
// byte from CONTRAST_JDS) so tailoring replays keylessly.
import { test, expect, type Page, type Locator } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { login, createApplication, tailor, expectResumeCanvasPainted } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — byte-for-byte, see applications.spec.ts

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const SECTION_KEYS = ["job", "letter", "design"] as const;

function railNav(page: Page): Locator {
  return page.getByTestId("rail-nav");
}

function currentRailItem(page: Page): Locator {
  return railNav(page).locator('[aria-current="true"]');
}

/** Reads which section is current straight off the DOM (`rail-nav-<key>` carrying `aria-current`), or null if none does. */
async function activeSectionKey(page: Page): Promise<string | null> {
  const current = currentRailItem(page);
  if ((await current.count()) === 0) return null;
  await expect(current, "at most one rail nav item may be current").toHaveCount(1);
  const testId = await current.getAttribute("data-testid");
  return testId?.replace("rail-nav-", "") ?? null;
}

/**
 * Independently re-derives the pinned 30%-line rule INSIDE the browser, from
 * the section headings' own bounding boxes and the editor pane's own
 * scrollTop/scrollHeight — never by reading the app's activeSection state or
 * any fixed scrollTop constant. This is what rules out a hardcoded
 * per-fixture threshold coincidentally matching the app's real logic.
 */
async function expectedActiveSection(editorPane: Locator): Promise<string> {
  return editorPane.evaluate(
    (container, keys) => {
      const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1;
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

test("scroll-spy (v4-T023/F202): active section tracks the 30%-line rule across independently-computed scroll positions, the short-last-section escape at the bottom, and the marker provably moves", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Scroll Spy Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId);
  await expectResumeCanvasPainted(page);

  const editorPane = page.getByTestId("editor-pane");

  // Precondition: genuine overflow, not a fixture that happens to barely
  // scroll — otherwise every sampled position could trivially land on the
  // same section regardless of whether scroll-spy actually works.
  const { scrollHeight, clientHeight } = await editorPane.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(
    scrollHeight,
    "editor pane must genuinely overflow for this test to mean anything",
  ).toBeGreaterThan(clientHeight + 500);

  // Sample ≥3 scroll positions computed as FRACTIONS of the scrollable
  // range (never fixed magic scrollTop constants), and check each against
  // an INDEPENDENTLY-computed expected section.
  const seenActive = new Set<string>();
  for (const fraction of [0, 0.4, 0.8]) {
    const target = Math.round((scrollHeight - clientHeight) * fraction);
    await editorPane.evaluate((el, top) => {
      el.scrollTop = top;
    }, target);

    const expected = await expectedActiveSection(editorPane);
    await expect
      .poll(() => activeSectionKey(page), {
        message: `at scroll fraction ${fraction}, expected "${expected}" to become current`,
      })
      .toBe(expected);
    seenActive.add(expected);
  }
  expect(
    seenActive.size,
    "the active marker must provably move across sampled scroll positions",
  ).toBeGreaterThan(1);

  // Escape hatch: scrolled all the way to the bottom, the FINAL section
  // ("design", the last of the three fixed WORKSPACE_SECTIONS) is active
  // regardless of where its heading's top edge actually sits relative to
  // the 30% line (the short-last-section rule).
  await editorPane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(() => activeSectionKey(page)).toBe("design");

  // Exactly one item carries aria-current, and the accent-pill computed
  // style lives on that SAME element — proven by diffing its background
  // against a row that is provably NOT current right now ("job", since
  // "design" is current at this bottom scroll position).
  await expect(currentRailItem(page)).toHaveCount(1);
  await expect(currentRailItem(page)).toHaveAttribute("data-testid", "rail-nav-design");
  const currentBg = await currentRailItem(page).evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  const nonCurrentBg = await page
    .getByTestId("rail-nav-job")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(
    currentBg,
    "the current item's pill background must differ from a non-current row's",
  ).not.toBe(nonCurrentBg);
});

test("section-row clarity (v4-T023/F209): the whole rail row navigates, with no second chevron/collapse control in the rail — collapse lives on the editor's own section headers instead", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Section Row Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId);
  await expectResumeCanvasPainted(page);

  // No rail-collapse-* control anywhere in the rail nav — F209 removed the
  // split-button entirely.
  for (const key of SECTION_KEYS) {
    await expect(page.getByTestId(`rail-collapse-${key}`)).toHaveCount(0);
  }

  // Each rail row is a single whole-row button (not a label + a second
  // control) that scrolls/focuses its section's heading.
  const editorPane = page.getByTestId("editor-pane");
  await editorPane.evaluate((el) => {
    el.scrollTop = 0;
  });
  const designHeading = page.getByTestId("workspace-section-heading-design");
  await expect(designHeading).not.toBeInViewport();

  await page.getByTestId("rail-nav-design").click();
  await expect(designHeading).toBeInViewport();

  // Collapse now lives on the editor's own section header.
  const letterBody = page.getByTestId("workspace-section-body-letter");
  await expect(letterBody).toBeVisible();
  const letterCollapseToggle = page.getByTestId("section-collapse-letter");
  await expect(letterCollapseToggle).toHaveAttribute("aria-expanded", "true");
  await letterCollapseToggle.click();
  await expect(letterBody).toBeHidden();
  await expect(letterCollapseToggle).toHaveAttribute("aria-expanded", "false");
});
