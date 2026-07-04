// Applications list page body — spec.md §27. Routing/nav is a separate
// ticket (E6-B2); this only renders the list + create control.

import { useApplications } from "../queries/useApplications";
import { ApplicationCard } from "./ApplicationCard";
import { NewApplication } from "./NewApplication";

export function ApplicationsView() {
  const { data: applications, isLoading, isError } = useApplications();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Applications</h1>
        <NewApplication />
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load applications.
        </p>
      ) : null}

      {applications && applications.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No applications yet — create one to start tailoring.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {applications?.map((application) => (
          <ApplicationCard key={application.id} application={application} />
        ))}
      </div>
    </div>
  );
}
