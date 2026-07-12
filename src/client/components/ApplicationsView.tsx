// Applications list page body — spec.md §27. Routing/nav is a separate
// ticket (E6-B2); this only renders the list + create control.
//
// v3-T050: this dashboard joins the other three routes as a WorkspaceShell
// surface — rendered as this route's Outlet content inside the persistent
// shell (App.tsx). It contributes no rail content of its own (the shell's
// global nav is its one functional rail item, spec.md Phase 5/M2) and no
// preview (a non-doc surface degrades) — so unlike ApplicationDetail/
// LibraryView/SettingsView, it needs neither RailSlot nor PreviewSlot, just
// the same p-6 editor-pane padding convention those views use.

import { FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useApplications } from "../queries/useApplications";
import { ApplicationCard } from "./ApplicationCard";
import { NewApplication } from "./NewApplication";
import { Skeleton } from "./ui/skeleton";

// T045 (F406): how long the post-duplicate locating highlight stays lit —
// a transient affordance, not persisted view-state.
const HIGHLIGHT_DURATION_MS = 1500;

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong py-16 text-center">
      <FileText aria-hidden className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
      <div>
        <p className="text-sm font-medium">No applications yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a job description and Lede tailors your resume to it.
        </p>
      </div>
      <NewApplication />
    </div>
  );
}

export function ApplicationsView() {
  const { data: applications, isLoading, isError } = useApplications();
  const empty = applications && applications.length === 0;

  // T045 (F406): a duplicate lands its new card at the end of the (refetched)
  // list with no locating feedback. `highlightId` names the just-duplicated
  // application; ApplicationCard renders the transient ring for the one card
  // whose id matches. `scrolledIdRef` guards the scrollIntoView call to fire
  // exactly once per duplicate — the list re-renders (new query data) after
  // `highlightId` is set, so the effect below re-runs and finds the card only
  // once it actually exists in the DOM.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const scrolledIdRef = useRef<string | null>(null);
  const highlightPresent =
    applications?.some((application) => application.id === highlightId) ?? false;

  useEffect(() => {
    if (!highlightId || !highlightPresent || scrolledIdRef.current === highlightId) return;
    const el = document.querySelector(`[data-application-id="${highlightId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      scrolledIdRef.current = highlightId;
    }
  }, [highlightId, highlightPresent]);

  useEffect(() => {
    if (!highlightId) return;
    const timeout = setTimeout(() => setHighlightId(null), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [highlightId]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One tailored resume per job description.
        </p>
      </div>

      {/* Inline, in-flow create panel (T032/F304) — sits above the card grid
          so opening it pushes the grid down rather than floating over it.
          `items-end` right-aligns the closed trigger; the panel's own
          `w-full` overrides that alignment once open. */}
      {empty ? null : (
        <div className="flex flex-col items-end gap-4">
          <NewApplication />
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : null}
      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load applications.
        </p>
      ) : null}

      {empty ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {applications?.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              highlighted={application.id === highlightId}
              onDuplicated={setHighlightId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
