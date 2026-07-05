// One application's detail page body — spec.md §27. Routing/nav is a
// separate ticket (E6-B2); this takes an id and renders the record.
// The tailor/lock lifecycle actions live up here in the page header — always
// visible — while JobPanel below is just the editable record.

import { ArrowLeft, BookOpen, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { DEFAULT_FORMAT } from "@shared/format";
import type { DocumentFormat } from "@shared/types";
import { downloadResumePdf } from "../document/download";
import { useProfile, useSettings } from "../hooks/queries";
import {
  useApplication,
  useLockApplication,
  useTailorApplication,
  useUnlockApplication,
  useUpdateApplication,
} from "../queries/useApplications";
import { DesignPanel } from "./DesignPanel";
import { GenStateBadge } from "./GenStateBadge";
import { JobPanel } from "./JobPanel";
import { ResultView } from "./ResultView";
import { TemplatePicker } from "./TemplatePicker";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Skeleton } from "./ui/skeleton";

function formatStaleDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ApplicationDetail({ applicationId }: { applicationId: string }) {
  const { data: application, isLoading, isError } = useApplication(applicationId);
  const { data: profile } = useProfile();
  const { data: settings } = useSettings();
  const tailorApplication = useTailorApplication();
  const lockApplication = useLockApplication();
  const unlockApplication = useUnlockApplication();
  const updateApplication = useUpdateApplication();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (isError || !application) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn't load application.
      </p>
    );
  }

  const isTailoring = tailorApplication.isPending || application.genState === "tailoring";
  const tailorLabel = application.genState === "untailored" ? "Tailor" : "Re-tailor";

  // Locked freezes the look along with the resume — editing a locked app's
  // format is out of scope (it froze what was actually sent), so the design
  // panel reflects lockedFormat.format read-only rather than the live
  // application.format/settings.defaultFormat fallback chain.
  const isLocked = Boolean(application.locked);
  const resolvedFormat: DocumentFormat = isLocked
    ? (application.lockedFormat?.format ?? DEFAULT_FORMAT)
    : (application.format ?? settings?.defaultFormat ?? DEFAULT_FORMAT);

  const handleFormatChange = (next: DocumentFormat) => {
    if (isLocked) return;
    updateApplication.mutate({ id: applicationId, input: { format: next } });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/applications"
          className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
          Applications
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {application.company ? (
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                {application.company}
              </p>
            ) : null}
            <div className="mt-1 flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {application.role || "Untitled application"}
              </h1>
              <GenStateBadge state={application.genState} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isTailoring ? <span className="text-sm text-muted-foreground">Tailoring…</span> : null}
            <Button
              variant="outline"
              onClick={() =>
                application.locked
                  ? unlockApplication.mutate(application.id)
                  : lockApplication.mutate(application.id)
              }
              disabled={
                (!application.locked && !application.current) ||
                lockApplication.isPending ||
                unlockApplication.isPending
              }
            >
              {application.locked ? "Unlock" : "Lock final"}
            </Button>
            <Button onClick={() => tailorApplication.mutate(application.id)} disabled={isTailoring}>
              {tailorLabel}
            </Button>
            <Button
              variant="outline"
              disabled={!application.current || !profile}
              onClick={() =>
                profile &&
                application.current &&
                downloadResumePdf({
                  resume: application.current,
                  profile,
                  company: application.company,
                  role: application.role,
                })
              }
            >
              Download PDF
            </Button>
          </div>
        </div>
      </div>

      <JobPanel application={application} />

      <Card>
        <CardHeader>
          <CardTitle className="text-md">Design</CardTitle>
          <CardDescription>
            {isLocked
              ? "Locked — this reflects the look frozen at lock time. Unlock to edit."
              : "Template and formatting for this application's document. Changes repaint the preview live."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <TemplatePicker
            format={resolvedFormat}
            onChange={handleFormatChange}
            readOnly={isLocked}
          />
          <DesignPanel format={resolvedFormat} onChange={handleFormatChange} readOnly={isLocked} />
        </CardContent>
      </Card>

      {application.currentMeta ? (
        <p className="flex items-center gap-2 rounded-lg bg-warn-soft px-4 py-2.5 text-sm text-warn">
          <Clock aria-hidden className="h-4 w-4 shrink-0" />
          Tailored from your Library as of {formatStaleDate(application.currentMeta.at)} — re-tailor
          to fold in newer entries.
        </p>
      ) : null}

      {application.current ? (
        <ResultView resume={application.current} format={resolvedFormat} />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong py-16 text-center">
          <BookOpen aria-hidden className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-medium">No tailored resume yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tailor pulls from your Library —{" "}
              <Link to="/library" className="text-primary underline underline-offset-4">
                add missing facts in Library →
              </Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
