// Rail design (v4-T021, spec.md F201/F204/F205 + oracle.md "rail zoning /
// one title convention / icons") — the header is gone (T020); this makes the
// rail itself a DESIGNED surface rather than just wired plumbing:
//   - global nav gets an icon (lucide-react) alongside its label.
//   - the nav hover fill is a real, perceptible, DESIGNATED token
//     (`--ring-weak`) — never the original `#fafafa`-on-white defect
//     (F201), asserted as resting-vs-hovered computed-style diff, not a
//     class-name check.
//   - the rail zones into global-nav / surface-context / section, the
//     section zone carrying a mono-caps "SECTIONS" micro-label.
//   - the detail surface's "← Applications" back-link is gone outright
//     (F204) — the active global-nav item is the only up-level affordance.
//   - the surface title lives ONLY in the editor pane's h1 on the detail
//     surface (F205) — the rail no longer echoes it.
//
// Shares applications.spec.ts's "applications" project/server (real
// first-run set-password -> login, gate ON; LEDE_TAILOR_ENGINE=fixture) —
// PASSWORD MUST match that file's exactly (single server-wide secret,
// playwright.config.ts).
import { test, expect } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { login, createApplication } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd;
const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe("rail design (v4-T021)", () => {
  test("each global-nav item carries an icon (svg) alongside its label", async ({ page }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const name of ["Applications", "Library", "Settings"]) {
      const item = nav.getByRole("link", { name });
      await expect(item).toBeVisible();
      await expect(item.locator("svg")).toHaveCount(1);
    }
  });

  test("nav hover computes to the --ring-weak token AND differs from the resting background", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const item = page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
      name: "Library",
    });

    const ringWeak = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--ring-weak").trim(),
    );
    expect(ringWeak.length, "--ring-weak must be a defined, non-empty token").toBeGreaterThan(0);

    const resting = await item.evaluate((el) => getComputedStyle(el).backgroundColor);
    await item.hover();
    // The rule declares a CSS transition (`transition-colors`) on background —
    // poll past its duration rather than sampling the mid-transition frame.
    await expect
      .poll(() => item.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(resting);
    const hovered = await item.evaluate((el) => getComputedStyle(el).backgroundColor);

    // The hovered background must resolve to the SAME color the --ring-weak
    // custom property carries (parsed the same way the browser parses any
    // rgba() into its canonical rgb()/rgba() serialization, within float
    // rounding of the alpha channel), not just "some other color" — this is
    // the "designated token" half of the assertion.
    const ringWeakResolved = await page.evaluate((token) => {
      const probe = document.createElement("div");
      probe.style.color = token;
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    }, ringWeak);
    function parseRgba(css: string): [number, number, number, number] {
      const [r, g, b, a] = css
        .replace(/[^\d.,]/g, "")
        .split(",")
        .map(Number);
      return [r ?? 0, g ?? 0, b ?? 0, a ?? 1];
    }
    const [hr, hg, hb, ha] = parseRgba(hovered);
    const [tr, tg, tb, ta] = parseRgba(ringWeakResolved);
    expect([hr, hg, hb], "hover color channel must match --ring-weak's").toEqual([tr, tg, tb]);
    expect(
      Math.abs(ha - ta),
      "hover alpha must match --ring-weak's alpha (within float rounding)",
    ).toBeLessThan(0.02);
  });

  test("the SECTIONS mono-caps section-zone label renders on the detail surface's rail, and the back-link is gone", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    const company = `E2E Rail Design Co ${runId}`;
    const applicationId = await createApplication(page, { company, jd: JD });
    await page.goto(`/applications/${applicationId}`);
    await expect(page.getByTestId("workspace-shell")).toBeVisible();

    const rail = page.getByTestId("rail-pane");
    await expect(rail.getByText("SECTIONS", { exact: true })).toBeVisible();

    // F204: the exact former back-link string must appear NOWHERE on the
    // detail surface (rail or editor) — not merely hidden.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("← Applications");
    // The global-nav "Applications" item itself is expected (and is the
    // up-level affordance F204 designates) — exactly ONE link named
    // "Applications" must exist, not a second (the former back-link row).
    await expect(page.getByRole("link", { name: /^Applications$/ })).toHaveCount(1);
  });

  test("one-title convention: the detail surface's title lives ONLY in the editor pane's h1, never repeated in the rail", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    const company = `E2E Rail Title Co ${runId}`;
    const role = `Staff Engineer ${runId}`;
    const applicationId = await createApplication(page, { company, role, jd: JD });
    await page.goto(`/applications/${applicationId}`);
    await expect(page.getByTestId("workspace-shell")).toBeVisible();

    const editorH1 = page.getByTestId("editor-pane").getByRole("heading", { level: 1 });
    await expect(editorH1).toHaveText(role);

    const rail = page.getByTestId("rail-pane");
    await expect(rail.getByRole("heading", { level: 1 })).toHaveCount(0);
    await expect(rail.getByText(role, { exact: true })).toHaveCount(0);
  });

  test("one-title convention holds on ALL FOUR shell surfaces: editor-pane h1 is the surface title, rail has no heading duplicating it", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    const company = `E2E Four Surfaces Co ${runId}`;
    const role = `Principal Engineer ${runId}`;
    const applicationId = await createApplication(page, { company, role, jd: JD });

    const surfaces = [
      { path: "/applications", title: "Applications" },
      { path: `/applications/${applicationId}`, title: role },
      { path: "/library", title: "Library" },
      { path: "/settings", title: "Settings" },
    ];

    for (const { path, title } of surfaces) {
      await page.goto(path);
      await expect(page.getByTestId("workspace-shell")).toBeVisible();

      // The surface title IS the editor pane's h1 (exactly one, equal to
      // the title) — the one place titles live.
      const editorH1 = page.getByTestId("editor-pane").getByRole("heading", { level: 1 });
      await expect(editorH1, `${path}: editor-pane h1 must be the surface title`).toHaveText(title);

      // The rail must not duplicate that title as a heading (the F205 defect
      // was Library/Settings rendering their title as an <h1> in the rail).
      // A global-nav LINK named for a destination is the up-level affordance,
      // not a title duplicate — so this targets headings specifically, which
      // is why /applications (whose rail carries an "Applications" nav link)
      // still passes.
      await expect(
        page.getByTestId("rail-pane").getByRole("heading", { name: title }),
        `${path}: rail must not render a heading duplicating the surface title`,
      ).toHaveCount(0);
    }
  });
});
