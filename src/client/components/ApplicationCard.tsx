// One tailoring record's list-row summary — spec.md §27. Applications are
// tailoring records, not a hiring tracker: the only status surfaced here is
// journey position (Not tailored/Tailoring…/Tailored/Locked, T007) plus a
// distinct failure treatment — never applied/interviewing/rejected or any
// kanban-style hiring status.
//
// T031 (Phase 3, OQ4b): four quick actions — open/duplicate/delete/download —
// live in their own row BELOW the card's Link (never nested inside it: an
// anchor can't legally contain another interactive element), so the card
// keeps exactly the four controls the "not a tracker" allowlist (spec.md
// red-team H8) counts, no more.

import { useState } from "react";
import type { ApplicationSummary } from "@shared/types";
import { DEFAULT_FORMAT_V2 } from "@shared/format-v2";
import { Link } from "react-router-dom";
import { getApplication } from "../api";
import { downloadLetterPdf, downloadResumePdf } from "../document/download";
import { useProfile, useSettings } from "../hooks/queries";
import { useDeleteApplication, useDuplicateApplication } from "../queries/useApplications";
import { cn } from "../lib/utils";
import { deriveJourneyStage, type JourneyStage } from "../lib/journey-stage";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { GenStateBadge, JourneyStagePill } from "./GenStateBadge";

const JD_PREVIEW_LENGTH = 160;

// T034 (F305): coarse-pointer tap-target floor for these quick-action
// buttons — gated to `pointer: coarse` (Tailwind 3.4 has no built-in coarse
// variant; this is an arbitrary-variant media query) so mouse/desktop
// rendering is untouched.
const TAP_TARGET_COARSE =
  "[@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]";

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

// The list payload omits the heavy current/letterCurrent snapshots (§9), so
// "does a document exist" has to ride a proxy already present on
// ApplicationSummary: `currentMeta` is only ever set alongside a successful
// `current` and is never cleared afterward (the same field ApplicationDetail
// reads for its staleness banner), and `letterGenState !== "untailored"` is
// the identical "a letter exists" proxy the letter pill above already uses
// (T030) — reused here rather than a second, parallel existence check.
function hasDownloadableDocument(application: ApplicationSummary): boolean {
  return Boolean(application.currentMeta) || application.letterGenState !== "untailored";
}

// deriveJourneyStage (journey-stage.ts, frozen) reads `locked`/`current` only
// for truthiness, but ApplicationSummary — the list row's shape (§9 "no heavy
// snapshots") — never carries the heavy `current` payload and flattens
// `locked` to a plain boolean. `currentMeta` is the same "a current snapshot
// exists" proxy `hasDownloadableDocument` above already relies on, so it
// stands in for `current` here; the sentinel value is never read, only its
// null-ness.
const PRESENT = {} as unknown as Parameters<typeof deriveJourneyStage>[0]["current"];

function cardStage(application: ApplicationSummary): JourneyStage {
  return deriveJourneyStage({
    locked: application.locked ? PRESENT : null,
    current: application.currentMeta ? PRESENT : null,
    genState: application.genState,
  });
}

export function ApplicationCard({
  application,
  highlighted = false,
  onDuplicated,
}: {
  application: ApplicationSummary;
  // T045 (F406): true for a brief window right after THIS card was produced
  // by a duplicate — a transient locating affordance, not persisted state.
  highlighted?: boolean;
  // T045 (F406): fires with the new application's id once a duplicate of
  // THIS card succeeds, so ApplicationsView (which owns the full list, and
  // therefore can find the new card once it renders) can scroll it into
  // view and light the highlight — without this card reaching into a
  // sibling's DOM node itself.
  onDuplicated?: (id: string) => void;
}) {
  const { data: profile } = useProfile();
  const { data: settings } = useSettings();
  const deleteApplication = useDeleteApplication();
  const duplicateApplication = useDuplicateApplication();
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const canDownload = hasDownloadableDocument(application) && Boolean(profile) && !downloading;
  const stage = cardStage(application);

  // Fetches the ONE full record this card's summary doesn't carry (current/
  // locked/letterCurrent/format), renders whichever document(s) exist via
  // the SAME render→blob→download pattern ApplicationDetail's Download
  // buttons use, then discards the fetched record — nothing here
  // reimplements the duplicate endpoint's copy semantics or any other
  // server logic, it only reads.
  async function handleDownload() {
    if (!profile || downloading) return;
    setDownloading(true);
    try {
      const full = await getApplication(application.id);
      const isLocked = Boolean(full.locked);
      const format = isLocked
        ? (full.lockedFormat?.format ?? DEFAULT_FORMAT_V2)
        : (full.format ?? settings?.defaultFormat ?? DEFAULT_FORMAT_V2);
      const paper = isLocked
        ? (full.lockedFormat?.paper ?? settings?.paper ?? "letter")
        : (settings?.paper ?? "letter");
      const resume = isLocked ? full.locked : full.current;

      if (resume) {
        await downloadResumePdf({
          resume,
          profile,
          company: full.company,
          role: full.role,
          format,
          paper,
        });
      }
      if (full.letterCurrent) {
        await downloadLetterPdf({
          letter: full.letterCurrent,
          profile,
          format,
          paper,
          company: full.company,
          role: full.role,
        });
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card
      data-application-id={application.id}
      data-highlight={highlighted ? "true" : undefined}
      className={cn(
        "flex h-full flex-col transition-shadow hover:border-border-strong hover:shadow-md",
        // T045 (F406): brief locating pulse after a duplicate lands this
        // card at the end of the list — removed by ApplicationsView once
        // the transient window elapses, never persisted.
        highlighted && "ring-2 ring-ring ring-offset-2",
      )}
    >
      <Link
        to={`/applications/${application.id}`}
        data-testid="application-card-open"
        // T045 (F406): full card radius (rounded-xl), not rounded-t-xl — the
        // focus ring must round all four corners like the card itself, not
        // square off at the header/footer seam.
        className="flex flex-1 flex-col rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <CardHeader className="gap-1 space-y-0 pb-3">
          {application.company ? (
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {application.company}
            </p>
          ) : null}
          <CardTitle as="h2" className="text-md leading-snug">
            {application.role || "Untitled application"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {jdPreview(application.jobDescription)}
          </p>
        </CardContent>
      </Link>

      <CardFooter className="justify-between border-t border-border/60 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* T007: the journey-stage pill REPLACES the old resume genState
              pill on the card (both would read "Tailored"/"Tailoring…" at
              once — a duplicate, not a contrast). `application.locked` and
              `stage === "final"` are the same condition (deriveJourneyStage
              checks `locked` first) — the pre-existing Locked badge already
              IS the design-system pill with the final stage's text, so it
              stands in for the pill there. */}
          {application.locked ? (
            <Badge variant="secondary">Locked</Badge>
          ) : (
            <JourneyStagePill stage={stage} />
          )}
          {/* A failed tailor is NOT a stage — it renders ALONGSIDE the stage
              pill as the existing distinct destructive treatment, never
              erased by it (locked spec carve-out): failed + no surviving
              current reads "Not tailored" + "Failed"; failed + surviving
              current reads "Tailored" + "Failed". */}
          {application.genState === "failed" ? (
            <GenStateBadge state={application.genState} />
          ) : null}
          {application.letterGenState !== "untailored" ? (
            <GenStateBadge state={application.letterGenState} kind="letter" />
          ) : null}
        </div>
        <span
          data-testid="application-card-stamp"
          className="whitespace-nowrap text-xs text-muted-foreground"
        >
          Updated {formatUpdatedAt(application.updatedAt)}
        </span>
      </CardFooter>

      {/* T007 (application-page-flow spec): the existing stale-tailor hint —
          `currentMeta` present means the last successful tailor may now be
          stale against newer Library entries. Kept ABSENT for apps that
          never tailored (currentMeta null), never gated on genState/stage,
          so a failed re-tailor over a surviving `current` still shows it. */}
      {application.currentMeta ? (
        <p
          data-testid="application-card-stale-hint"
          className="border-t border-border/60 bg-warn-soft px-6 py-2 text-xs text-warn"
        >
          Tailored {formatUpdatedAt(application.currentMeta.at)} — re-tailor to fold in newer
          Library entries.
        </p>
      ) : null}

      {/* Quick actions (T031, OQ4b) — a sibling row of the Link above, never
          nested inside it. Exactly four controls: Duplicate/Download stay
          mounted; Delete is a single two-step button (label/variant toggle,
          never a second control) so the resting-state count never exceeds
          four (spec.md red-team H8's allowlist). */}
      <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-border/60 px-6 py-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="application-card-duplicate"
          disabled={duplicateApplication.isPending}
          onClick={() =>
            duplicateApplication.mutate(application.id, {
              onSuccess: (created) => onDuplicated?.(created.id),
            })
          }
          className={TAP_TARGET_COARSE}
        >
          Duplicate
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="application-card-download"
          disabled={!canDownload}
          onClick={handleDownload}
          className={TAP_TARGET_COARSE}
        >
          {downloading ? "Preparing…" : "Download PDF"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={deleteArmed ? "destructive" : "destructive-ghost"}
          data-testid="application-card-delete"
          disabled={deleteApplication.isPending}
          onBlur={() => setDeleteArmed(false)}
          onKeyDown={(event) => {
            // T045 (F406): mirrors EntryCard's F106 armed-delete Escape
            // handler verbatim — Escape disarms without deleting.
            if (event.key === "Escape") setDeleteArmed(false);
          }}
          onClick={() => {
            if (deleteArmed) {
              deleteApplication.mutate(application.id);
            } else {
              setDeleteArmed(true);
            }
          }}
          className={TAP_TARGET_COARSE}
        >
          {deleteArmed ? "Confirm delete" : "Delete"}
        </Button>
      </div>

      {/* T040/F401: a failed duplicate/delete surfaces INLINE here, beside the
          quick-action row that triggered it — never a toast (locked
          feedback-layer rule; success is the toast, failure is inline). Mirrors
          ApplicationDetail's flagVoice inline-error pattern. */}
      {duplicateApplication.isError || deleteApplication.isError ? (
        <p
          role="alert"
          data-testid="application-card-error"
          className="border-t border-border/60 px-6 py-2 text-xs text-destructive"
        >
          {duplicateApplication.isError
            ? "Couldn't duplicate this application."
            : "Couldn't delete this application."}
        </p>
      ) : null}
    </Card>
  );
}
