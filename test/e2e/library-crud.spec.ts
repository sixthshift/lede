// LibraryView CRUD, driven in a real chromium tab against the real server
// (Phase 1, spec.md §13/§4). Covers experience + project only — skill and
// education are deferred (see ticket evidence). Each section: create → edit
// → delete, plus a reload-persistence check that's the browser-side
// complement to the keyless `entries persist across restart` API test
// (test/api.entries.test.ts) — same DATA_DIR, but proving the UI re-reads it
// rather than the API round-tripping it.
import { test, expect, type Page } from "@playwright/test";
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

// v3-T040: /library is housed inside WorkspaceShell (rail | editor) same as
// the application detail workspace, but as a non-doc surface it DEGRADES —
// no preview pane (§locked constraints: non-doc surfaces get rail+content,
// never a preview).
test("workspace shell: /library renders inside the shell with no preview pane (degrade)", async ({
  page,
}) => {
  await expect(page.getByTestId("workspace-shell")).toBeVisible();
  await expect(page.getByTestId("preview-pane")).toHaveCount(0);
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

  test("delete: two-step armed confirm — first click arms, second removes it from the list", async ({
    page,
  }) => {
    const deleteButton = cardFor(page, edited).getByRole("button", { name: "Delete" });
    await deleteButton.click();
    await expect(
      cardFor(page, edited).getByRole("button", { name: "Confirm delete" }),
    ).toBeVisible();
    await expect(page.getByText(edited, { exact: true })).toBeVisible();

    await cardFor(page, edited).getByRole("button", { name: "Confirm delete" }).click();
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

  test("Edit entry panel (per-row): non-modal, focus opens into the panel, Escape returns focus to the trigger", async ({
    page,
  }) => {
    const created = `E2E modality fact ${runId}`;

    const createDialog = await openAddEntry(page);
    await createDialog.getByLabel(/^Company/).fill("Modality E2E Co");
    await createDialog.getByLabel(/^Role/).fill("Engineer");
    await createDialog.getByLabel(/^Period/).fill("2021-2022");
    await createDialog.getByLabel("Facts 1", { exact: true }).fill(created);
    await submitAndClose(createDialog, "Create entry");

    // F502/T051: editing is that row's own Edit button — one activation,
    // no combobox + "Edit selected" pair.
    const trigger = cardFor(page, created).getByRole("button", { name: "Edit" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await assertNoModalOverlay(page);
    await expect(dialog.getByRole("combobox", { name: "Section" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    // Scratch entry cleanup — keeps this test's fixture out of any other
    // test's list assertions. Delete is a two-step armed confirm (F106):
    // first click arms, second confirms.
    await cardFor(page, created).getByRole("button", { name: "Delete" }).click();
    await cardFor(page, created).getByRole("button", { name: "Confirm delete" }).click();
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

// ── v3-T023: de-modal ProfileEditor ── same bar v3-T020/T021/T022 set for
// NewApplication/EntryEditor/LayoutEditor: no aria-modal, no oversized
// overlay, the underlying page stays genuinely clickable, focus opens into
// the panel, and Escape returns focus to the "Edit profile" button that
// invoked it.
test.describe("de-modal ProfileEditor (v3-T023)", () => {
  test("Edit profile panel: opens with fields, non-modal, underlying library control stays clickable, focus opens into the panel, Escape returns focus to the trigger", async ({
    page,
  }) => {
    const trigger = page.getByRole("button", { name: "Edit profile" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The panel actually opened with a real field, not an empty shell — this
    // is the assertion attempt 1 never got past.
    const nameField = dialog.getByLabel("Name", { exact: true });
    await expect(nameField).toBeVisible();

    await assertNoModalOverlay(page);

    // Focus opens INTO the panel (the Name field), not left on the trigger.
    await expect(nameField).toBeFocused();

    // The underlying page stays genuinely interactive: a real, un-forced
    // click on the toolbar's Import control synchronously opens a native
    // file chooser (via a hidden <input type=file>'s own .click()) — proof
    // nothing invisible is intercepting the click, not merely that the
    // element "exists". Same proof point v3-T021/T022 used. Like those
    // panels, an outside click like this one also dismisses this non-modal
    // panel (Radix's default outside-pointerdown dismiss), so the panel gets
    // reopened below to test the Escape path specifically.
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

  test("round-trip: editing the Headline and saving persists across reload", async ({ page }) => {
    await page.getByRole("button", { name: "Edit profile" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Name + email are required by the form (§16) and the seeded profile
    // ships both blank — fill them so the Save actually validates and PUTs,
    // rather than tripping the "Name and email are required" inline error.
    await dialog.getByLabel("Name", { exact: true }).fill("E2E Profile Owner");
    await dialog.getByLabel("Email", { exact: true }).fill("owner@example.com");

    const headlineField = dialog.getByLabel("Headline", { exact: true });
    await expect(headlineField).toBeVisible();
    const original = await headlineField.inputValue();
    const updated = `E2E headline ${runId}`;

    await headlineField.fill(updated);

    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/profile") && r.request().method() === "PUT" && r.status() === 200,
      ),
      dialog.getByRole("button", { name: "Save profile" }).click(),
    ]);
    await expect(dialog).toBeHidden();

    await page.reload();
    await expect(page.getByRole("button", { name: "Add entry" })).toBeVisible();

    // A fresh GET (not just the UI re-reading its own cache) reflects the change.
    const profileAfterReload = await (await page.request.get("/api/profile")).json();
    expect(profileAfterReload.headline).toBe(updated);

    // Re-open and assert the new state renders in the UI too.
    await page.getByRole("button", { name: "Edit profile" }).click();
    const dialog2 = page.getByRole("dialog");
    await expect(dialog2).toBeVisible();
    const headlineField2 = dialog2.getByLabel("Headline", { exact: true });
    await expect(headlineField2).toHaveValue(updated);

    // Restore original state so this test doesn't leak a mutation to the rest of the suite.
    await headlineField2.fill(original);
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/profile") && r.request().method() === "PUT" && r.status() === 200,
      ),
      dialog2.getByRole("button", { name: "Save profile" }).click(),
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

  test("delete: two-step armed confirm — first click arms, second removes it from the list", async ({
    page,
  }) => {
    const deleteButton = cardFor(page, edited).getByRole("button", { name: "Delete" });
    await deleteButton.click();
    await expect(
      cardFor(page, edited).getByRole("button", { name: "Confirm delete" }),
    ).toBeVisible();
    await expect(page.getByText(edited, { exact: true })).toBeVisible();

    await cardFor(page, edited).getByRole("button", { name: "Confirm delete" }).click();
    await expect(page.getByText(edited, { exact: true })).toHaveCount(0);
  });
});

// ── F106 (T016): two-step armed delete on EntryCard ── mirrors the
// dashboard's ApplicationCard armed-delete bar (applications.spec.ts's own
// DELETE assertion): first activation arms without deleting (no server call,
// no modality), second deletes with an actual server round-trip; blur/Escape
// disarm. Arm state is local to EACH EntryCard instance rather than one
// shared flag, so arming a row and then clicking Delete on a DIFFERENT row
// must only arm that other row (never delete it) while auto-disarming the
// first, via ordinary focus/blur — not a second boolean.
test.describe("F106: two-step armed delete (T016)", () => {
  async function createScratchEntry(page: Page, fact: string): Promise<void> {
    const dialog = await openAddEntry(page);
    // defaultSection is "experience" (EntryEditor.tsx) — no section change needed.
    await dialog.getByLabel(/^Company/).fill("F106 Scratch Co");
    await dialog.getByLabel(/^Role/).fill("Scratch Role");
    await dialog.getByLabel(/^Period/).fill("2023-2024");
    await dialog.getByLabel("Facts 1", { exact: true }).fill(fact);
    await submitAndClose(dialog, "Create entry");
    await expect(page.getByText(fact, { exact: true })).toBeVisible();
  }

  test("first activation arms without deleting: no server call, entry stays, still non-modal", async ({
    page,
  }) => {
    const fact = `F106 arm-only fact ${runId}`;
    await createScratchEntry(page, fact);

    const deleteRequests: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "DELETE" && /\/api\/entries\//.test(req.url())) {
        deleteRequests.push(req.url());
      }
    });

    const card = cardFor(page, fact);
    await card.getByRole("button", { name: "Delete" }).click();
    await expect(card.getByRole("button", { name: "Confirm delete" })).toBeVisible();
    await assertNoModalOverlay(page);

    // Give an accidental network call a moment to land before asserting zero.
    await page.waitForTimeout(300);
    expect(deleteRequests, "arming must not call the server").toHaveLength(0);
    await expect(page.getByText(fact, { exact: true })).toBeVisible();

    // Cleanup — second activation actually deletes it so it doesn't leak.
    await card.getByRole("button", { name: "Confirm delete" }).click();
    await expect(page.getByText(fact, { exact: true })).toHaveCount(0);
  });

  test("second activation deletes with an asserted server round-trip", async ({ page }) => {
    const fact = `F106 confirm-delete fact ${runId}`;
    await createScratchEntry(page, fact);

    const card = cardFor(page, fact);
    const entryId = await card.getAttribute("data-entry-id");
    expect(entryId, "card must carry its data-entry-id").toBeTruthy();

    await card.getByRole("button", { name: "Delete" }).click();
    await expect(card.getByRole("button", { name: "Confirm delete" })).toBeVisible();

    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/entries/${entryId}`) &&
          r.request().method() === "DELETE" &&
          r.status() === 200,
      ),
      card.getByRole("button", { name: "Confirm delete" }).click(),
    ]);
    await expect(page.getByText(fact, { exact: true })).toHaveCount(0);
  });

  test("Escape after arming disarms: reverts to Delete, no deletion", async ({ page }) => {
    const fact = `F106 escape-disarm fact ${runId}`;
    await createScratchEntry(page, fact);

    const card = cardFor(page, fact);
    await card.getByRole("button", { name: "Delete" }).click();
    await expect(card.getByRole("button", { name: "Confirm delete" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(card.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(page.getByText(fact, { exact: true })).toBeVisible();

    // Cleanup.
    await card.getByRole("button", { name: "Delete" }).click();
    await card.getByRole("button", { name: "Confirm delete" }).click();
    await expect(page.getByText(fact, { exact: true })).toHaveCount(0);
  });

  test("blur after arming disarms: reverts to Delete, no deletion", async ({ page }) => {
    const fact = `F106 blur-disarm fact ${runId}`;
    await createScratchEntry(page, fact);

    const card = cardFor(page, fact);
    await card.getByRole("button", { name: "Delete" }).click();
    await expect(card.getByRole("button", { name: "Confirm delete" })).toBeVisible();

    // Moves focus elsewhere on the page, blurring the armed button.
    await page.getByRole("button", { name: "Add entry" }).focus();
    await expect(card.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(page.getByText(fact, { exact: true })).toBeVisible();

    // Cleanup.
    await card.getByRole("button", { name: "Delete" }).click();
    await card.getByRole("button", { name: "Confirm delete" }).click();
    await expect(page.getByText(fact, { exact: true })).toHaveCount(0);
  });

  test("per-row isolation: arming entry A then clicking Delete once on a different entry B arms B only and auto-disarms A", async ({
    page,
  }) => {
    const factA = `F106 row-a fact ${runId}`;
    const factB = `F106 row-b fact ${runId}`;
    await createScratchEntry(page, factA);
    await createScratchEntry(page, factB);

    const cardA = cardFor(page, factA);
    const cardB = cardFor(page, factB);

    await cardA.getByRole("button", { name: "Delete" }).click();
    await expect(cardA.getByRole("button", { name: "Confirm delete" })).toBeVisible();

    // A single click on B's Delete — this rules out a shared boolean, which
    // would already read "armed" for every row and fire the delete right
    // here instead of merely arming B.
    await cardB.getByRole("button", { name: "Delete" }).click();
    await expect(cardB.getByRole("button", { name: "Confirm delete" })).toBeVisible();
    await expect(page.getByText(factB, { exact: true })).toBeVisible();

    // A must have auto-disarmed back to "Delete", untouched.
    await expect(cardA.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(page.getByText(factA, { exact: true })).toBeVisible();

    // Cleanup both — interacting with A's button blurs B (disarming it too),
    // so B needs re-arming before its own delete.
    await cardA.getByRole("button", { name: "Delete" }).click();
    await cardA.getByRole("button", { name: "Confirm delete" }).click();
    await expect(page.getByText(factA, { exact: true })).toHaveCount(0);

    await cardB.getByRole("button", { name: "Delete" }).click();
    await cardB.getByRole("button", { name: "Confirm delete" }).click();
    await expect(page.getByText(factB, { exact: true })).toHaveCount(0);
  });
});

// ── F502/F509 (T051): per-row Edit + identity line replace the
// "Choose entry to edit" combobox + "Edit selected" pair — editing any row
// is now that row's own one-click Edit button (EntryCard.tsx), fed by
// LibraryView's openEdit exactly as the old dropdown was; each row also
// gains a "Company · Role · Period" (or section-equivalent) identity line
// (F509) that wasn't shown before.
test.describe("F502/F509: per-row Edit + identity line (T051)", () => {
  test("the 'Choose entry to edit' combobox and 'Edit selected' button are gone from the DOM", async ({
    page,
  }) => {
    await expect(page.getByRole("combobox", { name: "Choose entry to edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit selected" })).toHaveCount(0);
  });

  test("per-row Edit opens THAT row's entry in one activation — contrast: two different rows load different data", async ({
    page,
  }) => {
    const factA = `F502 row-a fact ${runId}`;
    const factB = `F502 row-b fact ${runId}`;

    const dialogA = await openAddEntry(page);
    await dialogA.getByLabel(/^Company/).fill("F502 Row A Co");
    await dialogA.getByLabel(/^Role/).fill("Row A Role");
    await dialogA.getByLabel(/^Period/).fill("2018-2019");
    await dialogA.getByLabel("Facts 1", { exact: true }).fill(factA);
    await submitAndClose(dialogA, "Create entry");

    const dialogB = await openAddEntry(page);
    await dialogB.getByLabel(/^Company/).fill("F502 Row B Co");
    await dialogB.getByLabel(/^Role/).fill("Row B Role");
    await dialogB.getByLabel(/^Period/).fill("2020-2021");
    await dialogB.getByLabel("Facts 1", { exact: true }).fill(factB);
    await submitAndClose(dialogB, "Create entry");

    // Row A, one click — its own data.
    await cardFor(page, factA).getByRole("button", { name: "Edit" }).click();
    const editA = page.getByRole("dialog");
    await expect(editA).toBeVisible();
    await expect(editA.getByLabel(/^Company/)).toHaveValue("F502 Row A Co");
    await expect(editA.getByLabel(/^Role/)).toHaveValue("Row A Role");
    await page.keyboard.press("Escape");
    await expect(editA).toBeHidden();

    // Row B, one click — a genuinely different row's data (the contrast).
    await cardFor(page, factB).getByRole("button", { name: "Edit" }).click();
    const editB = page.getByRole("dialog");
    await expect(editB).toBeVisible();
    await expect(editB.getByLabel(/^Company/)).toHaveValue("F502 Row B Co");
    await expect(editB.getByLabel(/^Role/)).toHaveValue("Row B Role");
    await page.keyboard.press("Escape");
    await expect(editB).toBeHidden();

    // Cleanup both scratch entries.
    for (const fact of [factA, factB]) {
      await cardFor(page, fact).getByRole("button", { name: "Delete" }).click();
      await cardFor(page, fact).getByRole("button", { name: "Confirm delete" }).click();
      await expect(page.getByText(fact, { exact: true })).toHaveCount(0);
    }
  });

  test("each row renders an identity line built from its company/role/period", async ({ page }) => {
    const fact = `F509 identity fact ${runId}`;
    const dialog = await openAddEntry(page);
    await dialog.getByLabel(/^Company/).fill("F509 Identity Co");
    await dialog.getByLabel(/^Role/).fill("Identity Role");
    await dialog.getByLabel(/^Period/).fill("2022-2023");
    await dialog.getByLabel("Facts 1", { exact: true }).fill(fact);
    await submitAndClose(dialog, "Create entry");

    const identity = cardFor(page, fact).getByTestId("entry-identity");
    await expect(identity).toHaveText("F509 Identity Co · Identity Role · 2022-2023");

    // Cleanup.
    await cardFor(page, fact).getByRole("button", { name: "Delete" }).click();
    await cardFor(page, fact).getByRole("button", { name: "Confirm delete" }).click();
    await expect(page.getByText(fact, { exact: true })).toHaveCount(0);
  });
});
