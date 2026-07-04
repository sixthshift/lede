// Create control for a new tailoring record — spec.md §27. JD is the only
// required field; company/role/context are optional framing metadata.

import { useState } from "react";
import { useCreateApplication } from "../queries/useApplications";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

function emptyState() {
  return { company: "", role: "", jobDescription: "", context: "" };
}

export function NewApplication() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(emptyState());
  const [error, setError] = useState<string | null>(null);
  const createApplication = useCreateApplication();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setState(emptyState());
      setError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const jobDescription = state.jobDescription.trim();
    if (!jobDescription) {
      setError("Job description is required.");
      return;
    }

    try {
      await createApplication.mutateAsync({
        company: state.company.trim() || undefined,
        role: state.role.trim() || undefined,
        jobDescription,
        context: state.context.trim() || undefined,
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create application.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button size="sm" onClick={() => handleOpenChange(true)}>
        New application
      </Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New application</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="new-application-company">Company (optional)</Label>
            <Input
              id="new-application-company"
              value={state.company}
              onChange={(e) => setState((prev) => ({ ...prev, company: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="new-application-role">Role (optional)</Label>
            <Input
              id="new-application-role"
              value={state.role}
              onChange={(e) => setState((prev) => ({ ...prev, role: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="new-application-jd">Job description</Label>
            <Textarea
              id="new-application-jd"
              rows={8}
              value={state.jobDescription}
              onChange={(e) => setState((prev) => ({ ...prev, jobDescription: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="new-application-context">Context (optional)</Label>
            <Textarea
              id="new-application-context"
              rows={3}
              placeholder="Guides emphasis only — never a fact source"
              value={state.context}
              onChange={(e) => setState((prev) => ({ ...prev, context: e.target.value }))}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={createApplication.isPending}>
              Create application
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
