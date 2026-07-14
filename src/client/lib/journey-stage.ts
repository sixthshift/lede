// Pure journey-stage model + disclosure resolver — no React, no IO. The
// workspace shell (later ticket) reads these to decide what's open/muted;
// this module owns none of that wiring, only the taxonomy.
import type { Application } from "@shared/types";

export type JourneyStage = "setup" | "tailoring" | "review" | "final";

// Resume-lifecycle fields only (locked/current/genState) — currentMeta and
// the letter fields are deliberately excluded from the input type so a
// caller can't accidentally let them leak into the stage decision.
type StageInput = Pick<Application, "locked" | "current" | "genState">;

// First-match-wins taxonomy (locked decision, never re-litigate): a
// re-tailor in flight or a failed re-tailor both stay "review" as long as a
// prior `current` survives — only the absence of a surviving snapshot lets
// "tailoring" or "setup" match.
export function deriveJourneyStage(application: StageInput): JourneyStage {
  if (application.locked) return "final";
  if (application.current) return "review";
  if (application.genState === "tailoring") return "tailoring";
  return "setup";
}

export type DisclosureSectionKey = "job" | "letter" | "design";

export type DisclosureState = { open: boolean; muted: boolean };

type DisclosureOptions = {
  // true = collapsed, matching the sectionCollapse store's truthy-means-
  // collapsed convention (ApplicationDetail.tsx). Absent = no override.
  userOverride?: boolean;
  letterCurrent?: boolean;
};

// Stage defaults per section, before the override/exemption layers below.
// `design` is unaffected by the letter-content exemption, so it's plain data;
// `job`/`letter` get adjusted afterward.
const STAGE_DEFAULTS: Record<JourneyStage, Record<DisclosureSectionKey, DisclosureState>> = {
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

export function resolveDisclosure(
  stage: JourneyStage,
  sectionKey: DisclosureSectionKey,
  options: DisclosureOptions = {},
): DisclosureState {
  const { userOverride, letterCurrent } = options;

  // Precedence: an explicit override (either direction) always wins and
  // always unmutes — muted is a default-state treatment only.
  if (userOverride !== undefined) {
    return { open: !userOverride, muted: false };
  }

  // Letter-content exemption, scoped to setup/tailoring only: a letter that
  // already has content is never muted and defaults open there. Review's
  // default is already open+unmuted; final keeps its all-closed row — the
  // page reads finished regardless of letter content. Design is untouched —
  // it only tracks resume state.
  if (sectionKey === "letter" && letterCurrent && (stage === "setup" || stage === "tailoring")) {
    return { open: true, muted: false };
  }

  return STAGE_DEFAULTS[stage][sectionKey];
}
