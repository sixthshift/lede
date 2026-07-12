// F503 (kicker dedup) + F504 (action-strip regroup) + F509 (metadata
// typography) — T052.
//
// F503: each editor section's mono-caps kicker (EditorSection's own
// `workspace-section-heading-<key>`) is now the section's SEMANTIC heading
// (an <h2>), not a plain div sitting beside a duplicate CardTitle repeating
// the same words a few lines below. Proof of dedup is a UNIQUENESS check,
// not merely a presence check: before this ticket there were two elements
// named "Cover letter" (the kicker div + the CardTitle) and two named
// "Design" — `getByRole("heading", { name, exact: true })` would have been
// AMBIGUOUS (matched >1 element, which Playwright's strict mode rejects on
// any single-element assertion). Now there's exactly one of each — the
// kicker itself, promoted — so `.toHaveCount(1)` passes; a reworded-not-
// removed duplicate (e.g. a lingering "Design details" CardTitle) wouldn't
// be caught by name-equality, but the kicker's OWN text is asserted
// separately below precisely so a "renamed to dodge the check" dodge still
// shows up as a still-duplicated or still-doubled heading count.
//
// F504: the primary action (Tailor/Re-tailor) must be first in BOTH DOM/tab
// order (a `getByRole("button")` locator list reflects document order
// regardless of any CSS `order`/`flex-row-reverse`) AND visual position
// (leftmost boundingBox.x) — checked as two independent assertions so a
// CSS-only "looks first" trick fails the DOM-order half.
//
// F509: two non-kicker metadata readouts (the resume and letter gen-state
// badges) must resolve to the SAME computed font-family — an arbitrary
// per-badge Mono/Sans split would show up as a mismatch here.
//
// Shares applications.spec.ts's "applications" project/server (real
// first-run set-password -> login, gate ON; LEDE_TAILOR_ENGINE=fixture) —
// PASSWORD MUST match that file's exactly (single server-wide secret,
// playwright.config.ts).
import { test, expect, type Page } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { login, createApplication, tailor } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd;

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function setupTailoredApplication(page: Page, company: string): Promise<string> {
  // Wide enough that the action strip's five controls (longer now that the
  // voice-source labels are disambiguated) never wrap to a second line —
  // wrapping would make "leftmost boundingBox.x" meaningless across rows.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId);
  return applicationId;
}

test.describe("F503 — kicker dedup", () => {
  test("kickers still render; the CardTitle that duplicated each one is gone (no ambiguous heading)", async ({
    page,
  }, testInfo) => {
    const company = `E2E Detail Craft Kicker Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);

    const kickers: Array<{ key: string; text: string }> = [
      { key: "job", text: "Job details" },
      { key: "letter", text: "Cover letter" },
      { key: "design", text: "Design" },
    ];

    for (const { key, text } of kickers) {
      // The landmark itself is intact — scroll-spy still has something to spy.
      const kicker = page.getByTestId(`workspace-section-heading-${key}`);
      await expect(kicker).toBeVisible();
      await expect(kicker).toHaveText(text);

      // Exactly ONE heading named this — if a duplicate CardTitle still
      // existed alongside the kicker (now itself a heading), this would be
      // 2 and the assertion below would fail on the ambiguous count.
      await expect(
        page.getByRole("heading", { name: text, exact: true }),
        `exactly one heading named "${text}" — a surviving duplicate CardTitle would make this 2`,
      ).toHaveCount(1);
    }
  });

  test("heading order stays sequential (F208) with the kickers folded in as real headings", async ({
    page,
  }, testInfo) => {
    const company = `E2E Detail Craft Heading Order Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);

    const levels = await page.evaluate(() =>
      Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((el) =>
        Number(el.tagName[1]),
      ),
    );
    for (let i = 1; i < levels.length; i++) {
      expect(
        levels[i]! - levels[i - 1]!,
        `heading levels must never skip: saw ${levels.join(" -> ")}`,
      ).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("F504 — voice-source labels disambiguated", () => {
  test('"Use resume as a voice source" and "Use letter as a voice source" are both present and distinct', async ({
    page,
  }, testInfo) => {
    const company = `E2E Detail Craft Voice Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);

    const resumeVoice = page.getByRole("button", {
      name: "Use resume as a voice source",
      exact: true,
    });
    const letterVoice = page.getByRole("button", {
      name: "Use letter as a voice source",
      exact: true,
    });
    await expect(resumeVoice).toBeVisible();
    await expect(letterVoice).toBeVisible();

    // Distinct CONTROLS, not the same button read twice — different testids.
    await expect(page.getByTestId("flag-voice-resume")).toHaveText("Use resume as a voice source");
    await expect(page.getByTestId("flag-voice-letter")).toHaveText("Use letter as a voice source");
  });
});

test.describe("F504 — action strip regroup", () => {
  test("the primary action (Re-tailor) is first in DOM/tab order AND leftmost visually", async ({
    page,
  }, testInfo) => {
    const company = `E2E Detail Craft Primary Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);

    const strip = page.getByTestId("detail-action-strip");
    await expect(strip).toBeVisible();

    // DOM/tab order: read the strip's <button> descendants in DOCUMENT order
    // (querySelectorAll is document-ordered) — untouched by any CSS `order`
    // or `flex-row-reverse`, which only repaint. The primary must be first
    // in source order, so a CSS-only "looks first" trick fails here.
    const domOrder = await strip.evaluate((el) =>
      Array.from(el.querySelectorAll("button")).map((b) => b.textContent?.trim() ?? ""),
    );
    expect(domOrder[0]).toBe("Re-tailor");

    // Visual order: the primary button's left edge is left of every other
    // control in the strip.
    const primaryBox = await page.getByTestId("tailor-button").boundingBox();
    expect(primaryBox).not.toBeNull();

    const others = [
      // Freshly tailored, never locked in this test — "Lock final", not
      // "Unlock".
      page.getByRole("button", { name: "Lock final", exact: true }),
      page.getByRole("button", { name: "Use resume as a voice source", exact: true }),
      page.getByTestId("download-pdf-button"),
      page.getByTestId("download-text-button"),
    ];
    for (const other of others) {
      const box = await other.boundingBox();
      expect(box, "every other action-strip control must report a boundingBox").not.toBeNull();
      expect(
        primaryBox!.x,
        "the primary action must sit left of every other action-strip control",
      ).toBeLessThan(box!.x);
    }
  });

  test("Download PDF + Plain text are a single grouped/split control, pinned right of the primary group", async ({
    page,
  }, testInfo) => {
    const company = `E2E Detail Craft Export Group Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);

    const exportGroup = page.getByTestId("export-actions");
    await expect(exportGroup).toBeVisible();
    // Both exports live inside the one grouped control, not scattered.
    await expect(exportGroup.getByTestId("download-pdf-button")).toBeVisible();
    await expect(exportGroup.getByTestId("download-text-button")).toBeVisible();

    const pdfBox = await page.getByTestId("download-pdf-button").boundingBox();
    const textBox = await page.getByTestId("download-text-button").boundingBox();
    expect(pdfBox).not.toBeNull();
    expect(textBox).not.toBeNull();
    // Visually a PAIR — adjacent, not just co-located somewhere on the row.
    expect(
      textBox!.x - (pdfBox!.x + pdfBox!.width),
      "Plain text must sit immediately beside Download PDF (a joined split control)",
    ).toBeLessThanOrEqual(2);

    // Pinned to the RIGHT of the primary/lock/voice-source group.
    const primaryBox = await page.getByTestId("tailor-button").boundingBox();
    expect(primaryBox).not.toBeNull();
    expect(pdfBox!.x).toBeGreaterThan(primaryBox!.x + primaryBox!.width);
  });

  test("Lock final is visually distinguished from the harmless Plain text export", async ({
    page,
  }, testInfo) => {
    const company = `E2E Detail Craft Lock Style Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);

    const lockButton = page.getByRole("button", { name: "Lock final", exact: true });
    const plainTextButton = page.getByTestId("download-text-button");

    const [lockBg, plainBg] = await Promise.all([
      lockButton.evaluate((el) => getComputedStyle(el).backgroundColor),
      plainTextButton.evaluate((el) => getComputedStyle(el).backgroundColor),
    ]);
    expect(
      lockBg,
      "Lock final (consequential) must not share Plain text's (harmless) background treatment",
    ).not.toBe(plainBg);
  });
});

test.describe("F509 — metadata typography consistency", () => {
  test("the resume and letter gen-state metadata share the same resolved font-family", async ({
    page,
  }, testInfo) => {
    const company = `E2E Detail Craft Metadata Co ${runId}-${testInfo.retry}`;
    await setupTailoredApplication(page, company);

    const resumeMeta = page.getByTestId("genstate-resume-metadata");
    const letterMeta = page.getByTestId("genstate-letter-metadata");
    await expect(resumeMeta).toBeVisible();
    await expect(letterMeta).toBeVisible();

    const [resumeFont, letterFont] = await Promise.all([
      resumeMeta.evaluate((el) => getComputedStyle(el).fontFamily),
      letterMeta.evaluate((el) => getComputedStyle(el).fontFamily),
    ]);
    expect(
      resumeFont,
      "resume and letter gen-state metadata must not split Mono vs Sans arbitrarily",
    ).toBe(letterFont);

    // And it's genuinely the Sans metadata family, not accidentally the
    // kicker's exempt Mono landmark treatment leaking in.
    const kickerFont = await page
      .getByTestId("workspace-section-heading-job")
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(resumeFont).not.toBe(kickerFont);
  });
});
