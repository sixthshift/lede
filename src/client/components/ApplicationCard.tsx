// One tailoring record's list-row summary — spec.md §27. Applications are
// tailoring records, not a hiring tracker: the only status surfaced here is
// genState (untailored/tailoring/tailored/failed) — never applied/interviewing/
// rejected or any kanban-style hiring status.

import type { Application } from "@shared/types";
import { Link } from "react-router-dom";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { GenStateBadge } from "./GenStateBadge";

type ApplicationSummary = Omit<Application, "current" | "locked">;

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
  return (
    <Link
      to={`/applications/${application.id}`}
      className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card
        data-application-id={application.id}
        className="flex h-full flex-col transition-shadow hover:shadow-md"
      >
        <CardHeader className="gap-1 space-y-0 pb-3">
          {application.company ? (
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {application.company}
            </p>
          ) : null}
          <CardTitle className="text-md leading-snug">
            {application.role || "Untitled application"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {jdPreview(application.jobDescription)}
          </p>
        </CardContent>
        <CardFooter className="mt-auto justify-between border-t border-border/60 py-3">
          <GenStateBadge state={application.genState} />
          <span className="text-xs text-muted-foreground">
            Updated {formatUpdatedAt(application.updatedAt)}
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}
