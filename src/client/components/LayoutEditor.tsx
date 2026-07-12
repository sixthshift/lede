// Section order/visibility for the resume — spec.md §17. This orders and
// toggles WHOLE sections (settings.layout); the tailor orders items WITHIN a
// section (@shared/sections). Labels come from the section registry only.
//
// Non-modal by construction (v3-T022, same approach as v3-T020's
// NewApplication / v3-T021's EntryEditor): built directly on
// @radix-ui/react-dialog's `modal={false}` mode rather than the shared
// ui/dialog.tsx wrapper (which stays modal for its other, legitimately-modal
// consumers). `modal={false}` skips the overlay entirely and disables the
// focus trap/outside-pointer lock.
//
// Like EntryEditor, this panel has no owned trigger of its own — LibraryView
// opens it from its single "Edit layout" button and passes `triggerRef` (the
// button captured at click time) so focus can be restored to it on close.
//
// Unlike EntryEditor's fields (populated synchronously from a prop), the
// rows here come from useSettings() — settings can still be loading the
// first time this panel opens (LibraryView never warms that query before
// then), so `onOpenAutoFocus` firing at mount time is not reliable: the
// checkbox may not exist yet. Focus is instead driven by an effect keyed on
// `open` AND the row list actually being populated, so it lands as soon as
// the first row exists, whenever that is.
//
// F103 (chrome-agnostic, T014): docks bottom-right — see EntryEditor.tsx's
// header comment for the rationale (avoids top-viewport chrome by anchoring
// to the one edge nothing else in this app is fixed/sticky to, rather than
// hard-coding around the current header's height/z).
import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, ArrowDown, ArrowUp } from "lucide-react";
import type { Layout } from "@shared/types";
import { SECTIONS } from "@shared/sections";
import { toast } from "sonner";
import { useSettings, useUpdateSettings } from "../hooks/queries";
import { Button } from "./ui/button";

function labelFor(section: Layout[number]["section"]): string {
  return section === "summary" ? "Summary" : SECTIONS[section].label;
}

export function LayoutEditor({
  open,
  onOpenChange,
  triggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The control that opened this instance, focused back manually on close
   * (see file header comment — same contract as EntryEditor's triggerRef). */
  triggerRef?: React.RefObject<HTMLElement | null>;
}) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const [layout, setLayout] = useState<Layout>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const firstCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setLayout(settings?.layout ? [...settings.layout] : []);
      setError(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settings]);

  // Land focus on the first row's checkbox once it exists — settings (and so
  // `layout`) may still be loading at the instant the panel opens.
  useEffect(() => {
    if (open && layout.length > 0) {
      firstCheckboxRef.current?.focus();
    }
  }, [open, layout.length]);

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= layout.length) return;
    const next = [...layout];
    [next[i], next[j]] = [next[j], next[i]];
    setLayout(next);
  }

  function toggle(i: number) {
    setLayout((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, enabled: !row.enabled } : row)),
    );
  }

  async function handleSave() {
    try {
      await updateSettings.mutateAsync({ layout });
      // T040/F401: the success toast lives HERE, at the explicit "Save layout"
      // call-site — never in useUpdateSettings.onSuccess, which is shared with
      // the debounced design/settings saves (firing there would toast-spam on
      // every keystroke-coalesced PUT). This is the one deliberate layout save.
      toast.success("Layout saved");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPrimitive.Content
        className="fixed bottom-6 right-6 z-20 flex max-h-[85vh] w-[26rem] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=open]:motion-reduce:animate-none data-[state=closed]:motion-reduce:animate-none"
        onOpenAutoFocus={(e) => {
          // Focus is actually driven by the effect above (rows may not exist
          // yet at this instant) — just keep Radix from focusing the panel
          // container itself.
          e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          triggerRef?.current?.focus();
        }}
      >
        <div
          data-testid="panel-header"
          className="flex items-start justify-between border-b border-border px-6 py-4"
        >
          <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight text-foreground">
            Edit layout
          </DialogPrimitive.Title>
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </DialogPrimitive.Close>
        </div>

        <div
          data-testid="panel-body"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4"
        >
          <div className="flex flex-col gap-2">
            {layout.map((row, i) => (
              <div
                key={row.section}
                data-layout-row={row.section}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <input
                    ref={i === 0 ? firstCheckboxRef : undefined}
                    type="checkbox"
                    aria-label={`Enable ${labelFor(row.section)}`}
                    checked={row.enabled}
                    onChange={() => toggle(i)}
                  />
                  {labelFor(row.section)}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={i === 0}
                  aria-label={`Move ${labelFor(row.section)} up`}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={i === layout.length - 1}
                  aria-label={`Move ${labelFor(row.section)} down`}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end sm:space-x-2">
          <Button type="button" onClick={handleSave} disabled={updateSettings.isPending}>
            Save layout
          </Button>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}
