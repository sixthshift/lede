// Pure model — no DB, no fixtures, no jsdom.
import { describe, expect, it } from "vitest";
import type { Application, CoverLetter, TailoredResume } from "@shared/types";
import {
  deriveJourneyStage,
  type DisclosureSectionKey,
  resolveDisclosure,
} from "../src/client/lib/journey-stage";

const RESUME: TailoredResume = {
  signals: { roleLevel: "mid", weights: [], hardRequirements: [] },
  summary: "",
  sections: [],
  cut: [],
};

const LETTER: CoverLetter = { greeting: "", body: [], closing: "" };

// Full Application shape so the currentMeta/letter-independence assertions
// can flip an out-of-scope field without touching the ones that matter.
function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: "app-1",
    jobDescription: "",
    targetPages: 1,
    format: null,
    current: null,
    locked: null,
    lockedFormat: null,
    genState: "untailored",
    currentMeta: null,
    letterCurrent: null,
    letterPrevious: null,
    letterGenState: "untailored",
    letterFailedReason: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("deriveJourneyStage — stage contrasts", () => {
  it("idle, no current -> setup", () => {
    expect(deriveJourneyStage(makeApp())).toBe("setup");
  });

  it("genState=tailoring, current:null -> tailoring", () => {
    expect(deriveJourneyStage(makeApp({ genState: "tailoring" }))).toBe("tailoring");
  });

  it("genState=tailoring, surviving current -> review (must beat tailoring)", () => {
    expect(deriveJourneyStage(makeApp({ genState: "tailoring", current: RESUME }))).toBe("review");
  });

  it("current set, locked null, idle -> review", () => {
    expect(deriveJourneyStage(makeApp({ current: RESUME }))).toBe("review");
  });

  it("locked set -> final", () => {
    expect(deriveJourneyStage(makeApp({ locked: RESUME }))).toBe("final");
  });

  it("unlock (locked null again), current survives -> review", () => {
    expect(deriveJourneyStage(makeApp({ locked: null, current: RESUME }))).toBe("review");
  });

  it("genState=failed, current:null -> setup", () => {
    expect(deriveJourneyStage(makeApp({ genState: "failed" }))).toBe("setup");
  });

  it("genState=failed, surviving current -> review", () => {
    expect(deriveJourneyStage(makeApp({ genState: "failed", current: RESUME }))).toBe("review");
  });

  it("currentMeta present vs absent -> identical stage", () => {
    const withoutMeta = makeApp({ current: RESUME });
    const withMeta = makeApp({
      current: RESUME,
      currentMeta: { at: 1, provider: "anthropic", model: "x" },
    });
    expect(deriveJourneyStage(withMeta)).toBe(deriveJourneyStage(withoutMeta));
  });

  it("letterGenState=tailoring + letterCurrent present -> resume stage identical", () => {
    const bare = makeApp();
    const withLetter = makeApp({
      letterGenState: "tailoring",
      letterCurrent: LETTER,
    });
    expect(deriveJourneyStage(withLetter)).toBe(deriveJourneyStage(bare));
  });
});

describe("deriveJourneyStage — exhaustive cross-product", () => {
  const genStates = ["untailored", "tailoring", "tailored", "failed"] as const;
  const settings = [true, false]; // locked set?

  for (const locked of settings) {
    for (const current of settings) {
      for (const genState of genStates) {
        it(`locked=${locked} current=${current} genState=${genState}`, () => {
          const app = makeApp({
            locked: locked ? RESUME : null,
            current: current ? RESUME : null,
            genState,
          });
          const stage = deriveJourneyStage(app);
          if (locked) {
            expect(stage).toBe("final");
          } else if (current) {
            expect(stage).toBe("review");
          } else if (genState === "tailoring") {
            expect(stage).toBe("tailoring");
          } else {
            expect(stage).toBe("setup");
          }
        });
      }
    }
  }
});

describe("resolveDisclosure — matrix (defaults, no override, no letter content)", () => {
  const expected: Record<
    "setup" | "tailoring" | "review" | "final",
    Record<DisclosureSectionKey, { open: boolean; muted: boolean }>
  > = {
    setup: {
      job: { open: true, muted: false },
      letter: { open: false, muted: true },
      design: { open: false, muted: true },
    },
    tailoring: {
      job: { open: true, muted: false },
      letter: { open: false, muted: true },
      design: { open: false, muted: true },
    },
    review: {
      job: { open: false, muted: false },
      letter: { open: true, muted: false },
      design: { open: true, muted: false },
    },
    final: {
      job: { open: false, muted: false },
      letter: { open: false, muted: false },
      design: { open: false, muted: false },
    },
  };

  for (const [stage, sections] of Object.entries(expected) as [
    keyof typeof expected,
    (typeof expected)[keyof typeof expected],
  ][]) {
    for (const [sectionKey, state] of Object.entries(sections) as [
      DisclosureSectionKey,
      { open: boolean; muted: boolean },
    ][]) {
      it(`${stage} x ${sectionKey}`, () => {
        expect(resolveDisclosure(stage, sectionKey)).toEqual(state);
      });
    }
  }
});

describe("resolveDisclosure — letter-content exemption", () => {
  it("setup + letterCurrent -> letter open+unmuted, design stays closed+muted", () => {
    expect(resolveDisclosure("setup", "letter", { letterCurrent: true })).toEqual({
      open: true,
      muted: false,
    });
    expect(resolveDisclosure("setup", "design", { letterCurrent: true })).toEqual({
      open: false,
      muted: true,
    });
  });

  it("review + letterCurrent -> letter open+unmuted (coincides with the review default)", () => {
    expect(resolveDisclosure("review", "letter", { letterCurrent: true })).toEqual({
      open: true,
      muted: false,
    });
  });

  it("final + letterCurrent -> letter stays closed (the final row wins; page reads finished)", () => {
    expect(resolveDisclosure("final", "letter", { letterCurrent: true })).toEqual({
      open: false,
      muted: false,
    });
  });
});

describe("resolveDisclosure — override precedence", () => {
  it("userOverride=collapsed on design at review -> open:false (review default is open)", () => {
    expect(resolveDisclosure("review", "design", { userOverride: true })).toEqual({
      open: false,
      muted: false,
    });
  });

  it("userOverride=expanded on letter in setup -> open+unmuted", () => {
    expect(resolveDisclosure("setup", "letter", { userOverride: false })).toEqual({
      open: true,
      muted: false,
    });
  });

  it("any override unmutes, both directions", () => {
    expect(resolveDisclosure("setup", "design", { userOverride: true }).muted).toBe(false);
    expect(resolveDisclosure("setup", "design", { userOverride: false }).muted).toBe(false);
  });

  it("no override at review -> untouched sections re-default", () => {
    expect(resolveDisclosure("review", "job")).toEqual({ open: false, muted: false });
  });
});

describe("resolveDisclosure — joint independence within one pass", () => {
  it("design overridden collapsed while letter has no override, both at review", () => {
    expect(resolveDisclosure("review", "design", { userOverride: true })).toEqual({
      open: false,
      muted: false,
    });
    expect(resolveDisclosure("review", "letter")).toEqual({ open: true, muted: false });
  });
});
