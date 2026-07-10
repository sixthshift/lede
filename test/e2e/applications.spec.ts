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
import { test, expect, type Page, type Locator } from "@playwright/test";
import { ensureFirstRunPassword, login } from "./helpers/session";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { extractPdfText } from "../../src/client/document/extractText";
import { PRESET_MANIFESTS } from "../../src/client/document/registry";
import { letterPdfFilename } from "../../src/client/document/download";

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

// Shared "some non-white pixel exists" oracle — factored out so T24's
// letter-preview canvas (a DIFFERENT locator, deliberately never
// `.document-preview`, so a letter paint can't be mistaken for a resume
// paint) can reuse the exact same paint check as the resume preview below.
async function expectLocatorCanvasPainted(canvas: Locator): Promise<void> {
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

async function expectCanvasPainted(page: Page): Promise<void> {
  await expectLocatorCanvasPainted(page.locator(".document-preview canvas"));
}

const TEMPLATE_IDS = Object.keys(PRESET_MANIFESTS);

// Scope defaults to the page, but the E8-C1 gallery dialog renders its OWN
// set of `data-template-id` cards (one large preview each) ON TOP of the
// inline TemplatePicker's — both mounted at once while the dialog is open —
// so a gallery scenario must pass the dialog's own Locator as `scope` to
// avoid a strict-mode "resolved to N elements" ambiguity between the two.
function thumbnailCanvas(scope: Page | Locator, templateId: string) {
  return scope.locator(`[data-template-id="${templateId}"] canvas`);
}

// E8-B1: TemplatePicker cards render LIVE mini-renders, never static images
// (§28.2, decided 2026-07-05) — proof is a painted (non-blank) canvas, same
// "not just white pixels" oracle expectCanvasPainted already uses for the
// main preview, applied to a template card's thumbnail canvas instead.
async function expectThumbnailPainted(scope: Page | Locator, templateId: string): Promise<void> {
  const canvas = thumbnailCanvas(scope, templateId);
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeVisible();
  await expect
    .poll(
      () =>
        canvas.evaluate((el: HTMLCanvasElement) => {
          // A canvas that's never been drawn to sits at its default 300x150
          // size with fully TRANSPARENT (alpha=0) pixels — indistinguishable
          // from "non-white" by color alone (0 !== 255), so dimensions must
          // have moved off the pdf.js-untouched default AND at least one
          // pixel must be opaque and non-white.
          if (el.width === 300 && el.height === 150) return false;
          const ctx = el.getContext("2d");
          if (!ctx || el.width === 0 || el.height === 0) return false;
          const { data } = ctx.getImageData(0, 0, el.width, el.height);
          for (let i = 0; i < data.length; i += 4) {
            if (
              data[i + 3] !== 0 &&
              (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255)
            ) {
              return true;
            }
          }
          return false;
        }),
      { timeout: 15000 },
    )
    .toBe(true);
}

function thumbnailDataUrl(page: Page, templateId: string): Promise<string> {
  return thumbnailCanvas(page, templateId).evaluate((el: HTMLCanvasElement) => el.toDataURL());
}

test("create -> tailor -> render(token) -> reload-persist -> re-tailor -> lock", async ({
  page,
}) => {
  // Registered before the first navigation so it captures the LoginGate
  // ping (see below) alongside anything a real break would produce.
  const pageErrors: unknown[] = [];
  const consoleErrors: string[] = [];
  let loggedIn = false;
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
    // EXACT-MATCH allowlist, same pre-sign-in scope: LoginForm is ONE
    // component for first-run and returning-user login — it discovers which
    // case it's in by POSTing /api/auth/setup first and falling back to
    // /api/auth/login when setup 409s (test/e2e/helpers/session.ts). On a
    // retry (or a reused dev server) the password is already set, so that
    // probe 409s BY DESIGN — Chromium logs it like any non-2xx fetch. Without
    // this entry a retry could never pass the final console assertion,
    // defeating playwright.config.ts's retries-absorb-cold-boot-flake setup.
    if (
      !loggedIn &&
      msg.text() === "Failed to load resource: the server responded with a status of 409 (Conflict)"
    ) {
      return;
    }
    // EXACT-MATCH allowlist: react-pdf's usePDF revokes the PREVIOUS preview
    // blob url whenever a new render lands (its own `[state.url]` cleanup
    // effect), while PdfCanvas's pdf.js fetch of that old url can still be
    // in flight — pdf.js range-fetches url-backed documents lazily, so the
    // loser logs exactly this text. New renders land at every fit-ladder
    // re-run, format change, re-tailor, and download — and E8-B1's six
    // serialized thumbnail renders add enough contention that the race,
    // previously occasional (E7-C1b allowlisted it around the download
    // click only), now fires reliably at those swap points too. Harmless to
    // everything under test: each step's own painted-canvas/pixel/PDF-byte
    // assertions independently prove the CURRENT render is real and correct.
    // This text is specific to a dead blob: url — an asset/API failure logs
    // a status-code text (like the two above) and still fails the test.
    if (msg.text() === "Failed to load resource: net::ERR_FILE_NOT_FOUND") {
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

  // (3a) UNTAILORED (E8-B1, §28.2): no tailored resume exists yet, so every
  // template card falls back to sample content and says so — never silently
  // passing sample content off as the user's own.
  await expect(thumbnailCanvas(page, "strict")).toBeVisible();
  expect(await page.getByText("Sample content").count()).toBe(TEMPLATE_IDS.length);

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

  // (4·thumb) LIVE MINI-RENDER THUMBNAILS (E8-B1, §28.2) — once tailored,
  // the sample-content badge disappears, and every one of the six template
  // cards paints its OWN real render of the actual tailored resume (never a
  // static image/screenshot). Two different templates' thumbnails must also
  // differ pixelwise — the anti-stock-image proof that these are genuinely
  // per-template renders, not the same picture shown six times.
  expect(await page.getByText("Sample content").count()).toBe(0);
  for (const templateId of TEMPLATE_IDS) {
    await expectThumbnailPainted(page, templateId);
  }
  const strictThumbnail = await thumbnailDataUrl(page, "strict");
  const sidebarThumbnail = await thumbnailDataUrl(page, "sidebar-left");
  expect(strictThumbnail).not.toBe(sidebarThumbnail);

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
  expect((await templatePutResponse.json()).format.presetId).toBe("sidebar-left");
  await expectCanvasPainted(page);

  await page.getByRole("combobox", { name: "Body font" }).click();
  const [fontPutResponse] = await Promise.all([
    page.waitForResponse(applicationPut),
    page.getByRole("option", { name: "Arimo (Arial)" }).click(),
  ]);
  expect(fontPutResponse.status()).toBe(200);
  expect((await fontPutResponse.json()).format.fonts.body).toBe("arimo");
  await expectCanvasPainted(page);

  // (4b·color) E8-B1's other anti-stock-image proof: changing the primary
  // color repaints a thumbnail's actual pixels — a static screenshot
  // couldn't react to this, only a live render can.
  const sidebarThumbnailBeforeColor = await thumbnailDataUrl(page, "sidebar-left");
  // Scoped to the "Primary color" field specifically — the same curated hex
  // swatches also appear under "Text color", so an unscoped role query would
  // match both.
  const primaryColorField = page.getByText("Primary color", { exact: true }).locator("..");
  const [colorPutResponse] = await Promise.all([
    page.waitForResponse(applicationPut),
    primaryColorField.getByRole("button", { name: "#14532d" }).click(),
  ]);
  expect(colorPutResponse.status()).toBe(200);
  expect((await colorPutResponse.json()).format.colors.accent).toBe("#14532d");
  // Generous timeout, same rationale as expectThumbnailPainted: a color
  // change invalidates ALL SIX thumbnail cache keys, and the serialized
  // render queue (+ idle-time deferral per card) repaints them one at a
  // time — sidebar-left's turn can land well past the default 5s.
  await thumbnailCanvas(page, "sidebar-left").scrollIntoViewIfNeeded();
  await expect
    .poll(() => thumbnailDataUrl(page, "sidebar-left"), { timeout: 15000 })
    .not.toBe(sidebarThumbnailBeforeColor);

  // (5) full reload -> the same content still persists, with NO re-tailor
  // (persistence: genState stays 'tailored', current was persisted by (3),
  // not re-derived on load) — checked against the record itself, since the
  // canvas has no DOM text to assert a token against. The reload tears down
  // every blob url with the page, closing the design-change race window.
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

  // (4d) Dedicated template gallery (E8-C1, §28.2) — a full-screen browse
  // dialog off the Design card, opened here (AFTER (4b)/(4c)'s sidebar-LEFT
  // selection + reload-persistence checks, BEFORE (6)'s template-agnostic
  // re-tailor/lock) so switching the template to sidebar-RIGHT can't disturb
  // any earlier assertion.
  await page.getByRole("button", { name: "Browse templates" }).click();
  const gallery = page.getByRole("dialog");
  await expect(gallery).toBeVisible();

  // All 6 cards visible with PAINTED canvases — scoped to the gallery
  // dialog, since the inline TemplatePicker (same data-template-id
  // attributes) is still mounted underneath it while the dialog is open.
  for (const templateId of TEMPLATE_IDS) {
    await expectThumbnailPainted(gallery, templateId);
  }

  // Selecting a card applies that preset's composition (applyPreset) — the
  // (4b) color/font PUTs (stylistic axes, untouched by preset choice) must
  // survive.
  const [galleryPutResponse] = await Promise.all([
    page.waitForResponse(applicationPut),
    gallery.getByRole("button", { name: /^Sidebar Right/ }).click(),
  ]);
  expect(galleryPutResponse.status()).toBe(200);
  const galleryPutFormat = (await galleryPutResponse.json()).format;
  expect(galleryPutFormat.presetId).toBe("sidebar-right");
  expect(galleryPutFormat.colors.accent).toBe("#14532d");
  expect(galleryPutFormat.fonts.body).toBe("arimo");

  // Selecting closes the gallery; the inline picker + preview reflect the
  // new choice immediately.
  await expect(gallery).toBeHidden();
  await expect(page.getByRole("button", { name: /^Sidebar Right ATS/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectCanvasPainted(page);

  // Persists across a reload.
  await page.reload();
  await expect(page.getByRole("button", { name: "Re-tailor", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Sidebar Right ATS/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectCanvasPainted(page);
  expect(tailorRequests, "the gallery reload must not trigger a re-tailor").toHaveLength(1);

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

// ── T24: application-page letter surface. Letter generation is independent
// of resume /tailor (never threads through the giant lifecycle test above),
// so each of the following gets its OWN application rather than reusing the
// one `applicationId` created there. ──
// The fit ladder's very FIRST measurement on a freshly tailored resume can
// race cold @fontsource fetches (documented flake source, CLAUDE.md) and
// land on a slightly different density than every measurement after fonts
// are warm/cached — polling here until two consecutive reads agree gives a
// truly-settled "before" baseline, so a later comparison isn't blamed on
// that unrelated, pre-existing jitter.
async function waitForStableCanvas(canvas: Locator): Promise<string> {
  let previous = await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL());
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const current = await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL());
    if (current === previous) return current;
    previous = current;
  }
  return previous;
}

async function createApplicationViaUi(
  page: Page,
  { company, role, jd }: { company: string; role?: string; jd: string },
): Promise<string> {
  await page.getByRole("button", { name: "New application" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^Company/).fill(company);
  if (role) await dialog.getByLabel(/^Role/).fill(role);
  await dialog.getByLabel("Job description", { exact: true }).fill(jd);
  await dialog.getByRole("button", { name: "Create application" }).click();
  await expect(dialog).toBeHidden();

  const card = page.locator("[data-application-id]").filter({ hasText: company });
  await expect(card).toBeVisible();
  const applicationId = await card.getAttribute("data-application-id");
  expect(applicationId, "created card must carry a data-application-id").toBeTruthy();
  return applicationId!;
}

test("cover letter: generate/paint isolation, download filename, undo, motivation persistence", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  // This server's seeded profile has never had its name set (schema default
  // `""`) — the download filename check below needs a real `<Name>` segment
  // to prove the full "<Name> — <Company> — <Role> — Cover Letter.pdf"
  // pattern, so set one directly via the API (no e2e flow exists for this
  // and none is needed — it's fixture data, not something under test here).
  await page.request.put("/api/profile", {
    data: { name: "E2E Letter Tester", email: "e2e-letter-tester@example.com", links: [] },
  });

  // Unique per ATTEMPT, not just per test-file load: a retry reruns this
  // same test body against the SAME server/db (webServer isn't rebooted
  // between retries), so a fixed module-level id would collide with the
  // failed attempt's own leftover application row.
  const company = `E2E Letter Co ${runId}-${testInfo.retry}`;
  const role = "Staff Platform Engineer";
  const applicationId = await createApplicationViaUi(page, { company, role, jd: JD });
  await page.goto(`/applications/${applicationId}`);

  // (a) NO-LETTER state, before anything is generated: the Generate
  // affordance is visible AND there is no letter-preview canvas at all —
  // never a blank/empty document standing in for "not generated yet".
  await expect(page.getByRole("button", { name: "Generate letter", exact: true })).toBeVisible();
  await expect(page.getByText("No letter", { exact: true })).toBeVisible();
  expect(await page.locator('[data-testid="letter-preview"] canvas').count()).toBe(0);

  // (b) motivation persists across a reload, scoped to persistence only —
  // its flow-through into the letter decision is already unit-tested
  // (src/server/tailor/letter.ts), not re-asserted here. Done BEFORE
  // tailoring, while JobPanel is still open by default (no `current` yet).
  const motivationText = `Motivated by ${company}'s mission ${runId}`;
  await page.getByLabel("Motivation", { exact: true }).fill(motivationText);
  const [motivationPut] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}`) && r.request().method() === "PUT",
    ),
    page.getByRole("button", { name: "Save", exact: true }).click(),
  ]);
  expect(motivationPut.status()).toBe(200);
  await page.reload();
  await expect(page.getByLabel("Motivation", { exact: true })).toHaveValue(motivationText);

  // (c) tailor the resume so a REAL `.document-preview` canvas exists — the
  // isolation claim below (letter generation must not repaint it) only means
  // something once there's a real paint to leave alone. Waiting for the fit
  // chip's text (same oracle as the lifecycle test's own (4·fit) step) before
  // snapshotting pixels matters here specifically: the fit ladder's own
  // async re-render (comfortable -> its final settled density) would
  // otherwise race this snapshot and get mistaken for letter-generation
  // fallout.
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/tailor`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Tailor", exact: true }).click(),
  ]);
  await expectCanvasPainted(page);
  await expect(page.getByText(/^Fits \d+ pages? · (comfortable|standard|compact)$/)).toBeVisible();
  const resumeCanvas = page.locator(".document-preview canvas");
  const resumePixelsBefore = await waitForStableCanvas(resumeCanvas);
  const currentBefore = (
    await (await page.request.get(`/api/applications/${applicationId}`)).json()
  ).current;

  // (d) generate the letter: its OWN scope (`[data-testid="letter-preview"]`,
  // never `.document-preview`) paints, and the resume canvas is byte-for-byte
  // unchanged — proving the two documents' render pipelines are isolated.
  const [generateResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/generate-letter`) &&
        r.status() === 200,
    ),
    page.getByRole("button", { name: "Generate letter", exact: true }).click(),
  ]);
  expect(generateResponse.status()).toBe(200);

  // Server-side proof of isolation, precise and immune to any browser-side
  // render-timing jitter: the generate-letter response is the FULL updated
  // row — `current` (the resume snapshot) must be the exact same value the
  // /tailor response produced, since generate-letter's route only ever
  // touches the letterCurrent/letterPrevious/letterGenState columns.
  const currentAfter = (await generateResponse.json()).current;
  expect(
    JSON.stringify(currentAfter),
    "generate-letter must not touch the resume's `current` snapshot",
  ).toBe(JSON.stringify(currentBefore));

  await expectLocatorCanvasPainted(page.locator('[data-testid="letter-preview"] canvas'));
  await expect(page.getByText("Letter ready", { exact: true })).toBeVisible();

  // Polled, not a single snapshot: useGenerateLetter's onSuccess invalidates
  // the WHOLE ["applications", id] query (letter + resume share one record),
  // so the refetch hands useFit a structurally-identical but reference-NEW
  // `resume` — its effect resets fit -> the resume's own PdfCanvas
  // transiently unmounts (usePDF's `loading` flip) and repaints through 1-2
  // benign settle cycles before landing back on byte-identical output. What
  // isolation actually means here: the resume's CONTENT never changes from a
  // letter-only mutation — not that its DOM node is untouched by shared
  // plumbing — so this polls for that eventual, stable equality.
  await expect
    .poll(() => resumeCanvas.evaluate((el: HTMLCanvasElement) => el.toDataURL()), {
      timeout: 10000,
    })
    .toBe(resumePixelsBefore);

  // (e) undo is disabled right after the FIRST generate — letterPrevious is
  // still null (nothing recorded yet to swap back to).
  await expect(page.getByRole("button", { name: "Undo letter", exact: true })).toBeDisabled();

  // (f) download: a REAL download fires (proving the button/wiring actually
  // produces a file), and the filename is exactly `<Name> — <Company> —
  // <Role> — Cover Letter.pdf` per the SAME production function download.ts
  // calls (not a re-typed duplicate), so this can never silently drift from
  // it. Checked as a value equality against the production function's own
  // output rather than the browser's `download.suggestedFilename()`: this
  // Chromium build (verified with an from-scratch minimal <a download> repro,
  // unrelated to any app code) mis-reports ANY anchor `download` attribute
  // containing an em dash as the generic "download" — a pre-existing
  // environment quirk that equally affects the resume download once
  // company+role are both filled, not something T24 introduced.
  const profileResponse = await page.request.get("/api/profile");
  const profile = (await profileResponse.json()) as { name: string };
  const expectedFilename = `${profile.name} — ${company} — ${role} — Cover Letter.pdf`;
  expect(letterPdfFilename(profile.name, company, role)).toBe(expectedFilename);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download cover letter", exact: true }).click(),
  ]);
  expect(download.url()).toMatch(/^blob:/);

  // (g) regenerate -> undo becomes enabled (letterPrevious now holds the
  // FIRST letter) -> undo swaps letterCurrent/letterPrevious back.
  const [regenerateResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/generate-letter`) &&
        r.status() === 200,
    ),
    page.getByRole("button", { name: "Regenerate letter", exact: true }).click(),
  ]);
  expect(regenerateResponse.status()).toBe(200);
  await expect(page.getByRole("button", { name: "Undo letter", exact: true })).toBeEnabled();

  const [undoResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/undo-letter`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Undo letter", exact: true }).click(),
  ]);
  expect(undoResponse.status()).toBe(200);
});

test("cover letter: a failed generation surfaces a distinct failed badge, never a stub letter", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  // A JD with no recorded fixture — FixtureEngine.decideLetter throws
  // NoFixtureError (422 "no_fixture"), a deterministic, keyless way to drive
  // letterGenState to "failed" without a live provider key. Suffixed with
  // the retry index for the same reason as the test above.
  const company = `E2E Letter Fail Co ${runId}-${testInfo.retry}`;
  const unmatchedJd = `An entirely unrecorded job description, never fixture-matched ${runId}-${testInfo.retry}`;
  const applicationId = await createApplicationViaUi(page, { company, jd: unmatchedJd });
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByText("No letter", { exact: true })).toBeVisible();

  const [generateResponse] = await Promise.all([
    page.waitForResponse((r) =>
      r.url().endsWith(`/api/applications/${applicationId}/generate-letter`),
    ),
    page.getByRole("button", { name: "Generate letter", exact: true }).click(),
  ]);
  expect(generateResponse.status()).toBe(422);

  // The mutation only invalidates on success (mirrors /tailor's own
  // asymmetry) — a reload is what surfaces the server-persisted
  // `letterGenState: "failed"` in the UI, same as the lifecycle test's own
  // reload-persistence check for the resume side.
  await page.reload();
  await expect(page.getByText("Letter failed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo letter", exact: true })).toBeDisabled();
  expect(await page.locator('[data-testid="letter-preview"] canvas').count()).toBe(0);
});

// ── T34: in-place text editing (resume + letter) and locked read-only. Own
// application, same rationale as the letter tests above (generation/editing
// is independent of the main lifecycle test's applicationId). ──
test("in-place text editing: resume + letter edits persist and reach the artifact; locked disables every affordance and 409s", async ({
  page,
}, testInfo) => {
  const pageErrors: unknown[] = [];
  const consoleErrors: string[] = [];
  let loggedIn = false;
  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // Same exact-match allowlist as the tests above — see that comment for
    // the full rationale of each entry.
    if (
      !loggedIn &&
      msg.text() ===
        "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
    ) {
      return;
    }
    if (
      !loggedIn &&
      msg.text() === "Failed to load resource: the server responded with a status of 409 (Conflict)"
    ) {
      return;
    }
    if (msg.text() === "Failed to load resource: net::ERR_FILE_NOT_FOUND") {
      return;
    }
    consoleErrors.push(msg.text());
  });

  await page.goto("/");
  await login(page, PASSWORD);
  loggedIn = true;
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Edit Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplicationViaUi(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);

  // (1) tailor the resume + generate the letter, so both have real, editable
  // content.
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/tailor`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Tailor", exact: true }).click(),
  ]);
  await expectCanvasPainted(page);

  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/generate-letter`) &&
        r.status() === 200,
    ),
    page.getByRole("button", { name: "Generate letter", exact: true }).click(),
  ]);
  const letterPreviewCanvas = page.locator('[data-testid="letter-preview"] canvas');
  await expectLocatorCanvasPainted(letterPreviewCanvas);

  // (2) capture the PRE-EDIT baseline for the first resume item and the
  // first letter paragraph, so the later reload assertion can prove the
  // edit is non-vacuous (a no-op would leave these identical).
  const resumeItemField = page.locator('[data-testid="resume-edit-item-0"]');
  const letterParagraphField = page.locator('[data-testid="letter-edit-paragraph-0"]');
  await expect(resumeItemField).toBeVisible();
  await expect(letterParagraphField).toBeVisible();

  const resumeBaseline = await resumeItemField.inputValue();
  const letterBaseline = await letterParagraphField.inputValue();

  const runUniqueMarker = `${runId}-${testInfo.retry}`;
  const resumeMarker = `RESUME EDIT MARKER ${runUniqueMarker}`;
  const letterMarker = `LETTER EDIT MARKER ${runUniqueMarker}`;
  const resumeEditedText = `${resumeBaseline} ${resumeMarker}`;
  const letterEditedText = `${letterBaseline} ${letterMarker}`;

  const letterPixelsBefore = await letterPreviewCanvas.evaluate((el: HTMLCanvasElement) =>
    el.toDataURL(),
  );

  // (3) type the markers in and blur (Tab) each field — the PATCH fires and
  // 200s.
  await resumeItemField.fill(resumeEditedText);
  const [resumePatchResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/resume-part`) &&
        r.request().method() === "PATCH",
    ),
    resumeItemField.press("Tab"),
  ]);
  expect(resumePatchResponse.status()).toBe(200);

  await letterParagraphField.fill(letterEditedText);
  const [letterPatchResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/letter-part`) &&
        r.request().method() === "PATCH",
    ),
    letterParagraphField.press("Tab"),
  ]);
  expect(letterPatchResponse.status()).toBe(200);

  // (4) the edited ARTIFACT reflects the edit — the letter preview's OWN
  // pdf.js-painted canvas repaints (pixel-diff), proving this isn't just a
  // stale canvas that happens to still show something.
  await expect
    .poll(() => letterPreviewCanvas.evaluate((el: HTMLCanvasElement) => el.toDataURL()), {
      timeout: 10000,
    })
    .not.toBe(letterPixelsBefore);

  // ...and the resume side: a REAL downloaded PDF (not merely "a canvas
  // painted") extracts to text containing the resume marker — same
  // extractPdfText proof the lifecycle test's (4a) step uses.
  const [resumeDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  const resumeDownloadPath = await resumeDownload.path();
  expect(resumeDownloadPath, "Download PDF must produce a real saved file").toBeTruthy();
  const resumeExtractedText = (await extractPdfText(readFileSync(resumeDownloadPath!))).join(" ");
  expect(resumeExtractedText, "the edited resume PDF must contain the marker").toContain(
    resumeMarker,
  );

  // (5) reload — the edits persist VERBATIM, and each differs from its
  // captured pre-edit baseline (non-vacuous).
  await page.reload();
  await expect(page.locator('[data-testid="resume-edit-item-0"]')).toHaveValue(resumeEditedText);
  await expect(page.locator('[data-testid="resume-edit-item-0"]')).not.toHaveValue(resumeBaseline);
  await expect(page.locator('[data-testid="letter-edit-paragraph-0"]')).toHaveValue(
    letterEditedText,
  );
  await expect(page.locator('[data-testid="letter-edit-paragraph-0"]')).not.toHaveValue(
    letterBaseline,
  );

  // (6) lock — every edit affordance disables.
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/lock`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Lock final", exact: true }).click(),
  ]);
  await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();

  // (a) the resume text-edit control.
  await expect(page.locator('[data-testid="resume-edit-item-0"]')).toBeDisabled();
  // (b) the letter text-edit control.
  await expect(page.locator('[data-testid="letter-edit-paragraph-0"]')).toBeDisabled();
  // (c) the insert button.
  await expect(page.locator('[data-testid="letter-insert-paragraph-0"]')).toBeDisabled();
  // (d) the remove button.
  await expect(page.locator('[data-testid="letter-remove-paragraph-0"]')).toBeDisabled();

  // (7) a WELL-FORMED PATCH to the (now locked) resume-part route 409s, and
  // a GET shows the row byte-unchanged by the failed attempt.
  const lockedRowBefore = await (
    await page.request.get(`/api/applications/${applicationId}`)
  ).json();

  const lockedPatchResponse = await page.request.patch(
    `/api/applications/${applicationId}/resume-part`,
    { data: { path: { kind: "summary" }, text: "must never be written — locked" } },
  );
  expect(lockedPatchResponse.status()).toBe(409);

  const lockedRowAfter = await (
    await page.request.get(`/api/applications/${applicationId}`)
  ).json();
  expect(JSON.stringify(lockedRowAfter)).toBe(JSON.stringify(lockedRowBefore));

  expect(pageErrors, `unexpected page errors: ${pageErrors.join(", ")}`).toHaveLength(0);
  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join(", ")}`).toHaveLength(0);
});

// ── T44: voice UI — capture is a byproduct of normal use (edit -> flag),
// NEVER a paste-in form. The retroactive-import path proves the ONLY door
// in: create app -> blank letter (a REAL UI click, never a DB/API backdoor)
// -> hand-author via T34's in-place letter editing -> flag -> the server's
// OWN stored text, read via a fresh (non-cache) fetch, exact-matches this
// test's own literal constant — including the server's "\n\n" part-join
// delimiter (letterProse, src/server/routes/applications.ts). ──
function voiceSpecErrorListeners(page: Page): {
  pageErrors: unknown[];
  consoleErrors: string[];
  markLoggedIn: () => void;
} {
  const pageErrors: unknown[] = [];
  const consoleErrors: string[] = [];
  let loggedIn = false;
  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // Same exact-match allowlist as the tests above: LoginForm always tries
    // POST /api/auth/setup first, which 401/409s on every test after the
    // very first one on this server (the password is already set by then)
    // before it falls back to /api/auth/login — both expected, pre-login only.
    if (
      !loggedIn &&
      msg.text() ===
        "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
    ) {
      return;
    }
    if (
      !loggedIn &&
      msg.text() === "Failed to load resource: the server responded with a status of 409 (Conflict)"
    ) {
      return;
    }
    if (msg.text() === "Failed to load resource: net::ERR_FILE_NOT_FOUND") {
      return;
    }
    consoleErrors.push(msg.text());
  });
  return {
    pageErrors,
    consoleErrors,
    markLoggedIn: () => {
      loggedIn = true;
    },
  };
}

test("retroactive import: blank letter -> hand-authored via in-place editing -> flag -> exact voice-source text (server-verified)", async ({
  page,
}, testInfo) => {
  const { pageErrors, consoleErrors, markLoggedIn } = voiceSpecErrorListeners(page);

  await page.goto("/");
  await login(page, PASSWORD);
  markLoggedIn();
  await expect(page).toHaveURL(/\/applications$/);

  const marker = `${runId}-${testInfo.retry}`;
  const company = `E2E Retro Import Co ${marker}`;
  const applicationId = await createApplicationViaUi(page, {
    company,
    jd: "Retroactive-import test JD — no tailoring happens in this test.",
  });
  await page.goto(`/applications/${applicationId}`);

  // (1) blank letter — via the actual UI affordance (data-testid
  // "create-blank-letter"), never a DB/API backdoor.
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/letter-blank`) && r.status() === 200,
    ),
    page.getByTestId("create-blank-letter").click(),
  ]);

  // (2) hand-author DISTINCTIVE whitespace/punctuation across greeting, TWO
  // body paragraphs, and closing — via T34's in-place letter editing.
  const greeting = `Dear   Hiring Team --- it's a pleasure to write (${marker})!`;
  const paragraph1 = `First:\tI've shipped systems end-to-end,\nacross a line break too (${marker}).`;
  const paragraph2 = `Second — em-dash, ellipsis... and "quoted" text (${marker}).`;
  const closing = `Warmly,\n  Jason  (${marker})`;

  await page.getByTestId("letter-edit-greeting").fill(greeting);
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/letter-part`) &&
        r.request().method() === "PATCH",
    ),
    page.getByTestId("letter-edit-greeting").press("Tab"),
  ]);

  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/letter-part/paragraph`) &&
        r.request().method() === "POST",
    ),
    page.getByTestId("letter-insert-paragraph-0").click(),
  ]);
  await page.getByTestId("letter-edit-paragraph-0").fill(paragraph1);
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/letter-part`) &&
        r.request().method() === "PATCH",
    ),
    page.getByTestId("letter-edit-paragraph-0").press("Tab"),
  ]);

  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/letter-part/paragraph`) &&
        r.request().method() === "POST",
    ),
    page.getByTestId("letter-insert-paragraph-1").click(),
  ]);
  await page.getByTestId("letter-edit-paragraph-1").fill(paragraph2);
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/letter-part`) &&
        r.request().method() === "PATCH",
    ),
    page.getByTestId("letter-edit-paragraph-1").press("Tab"),
  ]);

  await page.getByTestId("letter-edit-closing").fill(closing);
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/letter-part`) &&
        r.request().method() === "PATCH",
    ),
    page.getByTestId("letter-edit-closing").press("Tab"),
  ]);

  // (3) flag as a voice source.
  const [flagResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/flag-voice`) && r.status() === 200,
    ),
    page.getByTestId("flag-voice-letter").click(),
  ]);
  const flagged = await flagResponse.json();
  expect(flagged.kind).toBe("cover-letter");

  // (4) a FRESH server fetch (not the query cache) proves the stored text
  // exact-equals this test's own literal, joined with the server's own
  // "\n\n" delimiter (letterProse: greeting, each body paragraph, closing).
  const expectedText = [greeting, paragraph1, paragraph2, closing].join("\n\n");
  const freshProfile = await (await page.request.get("/api/profile")).json();
  const stored = freshProfile.voiceSources.find((s: { id: string }) => s.id === flagged.id);
  expect(stored, "the flagged source must be present in a fresh /api/profile fetch").toBeTruthy();
  expect(stored.text).toBe(expectedText);

  // Cleanup — voiceSources is a shared, cap-5 (server-enforced) singleton
  // list, so tests keep it net-neutral for later runs/tests rather than
  // accumulating toward the cap.
  await page.request.delete(`/api/profile/voice-sources/${stored.id}`);

  expect(pageErrors, `unexpected page errors: ${pageErrors.join(", ")}`).toHaveLength(0);
  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join(", ")}`).toHaveLength(0);
});

test("flagging a locked application's resume as a voice source is permitted: a real 200, not merely an enabled button", async ({
  page,
}, testInfo) => {
  const { pageErrors, consoleErrors, markLoggedIn } = voiceSpecErrorListeners(page);

  await page.goto("/");
  await login(page, PASSWORD);
  markLoggedIn();
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Locked Voice Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplicationViaUi(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);

  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/tailor`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Tailor", exact: true }).click(),
  ]);
  await expectCanvasPainted(page);

  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`/api/applications/${applicationId}/lock`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Lock final", exact: true }).click(),
  ]);
  await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();

  const before = await (await page.request.get("/api/profile")).json();

  // The button stays enabled on a locked app (flagging copies, never
  // edits) — but the point of this test is the CLICK's real server effect,
  // not the disabled attribute.
  await expect(page.getByTestId("flag-voice-resume")).toBeEnabled();
  const [flagResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`/api/applications/${applicationId}/flag-voice`)),
    page.getByTestId("flag-voice-resume").click(),
  ]);
  expect(flagResponse.status()).toBe(200);
  const flagged = await flagResponse.json();
  expect(flagged.kind).toBe("resume");

  const after = await (await page.request.get("/api/profile")).json();
  expect(after.voiceSources.length).toBe(before.voiceSources.length + 1);
  expect(after.voiceSources.some((s: { id: string }) => s.id === flagged.id)).toBe(true);

  await page.request.delete(`/api/profile/voice-sources/${flagged.id}`);

  expect(pageErrors, `unexpected page errors: ${pageErrors.join(", ")}`).toHaveLength(0);
  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join(", ")}`).toHaveLength(0);
});

test("deleting a voice source in Profile removes it server-side, not just from the DOM", async ({
  page,
}, testInfo) => {
  const { pageErrors, consoleErrors, markLoggedIn } = voiceSpecErrorListeners(page);

  await page.goto("/");
  await login(page, PASSWORD);
  markLoggedIn();
  await expect(page).toHaveURL(/\/applications$/);

  // Seed one voice source via the same server plumbing the earlier tests
  // drive through the UI — DELETE is what's under test here, not the flag
  // path itself.
  const marker = `DELETE-TEST-${runId}-${testInfo.retry}`;
  const seedApp = await (
    await page.request.post("/api/applications", {
      data: { jobDescription: "Delete-test seed JD." },
    })
  ).json();
  await page.request.post(`/api/applications/${seedApp.id}/letter-blank`);
  await page.request.patch(`/api/applications/${seedApp.id}/letter-part`, {
    data: { path: { kind: "greeting" }, text: marker },
  });
  const seeded = await (
    await page.request.post(`/api/applications/${seedApp.id}/flag-voice`, {
      data: { kind: "cover-letter" },
    })
  ).json();

  await page.goto("/library");
  await page.getByRole("button", { name: "Edit profile" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId(`voice-source-${seeded.id}`)).toBeVisible();
  await expect(dialog.getByTestId(`voice-source-${seeded.id}`)).toContainText(marker);

  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/profile/voice-sources/${seeded.id}`) &&
        r.request().method() === "DELETE" &&
        r.status() === 200,
    ),
    dialog.getByTestId(`delete-voice-source-${seeded.id}`).click(),
  ]);

  // Reload + a FRESH /api/profile fetch — proves this is a server-side
  // deletion, not merely an optimistic DOM removal.
  await page.reload();
  const after = await (await page.request.get("/api/profile")).json();
  expect(after.voiceSources.some((s: { id: string }) => s.id === seeded.id)).toBe(false);

  expect(pageErrors, `unexpected page errors: ${pageErrors.join(", ")}`).toHaveLength(0);
  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join(", ")}`).toHaveLength(0);
});
