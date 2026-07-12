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
import { test, expect, type Locator } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { login, createApplication } from "./helpers/workspace";

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
