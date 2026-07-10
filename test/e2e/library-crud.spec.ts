// LibraryView CRUD, driven in a real chromium tab against the real server
// (Phase 1, spec.md §13/§4). Covers experience + project only — skill and
// education are deferred (see ticket evidence). Each section: create → edit
// → delete, plus a reload-persistence check that's the browser-side
// complement to the keyless `entries persist across restart` API test
// (test/api.entries.test.ts) — same DATA_DIR, but proving the UI re-reads it
// rather than the API round-tripping it.
import { test, expect } from "@playwright/test";
import {
  openAddEntry,
  selectSection,
  submitAndClose,
  openEditFor,
  cardFor,
  assertNoModalOverlay,
} from "./helpers/workspace";

// Unique per test run so assertions never collide with seeded data
// (SEED_ENTRIES, src/server/seed.ts) or with a previous run reusing the
// server (`reuseExistingServer` in non-CI dev loops).
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

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

// ── v3-T021: de-modal EntryEditor ── the Add-entry and Edit-selected panels
// are non-modal (Radix `modal={false}`, no owned DialogTrigger — see
// EntryEditor.tsx): no aria-modal, no oversized overlay, the underlying page
// stays genuinely clickable, focus opens into the panel, and Escape returns
// focus to whichever button invoked it. Same bar v3-T020 set for
// NewApplication (applications.spec.ts), reused here via assertNoModalOverlay.
test.describe("de-modal EntryEditor (v3-T021)", () => {
  test("Add entry panel: non-modal, underlying toolbar stays clickable, focus opens into the panel, Escape returns focus to the trigger", async ({
    page,
  }) => {
    const trigger = page.getByRole("button", { name: "Add entry" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await assertNoModalOverlay(page);

    // Focus opens INTO the panel (the Section field), not left on the trigger.
    await expect(dialog.getByRole("combobox", { name: "Section" })).toBeFocused();

    // The underlying toolbar stays genuinely interactive: a real, un-forced
    // click on Import synchronously opens a native file chooser (via a
    // hidden <input type=file>'s own .click()) — proof nothing invisible is
    // intercepting the click, not merely that the element "exists".
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Import" }).click(),
    ]);
    expect(fileChooser.isMultiple()).toBe(false);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Edit selected panel: non-modal, focus opens into the panel, Escape returns focus to the trigger", async ({
    page,
  }) => {
    const created = `E2E modality fact ${runId}`;

    const createDialog = await openAddEntry(page);
    await createDialog.getByLabel(/^Company/).fill("Modality E2E Co");
    await createDialog.getByLabel(/^Role/).fill("Engineer");
    await createDialog.getByLabel(/^Period/).fill("2021-2022");
    await createDialog.getByLabel("Facts 1", { exact: true }).fill(created);
    await submitAndClose(createDialog, "Create entry");

    await page.getByRole("combobox", { name: "Choose entry to edit" }).click();
    await page.getByRole("option", { name: `Experience: ${created}`, exact: true }).click();
    const trigger = page.getByRole("button", { name: "Edit selected" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await assertNoModalOverlay(page);
    await expect(dialog.getByRole("combobox", { name: "Section" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    // Scratch entry cleanup — keeps this test's fixture out of any other
    // test's list assertions.
    await cardFor(page, created).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(created, { exact: true })).toHaveCount(0);
  });
});

// ── v3-T022: de-modal LayoutEditor ── same bar v3-T020/T021 set for
// NewApplication/EntryEditor: no aria-modal, no oversized overlay, the
// underlying page stays genuinely clickable, focus opens into the panel, and
// Escape returns focus to the "Edit layout" button that invoked it.
test.describe("de-modal LayoutEditor (v3-T022)", () => {
  test("Edit layout panel: opens with rows, non-modal, underlying library control stays clickable, focus opens into the panel, Escape returns focus to the trigger", async ({
    page,
  }) => {
    const trigger = page.getByRole("button", { name: "Edit layout" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The panel actually opened with real rows, not an empty shell — this is
    // the assertion attempt 1 never got past.
    await expect(dialog.locator("[data-layout-row]").first()).toBeVisible();
    const firstCheckbox = dialog.locator('input[type="checkbox"]').first();
    await expect(firstCheckbox).toBeVisible();

    await assertNoModalOverlay(page);

    // Focus opens INTO the panel (the first row's checkbox), not left on the trigger.
    await expect(firstCheckbox).toBeFocused();

    // The underlying page stays genuinely interactive: a real, un-forced
    // click on the toolbar's Import control synchronously opens a native
    // file chooser (via a hidden <input type=file>'s own .click()) — proof
    // nothing invisible is intercepting the click, not merely that the
    // element "exists". Same proof point v3-T021 used for EntryEditor. Like
    // EntryEditor, an outside click like this one also dismisses this
    // non-modal panel (Radix's default outside-pointerdown dismiss), so the
    // panel gets reopened below to test the Escape path specifically.
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Import" }).click(),
    ]);
    expect(fileChooser.isMultiple()).toBe(false);
    await expect(dialog).toBeHidden();

    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("round-trip: toggling a section's Enable checkbox and saving persists across reload", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Edit layout" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const row = dialog.locator('[data-layout-row="interest"]');
    const checkbox = row.locator('input[type="checkbox"]');
    await expect(checkbox).toBeVisible();
    const wasChecked = await checkbox.isChecked();

    await checkbox.click();
    await expect(checkbox).toBeChecked({ checked: !wasChecked });

    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/settings") && r.request().method() === "PUT" && r.status() === 200,
      ),
      dialog.getByRole("button", { name: "Save layout" }).click(),
    ]);
    await expect(dialog).toBeHidden();

    await page.reload();
    await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();

    // A fresh GET (not just the UI re-reading its own cache) reflects the change.
    const settingsAfterReload = await (await page.request.get("/api/settings")).json();
    const persisted = settingsAfterReload.layout.find(
      (r: { section: string }) => r.section === "interest",
    );
    expect(persisted.enabled).toBe(!wasChecked);

    // Re-open and assert the new state renders in the UI too.
    await page.getByRole("button", { name: "Edit layout" }).click();
    const dialog2 = page.getByRole("dialog");
    await expect(dialog2).toBeVisible();
    const checkbox2 = dialog2.locator('[data-layout-row="interest"] input[type="checkbox"]');
    await expect(checkbox2).toBeVisible();
    await expect(checkbox2).toBeChecked({ checked: !wasChecked });

    // Restore original state so this test doesn't leak a mutation to the rest of the suite.
    await checkbox2.click();
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/settings") && r.request().method() === "PUT" && r.status() === 200,
      ),
      dialog2.getByRole("button", { name: "Save layout" }).click(),
    ]);
    await expect(dialog2).toBeHidden();
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
