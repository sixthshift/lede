// One application's detail page body — spec.md §27. Routing/nav is a
// separate ticket (E6-B2); this takes an id and renders the record.
// The tailor/lock lifecycle actions live up here in the page header — always
// visible — while JobPanel below is just the editable record.

import { ArrowLeft, BookOpen, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DEFAULT_FORMAT } from "@shared/format";
import type { DocumentFormat, Paper, Profile, TailoredResume } from "@shared/types";
import { downloadResumePdf, downloadResumeText } from "../document/download";
import { applyDensity, fitToPages, type FitResult } from "../document/fit";
import { getTemplate } from "../document/registry";
import { useProfile, useSettings } from "../hooks/queries";
import {
  useApplication,
  useLockApplication,
  useTailorApplication,
  useUnlockApplication,
  useUpdateApplication,
} from "../queries/useApplications";
import { AtsView } from "./AtsView";
import { DesignPanel } from "./DesignPanel";
import { FitChip } from "./FitChip";
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

// The fit ladder (§28.4) is a per-render computation, never persisted — this
// hook just re-runs it whenever the inputs that could change the outcome
// change, so the chip/preview/download always agree on the SAME FitResult.
function useFit(args: {
  resume: TailoredResume | null;
  profile: Profile | undefined;
  format: DocumentFormat;
  paper: Paper;
  targetPages: number;
}): FitResult | null {
  const { resume, profile, format, paper, targetPages } = args;
  const [fit, setFit] = useState<FitResult | null>(null);

  useEffect(() => {
    setFit(null);
    if (!resume || !profile) return;
    let cancelled = false;
    fitToPages({ resume, profile, format, paper, targetPages }).then(
      (result) => {
        if (!cancelled) setFit(result);
      },
      () => {
        // A failed fit measurement (e.g. a font asset unavailable in a given
        // render context) just leaves the density decision unmade — the
        // chip stays hidden and preview/download fall back to the authored
        // format untouched; it never surfaces as an unhandled rejection.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [resume, profile, format, paper, targetPages]);

  return fit;
}

export function ApplicationDetail({ applicationId }: { applicationId: string }) {
  const { data: application, isLoading, isError } = useApplication(applicationId);
  const { data: profile } = useProfile();
  const { data: settings } = useSettings();
  const tailorApplication = useTailorApplication();
  const lockApplication = useLockApplication();
  const unlockApplication = useUnlockApplication();
  const updateApplication = useUpdateApplication();

  // Preview vs "what the ATS sees" (§28.6) — a view toggle, not a route:
  // both read the SAME current resume + fittedFormat computed below, so
  // switching never re-tailors or re-fits.
  const [view, setView] = useState<"preview" | "ats">("preview");

  // Locked freezes the look along with the resume — editing a locked app's
  // format is out of scope (it froze what was actually sent), so the design
  // panel reflects lockedFormat.format/paper read-only rather than the live
  // application.format/settings fallback chain. Computed ahead of the
  // isLoading/isError early returns below so useFit (a hook) is never called
  // conditionally.
  const isLocked = Boolean(application?.locked);
  const resolvedFormat: DocumentFormat = isLocked
    ? (application?.lockedFormat?.format ?? DEFAULT_FORMAT)
    : (application?.format ?? settings?.defaultFormat ?? DEFAULT_FORMAT);
  const paper: Paper = isLocked
    ? (application?.lockedFormat?.paper ?? settings?.paper ?? "letter")
    : (settings?.paper ?? "letter");
  const targetPages = application?.targetPages ?? 1;

  // Fit once, here — the SAME FitResult drives the chip, the preview, and
  // the download, so the density the chip claims is the density the file
  // actually renders at (§28.4).
  const fit = useFit({
    resume: application?.current ?? null,
    profile,
    format: resolvedFormat,
    paper,
    targetPages,
  });
  const { densityMultipliers } = getTemplate(resolvedFormat.templateId);
  const fittedFormat = fit
    ? applyDensity(resolvedFormat, fit.density, densityMultipliers)
    : resolvedFormat;

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
                  format: fittedFormat,
                })
              }
            >
              Download PDF
            </Button>
            <Button
              variant="outline"
              disabled={!application.current || !profile}
              onClick={() =>
                profile &&
                application.current &&
                downloadResumeText({
                  resume: application.current,
                  profile,
                  company: application.company,
                  role: application.role,
                })
              }
            >
              Plain text
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
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {fit ? <FitChip fit={fit} /> : null}
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={view === "preview" ? "default" : "outline"}
                aria-pressed={view === "preview"}
                onClick={() => setView("preview")}
              >
                Preview
              </Button>
              <Button
                size="sm"
                variant={view === "ats" ? "default" : "outline"}
                aria-pressed={view === "ats"}
                onClick={() => setView("ats")}
              >
                What the ATS sees
              </Button>
            </div>
          </div>

          {fit && !fit.fits ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
              <span>
                Exceeds the {targetPages}-page target — even at the tightest density this renders at{" "}
                {fit.pageCount} pages. Nothing was cut.
              </span>
              <div className="flex gap-2">
                {targetPages === 1 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateApplication.mutate({ id: applicationId, input: { targetPages: 2 } })
                    }
                  >
                    Allow 2 pages
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  title="Re-tailoring to a tighter budget is coming in a later update (E7-D1)."
                >
                  Re-tailor to a tighter budget
                </Button>
              </div>
            </div>
          ) : null}

          {view === "ats" && profile ? (
            <AtsView
              resume={application.current}
              profile={profile}
              format={fittedFormat}
              paper={paper}
            />
          ) : (
            <ResultView resume={application.current} format={fittedFormat} />
          )}
        </div>
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
