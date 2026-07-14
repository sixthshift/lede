// genState → pill — spec.md §27. The only status Lede surfaces: the tailor
// lifecycle, never hiring status (applied/interviewing/rejected). The letter
// pipeline (T24) shares the same four-state taxonomy (untailored/tailoring/
// tailored/failed) but is a DISTINCT generation — its own labels via `kind`
// so a letter badge can never be read as a resume-tailor status, or vice versa.

import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import type { Application } from "@shared/types";
import type { JourneyStage } from "../lib/journey-stage";
import { cn } from "../lib/utils";
import { Badge, type BadgeProps } from "./ui/badge";

type GenState = Application["genState"];

const GEN_STATE_LABEL: Record<GenState, string> = {
  untailored: "Untailored",
  tailoring: "Tailoring…",
  tailored: "Tailored",
  failed: "Failed",
};

const LETTER_GEN_STATE_LABEL: Record<GenState, string> = {
  untailored: "No letter",
  tailoring: "Generating…",
  tailored: "Letter ready",
  failed: "Letter failed",
};

const GEN_STATE_VARIANT: Record<GenState, NonNullable<BadgeProps["variant"]>> = {
  untailored: "outline",
  tailoring: "default",
  tailored: "success",
  failed: "destructive",
};

/** The pill's visible wording for a state — exported so the collapsed rail's
 *  icon variant can carry the SAME words into its tooltip/aria-label. */
export function genStateLabel(state: GenState, kind: "resume" | "letter" = "resume"): string {
  return kind === "letter" ? LETTER_GEN_STATE_LABEL[state] : GEN_STATE_LABEL[state];
}

export function GenStateBadge({
  state,
  kind = "resume",
}: {
  state: GenState;
  kind?: "resume" | "letter";
}) {
  return <Badge variant={GEN_STATE_VARIANT[state]}>{genStateLabel(state, kind)}</Badge>;
}

// Icon-only variant for the rail's collapsed (48px) band, where a text pill
// can't shrink below its wording and overflows. Same four-state taxonomy;
// tones reuse the pill variants' own text tokens so the two representations
// can't drift apart. Carries no accessible name itself — the caller owns the
// label (tooltip + aria), since only it knows what context the collapse hid.
const GEN_STATE_ICON: Record<GenState, LucideIcon> = {
  untailored: CircleDashed,
  tailoring: LoaderCircle,
  tailored: CircleCheck,
  failed: CircleAlert,
};

const GEN_STATE_ICON_TONE: Record<GenState, string> = {
  untailored: "text-muted-foreground",
  tailoring: "text-primary",
  tailored: "text-success",
  failed: "text-danger",
};

export function GenStateIcon({ state }: { state: GenState }) {
  const Icon = GEN_STATE_ICON[state];
  return (
    <Icon
      aria-hidden
      strokeWidth={2}
      className={cn("h-4 w-4", GEN_STATE_ICON_TONE[state], state === "tailoring" && "animate-spin")}
    />
  );
}

// T007 (application-page-flow spec, "Dashboard cards show journey position"):
// the dashboard card's stage pill — it REPLACES the resume GenStateBadge on
// the card (the detail page keeps GenStateBadge untouched). Journey-stage
// wording (setup/tailoring/review/final) is a different taxonomy than
// genState (a failed re-tailor is still "review" if a prior `current`
// survives), so this is kept apart from GenStateBadge rather than folded
// into its `kind` union; the card's failed treatment still comes from
// GenStateBadge, rendered alongside this pill.
const JOURNEY_STAGE_LABEL: Record<JourneyStage, string> = {
  setup: "Not tailored",
  tailoring: "Tailoring…",
  review: "Tailored",
  final: "Locked",
};

const JOURNEY_STAGE_VARIANT: Record<JourneyStage, NonNullable<BadgeProps["variant"]>> = {
  setup: "outline",
  tailoring: "default",
  review: "success",
  final: "secondary",
};

export function JourneyStagePill({ stage }: { stage: JourneyStage }) {
  return (
    <Badge data-testid="application-card-stage-pill" variant={JOURNEY_STAGE_VARIANT[stage]}>
      {JOURNEY_STAGE_LABEL[stage]}
    </Badge>
  );
}
