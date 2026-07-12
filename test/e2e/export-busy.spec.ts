// Export busy state (F402/T042): the PDF/plain-text export controls on the
// detail surface (ApplicationDetail.tsx) previously had no pending state at
// all — a double-click rendered/downloaded TWICE. Fix: a local pending flag
// disables the control and swaps its label to a busy label ("Preparing…")
// while the export is in flight, and the SAME flag guards a second
// activation mid-flight into a no-op — exactly one download per user
// intent.
//
// The busy window has to be made wide enough to observe deterministically.
// Once every face @react-pdf needs is warm in its in-memory Font cache
// (fonts.ts), `pdf(doc).toBlob()` is fast enough that the window closes
// before a poll can ever catch it — CPU throttling alone doesn't widen it
// enough (verified empirically: even a 20x CDP throttle produced no visible
// "Preparing…" frame once fonts were cached). The genuinely slow part is the
// FIRST fetch of each font's bytes (fonts.ts's `fetch(src)`, a real network
// round trip) — so this test delays every font-asset response via
// `page.route`, set up before the application is ever tailored, so the
// export this test drives is the FIRST render (a cache miss), not a warm
// repeat off the preview pane's own earlier paint.
//
// Reuses the "applications" project's shared server/password (single
// server-wide password — PASSWORD MUST match applications.spec.ts exactly).
import { test, expect } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { login, createApplication, tailor, expectResumeCanvasPainted } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — recorded fixture
const FONT_DELAY_MS = 1500;

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test("export busy state (F402): PDF export disables + swaps label while in flight, and a double-click yields exactly one download", async ({
  page,
}, testInfo) => {
  const company = `E2E Export Busy Co ${runId}-${testInfo.retry}`;

  // Delay every font-face fetch (see fonts.ts) — real bytes served from
  // dist/assets, otherwise near-instant on localhost — so the render this
  // test drives takes long enough to observe. Registered before navigation:
  // it must catch the resume's FIRST render (this application's preview
  // pane paints as soon as it's tailored, which would otherwise warm the
  // cache before the deliberate download click below ever fires).
  await page.route(/\.woff2?(\?.*)?$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, FONT_DELAY_MS));
    await route.continue();
  });

  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId);

  const pdfButton = page.getByTestId("download-pdf-button");
  await expect(pdfButton).toHaveText("Download PDF");
  await expect(pdfButton).toBeEnabled();

  let downloadCount = 0;
  page.on("download", () => {
    downloadCount++;
  });

  const firstDownload = page.waitForEvent("download");

  await pdfButton.click(); // activation #1

  // While in flight: disabled AND the accessible label is the busy label,
  // not the resting one.
  await expect(pdfButton).toHaveText("Preparing…");
  await expect(pdfButton).toBeDisabled();

  // Activation #2, while busy — `force` bypasses Playwright's own
  // actionability wait (which would otherwise refuse to click a disabled
  // control), simulating a rapid second click landing mid-flight. A real
  // disabled <button> ignores the click at the DOM level, AND (belt and
  // suspenders) the handler's own pending-flag check would no-op it even if
  // that native disabling were ever bypassed — either way this must NOT
  // produce a second download.
  await pdfButton.click({ force: true });

  await firstDownload;

  // Resting state restored.
  await expect(pdfButton).toHaveText("Download PDF");
  await expect(pdfButton).toBeEnabled();

  // Exactly one download fired despite two activations — the guard is real,
  // not merely coincidental timing (without it, two clicks landing inside
  // the render window would each independently render+download).
  expect(downloadCount).toBe(1);

  // The delayed fonts having now resolved, the preview pane's own render
  // completes too — proof this ran against the real tailored resume, not a
  // stubbed one.
  await expectResumeCanvasPainted(page);
});
