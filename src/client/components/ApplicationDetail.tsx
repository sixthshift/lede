// One application's detail page body — spec.md §27. Routing/nav is a
// separate ticket (E6-B2); this takes an id and renders the record.

import { Link } from "react-router-dom";
import { useApplication } from "../queries/useApplications";
import { JobPanel } from "./JobPanel";
import { ResultView } from "./ResultView";

function formatStaleDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ApplicationDetail({ applicationId }: { applicationId: string }) {
  const { data: application, isLoading, isError } = useApplication(applicationId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (isError || !application) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn't load application.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <JobPanel application={application} />

      {application.currentMeta ? (
        <p className="text-sm text-muted-foreground">
          Tailored from your Library as of {formatStaleDate(application.currentMeta.at)} — re-tailor
          to fold in newer entries.
        </p>
      ) : null}

      {application.current ? (
        <ResultView resume={application.current} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No tailored resume yet —{" "}
          <Link to="/library" className="underline">
            add missing facts in Library →
          </Link>
        </p>
      )}
    </div>
  );
}
