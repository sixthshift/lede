// T045 (F406, spec.md) — four dashboard card-detail fixes bundled behind one
// gate: (1) Escape disarms the F106 two-step armed delete (ApplicationCard
// used to have no Escape handler at all — only onBlur); (2) a duplicated
// application used to land at the end of the list with zero locating
// feedback, so this asserts a transient highlight + scrollIntoView; (3)
// NewApplication's required-JD error used to render detached below the
// Context field with no red border/focus move — this asserts it renders
// adjacent to the JD field, with a COMPUTED (not class-presence) red border,
// and moves focus onto it; (4) the card's focus ring used to follow
// `rounded-t-xl` (square bottom corners mid-card) — this asserts all four
// corners of the focus-ring element's computed border-radius are equal and
// non-zero.
import { test, expect, type Page } from "@playwright/test";
import { login, createApplication } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = "Card detail regression role. React, TypeScript, Playwright.";
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function loginAndGoto(page: Page): Promise<void> {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);
}

/** Resolves a CSS custom property (e.g. "--destructive") to its computed rgb() string. */
async function resolveTokenRgb(page: Page, token: string): Promise<string> {
  return page.evaluate((cssVar) => {
    const hex = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    const probe = document.createElement("div");
    probe.style.color = hex;
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  }, token);
}

test.describe("F406: Escape disarms armed delete (T045)", () => {
  test("Escape after arming restores the resting Delete affordance and deletes nothing", async ({
    page,
  }, testInfo) => {
    await loginAndGoto(page);
    const company = `E2E Card Detail Escape ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: JD });
    const card = page.locator(`[data-application-id="${applicationId}"]`);

    const deleteButton = card.getByTestId("application-card-delete");
    await deleteButton.click(); // arm
    await expect(deleteButton).toHaveText("Confirm delete");

    await page.keyboard.press("Escape");
    await expect(deleteButton).toHaveText("Delete");

    // Not deleted: the card is still present and still carries its id.
    await expect(card).toBeVisible();
    await expect(card).toHaveCount(1);
  });
});

test.describe("F406: duplicate scroll + highlight (T045)", () => {
  test("the new card gets a transient highlight and is scrolled into view", async ({
    page,
  }, testInfo) => {
    await loginAndGoto(page);
    // Tall viewport but many cards force the grid to scroll — pad the list
    // with prior applications so the duplicate (appended at the end) starts
    // off-screen, giving scrollIntoView something real to do.
    await page.setViewportSize({ width: 1000, height: 700 });
    const company = `E2E Card Detail Duplicate ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: JD });
    for (let i = 0; i < 8; i++) {
      await createApplication(page, {
        company: `E2E Card Detail Filler ${runId}-${testInfo.retry}-${i}`,
        jd: JD,
      });
    }

    const originalCard = page.locator(`[data-application-id="${applicationId}"]`);
    // Scroll the original (and the whole grid) out of view before duplicating,
    // so the assertion below can't pass merely because the browser happened
    // to already be sitting at the right scroll position.
    await page.evaluate(() => window.scrollTo(0, 0));

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith(`/api/applications/${applicationId}/duplicate`) && r.ok(),
      ),
      originalCard.getByTestId("application-card-duplicate").click(),
    ]);
    const { id: newId } = (await response.json()) as { id: string };
    expect(newId, "duplicate response must carry the new application's id").toBeTruthy();

    const newCard = page.locator(`[data-application-id="${newId}"]`);
    await expect(newCard).toBeVisible();
    await expect(newCard).toHaveAttribute("data-highlight", "true");

    // Scrolled into view: boundingBox sits within the viewport.
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    // A 1px slack absorbs sub-pixel grid-gap rounding (block: "nearest" can
    // settle a fraction of a pixel past the exact edge) without tolerating a
    // genuinely off-screen card.
    const SLACK = 1;
    await expect
      .poll(async () => {
        const box = await newCard.boundingBox();
        if (!box) return false;
        return (
          box.y >= -SLACK &&
          box.y + box.height <= viewport!.height + SLACK &&
          box.x >= -SLACK &&
          box.x + box.width <= viewport!.width + SLACK
        );
      })
      .toBe(true);

    // The highlight is genuinely transient — gone well within a few seconds,
    // never persisted.
    await expect(newCard).not.toHaveAttribute("data-highlight", "true", { timeout: 5000 });
  });
});

test.describe("F406: NewApplication required-JD error placement (T045)", () => {
  test("submitting without a JD renders the error beside the JD field, reddens its border, and focuses it", async ({
    page,
  }, testInfo) => {
    await loginAndGoto(page);
    const company = `E2E Card Detail Field Error ${runId}-${testInfo.retry}`;

    await page.getByRole("button", { name: "New application" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/^Company/).fill(company);
    // Deliberately leave the JD field empty.
    await dialog.getByRole("button", { name: "Create application" }).click();

    const jdField = dialog.getByLabel("Job description", { exact: true });
    const alert = dialog.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText(/job description is required/i);

    // Adjacency: the error and the JD field share the same immediate parent
    // container (not detached under Context, a sibling container below).
    const sameParent = await jdField.evaluate(
      (jd, alertText) => {
        const parent = jd.parentElement;
        if (!parent) return false;
        const alertEl = parent.querySelector('[role="alert"]');
        return alertEl != null && alertEl.textContent === alertText;
      },
      await alert.textContent(),
    );
    expect(sameParent, "error must render inside the JD field's own container").toBe(true);

    // DOM order: the error follows the JD field (adjacent, not merely a
    // shared ancestor further up the tree).
    const jdComesFirst = await jdField.evaluate((jd) => {
      const parent = jd.parentElement!;
      const children = Array.from(parent.children);
      return children.indexOf(jd) < children.indexOf(parent.querySelector('[role="alert"]')!);
    });
    expect(jdComesFirst, "JD field must precede its error in DOM order").toBe(true);

    // Computed red border — a resolved color, not a class-presence check.
    // Polled rather than read once: `border-color` rides the shared
    // `transition-colors` utility, so an immediate read can land mid-fade.
    const destructiveRgb = await resolveTokenRgb(page, "--destructive");
    await expect
      .poll(() => jdField.evaluate((el) => getComputedStyle(el).borderTopColor))
      .toBe(destructiveRgb);

    // Focus moved onto the JD field.
    const isFocused = await jdField.evaluate((el) => el === document.activeElement);
    expect(isFocused, "failed submit must move focus onto the JD field").toBe(true);
  });
});

test.describe("F406: card focus ring uses the full card radius (T045)", () => {
  test("the focus-ring element's computed border-radius is equal on all four corners and non-zero", async ({
    page,
  }, testInfo) => {
    await loginAndGoto(page);
    const company = `E2E Card Detail Focus Ring ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: JD });
    const openLink = page
      .locator(`[data-application-id="${applicationId}"]`)
      .getByTestId("application-card-open");

    await openLink.focus();
    await expect(openLink).toBeFocused();

    const radii = await openLink.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        topLeft: style.borderTopLeftRadius,
        topRight: style.borderTopRightRadius,
        bottomLeft: style.borderBottomLeftRadius,
        bottomRight: style.borderBottomRightRadius,
      };
    });

    expect(radii.topLeft, "top-left radius must be non-zero").not.toBe("0px");
    expect(radii.topRight).toBe(radii.topLeft);
    expect(radii.bottomLeft).toBe(radii.topLeft);
    expect(radii.bottomRight).toBe(radii.topLeft);
  });
});
