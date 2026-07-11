// F101/T012 — AtsView.tsx renders <pre class="ats-view__text"> (spec.md
// §28.6), but until this ticket no CSS rule anywhere targeted that class:
// the UA default `white-space: pre` measured scrollWidth 8,050px in a 351px
// pane, so content past ~40 chars was unreachable. app.css now gives it
// `white-space: pre-wrap` + `overflow-wrap: anywhere` + `word-break:
// break-word` — this spec proves the FIX, not just that the rule exists.
//
// Shares applications.spec.ts's "applications" project/server (real
// first-run set-password -> login, gate ON; LEDE_TAILOR_ENGINE=fixture) so
// PASSWORD MUST match that file's exactly — same rationale as design.spec.ts/
// cohesion.spec.ts's identical header comments.
//
// Anti-gaming (oracle.md "Anti-gaming protocols"): WRAP not CLIP — a fix
// that shrank scrollWidth via `overflow:hidden`/a fixed height would also
// shrink measured height, so this asserts height GROWS with content rather
// than just checking scrollWidth once. PRE-WRAP not PRE-LINE — `innerText`
// (not `textContent`, which is CSS-blind) is what actually differs between
// the two: `pre-line` collapses runs of whitespace when rendered, `pre-wrap`
// doesn't, so asserting the raw run survives in `innerText` is the real
// discriminator between the two values, not just a DOM presence check.
import { test, expect } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { login, createApplication, tailor } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — same recorded fixture as applications.spec.ts

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test("ATS view: real content wraps in its pane, an unbroken 500-char token still wraps, height grows (not clips), and pre-wrap preserves consecutive whitespace", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E ATS View Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplication(page, { company, jd: JD });

  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId);

  // Switch the resume preview from Preview to "What the ATS sees" (§28.6) —
  // AtsView only mounts once a tailored resume exists, same precondition
  // design.spec.ts's tailor() call establishes.
  await page.getByRole("button", { name: "What the ATS sees" }).click();

  const atsText = page.getByTestId("preview-pane").locator(".ats-view__text");
  await expect(atsText).toBeVisible();
  // Real extraction is async (pdf render -> blob -> extractPdfText); wait
  // for it to land rather than racing the loading placeholder.
  await expect(page.getByText("Extracting…")).not.toBeVisible();

  // (1) The REAL seeded/tailored content, unmodified: scrollWidth must never
  // exceed clientWidth. This is the literal F101 measurement (was 8,050px in
  // a 351px pane) against real extracted document text, not a synthetic stand-in.
  async function overflowsHorizontally(): Promise<boolean> {
    return atsText.evaluate((el) => el.scrollWidth > el.clientWidth);
  }
  expect(
    await overflowsHorizontally(),
    "ats-view__text must not overflow its pane with real tailored content",
  ).toBe(false);

  // (2) An unbroken 500-char token (no spaces/hyphens to wrap at — a URL or
  // a long slug is the realistic case) must still wrap: scrollWidth stays
  // <= clientWidth. Injected directly onto the real, real-CSS'd element
  // (rather than re-deriving a PDF that happens to extract this exact run)
  // since what's under test is app.css's wrap behavior, not extraction.
  const unbrokenToken = "x".repeat(500);
  await atsText.evaluate((el, token) => {
    el.textContent = token;
  }, unbrokenToken);
  expect(
    await overflowsHorizontally(),
    "a 500-char unbroken token must still wrap, not force horizontal overflow",
  ).toBe(false);

  // (3) WRAP not CLIP: rendered height must GROW as content grows. A fix
  // that merely hid overflow (overflow:hidden / a fixed max-height) would
  // shrink scrollWidth by hiding content while height stayed flat — this
  // rules that out by observing height increase directly.
  const shortHeight = await atsText.evaluate((el) => el.getBoundingClientRect().height);
  const manyLines = Array.from({ length: 200 }, (_, i) => `line ${i}: some ATS-visible text`).join(
    "\n",
  );
  await atsText.evaluate((el, text) => {
    el.textContent = text;
  }, manyLines);
  const longHeight = await atsText.evaluate((el) => el.getBoundingClientRect().height);
  expect(
    longHeight,
    "content height must grow with content length (wrap, not clip)",
  ).toBeGreaterThan(shortHeight);

  // (4) PRE-WRAP not PRE-LINE: a run of consecutive spaces and tabs must
  // render verbatim. `innerText` (CSS-rendering-aware, unlike `textContent`)
  // is what actually distinguishes the two values — `pre-line` collapses
  // whitespace runs down to a single space when rendered; `pre-wrap` doesn't.
  const whitespaceFixture = "ALPHA     BETA\t\tGAMMA";
  await atsText.evaluate((el, text) => {
    el.textContent = text;
  }, whitespaceFixture);
  const rendered = await atsText.innerText();
  expect(rendered, "consecutive spaces/tabs must survive verbatim (pre-wrap, not pre-line)").toBe(
    whitespaceFixture,
  );
});
