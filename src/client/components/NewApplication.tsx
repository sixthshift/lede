// Create control for a new tailoring record — spec.md §27. JD is the only
// required field; company/role/context are optional framing metadata.
//
// Non-modal by construction (v3-T020): built directly on
// @radix-ui/react-dialog's `modal={false}` mode rather than the shared
// ui/dialog.tsx wrapper (which is hardwired modal for its other consumers —
// gallery/voice-source dialogs that are legitimately modal). `modal={false}`
// is what makes this genuinely non-modal, not a cosmetic change on top of a
// trapped dialog: Radix skips the overlay entirely (DialogOverlay is a
// no-op when `!modal`), disables the focus trap and outside-pointer lock, and
// still restores focus to the trigger on close.
//
// T032 (OQ7/F304): the panel used to be an ANCHORED POPOVER (`absolute
// right-0 top-full`) floating over the card grid below it — off-screen at
// narrow widths, covering cards at desktop. Now it's a true IN-FLOW block:
// no DialogPortal, no absolute/fixed positioning anywhere in this file, so
// DialogPrimitive.Content renders exactly where it sits in the tree (right
// after the trigger) and — since Radix unmounts Content when `open` is
// false rather than hiding it — the old floating variant isn't merely
// invisible, it no longer exists in the DOM at all. Opening the panel pushes
// whatever follows it (ApplicationsView's card grid) down in normal flow;
// nothing is ever covered.

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../lib/utils";
import { useCreateApplication } from "../queries/useApplications";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

function emptyState() {
  return { company: "", role: "", jobDescription: "", context: "" };
}

// T034 (F305): 44px is the coarse-pointer tap-target floor — gated to
// `pointer: coarse` (no Tailwind config change; Tailwind 3.4 has no built-in
// coarse variant, so this is an arbitrary-variant media query) rather than
// applied unconditionally, so the mouse/desktop rendering of these SAME
// controls is untouched. Applied to the interactive element itself (the
// functional target a tap must actually hit), never a wrapper.
const TAP_TARGET_COARSE =
  "[@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]";

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
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange} modal={false}>
      <DialogPrimitive.Trigger asChild>
        <Button size="sm" className={TAP_TARGET_COARSE}>
          New application
        </Button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Content
        className="mt-4 flex w-full flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-lg"
        onOpenAutoFocus={(e) => {
          // Land focus on the first field rather than the panel container.
          e.preventDefault();
          document.getElementById("new-application-company")?.focus();
        }}
      >
        <div className="flex items-start justify-between">
          <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight text-foreground">
            New application
          </DialogPrimitive.Title>
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              className={cn(
                "rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "[@media(pointer:coarse)]:flex [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:items-center [@media(pointer:coarse)]:justify-center",
              )}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </DialogPrimitive.Close>
        </div>

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

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2">
            <Button
              type="submit"
              disabled={createApplication.isPending}
              className={TAP_TARGET_COARSE}
            >
              Create application
            </Button>
          </div>
        </form>
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}
