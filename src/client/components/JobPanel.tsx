// Edit an application's JD/context/company/role, and drive tailor + lock —
// spec.md §27. No hiring-status UI here — only the tailor lifecycle
// (genState) and the lock/unlock toggle for the current snapshot.

import { useEffect, useState } from "react";
import type { Application } from "@shared/types";
import {
  useUpdateApplication,
  useTailorApplication,
  useLockApplication,
  useUnlockApplication,
} from "../queries/useApplications";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

function fieldsFrom(application: Application) {
  return {
    company: application.company ?? "",
    role: application.role ?? "",
    jobDescription: application.jobDescription,
    context: application.context ?? "",
  };
}

export function JobPanel({ application }: { application: Application }) {
  const [fields, setFields] = useState(() => fieldsFrom(application));
  const updateApplication = useUpdateApplication();
  const tailorApplication = useTailorApplication();
  const lockApplication = useLockApplication();
  const unlockApplication = useUnlockApplication();

  // Only reseed the form when a different application is loaded — an
  // in-flight edit shouldn't be clobbered by a background refetch of the
  // same record.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on id only
  useEffect(() => {
    setFields(fieldsFrom(application));
  }, [application.id]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateApplication.mutate({
      id: application.id,
      input: {
        company: fields.company.trim() || null,
        role: fields.role.trim() || null,
        jobDescription: fields.jobDescription.trim(),
        context: fields.context.trim() || null,
      },
    });
  }

  const isTailoring = tailorApplication.isPending || application.genState === "tailoring";
  const tailorLabel = application.genState === "untailored" ? "Tailor" : "Re-tailor";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Job details</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="job-panel-company">Company</Label>
            <Input
              id="job-panel-company"
              value={fields.company}
              onChange={(e) => setFields((prev) => ({ ...prev, company: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="job-panel-role">Role</Label>
            <Input
              id="job-panel-role"
              value={fields.role}
              onChange={(e) => setFields((prev) => ({ ...prev, role: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="job-panel-jd">Job description</Label>
            <Textarea
              id="job-panel-jd"
              rows={8}
              value={fields.jobDescription}
              onChange={(e) => setFields((prev) => ({ ...prev, jobDescription: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="job-panel-context">Context</Label>
            <Textarea
              id="job-panel-context"
              rows={3}
              placeholder="Guides emphasis only — never a fact source"
              value={fields.context}
              onChange={(e) => setFields((prev) => ({ ...prev, context: e.target.value }))}
            />
          </div>

          <div>
            <Button type="submit" size="sm" disabled={updateApplication.isPending}>
              Save
            </Button>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button
            size="sm"
            onClick={() => tailorApplication.mutate(application.id)}
            disabled={isTailoring}
          >
            {tailorLabel}
          </Button>
          {isTailoring ? <span className="text-sm text-muted-foreground">Tailoring…</span> : null}

          <Button
            size="sm"
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
        </div>
      </CardContent>
    </Card>
  );
}
