// F107/F110/T017 (spec.md, .ailoop/oracle.md Phase 0 gate) — dashboard card
// action-row overflow + footer stamp wrap + dark-mode hover elevation.
//
// F107: the quick-action row (Duplicate/Download PDF/Delete, ~258px of
// buttons, `justify-end`, ApplicationCard.tsx) overflowed a 240px card at
// 768-1024 — and 240px is exactly what this dashboard's own grid produces at
// BOTH those widths (rail 224px + p-6 gutters + `sm:grid-cols-2` at 768 /
// `lg:grid-cols-3` at 1024 all resolve to the same ~240px column), so no
// fixture card sizing is needed to reproduce it: the real grid does it. The
// fix wraps the row (`flex-wrap`) rather than shrinking/hiding a control.
//
// The footer stamp ("Updated <date>") broke mid-date under the same squeeze;
// the fix is `whitespace-nowrap`. Anti-gaming (oracle.md's protocols + this
// ticket's acceptance): a `text-overflow: ellipsis` truncation would also
// keep the text on one line and would NOT show up as a DOM text change (the
// full string stays in the text node even while visually clipped) — so this
// spec asserts the RENDERED absence of clipping (`scrollWidth <=
// clientWidth`), not merely `textContent`, and separately asserts the exact
// verbatim date text against the real `updatedAt` the server returned for
// this application (not a hard-coded/guessed string).
//
// F110: dark-mode card hover elevation was invisible (`hover:shadow-md`
// alone). Fix adds `hover:border-border-strong`; anti-gaming (red-team #21,
// oracle.md's "per-theme resolution, not a shared literal") requires the
// hover border to equal the THEME-RESOLVED `--border-strong` custom
// property (read live from the document, not a hard-coded hex) and to
// differ from the card's own rest-state border — a same-computed-value
// "fix" (no visible delta) must fail here.
import { test, expect, type Page, type Locator } from "@playwright/test";
import { firstRunLogin, createApplication } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

function requireBox(box: { x: number; y: number; width: number; height: number } | null) {
  expect(box, "element must have a rendered bounding box").not.toBeNull();
  return box!;
}

// `inner` fully inside `outer`'s box on all four edges (flush is fine, past
// the edge is not) — the direct negation of "spills left"/"overlaps the
// neighbor".
function expectContained(
  inner: { x: number; y: number; width: number; height: number },
  outer: { x: number; y: number; width: number; height: number },
  label: string,
) {
  expect(inner.x, `${label} left edge inside its card`).toBeGreaterThanOrEqual(outer.x - 0.5);
  expect(inner.y, `${label} top edge inside its card`).toBeGreaterThanOrEqual(outer.y - 0.5);
  expect(inner.x + inner.width, `${label} right edge inside its card`).toBeLessThanOrEqual(
    outer.x + outer.width + 0.5,
  );
  expect(inner.y + inner.height, `${label} bottom edge inside its card`).toBeLessThanOrEqual(
    outer.y + outer.height + 0.5,
  );
}

async function loginAndCreateCard(
  page: Page,
  viewport: { width: number; height: number },
  label: string,
): Promise<{ applicationId: string; card: Locator }> {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await firstRunLogin(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Card Bounds ${label} ${runId}`;
  const applicationId = await createApplication(page, {
    company,
    jd: "Backend platform engineer role. Distributed systems, Go, Kubernetes.",
  });
  const card = page.locator(`[data-application-id="${applicationId}"]`);
  await expect(card).toBeVisible();
  return { applicationId, card };
}

async function assertActionsContainedInCard(card: Locator): Promise<void> {
  const cardBox = requireBox(await card.boundingBox());
  for (const testId of [
    "application-card-duplicate",
    "application-card-download",
    "application-card-delete",
  ]) {
    const action = card.getByTestId(testId);
    const actionBox = requireBox(await action.boundingBox());
    expectContained(actionBox, cardBox, testId);
  }
}

async function assertStampOneLineVerbatim(page: Page, applicationId: string, card: Locator) {
  const response = await page.request.get(`/api/applications/${applicationId}`);
  expect(response.ok(), "fetch application for its real updatedAt").toBe(true);
  const application = await response.json();

  const expectedDateText: string = await page.evaluate(
    (updatedAt) =>
      new Date(updatedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    application.updatedAt,
  );

  const stamp = card.getByTestId("application-card-stamp");
  // Verbatim, not merely "contains a date-shaped substring": the DOM text
  // node keeps its full content even under a `text-overflow: ellipsis`
  // cheat, so this alone wouldn't catch that cheat — paired with the
  // clipping check below, which does.
  await expect(stamp).toHaveText(`Updated ${expectedDateText}`);

  const metrics = await stamp.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      whiteSpace: style.whiteSpace,
      textOverflow: style.textOverflow,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    };
  });
  expect(metrics.whiteSpace, "stamp must not be allowed to wrap").toBe("nowrap");
  expect(metrics.textOverflow, "stamp must not be visually truncated with an ellipsis").not.toBe(
    "ellipsis",
  );
  expect(
    metrics.scrollWidth,
    "stamp's full text must render un-clipped (scrollWidth <= clientWidth)",
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

for (const viewport of [
  { width: 768, height: 800 },
  { width: 1024, height: 800 },
]) {
  test.describe(`F107 dashboard card @ ${viewport.width}px`, () => {
    test(`no card action spills outside its card, stamp stays one line and verbatim`, async ({
      page,
    }) => {
      const { applicationId, card } = await loginAndCreateCard(
        page,
        viewport,
        String(viewport.width),
      );
      await assertActionsContainedInCard(card);
      await assertStampOneLineVerbatim(page, applicationId, card);
    });
  });
}

test.describe("F110 dark-mode card hover elevation", () => {
  test("hover border resolves to the theme's --border-strong and differs from rest-state", async ({
    page,
  }) => {
    const { card } = await loginAndCreateCard(page, { width: 1280, height: 800 }, "dark");

    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    const resolvedBorderStrongRgb: string = await page.evaluate(() => {
      const hex = getComputedStyle(document.documentElement)
        .getPropertyValue("--border-strong")
        .trim();
      const probe = document.createElement("div");
      probe.style.color = hex;
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    });

    const restBorderColor = await card.evaluate((el) => getComputedStyle(el).borderTopColor);

    await card.hover();
    const hoverBorderColor = await card.evaluate((el) => getComputedStyle(el).borderTopColor);

    expect(
      restBorderColor,
      "rest-state border must not already equal --border-strong (else hover has no delta)",
    ).not.toBe(resolvedBorderStrongRgb);
    expect(hoverBorderColor, "hover border must equal the resolved dark --border-strong").toBe(
      resolvedBorderStrongRgb,
    );
    expect(hoverBorderColor, "hover border must differ from the rest-state border").not.toBe(
      restBorderColor,
    );
  });
});
