// Design accordion (v4-T041a, spec.md "Accordion consistency" + oracle.md
// F505) — DesignPanel's ~16 internal control groups (Typography, Header,
// Links, Section headings, Dates, Entries, Color, Page, Photo, Layout,
// Footer, and Sections' five per-section subgroups) each fold behind their
// own header, DEFAULT COLLAPSED — retiring the ~5,400px always-open scroll
// this panel used to force. The three top-level editor sections (Job
// details/Cover letter/Design) are UNCHANGED by this ticket and stay default
// EXPANDED (red-team #8: outer sections are never collapsed-by-default).
//
// Locked decisions under test: group collapse is VIEW-STATE ONLY (a
// namespaced localStorage key per group, NEVER a settings/application
// write — CLAUDE.md's rail-collapse/H2 pattern, extended here to
// DesignPanel's inner groups) — network-zero on toggle, and the preview
// canvas is pixel-identical before/after (collapsing controls can never
// change a format value or the rendered document).
//
// Shares applications.spec.ts's "applications" project/server (real
// first-run set-password -> login, gate ON, LEDE_TAILOR_ENGINE=fixture) —
// PASSWORD MUST match that file's exactly (single server-wide secret,
// playwright.config.ts), and JD reuses the SAME recorded fixture (byte-for-
// byte from CONTRAST_JDS) so tailoring replays keylessly.
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import {
  login,
  createApplication,
  tailor,
  expectResumeCanvasPainted,
  resumePreviewCanvas,
  canvasSnapshot,
} from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — byte-for-byte, see applications.spec.ts

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const OUTER_SECTIONS = ["job", "letter", "design"] as const;

// Every group DesignPanel.tsx wraps in a CollapsibleGroup (T041a) — walked in
// full by the scroll-retirement test; a representative SAMPLE covers the
// default-collapsed/toggle-reveals-controls behavior without every test
// enumerating all sixteen.
const ALL_GROUPS = [
  "typography",
  "header",
  "links",
  "sectionHeadings",
  "dates",
  "entries",
  "color",
  "page",
  "photo",
  "layout",
  "footer",
  "sectionsSkillsLanguages",
  "sectionsInterests",
  "sectionsExperience",
  "sectionsSummary",
  "sectionsEducation",
] as const;
const SAMPLE_GROUPS = [
  "typography",
  "header",
  "color",
  "layout",
  "footer",
  "sectionsExperience",
] as const;

function groupToggle(page: Page, key: string) {
  return page.getByTestId(`design-group-toggle-${key}`);
}
function groupBody(page: Page, key: string) {
  return page.getByTestId(`design-group-body-${key}`);
}

async function setupTailoredApplication(page: Page, testInfo: TestInfo): Promise<string> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Design Accordion Co ${runId}-${testInfo.retry}-${testInfo.title.length}`;
  const applicationId = await createApplication(page, { company, jd: JD });
  await page.goto(`/applications/${applicationId}`);
  await tailor(page, applicationId);
  await expectResumeCanvasPainted(page);
  return applicationId;
}

test.describe("design accordion (v4-T041a, F505)", () => {
  test("the 3 top-level sections (Job details/Cover letter/Design) are ALL default expanded on load", async ({
    page,
  }, testInfo) => {
    await setupTailoredApplication(page, testInfo);

    for (const key of OUTER_SECTIONS) {
      await expect(
        page.getByTestId(`section-collapse-${key}`),
        `${key} section must default expanded`,
      ).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByTestId(`workspace-section-body-${key}`)).toBeVisible();
    }
  });

  test("Design's internal groups default COLLAPSED on load; clicking a group header reveals its controls", async ({
    page,
  }, testInfo) => {
    await setupTailoredApplication(page, testInfo);
    await expect(page.getByTestId("workspace-section-body-design")).toBeVisible();

    for (const key of SAMPLE_GROUPS) {
      const toggle = groupToggle(page, key);
      await toggle.scrollIntoViewIfNeeded();
      await expect(toggle, `${key} group must render its header toggle`).toBeVisible();
      await expect(toggle, `${key} group must default COLLAPSED`).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(groupBody(page, key), `${key} group's controls must start hidden`).toBeHidden();

      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(
        groupBody(page, key),
        `${key} group's controls must reveal on click`,
      ).toBeVisible();
    }
  });

  test("toggling a Design group is network-zero over a multi-second window, and the preview canvas is pixel-identical before/after", async ({
    page,
  }, testInfo) => {
    const applicationId = await setupTailoredApplication(page, testInfo);

    const applicationBefore = await (
      await page.request.get(`/api/applications/${applicationId}`)
    ).json();
    const settingsBefore = await (await page.request.get("/api/settings")).json();

    const canvas = resumePreviewCanvas(page);
    const canvasBefore = await canvasSnapshot(canvas);

    const writes: Array<{ method: string; url: string; body: string | null }> = [];
    page.on("request", (req) => {
      const method = req.method();
      const url = req.url();
      if (
        (method === "PUT" || method === "PATCH" || method === "POST") &&
        (/\/api\/applications\//.test(url) || /\/api\/settings/.test(url))
      ) {
        writes.push({ method, url, body: req.postData() });
      }
    });

    const toggle = groupToggle(page, "color");
    await toggle.scrollIntoViewIfNeeded();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(groupBody(page, "color")).toBeVisible();

    // The toggle's handler is synchronous (setState + a localStorage write)
    // — this window is only to let an ACCIDENTAL fire-and-forget request
    // surface before asserting zero, not to await a legitimate one.
    await page.waitForTimeout(3000);
    expect(
      writes,
      `expanding a group must never write to the server: ${JSON.stringify(writes)}`,
    ).toEqual([]);

    const canvasAfterExpand = await canvasSnapshot(canvas);
    expect(canvasAfterExpand, "expanding a group must not repaint/disrupt the preview").toBe(
      canvasBefore,
    );

    // Collapse it back — still zero writes, still pixel-identical.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.waitForTimeout(1000);
    expect(
      writes,
      `collapsing a group must never write to the server: ${JSON.stringify(writes)}`,
    ).toEqual([]);
    const canvasAfterCollapse = await canvasSnapshot(canvas);
    expect(canvasAfterCollapse, "collapsing a group must not repaint/disrupt the preview").toBe(
      canvasBefore,
    );

    const applicationAfter = await (
      await page.request.get(`/api/applications/${applicationId}`)
    ).json();
    const settingsAfter = await (await page.request.get("/api/settings")).json();
    expect(
      applicationAfter.format,
      "toggling a group must never mutate the application's format",
    ).toEqual(applicationBefore.format);
    expect(
      settingsAfter.defaultFormat,
      "toggling a group must never mutate settings.defaultFormat",
    ).toEqual(settingsBefore.defaultFormat);
  });

  test("scroll retired: default (groups-collapsed) Design height is far below fully-expanded, and expanding every group measurably grows it; scroll-spy precondition still holds", async ({
    page,
  }, testInfo) => {
    await setupTailoredApplication(page, testInfo);

    const editorPane = page.getByTestId("editor-pane");
    // Scroll-spy precondition (v4-T023/F202) must still hold on the default
    // (groups-collapsed) surface.
    const baseline = await editorPane.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(
      baseline.scrollHeight,
      "editor pane must still genuinely overflow on the default (collapsed) surface",
    ).toBeGreaterThan(baseline.clientHeight + 500);

    const designBody = page.getByTestId("workspace-section-body-design");
    const collapsedHeight = await designBody.evaluate((el) => el.scrollHeight);

    for (const key of ALL_GROUPS) {
      const toggle = groupToggle(page, key);
      await toggle.scrollIntoViewIfNeeded();
      await toggle.click();
      await expect(toggle, `${key} group must expand`).toHaveAttribute("aria-expanded", "true");
    }
    const expandedHeight = await designBody.evaluate((el) => el.scrollHeight);

    // The default (collapsed) height still includes chrome this ticket never
    // touches — the Card header, and the TemplateGallery/TemplatePicker
    // controls above DesignPanel itself — so a fixed ratio of expandedHeight
    // is the wrong bar. What proves a REAL collapse (not a cosmetic
    // overflow:hidden clip that still lays out full height) is: expanding
    // every group must add a large, absolute amount of height back.
    expect(
      expandedHeight - collapsedHeight,
      "expanding every group must measurably grow the Design section's rendered height by a large absolute amount — proves a real collapse, not a cosmetic clip that still lays out full height",
    ).toBeGreaterThan(1500);
    // "well under the old ~5,400px" (the panel's OWN pre-ticket scroll,
    // spec.md's T041a ticket text) — collapsed still leaves headroom below
    // that figure even counting the untouched chrome above.
    expect(
      collapsedHeight,
      "the default (groups-collapsed) Design section must render well under the old ~5,400px always-open scroll",
    ).toBeLessThan(4000);
  });
});
