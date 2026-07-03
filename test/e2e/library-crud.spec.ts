// LibraryView CRUD, driven in a real chromium tab against the real server
// (Phase 1, spec.md §13/§4). Covers experience + project only — skill and
// education are deferred (see ticket evidence). Each section: create → edit
// → delete, plus a reload-persistence check that's the browser-side
// complement to the keyless `entries persist across restart` API test
// (test/api.entries.test.ts) — same DATA_DIR, but proving the UI re-reads it
// rather than the API round-tripping it.
import { test, expect, type Page, type Locator } from "@playwright/test";

// Unique per test run so assertions never collide with seeded data
// (SEED_ENTRIES, src/server/seed.ts) or with a previous run reusing the
// server (`reuseExistingServer` in non-CI dev loops).
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function openAddEntry(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Add entry" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function selectSection(dialog: Locator, page: Page, label: string): Promise<void> {
  await dialog.getByRole("combobox", { name: "Section" }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

async function submitAndClose(dialog: Locator, buttonName: string): Promise<void> {
  await dialog.getByRole("button", { name: buttonName }).click();
  await expect(dialog).toBeHidden();
}

// LibraryView's edit entry point (§13 comment in LibraryView.tsx): a picker
// keyed by `${section label}: ${entry.facts[0]}`, since EntryCard's own Edit
// button is a disabled stub.
async function openEditFor(page: Page, optionLabel: string): Promise<Locator> {
  await page.getByRole("combobox", { name: "Choose entry to edit" }).click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
  await page.getByRole("button", { name: "Edit selected" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

function cardFor(page: Page, text: string): Locator {
  return page.locator("[data-entry-id]").filter({ hasText: text });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();
});

test.describe("experience section", () => {
  const created = `E2E experience fact ${runId}`;
  const edited = `E2E experience fact EDITED ${runId}`;

  test("create: new experience entry appears in the list", async ({ page }) => {
    const dialog = await openAddEntry(page);
    // defaultSection is "experience" (EntryEditor.tsx) — no section change needed.
    await dialog.getByLabel(/^Company/).fill("Acme E2E Co");
    await dialog.getByLabel(/^Role/).fill("Staff Engineer");
    await dialog.getByLabel(/^Period/).fill("2020-2022");
    await dialog.getByLabel("Facts 1", { exact: true }).fill(created);
    await submitAndClose(dialog, "Create entry");

    await expect(page.locator('[data-section="experience"]').getByText(created)).toBeVisible();
  });

  test("edit: changing a fact updates the list", async ({ page }) => {
    const dialog = await openEditFor(page, `Experience: ${created}`);
    await dialog.getByLabel("Facts 1", { exact: true }).fill(edited);
    await submitAndClose(dialog, "Save changes");

    await expect(page.locator('[data-section="experience"]').getByText(edited)).toBeVisible();
    await expect(page.getByText(created, { exact: true })).toHaveCount(0);
  });

  test("reload persistence: the entry survives a page reload", async ({ page }) => {
    await expect(page.locator('[data-section="experience"]').getByText(edited)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();
    await expect(page.locator('[data-section="experience"]').getByText(edited)).toBeVisible();
  });

  test("delete: removing the entry drops it from the list", async ({ page }) => {
    await cardFor(page, edited).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(edited, { exact: true })).toHaveCount(0);
  });
});

test.describe("project section", () => {
  const created = `E2E project fact ${runId}`;
  const edited = `E2E project fact EDITED ${runId}`;

  test("create: new project entry appears in the list", async ({ page }) => {
    const dialog = await openAddEntry(page);
    await selectSection(dialog, page, "Projects");
    await dialog.getByLabel(/^Name/).fill("Acme E2E Widget");
    await dialog.getByLabel("Facts 1", { exact: true }).fill(created);
    await submitAndClose(dialog, "Create entry");

    await expect(page.locator('[data-section="project"]').getByText(created)).toBeVisible();
  });

  test("edit: changing a fact updates the list", async ({ page }) => {
    const dialog = await openEditFor(page, `Projects: ${created}`);
    await dialog.getByLabel("Facts 1", { exact: true }).fill(edited);
    await submitAndClose(dialog, "Save changes");

    await expect(page.locator('[data-section="project"]').getByText(edited)).toBeVisible();
    await expect(page.getByText(created, { exact: true })).toHaveCount(0);
  });

  test("reload persistence: the entry survives a page reload", async ({ page }) => {
    await expect(page.locator('[data-section="project"]').getByText(edited)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();
    await expect(page.locator('[data-section="project"]').getByText(edited)).toBeVisible();
  });

  test("delete: removing the entry drops it from the list", async ({ page }) => {
    await cardFor(page, edited).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(edited, { exact: true })).toHaveCount(0);
  });
});
