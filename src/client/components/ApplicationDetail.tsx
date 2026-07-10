// One application's detail page body — spec.md §27. Routing/nav is a
// separate ticket (E6-B2); this takes an id and renders the record.
// The tailor/lock lifecycle actions live up here in the page header — always
// visible — while JobPanel below is just the editable record.

import { ArrowLeft, BookOpen, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import type { Paper, Profile, TailoredResume } from "@shared/types";
import { ApiError } from "../api";
import { downloadLetterPdf, downloadResumePdf, downloadResumeText } from "../document/download";
import { fitToPages, type FitResult } from "../document/fit";
import { useProfile, useSettings } from "../hooks/queries";
import {
  useApplication,
  useCreateBlankLetter,
  useFlagVoice,
  useGenerateLetter,
  useLockApplication,
  useTailorApplication,
  useUndoLetter,
  useUnlockApplication,
  useUpdateApplication,
} from "../queries/useApplications";
import { AtsView } from "./AtsView";
import { DesignPanel } from "./DesignPanel";
import { FitChip } from "./FitChip";
import { GenStateBadge } from "./GenStateBadge";
import { JobPanel } from "./JobPanel";
import { LetterPreview } from "./LetterPreview";
import { ResultView } from "./ResultView";
import { TemplateGallery } from "./TemplateGallery";
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
//
// fitToPages THROWING is a bug (e.g. its render path broke), never a
// legitimate outcome — the ladder already reports "doesn't fit" via
// FitResult.fits:false. A thrown render must stay visibly distinct from that
// so a broken render can't hide behind the same blank state overflow never
// produces (that swallow is exactly how this feature went silently broken in
// the browser once already).
// Exported so DesignView (E9-F1a) can drive the SAME fit-ladder walk off
// its own resolvedFormat/paper/targetPages — the chip/preview on that view
// must agree with this one, not run a second, possibly-diverging copy.
export function useFit(args: {
  resume: TailoredResume | null;
  profile: Profile | undefined;
  format: DocumentFormatV2;
  paper: Paper;
  targetPages: number;
}): { fit: FitResult | null; fitError: boolean } {
  const { resume, profile, format, paper, targetPages } = args;
  const [fit, setFit] = useState<FitResult | null>(null);
  const [fitError, setFitError] = useState(false);

  useEffect(() => {
    setFit(null);
    setFitError(false);
    if (!resume || !profile) return;
    let cancelled = false;
    fitToPages({ resume, profile, format, paper, targetPages }).then(
      (result) => {
        if (!cancelled) setFit(result);
      },
      (error) => {
        if (cancelled) return;
        console.error(
          "fitToPages threw — the fit chip and fitted density were not computed",
          error,
        );
        setFitError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [resume, profile, format, paper, targetPages]);

  return { fit, fitError };
}

// A flag mutation's error surfaced next to its button — the cap (§ voice-
// source epic, VOICE_SOURCES_CAP=5, server-enforced) is the one expected
// failure worth naming distinctly; anything else is a generic retry prompt.
function flagVoiceErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "voice_cap") {
    return "Voice source cap reached (5) — delete one in Profile to flag another.";
  }
  return "Couldn't flag as a voice source.";
}

export function ApplicationDetail({ applicationId }: { applicationId: string }) {
  const { data: application, isLoading, isError } = useApplication(applicationId);
  const { data: profile } = useProfile();
  const { data: settings } = useSettings();
  const tailorApplication = useTailorApplication();
  const generateLetter = useGenerateLetter();
  const undoLetter = useUndoLetter();
  const lockApplication = useLockApplication();
  const unlockApplication = useUnlockApplication();
  const updateApplication = useUpdateApplication();
  const createBlankLetter = useCreateBlankLetter();
  // Two independent mutation instances — one per output — so a cap-409 on
  // one (e.g. the resume) never renders its error under the other's button.
  const flagVoiceResume = useFlagVoice();
  const flagVoiceLetter = useFlagVoice();

  // Preview vs "what the ATS sees" (§28.6) — a view toggle, not a route:
  // both read the SAME current resume + resolvedFormat/density computed
  // below, so switching never re-tailors or re-fits.
  const [view, setView] = useState<"preview" | "ats">("preview");

  // Locked freezes the look along with the resume — editing a locked app's
  // format is out of scope (it froze what was actually sent), so the design
  // panel reflects lockedFormat.format/paper read-only rather than the live
  // application.format/settings fallback chain. Computed ahead of the
  // isLoading/isError early returns below so useFit (a hook) is never called
  // conditionally.
  const isLocked = Boolean(application?.locked);
  const resolvedFormat: DocumentFormatV2 = isLocked
    ? (application?.lockedFormat?.format ?? DEFAULT_FORMAT_V2)
    : (application?.format ?? settings?.defaultFormat ?? DEFAULT_FORMAT_V2);
  const paper: Paper = isLocked
    ? (application?.lockedFormat?.paper ?? settings?.paper ?? "letter")
    : (settings?.paper ?? "letter");
  const targetPages = application?.targetPages ?? 1;

  // Fit once, here — the SAME FitResult drives the chip, the preview, and
  // the download, so the density the chip claims is the density the file
  // actually renders at (§28.4). Unlike v1 (applyDensity pre-scaled a COPY of
  // format), the engine takes density as a sibling prop of format and applies
  // the ladder itself (EngineDocument) — so `resolvedFormat` rides unscaled
  // to every renderer, with `fit?.density` threaded alongside it.
  const { fit, fitError } = useFit({
    resume: application?.current ?? null,
    profile,
    format: resolvedFormat,
    paper,
    targetPages,
  });
  const density = fit?.density;

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

  const isLetterGenerating = generateLetter.isPending || application.letterGenState === "tailoring";
  const letterLabel =
    application.letterGenState === "untailored" ? "Generate letter" : "Regenerate letter";

  const handleFormatChange = (next: DocumentFormatV2) => {
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
                  format: resolvedFormat,
                  paper,
                  density,
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
            <Button
              variant="outline"
              disabled={!application.current || flagVoiceResume.isPending}
              data-testid="flag-voice-resume"
              onClick={() => flagVoiceResume.mutate({ id: application.id, kind: "resume" })}
            >
              Use as a voice source
            </Button>
          </div>
        </div>
        {flagVoiceResume.isError ? (
          <p role="alert" className="mt-2 text-right text-xs text-destructive">
            {flagVoiceErrorMessage(flagVoiceResume.error)}
          </p>
        ) : null}
      </div>

      <JobPanel application={application} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-md">Cover letter</CardTitle>
              <CardDescription>
                Generated independently of the resume — its own draw on your Library, this job's JD,
                and Motivation above.
              </CardDescription>
            </div>
            <GenStateBadge state={application.letterGenState} kind="letter" />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {isLetterGenerating ? (
              <span className="text-sm text-muted-foreground">Generating…</span>
            ) : null}
            <Button
              onClick={() => generateLetter.mutate(application.id)}
              disabled={isLetterGenerating}
            >
              {letterLabel}
            </Button>
            <Button
              variant="outline"
              onClick={() => undoLetter.mutate(application.id)}
              disabled={!application.letterPrevious || undoLetter.isPending}
            >
              Undo letter
            </Button>
            <Button
              variant="outline"
              disabled={!application.letterCurrent || !profile}
              onClick={() =>
                profile &&
                application.letterCurrent &&
                downloadLetterPdf({
                  letter: application.letterCurrent,
                  profile,
                  paper,
                  format: resolvedFormat,
                  company: application.company,
                  role: application.role,
                })
              }
            >
              Download cover letter
            </Button>
            <Button
              variant="outline"
              disabled={!application.letterCurrent || flagVoiceLetter.isPending}
              data-testid="flag-voice-letter"
              onClick={() => flagVoiceLetter.mutate({ id: application.id, kind: "cover-letter" })}
            >
              Use as a voice source
            </Button>
          </div>
          {flagVoiceLetter.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {flagVoiceErrorMessage(flagVoiceLetter.error)}
            </p>
          ) : null}

          {application.letterCurrent ? (
            <div data-testid="letter-preview">
              <LetterPreview
                letter={application.letterCurrent}
                format={resolvedFormat}
                applicationId={applicationId}
                readOnly={isLocked}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong py-12 text-center">
              <BookOpen
                aria-hidden
                className="h-8 w-8 text-muted-foreground/60"
                strokeWidth={1.5}
              />
              <div>
                <p className="text-sm font-medium">No cover letter yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Generate pulls from your Library, this job's JD, and Motivation above — or{" "}
                  hand-author one from scratch.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={isLocked || createBlankLetter.isPending}
                data-testid="create-blank-letter"
                onClick={() => createBlankLetter.mutate(application.id)}
              >
                Create blank letter
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-md">Design</CardTitle>
              <CardDescription>
                {isLocked
                  ? "Locked — this reflects the look frozen at lock time. Unlock to edit."
                  : "Template and formatting for this application's document. Changes repaint the preview live."}
              </CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to={`/applications/${applicationId}/design`}>Open design view</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <TemplateGallery
                format={resolvedFormat}
                onChange={handleFormatChange}
                readOnly={isLocked}
                resume={application.current}
                profile={profile}
                paper={paper}
                applicationId={applicationId}
              />
            </div>
            <TemplatePicker
              format={resolvedFormat}
              onChange={handleFormatChange}
              readOnly={isLocked}
              resume={application.current}
              profile={profile}
              paper={paper}
            />
          </div>
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
            {fitError ? (
              <span role="alert" className="text-xs text-destructive">
                Couldn't measure the fitted page count.
              </span>
            ) : null}
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
              format={resolvedFormat}
              paper={paper}
              density={density}
            />
          ) : (
            <ResultView
              resume={application.current}
              format={resolvedFormat}
              density={density}
              applicationId={applicationId}
              readOnly={isLocked}
            />
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
