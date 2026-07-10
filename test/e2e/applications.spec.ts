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
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { extractPdfText } from "../../src/client/document/extractText";
import { PRESET_MANIFESTS } from "../../src/client/document/registry";
import { letterPdfFilename } from "../../src/client/document/download";
import {
  firstRunLogin,
  login,
  createApplication,
  tailor,
  retailor,
  lockFinal,
  generateLetter,
  regenerateLetter,
  resumePreviewCanvas,
  letterPreviewCanvas,
  expectResumeCanvasPainted,
  expectLetterCanvasPainted,
  switchPreviewDoc,
  distinctColorCount,
  canvasSnapshot,
  pixelDiffFraction,
} from "./helpers/workspace";

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

// Shared "some non-white pixel exists" oracle (test/e2e/helpers/workspace.ts)
// — T24's letter-preview canvas (a DIFFERENT locator, deliberately never
// `.document-preview`, so a letter paint can't be mistaken for a resume
// paint) reuses the exact same paint check as the resume preview below via
// expectLetterCanvasPainted.
const expectCanvasPainted = expectResumeCanvasPainted;

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
  await firstRunLogin(page, PASSWORD);
  loggedIn = true;
  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.getByRole("button", { name: "New application" })).toBeVisible();

  // (2) create an Application with the exact recorded fixture JD.
  const applicationId = await createApplication(page, { company: COMPANY_MARKER, jd: JD });

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

  const tailorResponse = await tailor(page, applicationId!);
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
  const retailorResponse = await retailor(page, applicationId!);
  expect(tailorRequests).toHaveLength(2);
  expect(JSON.stringify(await retailorResponse.json())).toContain(RESUME_TOKEN);
  await expectCanvasPainted(page);

  // (7) lock final -> `locked` renders: the lock/unlock toggle (JobPanel's
  // only locked-state UI, src/client/components/JobPanel.tsx) flips to
  // "Unlock", and the resume content (still driven by `current`, which lock
  // deep-copies rather than replaces) stays visible.
  const lockResponse = await lockFinal(page, applicationId!);
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
  const applicationId = await createApplication(page, { company, role, jd: JD });
  await page.goto(`/applications/${applicationId}`);

  // (a) NO-LETTER state, before anything is generated: the Generate
  // affordance is visible AND there is no letter-preview canvas at all —
  // never a blank/empty document standing in for "not generated yet".
  await expect(page.getByRole("button", { name: "Generate letter", exact: true })).toBeVisible();
  await expect(page.getByText("No letter", { exact: true })).toBeVisible();
  expect(await letterPreviewCanvas(page).count()).toBe(0);

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
  await tailor(page, applicationId!);
  await expectCanvasPainted(page);
  await expect(page.getByText(/^Fits \d+ pages? · (comfortable|standard|compact)$/)).toBeVisible();
  const resumeCanvas = resumePreviewCanvas(page);
  const resumePixelsBefore = await waitForStableCanvas(resumeCanvas);
  const currentBefore = (
    await (await page.request.get(`/api/applications/${applicationId}`)).json()
  ).current;

  // (d) generate the letter: its OWN scope (`[data-testid="letter-preview"]`,
  // never `.document-preview`) paints, and the resume canvas is byte-for-byte
  // unchanged — proving the two documents' render pipelines are isolated.
  const generateResponse = await generateLetter(page, applicationId!, { status: 200 });
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

  // The letter lives behind the preview pane's in-pane switch (v3-T011) —
  // never mounted alongside the resume side.
  await switchPreviewDoc(page, "letter");
  await expectLetterCanvasPainted(page);
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
  // Switch back to the resume side to read its canvas — the preview pane
  // shows one document at a time (v3-T011), so the isolation proof below
  // reads whatever a fresh mount of the resume side paints, same tolerance
  // the comment above already documents for the shared-invalidation settle.
  await switchPreviewDoc(page, "resume");
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
  const regenerateResponse = await regenerateLetter(page, applicationId!, { status: 200 });
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
  const applicationId = await createApplication(page, { company, jd: unmatchedJd });
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByText("No letter", { exact: true })).toBeVisible();

  const generateResponse = await generateLetter(page, applicationId!);
  expect(generateResponse.status()).toBe(422);

  // The mutation only invalidates on success (mirrors /tailor's own
  // asymmetry) — a reload is what surfaces the server-persisted
  // `letterGenState: "failed"` in the UI, same as the lifecycle test's own
  // reload-persistence check for the resume side.
  await page.reload();
  await expect(page.getByText("Letter failed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo letter", exact: true })).toBeDisabled();
  expect(await letterPreviewCanvas(page).count()).toBe(0);
});

// ── T07 (coverage-audit repair): the spec's Phase 2 claims a typography
// change on the application format visibly re-renders the LETTER preview
// (pixel-diff, the established pattern) — this was previously only proven
// via a mocked re-render + a real letter-canvas pixel-diff on a TEXT-EDIT
// trigger (T34 below) + the RESUME typography pixel-diff (design.spec.ts /
// the lifecycle test's own (4b) step). Nothing asserted a typography change
// against the letter canvas directly. Own application, same rationale as the
// other letter tests. ──
test("cover letter: a typography format change re-renders the letter preview (pixel-diff)", async ({
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

  const company = `E2E Letter Typography Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);

  // (1) tailor the resume + generate the letter, so the letter preview has
  // real, painted content.
  await tailor(page, applicationId!);
  await expectCanvasPainted(page);

  await generateLetter(page, applicationId!, { status: 200 });

  // The letter lives behind the preview pane's in-pane switch (v3-T011).
  await switchPreviewDoc(page, "letter");

  // (2) the before-capture must be of a PAINTED (non-blank) letter canvas —
  // proves the diff below is real content changing, not a blank canvas
  // trivially differing from itself.
  const letterCanvas = letterPreviewCanvas(page);
  await expectLetterCanvasPainted(page);
  const letterBefore = await letterCanvas.evaluate((el: HTMLCanvasElement) => el.toDataURL());

  // (3) the ONLY change between captures: a DesignPanel typography control
  // (Body font), mirroring design.spec.ts's own body-font change — never a
  // letter regenerate, never a text edit. The application format PUT is the
  // one shared axis both the resume preview AND the letter preview
  // (ApplicationDetail.tsx, both driven by the same `resolvedFormat`) read.
  const applicationPut = (r: import("@playwright/test").Response) =>
    r.url().endsWith(`/api/applications/${applicationId}`) && r.request().method() === "PUT";

  await page.getByRole("combobox", { name: "Body font" }).click();
  const [fontPutResponse] = await Promise.all([
    page.waitForResponse(applicationPut),
    page.getByRole("option", { name: "Arimo (Arial)" }).click(),
  ]);
  expect(fontPutResponse.status()).toBe(200);
  expect((await fontPutResponse.json()).format.fonts.body).toBe("arimo");

  // (4) the LETTER canvas — not the resume `.document-preview` canvas —
  // repaints in response to that typography-only change.
  await expect
    .poll(() => letterCanvas.evaluate((el: HTMLCanvasElement) => el.toDataURL()), {
      timeout: 15000,
    })
    .not.toBe(letterBefore);

  expect(pageErrors, `unexpected page errors: ${pageErrors.join(", ")}`).toHaveLength(0);
  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join(", ")}`).toHaveLength(0);
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
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);

  // (1) tailor the resume + generate the letter, so both have real, editable
  // content.
  await tailor(page, applicationId!);
  await expectCanvasPainted(page);

  await generateLetter(page, applicationId!, { status: 200 });
  // The letter side lives behind the preview pane's in-pane switch
  // (v3-T011) — never mounted alongside the resume side.
  await switchPreviewDoc(page, "letter");
  const letterCanvas = letterPreviewCanvas(page);
  await expectLetterCanvasPainted(page);

  // (2) capture the PRE-EDIT baseline for the first resume item and the
  // first letter paragraph, so the later reload assertion can prove the
  // edit is non-vacuous (a no-op would leave these identical). Each field
  // only mounts while its own side of the preview switch is active.
  const letterParagraphField = page.locator('[data-testid="letter-edit-paragraph-0"]');
  await expect(letterParagraphField).toBeVisible();
  const letterBaseline = await letterParagraphField.inputValue();
  const letterPixelsBefore = await letterCanvas.evaluate((el: HTMLCanvasElement) => el.toDataURL());

  await switchPreviewDoc(page, "resume");
  const resumeItemField = page.locator('[data-testid="resume-edit-item-0"]');
  await expect(resumeItemField).toBeVisible();
  const resumeBaseline = await resumeItemField.inputValue();

  const runUniqueMarker = `${runId}-${testInfo.retry}`;
  const resumeMarker = `RESUME EDIT MARKER ${runUniqueMarker}`;
  const letterMarker = `LETTER EDIT MARKER ${runUniqueMarker}`;
  const resumeEditedText = `${resumeBaseline} ${resumeMarker}`;
  const letterEditedText = `${letterBaseline} ${letterMarker}`;

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

  await switchPreviewDoc(page, "letter");
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
    .poll(() => letterCanvas.evaluate((el: HTMLCanvasElement) => el.toDataURL()), {
      timeout: 10000,
    })
    .not.toBe(letterPixelsBefore);

  // ...and the resume side: a REAL downloaded PDF (not merely "a canvas
  // painted") extracts to text containing the resume marker — same
  // extractPdfText proof the lifecycle test's (4a) step uses. Download PDF
  // is an editor-pane control, reachable regardless of which preview tab is
  // active.
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
  // captured pre-edit baseline (non-vacuous). The preview pane resets to its
  // default (resume) tab on reload.
  await page.reload();
  await expect(page.locator('[data-testid="resume-edit-item-0"]')).toHaveValue(resumeEditedText);
  await expect(page.locator('[data-testid="resume-edit-item-0"]')).not.toHaveValue(resumeBaseline);

  await switchPreviewDoc(page, "letter");
  await expect(page.locator('[data-testid="letter-edit-paragraph-0"]')).toHaveValue(
    letterEditedText,
  );
  await expect(page.locator('[data-testid="letter-edit-paragraph-0"]')).not.toHaveValue(
    letterBaseline,
  );

  // (6) lock — every edit affordance disables.
  await lockFinal(page, applicationId!);
  await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();

  // (b) the letter text-edit control (still on the letter tab from above).
  await expect(page.locator('[data-testid="letter-edit-paragraph-0"]')).toBeDisabled();
  // (c) the insert button.
  await expect(page.locator('[data-testid="letter-insert-paragraph-0"]')).toBeDisabled();
  // (d) the remove button.
  await expect(page.locator('[data-testid="letter-remove-paragraph-0"]')).toBeDisabled();

  // (a) the resume text-edit control.
  await switchPreviewDoc(page, "resume");
  await expect(page.locator('[data-testid="resume-edit-item-0"]')).toBeDisabled();

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
  const applicationId = await createApplication(page, {
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

  // The letter's in-place editor fields live behind the preview pane's
  // in-pane switch (v3-T011) — never mounted alongside the resume side.
  await switchPreviewDoc(page, "letter");

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
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);

  await tailor(page, applicationId!);
  await expectCanvasPainted(page);

  await lockFinal(page, applicationId!);
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

// ── v3-T011: WorkspaceShell wiring for /applications/:id — editor + preview
// co-visible at desktop width, drawer-collapsed below it, and never modal.
// Own applications, same rationale as the letter tests above. ──

// Both the box lookup AND the occlusion check are polled: a preview-pane
// document mid-switch can transiently re-mount (usePDF's loading -> ready
// cycle, same "1-2 benign settle cycles" already documented above for the
// resume/letter isolation checks), during which boundingBox() can briefly
// return null or a stale element can fail elementFromPoint — polling until
// BOTH settle is what makes this assertion about the final, stable layout
// rather than an accidental mid-transition frame.
async function assertUnoccluded(locator: Locator): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  let box: { x: number; y: number; width: number; height: number } | null = null;
  let unoccluded = false;
  await expect
    .poll(
      async () => {
        box = await locator.boundingBox();
        if (!box) return false;
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        unoccluded = await locator.evaluate(
          (el, point) => {
            const hit = document.elementFromPoint(point.cx, point.cy);
            return hit !== null && (hit === el || el.contains(hit));
          },
          { cx, cy },
        );
        return unoccluded;
      },
      { timeout: 10000 },
    )
    .toBe(true);
  expect(box, "element must have a real layout box").toBeTruthy();
  expect(
    unoccluded,
    "the element's own bbox center must resolve to itself or a descendant — no occluding overlay",
  ).toBe(true);
  return box!;
}

test("WorkspaceShell (protocol C): editor + preview panes are co-visible and unoccluded at 1280px, and switching the preview's resume/letter tab never remounts the editor pane", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Covis Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId!);
  await expectCanvasPainted(page);
  await generateLetter(page, applicationId!, { status: 200 });

  const editorPane = page.getByTestId("editor-pane");

  async function assertCoVisible(
    canvas: Locator,
    expectPainted: () => Promise<void>,
  ): Promise<void> {
    // Wait for a genuinely painted, settled canvas BEFORE snapshotting its
    // box/pixels below — a freshly (re)mounted preview briefly shows a
    // loading placeholder or a not-yet-painted canvas first.
    await expectPainted();
    await expect(editorPane).toBeInViewport({ ratio: 0.9 });
    await expect(canvas).toBeInViewport({ ratio: 0.9 });
    await assertUnoccluded(editorPane);
    const canvasBox = await assertUnoccluded(canvas);
    expect(canvasBox.width).toBeGreaterThanOrEqual(320);
    await expect.poll(() => distinctColorCount(canvas), { timeout: 10000 }).toBeGreaterThan(1);
  }

  // RESUME is the default active document.
  await assertCoVisible(resumePreviewCanvas(page), () => expectCanvasPainted(page));

  // Mark the editor-pane's own DOM node — surviving the switch below (rather
  // than a fresh node coming back with no marker) is the proof the switch is
  // in-pane, not a remount of the whole surface.
  await editorPane.evaluate((el) => {
    (el as unknown as Record<string, string>).__t011EditorMarker = "same-node";
  });

  await switchPreviewDoc(page, "letter");
  await assertCoVisible(letterPreviewCanvas(page), () => expectLetterCanvasPainted(page));

  const markerSurvived = await editorPane.evaluate(
    (el) => (el as unknown as Record<string, string>).__t011EditorMarker === "same-node",
  );
  expect(markerSurvived, "switching the preview's doc must not remount the editor pane").toBe(true);
});

test("WorkspaceShell (protocol B): the surface stays non-modal — no aria-modal/backdrop overlay, and an underlying editor control stays genuinely clickable — at 1280px and in the below-1280 drawer-open state", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Modality Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId!);
  await expectCanvasPainted(page);

  async function assertNonModal(): Promise<void> {
    expect(await page.locator('[aria-modal="true"]').count()).toBe(0);

    // Scoped to OVERLAY-shaped elements (fixed/absolute positioned) — a
    // normal in-flow content pane (e.g. editor-pane) legitimately fills a
    // large share of the layout, and that's not what "modal" means here
    // (CLAUDE.md's modality ban is about backdrops/overlays, never plain
    // document flow).
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

    // A real, un-forced click on an underlying editor control succeeds: a
    // genuine browser download is the observable side effect, proving
    // nothing invisible is intercepting the click.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Plain text" }).click(),
    ]);
    expect(download.suggestedFilename()).toBeTruthy();
  }

  // At 1280px (editor + preview co-visible, no drawer involved).
  await assertNonModal();

  // In the below-1280 drawer-OPEN state.
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.getByRole("button", { name: "Show preview" }).click();
  await expect(page.getByTestId("preview-pane")).toBeVisible();
  await assertNonModal();
});

test("WorkspaceShell drawer: below 1280px the preview pane starts non-co-visible (closed), and the toggle reveals a real painted canvas", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Drawer Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId!);

  // Drawer closed by default below 1280 — the preview pane (and whatever
  // canvas it hosts) is not visible/co-visible at all.
  const previewPane = page.getByTestId("preview-pane");
  await expect(previewPane).toBeHidden();
  await expect(page.getByRole("button", { name: "Show preview" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  // Activate the drawer — the resume canvas becomes visible and genuinely
  // painted (non-uniform pixels), not just present-but-blank.
  await page.getByRole("button", { name: "Show preview" }).click();
  await expect(previewPane).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide preview" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  const canvas = resumePreviewCanvas(page);
  await expectResumeCanvasPainted(page);
  await expect.poll(() => distinctColorCount(canvas), { timeout: 10000 }).toBeGreaterThan(1);
});

// ── v3-T013: rail-driven navigation + collapse over the editor pane's three
// sections (Job details / Cover letter / Design — WORKSPACE_SECTIONS in
// ApplicationDetail.tsx). Own applications, same rationale as the
// WorkspaceShell tests above. ──

test("rail nav (v3-T013): activating an out-of-view section scrolls/focuses its heading without touching the URL, remounting the preview, or repainting it", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Rail Nav Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId);
  await expectCanvasPainted(page);

  const canvas = resumePreviewCanvas(page);
  const canvasBefore = await canvasSnapshot(canvas);

  // Mark the canvas's own DOM node — surviving the nav click below (rather
  // than a fresh node with no marker) is the proof nav is a pure scroll/
  // focus, never a remount of the preview.
  await canvas.evaluate((el) => {
    (el as unknown as Record<string, string>).__t013CanvasMarker = "same-node";
  });

  // Design is the LAST of the three editor sections — with the editor
  // pane scrolled to its top, its heading starts below the fold (out of
  // the page viewport) without any extra scrolling.
  const editorPane = page.getByTestId("editor-pane");
  await editorPane.evaluate((el) => {
    el.scrollTop = 0;
  });
  const designHeading = page.getByTestId("workspace-section-heading-design");
  await expect(designHeading).not.toBeInViewport();

  const urlBefore = page.url();

  await page.getByTestId("rail-nav-design").click();

  // Positive: the heading is unconditionally in the viewport. Since nav
  // also focuses it, activeElement is this same heading — which must be
  // visible too (it always is: collapse only folds `children`, never the
  // heading itself).
  await expect(designHeading).toBeInViewport();
  await expect(designHeading).toBeVisible();
  const activeTestId = await page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? null,
  );
  expect(activeTestId).toBe("workspace-section-heading-design");

  expect(page.url()).toBe(urlBefore);

  const markerSurvived = await canvas.evaluate(
    (el) => (el as unknown as Record<string, string>).__t013CanvasMarker === "same-node",
  );
  expect(markerSurvived, "rail nav must not remount the preview canvas").toBe(true);

  const canvasAfter = await canvasSnapshot(canvas);
  expect(canvasAfter, "rail nav must not repaint/disrupt the preview").toBe(canvasBefore);
});

test("rail collapse (v3-T013, protocol E): folding a section is local view-state only — zero application/settings network writes, a localStorage collapse key, a pixel-identical preview, and untouched settings.layout/application.format", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Rail Collapse Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId);
  await expectCanvasPainted(page);

  const applicationBefore = await (
    await page.request.get(`/api/applications/${applicationId}`)
  ).json();
  const settingsBefore = await (await page.request.get("/api/settings")).json();

  const canvas = resumePreviewCanvas(page);
  const canvasBefore = await canvasSnapshot(canvas);

  const writes: string[] = [];
  page.on("request", (req) => {
    const method = req.method();
    const url = req.url();
    if (
      (method === "PUT" || method === "PATCH" || method === "POST") &&
      (/\/api\/applications\//.test(url) || /\/api\/settings/.test(url))
    ) {
      writes.push(`${method} ${url}`);
    }
  });

  const letterBody = page.getByTestId("workspace-section-body-letter");
  await expect(letterBody).toBeVisible();

  await page.getByTestId("rail-collapse-letter").click();

  await expect(letterBody).toBeHidden();
  await expect(page.getByTestId("rail-collapse-letter")).toHaveAttribute("aria-expanded", "false");

  // The toggle's own handler is synchronous (setState + a localStorage
  // write) — this beat is only to let an ACCIDENTAL fire-and-forget
  // request surface before asserting zero, not to await a legitimate one.
  await page.waitForTimeout(300);
  expect(writes, "collapsing a section must never write to the server").toEqual([]);

  const storageValue = await page.evaluate(
    (id) => window.localStorage.getItem(`lede.workspace.sectionCollapse.${id}`),
    applicationId,
  );
  expect(storageValue, "collapse state must be persisted to localStorage").toBeTruthy();
  expect(JSON.parse(storageValue!)).toMatchObject({ letter: true });

  const canvasAfter = await canvasSnapshot(canvas);
  expect(canvasAfter, "collapsing an editor section must not disrupt the preview").toBe(
    canvasBefore,
  );

  const applicationAfter = await (
    await page.request.get(`/api/applications/${applicationId}`)
  ).json();
  const settingsAfter = await (await page.request.get("/api/settings")).json();
  expect(applicationAfter.format, "collapse must never mutate the application's format").toEqual(
    applicationBefore.format,
  );
  expect(settingsAfter.layout, "collapse must never mutate settings.layout").toEqual(
    settingsBefore.layout,
  );
});

// ── T014: inline-edit-reaches-document contrast + application behavior
// sweep on the WorkspaceShell surface (closes Phase 1). Own applications,
// same rationale as the tests above. ──

// Scoped to OVERLAY-shaped elements (fixed/absolute positioned), same
// definition of "modal" as the protocol-B test above (CLAUDE.md's modality
// ban is about backdrops/overlays, never plain document flow) — duplicated
// here (rather than importing that test's local function) because it needs
// to run WHILE an inline editor is focused/mid-edit, not just before/after.
async function assertNoModalOverlay(page: Page): Promise<void> {
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

// 0.2% of the canvas's pixels — a cursor blink or a toast moves a handful of
// pixels (a small fraction of a percent on a ~1000x1000+ px pdf.js canvas);
// a sentinel long enough to force real rendered text changes many times
// that many. Un-gameable: "any diff" would also pass for a blink; this floor
// would not.
const CANVAS_DIFF_FLOOR = 0.002;

test("in-place edits reach the document: sentinel text is exportable AND the preview canvas changes by more than a floor magnitude — not merely 'any diff'; modality holds mid-edit", async ({
  page,
}, testInfo) => {
  const { pageErrors, consoleErrors, markLoggedIn } = voiceSpecErrorListeners(page);

  await page.goto("/");
  await login(page, PASSWORD);
  markLoggedIn();
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Contrast Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);

  await tailor(page, applicationId!);
  await expectCanvasPainted(page);
  await generateLetter(page, applicationId!, { status: 200 });

  // Every token stays short (<20 chars) — a long UNBROKEN token (e.g. the
  // whole marker glued to the run id with no spaces) can get force-wrapped
  // by the PDF renderer's line-fill with an inserted hyphen, which would
  // split the literal substring this test looks for. Spacing the id out
  // into its own short token avoids that without weakening distinctiveness.
  const resumeSentinel = `zqxresumesentinel ${runId} retry${testInfo.retry} repositioning judgment engineered directly for this exact requisition end to end`;
  const letterSentinel = `zqxlettersentinel ${runId} retry${testInfo.retry} a hand authored line proving this exact paragraph reached the rendered artifact`;

  // ── Resume side ──
  const resumeCanvas = resumePreviewCanvas(page);
  await expectResumeCanvasPainted(page);
  const resumeBefore = await canvasSnapshot(resumeCanvas);

  const resumeItemField = page.locator('[data-testid="resume-edit-item-0"]');
  await expect(resumeItemField).toBeVisible();
  const resumeBaseline = await resumeItemField.inputValue();
  await resumeItemField.fill(`${resumeBaseline} ${resumeSentinel}`);

  // Modality asserted WHILE mid-edit — the field is focused/dirty, not yet
  // blurred/persisted.
  await expect(resumeItemField).toBeFocused();
  await assertNoModalOverlay(page);

  const [resumePatchResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/resume-part`) &&
        r.request().method() === "PATCH",
    ),
    resumeItemField.press("Tab"),
  ]);
  expect(resumePatchResponse.status()).toBe(200);

  // (a) the un-gameable half: a REAL plain-text export contains the sentinel
  // verbatim.
  const [textDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Plain text" }).click(),
  ]);
  const textPath = await textDownload.path();
  expect(textPath, "Plain text must produce a real saved file").toBeTruthy();
  const exportedText = readFileSync(textPath!, "utf-8");
  expect(exportedText, "the plain-text export must contain the resume sentinel").toContain(
    resumeSentinel,
  );

  // (b) magnitude proof: the canvas changed by more than CANVAS_DIFF_FLOOR —
  // not merely "some" diff, which a cursor blink or a toast would also
  // produce.
  const resumeDiffFraction = await pixelDiffFraction(resumeCanvas, resumeBefore);
  expect(
    resumeDiffFraction,
    `resume canvas must change by more than ${CANVAS_DIFF_FLOOR * 100}% of its pixels (got ${resumeDiffFraction})`,
  ).toBeGreaterThan(CANVAS_DIFF_FLOOR);

  // ── Letter side ──
  await switchPreviewDoc(page, "letter");
  const letterCanvas = letterPreviewCanvas(page);
  await expectLetterCanvasPainted(page);
  const letterBefore = await canvasSnapshot(letterCanvas);

  const letterParagraphField = page.locator('[data-testid="letter-edit-paragraph-0"]');
  await expect(letterParagraphField).toBeVisible();
  const letterBaseline = await letterParagraphField.inputValue();
  await letterParagraphField.fill(`${letterBaseline} ${letterSentinel}`);

  await expect(letterParagraphField).toBeFocused();
  await assertNoModalOverlay(page);

  const [letterPatchResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}/letter-part`) &&
        r.request().method() === "PATCH",
    ),
    letterParagraphField.press("Tab"),
  ]);
  expect(letterPatchResponse.status()).toBe(200);

  // (a) the letter's own prose/download: a real downloaded cover-letter PDF
  // extracts to text containing the sentinel.
  const [letterDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download cover letter" }).click(),
  ]);
  const letterDownloadPath = await letterDownload.path();
  expect(letterDownloadPath, "Download cover letter must produce a real saved file").toBeTruthy();
  const letterExtractedText = (await extractPdfText(readFileSync(letterDownloadPath!))).join(" ");
  expect(letterExtractedText, "the cover-letter PDF must contain the letter sentinel").toContain(
    letterSentinel,
  );

  // (b) magnitude proof, letter canvas.
  const letterDiffFraction = await pixelDiffFraction(letterCanvas, letterBefore);
  expect(
    letterDiffFraction,
    `letter canvas must change by more than ${CANVAS_DIFF_FLOOR * 100}% of its pixels (got ${letterDiffFraction})`,
  ).toBeGreaterThan(CANVAS_DIFF_FLOOR);

  expect(pageErrors, `unexpected page errors: ${pageErrors.join(", ")}`).toHaveLength(0);
  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join(", ")}`).toHaveLength(0);
});

test("locked sweep (protocol D): every edit affordance individually disabled/409'd by name; design read-only, motivation and voice-flag still work, motivation persists across reload", async ({
  page,
}, testInfo) => {
  const { pageErrors, consoleErrors, markLoggedIn } = voiceSpecErrorListeners(page);

  await page.goto("/");
  await login(page, PASSWORD);
  markLoggedIn();
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Locked Sweep Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);

  await tailor(page, applicationId!);
  await expectCanvasPainted(page);
  await generateLetter(page, applicationId!, { status: 200 });

  await lockFinal(page, applicationId!);
  await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();

  // (1) resume item edit — disabled (real attribute, not CSS-only) AND its
  // route 409s on a direct, well-formed attempt.
  await expect(page.locator('[data-testid="resume-edit-item-0"]')).toBeDisabled();
  const resumePatchLocked = await page.request.patch(
    `/api/applications/${applicationId}/resume-part`,
    { data: { path: { kind: "summary" }, text: "must never be written — locked sweep" } },
  );
  expect(resumePatchLocked.status(), "resume-part must 409 while locked").toBe(409);

  // (2) letter edit — its field only mounts on the letter side of the
  // preview switch — disabled AND its route 409s.
  await switchPreviewDoc(page, "letter");
  await expect(page.locator('[data-testid="letter-edit-paragraph-0"]')).toBeDisabled();
  const letterPatchLocked = await page.request.patch(
    `/api/applications/${applicationId}/letter-part`,
    {
      data: {
        path: { kind: "body", index: 0 },
        text: "must never be written — locked sweep",
      },
    },
  );
  expect(letterPatchLocked.status(), "letter-part must 409 while locked").toBe(409);

  // (3) design axis control — a real disabled attribute, enumerated here
  // alongside the other affordances on this SAME locked application (already
  // covered in depth by design.spec.ts's own dedicated locked test).
  await expect(page.getByRole("combobox", { name: "Body font" })).toBeDisabled();

  // (4) motivation — not a document-editing affordance (it only guides a
  // FUTURE letter generation, itself locked-blocked via Generate/Regenerate);
  // stays editable on a locked application, its PUT still 200s, and it
  // persists across reload.
  const motivationText = `Locked-sweep motivation ${runId}-${testInfo.retry}`;
  await page.getByLabel("Motivation", { exact: true }).fill(motivationText);
  const [motivationPut] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/applications/${applicationId}`) && r.request().method() === "PUT",
    ),
    page.getByRole("button", { name: "Save", exact: true }).click(),
  ]);
  expect(motivationPut.status(), "motivation must still WORK (200) on a locked application").toBe(
    200,
  );

  // Reload — JobPanel's OWN accordion (independent of the rail's outer
  // section collapse) defaults to collapsed once `application.current`
  // exists, so a fresh mount post-reload needs it re-expanded before the
  // field is reachable.
  await page.reload();
  // Scoped to the section body — "Job details" also names the rail's own
  // nav/collapse buttons (a different accordion entirely), which would
  // otherwise collide with JobPanel's own internal toggle here.
  const jobDetailsToggle = page
    .getByTestId("workspace-section-body-job")
    .getByRole("button", { name: "Job details", exact: true });
  if ((await jobDetailsToggle.getAttribute("aria-expanded")) === "false") {
    await jobDetailsToggle.click();
  }
  await expect(page.getByLabel("Motivation", { exact: true })).toHaveValue(motivationText);

  // (5) voice-flag — must still WORK when locked (a real 200), not merely an
  // enabled button. The full server-side round trip (profile.voiceSources
  // before/after) is already covered by the dedicated "flagging a locked
  // application's resume..." test above; this is this sweep's own
  // per-affordance entry, cleaned up immediately after (shared, cap-5
  // singleton).
  await expect(page.getByTestId("flag-voice-resume")).toBeEnabled();
  const [flagResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`/api/applications/${applicationId}/flag-voice`)),
    page.getByTestId("flag-voice-resume").click(),
  ]);
  expect(flagResponse.status(), "voice-flag must still WORK (200) on a locked application").toBe(
    200,
  );
  const flagged = await flagResponse.json();
  await page.request.delete(`/api/profile/voice-sources/${flagged.id}`);

  expect(pageErrors, `unexpected page errors: ${pageErrors.join(", ")}`).toHaveLength(0);
  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join(", ")}`).toHaveLength(0);
});

// ── T020: de-modal NewApplication ── the create panel on the /applications
// list page is now a non-modal role="dialog" (Radix `modal={false}`, no
// DialogPortal/overlay — src/client/components/NewApplication.tsx), not the
// former modal Dialog. Reuses assertNoModalOverlay (the same aria-modal +
// oversized-fixed/absolute-overlay check the WorkspaceShell protocol-B test
// above already established as this repo's definition of "non-modal").
test("NewApplication (v3-T020): the create panel is non-modal, the underlying list stays clickable, focus opens into the panel, and Escape returns focus to the trigger", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  // A background application gives a real underlying list control to click
  // while the panel is open — it lands in the grid's first (leftmost) cell,
  // which a right-anchored dropdown panel off the header's "New
  // application" button can never cover.
  const backgroundCompany = `E2E T020 Background Co ${runId}-${testInfo.retry}`;
  await createApplication(page, { company: backgroundCompany, jd: JD });

  const trigger = page.getByRole("button", { name: "New application" });
  await trigger.click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();

  // Modality ban: no aria-modal, no oversized fixed/absolute overlay.
  await assertNoModalOverlay(page);

  // Focus opens INTO the panel (the first field), not left on the trigger.
  await expect(page.getByLabel(/^Company/)).toBeFocused();

  // The underlying list stays genuinely interactive: a real, un-forced
  // click on the background card navigates (react-router Link) — proof
  // nothing invisible intercepts it, not merely that the element "exists".
  const backgroundCard = page
    .locator("[data-application-id]")
    .filter({ hasText: backgroundCompany });
  await backgroundCard.click();
  await expect(page).toHaveURL(/\/applications\/[^/]+$/);

  // Back to the list: reopening then pressing Escape closes the panel AND
  // returns focus to the invoking trigger control.
  await page.goBack();
  await expect(page).toHaveURL(/\/applications$/);
  await trigger.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
});

// ── T030 (Phase 3, OQ4a): card dashboard content — the list's GEN_STATE
// LABEL text this pill-contrast check reads against, mirrored here (not
// imported) so this spec exercises the same accessible text a real user
// sees rather than reaching into GenStateBadge.tsx's internals.
const RESUME_STATE_LABEL: Record<string, string> = {
  untailored: "Untailored",
  tailoring: "Tailoring…",
  tailored: "Tailored",
  failed: "Failed",
};
const LETTER_STATE_LABEL: Record<string, string> = {
  untailored: "No letter",
  tailoring: "Generating…",
  tailored: "Letter ready",
  failed: "Letter failed",
};

test("dashboard card content (T030, OQ4a): resume pills differ and match server genState; the locked badge appears only on a locked app; the letter pill appears iff a letter exists", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const marker = `${runId}-${testInfo.retry}`;
  const untailoredCompany = `E2E T030 Untailored Co ${marker}`;
  const tailoredCompany = `E2E T030 Tailored Co ${marker}`;

  // (1) one application left untailored, one driven to tailored + locked +
  // a generated letter — the three axes this ticket's card content covers.
  const untailoredId = await createApplication(page, { company: untailoredCompany, jd: JD });
  const tailoredId = await createApplication(page, { company: tailoredCompany, jd: JD });

  await page.goto(`/applications/${tailoredId}`);
  await tailor(page, tailoredId);
  await expectCanvasPainted(page);
  await generateLetter(page, tailoredId, { status: 200 });
  await lockFinal(page, tailoredId);
  await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();

  // (2) server-side truth for both rows, read via the LIST endpoint itself
  // (the CO-1 projection under test) — never the detail route.
  const listRows = await (await page.request.get("/api/applications")).json();
  const untailoredRow = listRows.find((r: { id: string }) => r.id === untailoredId);
  const tailoredRow = listRows.find((r: { id: string }) => r.id === tailoredId);
  expect(untailoredRow.genState).toBe("untailored");
  expect(untailoredRow.letterGenState).toBe("untailored");
  expect(untailoredRow.locked).toBe(false);
  expect(tailoredRow.genState).toBe("tailored");
  expect(tailoredRow.letterGenState).toBe("tailored");
  expect(tailoredRow.locked).toBe(true);

  // (3) back on the list — each card's resume pill DIFFERS and matches its
  // own row's server genState (never hardcoded/swapped).
  await page.goto("/applications");
  const untailoredCard = page
    .locator("[data-application-id]")
    .filter({ hasText: untailoredCompany });
  const tailoredCard = page.locator("[data-application-id]").filter({ hasText: tailoredCompany });
  await expect(untailoredCard).toBeVisible();
  await expect(tailoredCard).toBeVisible();

  const untailoredLabel = RESUME_STATE_LABEL[untailoredRow.genState]!;
  const tailoredLabel = RESUME_STATE_LABEL[tailoredRow.genState]!;
  expect(untailoredLabel).not.toBe(tailoredLabel);
  expect(Object.values(RESUME_STATE_LABEL)).toContain(untailoredLabel);
  expect(Object.values(RESUME_STATE_LABEL)).toContain(tailoredLabel);

  await expect(untailoredCard.getByText(untailoredLabel, { exact: true })).toBeVisible();
  await expect(untailoredCard.getByText(tailoredLabel, { exact: true })).toHaveCount(0);
  await expect(tailoredCard.getByText(tailoredLabel, { exact: true })).toBeVisible();
  await expect(tailoredCard.getByText(untailoredLabel, { exact: true })).toHaveCount(0);

  // (4) locked badge: present on the locked app's card, absent on the
  // unlocked one.
  await expect(tailoredCard.getByText("Locked", { exact: true })).toBeVisible();
  await expect(untailoredCard.getByText("Locked", { exact: true })).toHaveCount(0);

  // (5) letter pill: present (its "letter exists" label) on the app with a
  // generated letter, absent entirely on the one that never generated one —
  // "untailored" letterGenState renders NO letter pill at all (never a
  // visible "No letter" pill on the card).
  const letterReadyLabel = LETTER_STATE_LABEL.tailored!;
  await expect(tailoredCard.getByText(letterReadyLabel, { exact: true })).toBeVisible();
  for (const label of Object.values(LETTER_STATE_LABEL)) {
    await expect(untailoredCard.getByText(label, { exact: true })).toHaveCount(0);
  }

  // NOT A TRACKER (scope tripwire): no hiring-status vocabulary anywhere on
  // the list, regardless of gen/locked/letter state.
  const html = (await page.locator("body").innerText()).toString();
  for (const forbidden of ["Applied", "Interviewing", "Offer", "Rejected"]) {
    expect(html).not.toContain(forbidden);
  }
});

// ── T031 (Phase 3, OQ4b): dashboard quick actions — open/duplicate/delete/
// download, all client-only against EXISTING routes (duplicate is CO-2's new
// one, server-verified below same as delete). ──
test("dashboard quick actions (T031, OQ4b): open routes to the workspace; duplicate/delete are server-verified; download produces a real PDF; disabled states match document existence", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const marker = `${runId}-${testInfo.retry}`;
  const untailoredCompany = `E2E T031 Untailored Co ${marker}`;
  const readyCompany = `E2E T031 Ready Co ${marker}`;

  // (1) one application left untailored (proves the download-disabled case
  // and is the one this test deletes), one driven to tailored + letter +
  // locked (proves the download-enabled case and is the one this test
  // duplicates).
  const untailoredId = await createApplication(page, { company: untailoredCompany, jd: JD });
  const readyId = await createApplication(page, { company: readyCompany, jd: JD });

  await page.goto(`/applications/${readyId}`);
  await tailor(page, readyId);
  await expectCanvasPainted(page);
  await generateLetter(page, readyId, { status: 200 });
  await lockFinal(page, readyId);
  await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();

  await page.goto("/applications");
  let untailoredCard = page.locator("[data-application-id]").filter({ hasText: untailoredCompany });
  let readyCard = page.locator("[data-application-id]").filter({ hasText: readyCompany });
  await expect(untailoredCard).toBeVisible();
  await expect(readyCard).toBeVisible();

  // (2) OPEN — routes to the workspace; the shell is visible.
  await untailoredCard.getByTestId("application-card-open").click();
  await expect(page).toHaveURL(new RegExp(`/applications/${untailoredId}$`));
  await expect(page.getByTestId("workspace-shell")).toBeVisible();
  await page.goto("/applications");
  untailoredCard = page.locator("[data-application-id]").filter({ hasText: untailoredCompany });
  readyCard = page.locator("[data-application-id]").filter({ hasText: readyCompany });

  // (3) DOWNLOAD disabled/enabled states match document existence — the
  // untailored app has no resume/letter at all; the ready app has both.
  await expect(untailoredCard.getByTestId("application-card-download")).toBeDisabled();
  await expect(readyCard.getByTestId("application-card-download")).toBeEnabled();

  // (4) DOWNLOAD — a real browser download event, a non-empty file that is
  // an actual PDF (starts with the %PDF magic bytes), client-rendered via
  // @react-pdf/renderer from the fetched full record (never the list's
  // heavy-snapshot-omitting summary).
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    readyCard.getByTestId("application-card-download").click(),
  ]);
  const downloadPath = await download.path();
  expect(downloadPath, "Download must produce a real saved file").toBeTruthy();
  const pdfBytes = readFileSync(downloadPath!);
  expect(pdfBytes.length).toBeGreaterThan(0);
  expect(pdfBytes.subarray(0, 4).toString("latin1")).toBe("%PDF");

  // (5) DELETE — inline two-step confirm (a single button toggling
  // label/variant, never a modal): arming it holds the modality checks
  // (zero aria-modal, no >50% overlay), and only the SECOND click actually
  // deletes. A fresh GET /api/applications shows the id gone.
  const deleteButton = untailoredCard.getByTestId("application-card-delete");
  await deleteButton.click();
  await expect(deleteButton).toHaveText("Confirm delete");
  await assertNoModalOverlay(page);
  await deleteButton.click();
  await expect(untailoredCard).toHaveCount(0);

  const afterDelete = (await (await page.request.get("/api/applications")).json()) as Array<{
    id: string;
  }>;
  expect(afterDelete.some((a) => a.id === untailoredId)).toBe(false);

  // (6) DUPLICATE — existing-route semantics (CO-2), verified server-side: a
  // fresh GET returns n+1 including the new id, and the new row's
  // genState/locked/letterGenState match the source's (the full-copy proof).
  const beforeDup = (await (await page.request.get("/api/applications")).json()) as Array<{
    id: string;
  }>;
  await readyCard.getByTestId("application-card-duplicate").click();
  await expect
    .poll(async () => (await (await page.request.get("/api/applications")).json()).length)
    .toBe(beforeDup.length + 1);

  const afterDup = (await (await page.request.get("/api/applications")).json()) as Array<{
    id: string;
    genState: string;
    locked: boolean;
    letterGenState: string;
  }>;
  const beforeIds = new Set(beforeDup.map((a) => a.id));
  const newRow = afterDup.find((a) => !beforeIds.has(a.id));
  expect(newRow, "duplicate must appear as a new row in the list").toBeTruthy();
  expect(newRow!.genState).toBe("tailored");
  expect(newRow!.locked).toBe(true);
  expect(newRow!.letterGenState).toBe("tailored");
});
