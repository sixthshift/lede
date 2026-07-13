// Motion language (F403/F404, v4-T043, oracle.md red-team #22) — the docked
// editor panels (EntryEditor/ProfileEditor/LayoutEditor) used to pop at 0ms;
// they now adopt ui/dialog.tsx's own pinned `animate-in`/duration-200 entry
// motion (that file is the reference and stays untouched). Section collapse
// (ApplicationDetail's EditorSection) animates via the grid-template-rows
// `0fr -> 1fr` technique instead of a hard mount/unmount. Both must compute
// to a duration in [100ms,300ms] — a 1ms token-pop must FAIL this, so every
// assertion here parses the actual numeric duration rather than checking for
// class presence — and both must silence to no motion under
// `prefers-reduced-motion: reduce`. Selects (ui/select.tsx trigger) get a
// hover background transition (F404), verified as a genuine computed color
// delta, not a class check.
//
// Shares applications.spec.ts's "applications" project/server (real
// first-run set-password -> login, gate ON, LEDE_TAILOR_ENGINE=fixture) —
// PASSWORD must match that file's exactly (single server-wide secret,
// playwright.config.ts). No tailoring needed here — the "job" section
// renders (and its collapse is exercised) with no fixture dependency, so JD
// content is incidental.
import { test, expect, type Locator, type Page } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import {
  login,
  createApplication,
  railWordmark,
  themeToggleButton,
  railLogoutButton,
} from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — byte-for-byte, see applications.spec.ts

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const MIN_MS = 100;
const MAX_MS = 300;

/** Parses a CSS `<time>` computed-style value ("0.2s" or "200ms") to ms.
 * Every element this spec reads applies exactly one animation/transition, so
 * a bare (non-list) value is always expected — a comma-separated list would
 * mean two motions landed on one element, which is itself worth failing on
 * rather than silently taking the first. */
function cssTimeToMs(value: string): number {
  expect(value.includes(","), `expected a single CSS time value, got a list: "${value}"`).toBe(
    false,
  );
  const trimmed = value.trim();
  if (trimmed.endsWith("ms")) return Number.parseFloat(trimmed);
  if (trimmed.endsWith("s")) return Number.parseFloat(trimmed) * 1000;
  throw new Error(`unrecognized CSS time value: "${value}"`);
}

type MotionStyle = {
  animationName: string;
  animationDuration: string;
  transitionDuration: string;
};

async function readMotionStyle(locator: Locator): Promise<MotionStyle> {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      animationName: s.animationName,
      animationDuration: s.animationDuration,
      transitionDuration: s.transitionDuration,
    };
  });
}

// A structural animation is EITHER a keyframe animation (the docked panels'
// animate-in) OR a property transition (section collapse's grid-template-
// rows) — the CALLER names which channel actually drives a given element
// (rather than sniffing it from computed style), since under reduced motion
// an animation-driven element legitimately still carries an UNRELATED
// incidental transition-duration (Tailwind's `duration-*` utility sets both
// animation-duration and transition-duration off the one shared class name —
// harmless here since no property transition is ever actually triggered on
// these elements, but it would make a naive "both channels must be off"
// check fail on a false positive).
type MotionChannel = "animation" | "transition";

function channelDuration(style: MotionStyle, channel: MotionChannel): string {
  return channel === "animation" ? style.animationDuration : style.transitionDuration;
}

function assertBandedDuration(style: MotionStyle, channel: MotionChannel, label: string): void {
  const raw = channelDuration(style, channel);
  const ms = cssTimeToMs(raw);
  expect(
    ms,
    `${label}: computed duration (${raw}) must be within [${MIN_MS}ms,${MAX_MS}ms]`,
  ).toBeGreaterThanOrEqual(MIN_MS);
  expect(
    ms,
    `${label}: computed duration (${raw}) must be within [${MIN_MS}ms,${MAX_MS}ms]`,
  ).toBeLessThanOrEqual(MAX_MS);
}

function assertNoMotion(style: MotionStyle, channel: MotionChannel, label: string): void {
  const off =
    channel === "animation"
      ? style.animationName === "none" || cssTimeToMs(style.animationDuration) === 0
      : cssTimeToMs(style.transitionDuration) === 0;
  expect(
    off,
    `${label}: under reduced motion the computed ${channel} (${channelDuration(style, channel)}, name=${style.animationName}) must be off`,
  ).toBe(true);
}

test.describe("Motion language (F403/F404): panel entry + section collapse in [100ms,300ms], silenced under reduced motion; select hover delta", () => {
  test("docked panels (EntryEditor/ProfileEditor/LayoutEditor) animate in within the pinned band", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await page.goto("/library");

    await page.getByRole("button", { name: "Add entry" }).click();
    const entryDialog = page.getByRole("dialog");
    await expect(entryDialog).toBeVisible();
    assertBandedDuration(await readMotionStyle(entryDialog), "animation", "EntryEditor");
    await page.keyboard.press("Escape");
    await expect(entryDialog).toBeHidden();

    await page.getByRole("button", { name: "Edit profile" }).click();
    const profileDialog = page.getByRole("dialog");
    await expect(profileDialog).toBeVisible();
    assertBandedDuration(await readMotionStyle(profileDialog), "animation", "ProfileEditor");
    await page.keyboard.press("Escape");
    await expect(profileDialog).toBeHidden();

    await page.getByRole("button", { name: "Edit layout" }).click();
    const layoutDialog = page.getByRole("dialog");
    await expect(layoutDialog).toBeVisible();
    assertBandedDuration(await readMotionStyle(layoutDialog), "animation", "LayoutEditor");
  });

  test("section collapse (ApplicationDetail's 'job' section) animates via grid-rows within the pinned band", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const company = `E2E Motion Section Co ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: JD });
    await page.goto(`/applications/${applicationId}`);

    const track = page.getByTestId("section-collapse-track-job");
    const body = page.getByTestId("workspace-section-body-job");
    await expect(body).toBeVisible();
    assertBandedDuration(
      await readMotionStyle(track),
      "transition",
      "section-collapse-track-job (collapsing)",
    );

    await page.getByTestId("section-collapse-job").click();
    await expect(body).toBeHidden();
    assertBandedDuration(
      await readMotionStyle(track),
      "transition",
      "section-collapse-track-job (expanding back)",
    );
  });

  test("reduced motion: panel entry and section collapse both compute to no animation", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    const company = `E2E Motion Reduce Co ${runId}-${testInfo.retry}`;
    const applicationId = await createApplication(page, { company, jd: JD });
    await page.goto(`/applications/${applicationId}`);
    await page.emulateMedia({ reducedMotion: "reduce" });

    // Section collapse: close then re-open UNDER reduced motion — the
    // re-open is the transition whose computed style must show no motion.
    const toggle = page.getByTestId("section-collapse-job");
    const body = page.getByTestId("workspace-section-body-job");
    await toggle.click();
    await expect(body).toBeHidden();
    await toggle.click();
    await expect(body).toBeVisible();
    assertNoMotion(
      await readMotionStyle(page.getByTestId("section-collapse-track-job")),
      "transition",
      "section-collapse-track-job under reduced motion",
    );

    // Docked panel entry: a fresh open, still under reduced motion.
    await page.goto("/library");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Add entry" }).click();
    const entryDialog = page.getByRole("dialog");
    await expect(entryDialog).toBeVisible();
    assertNoMotion(
      await readMotionStyle(entryDialog),
      "animation",
      "EntryEditor under reduced motion",
    );
  });

  test("select trigger: hover produces a computed background-color delta with a non-zero transition-duration", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await page.goto("/library");

    await page.getByRole("button", { name: "Add entry" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const trigger = dialog.getByRole("combobox", { name: "Section" });
    await expect(trigger).toBeVisible();

    const restBg = await trigger.evaluate((el) => getComputedStyle(el).backgroundColor);
    const transitionDuration = await trigger.evaluate(
      (el) => getComputedStyle(el).transitionDuration,
    );

    // Start the mouse somewhere neutral so the hover below is a genuine
    // enter, not a no-op re-hover of wherever the previous step left it.
    await page.mouse.move(2, 2);
    await trigger.hover();
    // The delta is reached via a CSS transition (not instant) — let it settle
    // past its own transition-duration before reading the resting color, same
    // margin as applications.spec.ts/rail-collapse.spec.ts use for their own
    // transition settle waits.
    await page.waitForTimeout(300);
    const hoverBg = await trigger.evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(
      hoverBg,
      `select trigger hover must produce a computed background-color delta (rest ${restBg}, hover ${hoverBg})`,
    ).not.toBe(restBg);
    expect(
      cssTimeToMs(transitionDuration),
      "select trigger must declare a non-zero transition-duration",
    ).toBeGreaterThan(0);
  });
});

// v5-T004 (OQ6) — the rail's collapsible labels (nav labels, the wordmark
// "Lede" text, the expanded footer row labels) used to hard mount/unmount at
// t=0 while the rail `<aside>`'s own 200ms width slide (rail-collapse.spec.ts)
// was still running — the "pop" a human flagged. They now fade opacity IN
// STEP with that slide (no start delay), swap instantly under
// prefers-reduced-motion, and — this is the ticket's hard constraint — the
// SETTLED collapsed state is unchanged from before: the label is genuinely
// GONE (unmounted, zero width), never merely CSS-hidden behind an
// overflow-clip (T001's own invariant, re-checked below, forbids that).
//
// "Mid-slide" is proven DETERMINISTICALLY, not by racing a real 200ms
// transition from Node: `Element.getAnimations()` returns the live
// CSSTransition for a property once triggered, and pausing it + setting
// `.currentTime` scrubs it to an exact, reproducible point on its own
// timeline — immune to CI scheduling jitter. `duration-200 ease-in-out` is
// symmetric about its own midpoint, so freezing at 100ms of a 200ms
// transition lands both the aside's width and a label's opacity at their
// distinct-from-either-endpoint 50% value; a `transition: opacity 1ms` or a
// hard mount/unmount (no transition at all) fails to produce an Animation to
// scrub at all, so `findTransition` below returns null and the assertion
// fails loud rather than silently passing.
test.describe("v5-T004 — rail label fade coordinated with the 200ms width slide", () => {
  function railPane(page: Page): Locator {
    return page.getByTestId("rail-pane");
  }
  function railCollapseToggle(page: Page): Locator {
    return page.getByTestId("rail-collapse-toggle");
  }
  async function railWidth(page: Page): Promise<number> {
    const box = await railPane(page).boundingBox();
    expect(box, "rail-pane must have a boundingBox").toBeTruthy();
    return box!.width;
  }

  /**
   * The three label groups, EVERY individual label (not one sampled per
   * group): the three nav items, the wordmark text, and both footer rows
   * (theme + logout). Each locator resolves to the `<span>` actually carrying
   * the fade classes — `span:not([aria-hidden])` for the wordmark excludes
   * the always-visible "L" box, which is a sibling `<span>` in the same link.
   */
  function labelGroups(page: Page): { name: string; locator: Locator }[] {
    const nav = page.getByRole("navigation", { name: "Primary" });
    return [
      {
        name: "nav:Applications",
        locator: nav.getByRole("link", { name: "Applications" }).locator("span"),
      },
      { name: "nav:Library", locator: nav.getByRole("link", { name: "Library" }).locator("span") },
      {
        name: "nav:Settings",
        locator: nav.getByRole("link", { name: "Settings" }).locator("span"),
      },
      { name: "wordmark:Lede", locator: railWordmark(page).locator("span:not([aria-hidden])") },
      { name: "footer:theme", locator: themeToggleButton(page).locator("span") },
      { name: "footer:logout", locator: railLogoutButton(page).locator("span") },
    ];
  }

  /**
   * Finds the live CSSTransition Animation for `property` on `handle` inside
   * the page, pauses it, and scrubs it to `atMs` on its OWN timeline — then
   * resumes it (`.play()`) so it continues settling naturally afterward
   * (this is a diagnostic freeze-and-read, not meant to leave the real
   * collapse transition stuck). Returns `null` if no such transition is
   * running (the reduced-motion case, or a regression that removed the
   * transition entirely).
   */
  async function scrubTransition(
    locator: Locator,
    property: string,
    atMs: number,
  ): Promise<{ value: string } | null> {
    return locator.evaluate(
      async (el, { property, atMs }) => {
        let anim: Animation | undefined;
        for (let i = 0; i < 60 && !anim; i++) {
          anim = el
            .getAnimations()
            .find(
              (a) =>
                (a as unknown as { transitionProperty?: string }).transitionProperty === property,
            );
          if (!anim) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        if (!anim) return null;
        anim.pause();
        anim.currentTime = atMs;
        const value = getComputedStyle(el).getPropertyValue(property);
        anim.play();
        return { value };
      },
      { property, atMs },
    );
  }

  test("no-preference: every label fades in step with the 200ms width slide, and is genuinely gone (not just invisible) once settled — collapsing and expanding both directions", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    // Expanded baseline: every label present, opacity ~1.
    for (const { name, locator } of labelGroups(page)) {
      await expect(locator, `${name}: must be present expanded`).toHaveCount(1);
      const opacity = await locator.evaluate((el) => getComputedStyle(el).opacity);
      expect(Number.parseFloat(opacity), `${name}: expanded opacity must be ~1`).toBeGreaterThan(
        0.95,
      );
    }

    // Collapse — freeze the aside's own width transition AND every label's
    // opacity transition mid-flight (100ms into their shared 200ms window),
    // proving the fade runs IN STEP with the slide, not delayed or instant.
    await railCollapseToggle(page).click();

    const asideMid = await scrubTransition(railPane(page), "width", 100);
    expect(asideMid, "rail-pane width transition must be running mid-collapse").not.toBeNull();
    const asideWidthMid = Number.parseFloat(asideMid!.value);
    expect(
      asideWidthMid,
      "mid-slide aside width must be strictly between 48 and 224",
    ).toBeGreaterThan(48);
    expect(asideWidthMid).toBeLessThan(224);

    for (const { name, locator } of labelGroups(page)) {
      const mid = await scrubTransition(locator, "opacity", 100);
      expect(
        mid,
        `${name}: opacity transition must be running mid-slide (no hard mount/unmount, no 1ms transition)`,
      ).not.toBeNull();
      const opacityMid = Number.parseFloat(mid!.value);
      expect(
        opacityMid,
        `${name}: mid-slide opacity (${opacityMid}) must be strictly between 0 and 1, simultaneously with the width slide`,
      ).toBeGreaterThan(0.05);
      expect(opacityMid).toBeLessThan(0.95);
    }

    // Let the (now-resumed) transitions actually settle.
    await expect.poll(() => railWidth(page), { timeout: 5000 }).toBeLessThanOrEqual(64);
    await page.waitForTimeout(250);
    await expect(railPane(page)).toHaveAttribute("data-collapsed", "true");

    // Settled collapsed: every label genuinely GONE — not present-but-faded.
    for (const { name, locator } of labelGroups(page)) {
      await expect(
        locator,
        `${name}: must be unmounted (not just invisible) once settled collapsed`,
      ).toHaveCount(0);
    }

    // T001's own invariant, re-checked here with faded labels in play: no
    // rail-pane descendant may overflow, and nothing may mask overflow with
    // a clipper — a faded-out label must add zero width, never be clipped.
    const violations = await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="rail-pane"]');
      if (!pane) return [{ tag: "MISSING", detail: "rail-pane not found" }];
      const masking = new Set(["hidden", "clip", "scroll"]);
      const found: { tag: string; detail: string }[] = [];
      for (const el of Array.from(pane.querySelectorAll("*"))) {
        const widthOverflows = el.scrollWidth > el.clientWidth + 1;
        const heightOverflows = el.scrollHeight > el.clientHeight + 1;
        if (widthOverflows) {
          found.push({
            tag: el.tagName,
            detail: `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`,
          });
        }
        if (widthOverflows || heightOverflows) {
          const style = getComputedStyle(el);
          if (masking.has(style.overflowX) || masking.has(style.overflowY)) {
            found.push({
              tag: el.tagName,
              detail: `masks overflow (x=${style.overflowX}, y=${style.overflowY})`,
            });
          }
        }
      }
      return found;
    });
    expect(
      violations,
      `rail-pane overflow/masking violations: ${JSON.stringify(violations)}`,
    ).toEqual([]);

    // Expand back — a real two-way fade, not one-directional.
    await railCollapseToggle(page).click();
    await expect.poll(() => railWidth(page), { timeout: 5000 }).toBeGreaterThan(200);
    await page.waitForTimeout(250);
    await expect(railPane(page)).toHaveAttribute("data-collapsed", "false");

    for (const { name, locator } of labelGroups(page)) {
      await expect(locator, `${name}: must be present again expanded`).toHaveCount(1);
      const opacity = await locator.evaluate((el) => getComputedStyle(el).opacity);
      expect(
        Number.parseFloat(opacity),
        `${name}: opacity must be back to ~1 once re-expanded`,
      ).toBeGreaterThan(0.95);
    }
  });

  test("reduced motion: every label swaps 0<->1 instantly, with no mounted-but-fading intermediate frame", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const { name, locator } of labelGroups(page)) {
      await expect(locator, `${name}: must be present expanded`).toHaveCount(1);
    }

    await railCollapseToggle(page).click();
    await expect(railPane(page)).toHaveAttribute("data-collapsed", "true");

    // No wall-clock wait: under reduced motion the swap must already be
    // complete by the time React has committed the collapse — no lingering
    // mounted-but-opacity-fading frame to catch, and no Animation to scrub.
    for (const { name, locator } of labelGroups(page)) {
      await expect(
        locator,
        `${name}: must already be unmounted — no fade frame under reduced motion`,
      ).toHaveCount(0);
    }
    const asideAnimUnderReducedMotion = await railPane(page).evaluate((el) =>
      el
        .getAnimations()
        .some(
          (a) => (a as unknown as { transitionProperty?: string }).transitionProperty === "width",
        ),
    );
    expect(
      asideAnimUnderReducedMotion,
      "the aside's own width transition must be off under reduced motion too",
    ).toBe(false);

    // And back — instant reveal, no intermediate opacity-0-but-mounted frame.
    await railCollapseToggle(page).click();
    await expect(railPane(page)).toHaveAttribute("data-collapsed", "false");
    for (const { name, locator } of labelGroups(page)) {
      await expect(
        locator,
        `${name}: must already be mounted at opacity ~1 — instant reveal under reduced motion`,
      ).toHaveCount(1);
      const opacity = await locator.evaluate((el) => getComputedStyle(el).opacity);
      expect(Number.parseFloat(opacity)).toBeGreaterThan(0.95);
    }
  });

  // Escaped-bug strengthening (coordinator re-verify of T004): unifying the
  // nav render path put every NavLink under `<TooltipTrigger asChild>`, and
  // Radix's Slot string-JOINS a child's `className` — so NavLink's
  // `({ isActive }) => …` FUNCTION className got stringified to its own
  // source text and `bg-accent` silently stopped applying to the ACTIVE tab.
  // rail-design.spec.ts (v5-T002) asserts this for the EXPANDED active link;
  // the COLLAPSED active link went through the identical asChild+function
  // path and had been broken since T001 with no test covering it. This
  // pins BOTH states: the active nav link's computed background-color must
  // resolve to the --accent-bg token in expanded AND collapsed.
  test("active nav link keeps its --accent-bg highlight in BOTH expanded and collapsed (asChild + string className, not a stringified function)", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page, PASSWORD);
    await expect(page).toHaveURL(/\/applications$/);

    function parseRgbaChannels(css: string): [number, number, number, number] {
      const [r, g, b, a] = css
        .replace(/[^\d.,]/g, "")
        .split(",")
        .map(Number);
      return [r ?? 0, g ?? 0, b ?? 0, a ?? 1];
    }
    async function resolveToken(raw: string): Promise<[number, number, number, number]> {
      const resolved = await page.evaluate((value) => {
        const probe = document.createElement("div");
        probe.style.color = value;
        document.body.appendChild(probe);
        const computed = getComputedStyle(probe).color;
        probe.remove();
        return computed;
      }, raw);
      return parseRgbaChannels(resolved);
    }
    function sameColor(
      a: [number, number, number, number],
      b: [number, number, number, number],
    ): boolean {
      return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && Math.abs(a[3] - b[3]) < 0.02;
    }

    const accentBgRaw = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--accent-bg").trim(),
    );
    expect(accentBgRaw.length, "--accent-bg must be a defined token").toBeGreaterThan(0);
    const accentBg = await resolveToken(accentBgRaw);

    // Default landing route is /applications, so its nav link is active.
    const activeLink = page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Applications" });

    const expandedBg = parseRgbaChannels(
      await activeLink.evaluate((el) => getComputedStyle(el).backgroundColor),
    );
    expect(
      sameColor(expandedBg, accentBg),
      `expanded active nav link background (${JSON.stringify(expandedBg)}) must resolve to --accent-bg (${JSON.stringify(accentBg)}) — a stringified function className fails this`,
    ).toBe(true);

    await railCollapseToggle(page).click();
    await expect(railPane(page)).toHaveAttribute("data-collapsed", "true");
    await page.waitForTimeout(250);

    const collapsedBg = parseRgbaChannels(
      await activeLink.evaluate((el) => getComputedStyle(el).backgroundColor),
    );
    expect(
      sameColor(collapsedBg, accentBg),
      `collapsed active nav link background (${JSON.stringify(collapsedBg)}) must resolve to --accent-bg (${JSON.stringify(accentBg)}) — the silent gap since T001`,
    ).toBe(true);
  });
});
