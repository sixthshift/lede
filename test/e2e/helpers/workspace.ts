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

// ── Create application ── the "New application" -> dialog -> fill -> submit
// flow, identical across every call site (the main lifecycle test, T24's
// letter tests, and design.spec.ts's own setup).
export interface CreateApplicationParams {
  company: string;
  role?: string;
  jd: string;
}

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
  await expect(dialog).toBeHidden();

  const card = page.locator("[data-application-id]").filter({ hasText: company });
  await expect(card).toBeVisible();
  const applicationId = await card.getAttribute("data-application-id");
  expect(applicationId, "created card must carry a data-application-id").toBeTruthy();
  return applicationId!;
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

// ── Library CRUD ── LibraryView's add/edit-entry dialog flow (spec.md §13),
// lifted verbatim from library-crud.spec.ts. Edit's entry point is a
// `${section label}: ${entry.facts[0]}` picker option, since EntryCard's own
// Edit button is a disabled stub.
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

export async function openEditFor(page: Page, optionLabel: string): Promise<Locator> {
  await page.getByRole("combobox", { name: "Choose entry to edit" }).click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
  await page.getByRole("button", { name: "Edit selected" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

export function cardFor(page: Page, text: string): Locator {
  return page.locator("[data-entry-id]").filter({ hasText: text });
}
