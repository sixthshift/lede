// Edit an application's JD/context/company/role — spec.md §27. The tailor +
// lock lifecycle actions live in ApplicationDetail's page header; this card
// is only the editable record. Collapsed by default once a resume exists —
// the tailored output is the page's subject, not the input form.

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Application } from "@shared/types";
import { useUpdateApplication } from "../queries/useApplications";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
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
  const [open, setOpen] = useState(() => !application.current);
  const updateApplication = useUpdateApplication();

  // Only reseed the form when a different application is loaded — an
  // in-flight edit shouldn't be clobbered by a background refetch of the
  // same record.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on id only
  useEffect(() => {
    setFields(fieldsFrom(application));
    setOpen(!application.current);
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

  return (
    <Card>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl px-6 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-sm font-semibold">Job details</span>
        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <CardContent className="border-t border-border/60 pt-5">
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="job-panel-company">Company</Label>
                <Input
                  id="job-panel-company"
                  value={fields.company}
                  onChange={(e) => setFields((prev) => ({ ...prev, company: e.target.value }))}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="job-panel-role">Role</Label>
                <Input
                  id="job-panel-role"
                  value={fields.role}
                  onChange={(e) => setFields((prev) => ({ ...prev, role: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="job-panel-jd">Job description</Label>
              <Textarea
                id="job-panel-jd"
                rows={8}
                value={fields.jobDescription}
                onChange={(e) => setFields((prev) => ({ ...prev, jobDescription: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
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
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={updateApplication.isPending}
              >
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      ) : null}
    </Card>
  );
}
