// genState → pill — spec.md §27. The only status Lede surfaces: the tailor
// lifecycle, never hiring status (applied/interviewing/rejected). The letter
// pipeline (T24) shares the same four-state taxonomy (untailored/tailoring/
// tailored/failed) but is a DISTINCT generation — its own labels via `kind`
// so a letter badge can never be read as a resume-tailor status, or vice versa.

import type { Application } from "@shared/types";
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

export function GenStateBadge({
  state,
  kind = "resume",
}: {
  state: GenState;
  kind?: "resume" | "letter";
}) {
  const label = kind === "letter" ? LETTER_GEN_STATE_LABEL[state] : GEN_STATE_LABEL[state];
  return <Badge variant={GEN_STATE_VARIANT[state]}>{label}</Badge>;
}
