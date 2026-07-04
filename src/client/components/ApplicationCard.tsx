// One tailoring record's list-row summary — spec.md §27. Applications are
// tailoring records, not a hiring tracker: the only status surfaced here is
// genState (untailored/tailoring/tailored/failed) — never applied/interviewing/
// rejected or any kanban-style hiring status.

import type { Application } from "@shared/types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge, type BadgeProps } from "./ui/badge";

type ApplicationSummary = Omit<Application, "current" | "locked">;

const GEN_STATE_LABEL: Record<Application["genState"], string> = {
  untailored: "Untailored",
  tailoring: "Tailoring…",
  tailored: "Tailored",
  failed: "Failed",
};

const GEN_STATE_VARIANT: Record<Application["genState"], NonNullable<BadgeProps["variant"]>> = {
  untailored: "outline",
  tailoring: "secondary",
  tailored: "default",
  failed: "destructive",
};

const JD_PREVIEW_LENGTH = 160;

function jdPreview(jobDescription: string): string {
  const trimmed = jobDescription.trim();
  return trimmed.length > JD_PREVIEW_LENGTH ? `${trimmed.slice(0, JD_PREVIEW_LENGTH)}…` : trimmed;
}

function formatUpdatedAt(updatedAt: number): string {
  return new Date(updatedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ApplicationCard({ application }: { application: ApplicationSummary }) {
  const title = [application.role, application.company].filter(Boolean).join(" · ");

  return (
    <Card data-application-id={application.id}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{title || "Untitled application"}</CardTitle>
        <Badge variant={GEN_STATE_VARIANT[application.genState]}>
          {GEN_STATE_LABEL[application.genState]}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{jdPreview(application.jobDescription)}</p>
        <p className="text-xs text-muted-foreground">
          Updated {formatUpdatedAt(application.updatedAt)}
        </p>
      </CardContent>
    </Card>
  );
}
