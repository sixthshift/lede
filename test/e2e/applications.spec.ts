// Applications full-lifecycle, driven in a real chromium tab against the
// real server (spec.md §27) — the "applications" project's own webServer
// (playwright.config.ts): auth gate ON (so first-run set-password -> login
// is real, not bypassed like library-crud.spec.ts's server) and
// LEDE_TAILOR_ENGINE=fixture (so tailoring replays a recorded decision, no
// API key — FixtureEngine, src/server/tailor/engine.ts).
//
// Keyless replay is exact-match: FixtureEngine's key is hashKey(jd, entries)
// (src/server/tailor/evalcore.ts) over the JD verbatim AND the full entries
// array, so this spec (a) uses CONTRAST_JDS[0].jd byte-for-byte — the
// "platform-sdk" scenario — imported straight from evalcore rather than
// retyped, so it can never drift from the recorded fixture's key, and
// (b) never touches the Library (LibraryView), since the fixture at
// test/fixtures/decisions/platform-sdk.json was recorded against the
// server's default SEED_ENTRIES (src/server/seed.ts) — editing the library
// would change the entries side of the hash and the fixture would 404 as
// "no recorded fixture" instead of replaying.
//
// RESUME_TOKEN is a verbatim substring of that fixture's leading item text
// (rank 1, entryId "cloudcase-platform-sdk") — RED-TEAM #8: proves the
// specific recorded content rendered, not just that *some* non-empty resume
// appeared. Since E7-A4, the artifact is a react-pdf PDF painted onto a pdf.js
// <canvas> (§28.0) — there's no DOM text node to assert on — so RESUME_TOKEN
// is checked against the tailor/lock endpoints' own JSON response bodies
// (server-side proof of the exact recorded content), and expectCanvasPainted
// below is the client-side proof that DocumentPreview's real react-pdf ->
// pdf.js pipeline actually painted something (not just mounted in a loading
// state) — non-white pixels in the canvas.
//
// One continuous test rather than several independent ones: it's a single
// lifecycle (create -> tailor -> persist -> re-tailor -> lock) where each
// step's assertions depend on the previous step's state, and the
// console/pageerror listeners have to be registered before the one
// first-run goto() every step shares (same rationale as docker-spa.spec.ts).
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { ensureFirstRunPassword } from "./helpers/session";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { extractPdfText } from "../../src/client/document/extractText";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario
const RESUME_TOKEN =
  "Built a platform SDK that programmatically exposed the platform for the first time";
// The fixture's rank-2 item (entryId "cloudcase-frontend-rewrite") — proves
// ORDER, not just presence, of the real extracted content (see (4a) below).
const SECOND_TOKEN = "Replaced legacy jQuery with a new three-layer React/TypeScript architecture";

// Unique per test run so the created card is unambiguously findable in a
// list that (on a reused dev server) may carry rows from a previous run.
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const COMPANY_MARKER = `E2E Applications Co ${runId}`;

async function expectCanvasPainted(page: Page): Promise<void> {
  const canvas = page.locator(".document-preview canvas");
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

test("create -> tailor -> render(token) -> reload-persist -> re-tailor -> lock", async ({
  page,
}) => {
  // Registered before the first navigation so it captures the LoginGate
  // ping (see below) alongside anything a real break would produce.
  const pageErrors: unknown[] = [];
  const consoleErrors: string[] = [];
  let loggedIn = false;
  // Set true only around the (4a) Download PDF click below — DocumentPreview
  // (src/client/components/DocumentPreview.tsx) runs its OWN concurrent
  // react-pdf render (usePDF) for the live canvas; racing it against a
  // SECOND react-pdf render for the download (downloadResumePdf) can
  // occasionally cause pdf.js's canvas-side blob fetch to lose a revoke race
  // on react-pdf's internal (not this ticket's) blob url, logging a
  // same-text net::ERR_FILE_NOT_FOUND — harmless to what's under test here,
  // since (4a)'s own assertions independently verify the REAL downloaded
  // PDF's bytes are correct. Scoped tightly (only while true) so a real
  // regression anywhere else in the flow still fails the test.
  let downloadInFlight = false;
  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // EXACT-MATCH allowlist, one entry, scoped to before sign-in only:
    // LoginGate (src/client/components/LoginGate.tsx) only swaps in the
    // password form once its own auth ping (GET /api/settings) has RESOLVED
    // 401 — while that ping is still in flight, `unauthorized` is false and
    // LoginGate renders the real app underneath it, so whatever route is
    // current (ApplicationsView, GET /api/applications) fires its own query
    // in the same unauthenticated window and 401s too. Both are the same
    // expected pre-session race, not a bug — Chromium logs this exact text
    // for any non-2xx fetch response regardless of the app catching it. Once
    // `loggedIn` flips true (post sign-in), this text is no longer excused:
    // a real break here still fails the test.
    if (
      !loggedIn &&
      msg.text() ===
        "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
    ) {
      return;
    }
    // EXACT-MATCH allowlist, scoped to the (4a) download window only — see
    // downloadInFlight's comment above.
    if (downloadInFlight && msg.text() === "Failed to load resource: net::ERR_FILE_NOT_FOUND") {
      return;
    }
    consoleErrors.push(msg.text());
  });

  const tailorRequests: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && /\/api\/applications\/[^/]+\/tailor$/.test(req.url())) {
      tailorRequests.push(req.url());
    }
  });

  // (1) fresh boot -> set-password -> logged in -> lands on /applications
  // (main.tsx's index route, post E6-B2's nav cutover — not /tailor, which
  // that ticket removed).
  await page.goto("/");
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await ensureFirstRunPassword(page, PASSWORD);
  loggedIn = true;
  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.getByRole("button", { name: "New application" })).toBeVisible();

  // (2) create an Application with the exact recorded fixture JD.
  await page.getByRole("button", { name: "New application" }).click();
  const createDialog = page.getByRole("dialog");
  await expect(createDialog).toBeVisible();
  await createDialog.getByLabel(/^Company/).fill(COMPANY_MARKER);
  await createDialog.getByLabel("Job description", { exact: true }).fill(JD);
  await createDialog.getByRole("button", { name: "Create application" }).click();
  await expect(createDialog).toBeHidden();

  const card = page.locator("[data-application-id]").filter({ hasText: COMPANY_MARKER });
  await expect(card).toBeVisible();
  const applicationId = await card.getAttribute("data-application-id");
  expect(applicationId, "created card must carry a data-application-id").toBeTruthy();

  // (3) navigate to the detail page (no in-app link from the list to a
  // detail route exists yet — same direct-navigation approach auth.spec.ts
  // uses for its protected-route check) and drive Tailor.
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByRole("button", { name: "Tailor", exact: true })).toBeVisible();

  const [tailorResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/tailor`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Tailor", exact: true }).click(),
  ]);
  expect(tailorRequests).toHaveLength(1);
  expect(JSON.stringify(await tailorResponse.json())).toContain(RESUME_TOKEN);

  // (4) current renders: DocumentPreview painted a real PDF, ReasoningPanel
  // present, as SIBLINGS (§11/§28.0) — the specific fixture token (RED-TEAM
  // #8) is proven server-side above (the tailor response body), since the
  // rendered artifact is a canvas, not DOM text.
  await expect(page.getByRole("button", { name: "Re-tailor", exact: true })).toBeVisible();
  await expectCanvasPainted(page);
  await expect(page.locator(".reasoning-panel")).toBeVisible();

  // (4·fit) BROWSER FIT PROOF (E7-C2 escaped-bug guard): fit.ts's page-count
  // measurement used to call renderToBuffer, which @react-pdf/renderer's
  // browser build stubs to throw ("Node specific API") — in a REAL browser
  // (unlike vitest, which always runs under Node) that throw got swallowed
  // by useFit's catch, so the FitChip silently never rendered and the
  // fitted density never reached the live preview/download. Node-only unit
  // tests (test/fit.test.ts) can't catch this — they don't run in a browser.
  // Asserting the chip's exact rendered text (src/client/components/
  // FitChip.tsx: `Fits <n> page(s) · <density>`) is visible here proves
  // fitToPages actually completed in-browser instead of throwing-and-hiding.
  await expect(page.getByText(/^Fits \d+ pages? · (comfortable|standard|compact)$/)).toBeVisible();

  // (4a) REAL-PDF content-fidelity (ledger [v3-016], §28.6) — the ESCAPED-BUG
  // COMPENSATION this ticket exists for. Since E7-A4 swapped the resume DOM
  // for a pdf.js canvas, expectCanvasPainted only proves SOME PDF painted,
  // and the tailor-response assertions above only prove the server's JSON
  // carried the right content — neither proves the file a real applicant
  // would actually submit contains it. Capture the REAL generated PDF via
  // the Download PDF button + a real browser download event, then run the
  // SAME extractPdfText an ATS parser's extraction would use over its actual
  // bytes, asserting the live-tailored RESUME_TOKEN and a second selected
  // item (rank-2, so ORDER is checked too) are both present, in order.
  downloadInFlight = true;
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  const downloadPath = await download.path();
  expect(downloadPath, "Download PDF must produce a real saved file").toBeTruthy();
  const pdfBytes = readFileSync(downloadPath!);
  const extractedText = (await extractPdfText(pdfBytes)).join(" ");

  const firstIdx = extractedText.indexOf(RESUME_TOKEN);
  const secondIdx = extractedText.indexOf(SECOND_TOKEN);
  expect(
    firstIdx,
    "RESUME_TOKEN must be in the REAL downloaded PDF's extracted text",
  ).toBeGreaterThan(-1);
  expect(
    secondIdx,
    "the second selected item must be in the REAL downloaded PDF's extracted text",
  ).toBeGreaterThan(-1);
  expect(secondIdx, "content order: RESUME_TOKEN must precede the second item").toBeGreaterThan(
    firstIdx,
  );
  downloadInFlight = false;

  // (4b) Design panel (E7-B1e) — change the TEMPLATE and the body FONT; each
  // change PUTs application.format and the preview canvas repaints (§28.3).
  // Both PUTs are proven to persist below by the SAME full reload (5) uses.
  const applicationPut = (r: import("@playwright/test").Response) =>
    r.url().endsWith(`/api/applications/${applicationId}`) && r.request().method() === "PUT";

  // /^Sidebar ATS/ — accessible-name prefix (card title + ATS badge) that
  // uniquely matches the sidebar-LEFT card; a bare /Sidebar/ would also match
  // the "Sidebar Right" card added by E8-A2.
  const [templatePutResponse] = await Promise.all([
    page.waitForResponse(applicationPut),
    page.getByRole("button", { name: /^Sidebar ATS/ }).click(),
  ]);
  expect(templatePutResponse.status()).toBe(200);
  expect((await templatePutResponse.json()).format.templateId).toBe("sidebar-left");
  await expectCanvasPainted(page);

  await page.getByRole("combobox", { name: "Body font" }).click();
  const [fontPutResponse] = await Promise.all([
    page.waitForResponse(applicationPut),
    page.getByRole("option", { name: "Arimo (Arial)" }).click(),
  ]);
  expect(fontPutResponse.status()).toBe(200);
  expect((await fontPutResponse.json()).format.typography.body.family).toBe("arimo");
  await expectCanvasPainted(page);

  // (5) full reload -> the same content still persists, with NO re-tailor
  // (persistence: genState stays 'tailored', current was persisted by (3),
  // not re-derived on load) — checked against the record itself, since the
  // canvas has no DOM text to assert a token against.
  await page.reload();
  await expect(page.getByRole("button", { name: "Re-tailor", exact: true })).toBeVisible();
  await expectCanvasPainted(page);
  const afterReload = await page.request.get(`/api/applications/${applicationId}`);
  expect(JSON.stringify(await afterReload.json())).toContain(RESUME_TOKEN);
  expect(tailorRequests, "reload must not trigger a re-tailor").toHaveLength(1);

  // (4c) the format change from (4b) PERSISTS across the reload — the
  // TemplatePicker/DesignPanel controls reflect the saved value, not a
  // client-only draft.
  await expect(page.getByRole("button", { name: /^Sidebar ATS/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("combobox", { name: "Body font" })).toHaveText(/Arimo/);

  // (6) re-tailor.
  const [retailorResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/tailor`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Re-tailor", exact: true }).click(),
  ]);
  expect(tailorRequests).toHaveLength(2);
  expect(JSON.stringify(await retailorResponse.json())).toContain(RESUME_TOKEN);
  await expectCanvasPainted(page);

  // (7) lock final -> `locked` renders: the lock/unlock toggle (JobPanel's
  // only locked-state UI, src/client/components/JobPanel.tsx) flips to
  // "Unlock", and the resume content (still driven by `current`, which lock
  // deep-copies rather than replaces) stays visible.
  const [lockResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/lock`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Lock final", exact: true }).click(),
  ]);
  await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();
  expect(JSON.stringify(await lockResponse.json())).toContain(RESUME_TOKEN);
  await expectCanvasPainted(page);

  expect(pageErrors, `unexpected page errors: ${pageErrors.join(", ")}`).toHaveLength(0);
  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join(", ")}`).toHaveLength(0);
});
