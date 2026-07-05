// genState → pill — spec.md §27. The only status Lede surfaces: the tailor
// lifecycle, never hiring status (applied/interviewing/rejected).

import type { Application } from "@shared/types";
import { Badge, type BadgeProps } from "./ui/badge";

const GEN_STATE_LABEL: Record<Application["genState"], string> = {
  untailored: "Untailored",
  tailoring: "Tailoring…",
  tailored: "Tailored",
  failed: "Failed",
};

const GEN_STATE_VARIANT: Record<Application["genState"], NonNullable<BadgeProps["variant"]>> = {
  untailored: "outline",
  tailoring: "default",
  tailored: "success",
  failed: "destructive",
};

export function GenStateBadge({ state }: { state: Application["genState"] }) {
  return <Badge variant={GEN_STATE_VARIANT[state]}>{GEN_STATE_LABEL[state]}</Badge>;
}
