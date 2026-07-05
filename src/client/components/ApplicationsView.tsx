// Applications list page body — spec.md §27. Routing/nav is a separate
// ticket (E6-B2); this only renders the list + create control.

import { FileText } from "lucide-react";

import { useApplications } from "../queries/useApplications";
import { ApplicationCard } from "./ApplicationCard";
import { NewApplication } from "./NewApplication";
import { Skeleton } from "./ui/skeleton";

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One tailored resume per job description.
          </p>
        </div>
        {empty ? null : <NewApplication />}
      </div>

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
            <ApplicationCard key={application.id} application={application} />
          ))}
        </div>
      )}
    </div>
  );
}
