// ONE panel for create + edit, for every Section — spec.md §13. The section
// registry (@shared/sections) + META_FIELDS (SectionMetaFields) decide which
// fields render; there is no per-section editor. Selection/ordering is out of
// scope here — this only edits an Entry's own facts/tags/meta (§1: never
// derived from tags).
//
// Non-modal by construction (v3-T021, same approach as v3-T020's
// NewApplication): built directly on @radix-ui/react-dialog's `modal={false}`
// mode rather than the shared ui/dialog.tsx wrapper (which stays modal for
// its other, legitimately-modal consumers). `modal={false}` skips the overlay
// entirely and disables the focus trap/outside-pointer lock.
//
// Unlike NewApplication, this panel has no single owned trigger — LibraryView
// opens it from two different buttons ("Add entry" and "Edit selected"), so
// it can't rely on Radix's own DialogTrigger/triggerRef plumbing (that ref is
// a single slot; two independent trigger buttons would fight over it). The
// caller instead passes `triggerRef`, a ref it points at whichever control
// was just clicked (document.activeElement at click time), and this
// component focuses that element back manually on close — the same
// return-focus contract NewApplication gets for free from Radix, reproduced
// by hand for the two-trigger case. For the same reason the panel docks to a
// fixed viewport corner rather than anchoring under one particular trigger.
//
// F103 (chrome-agnostic, T014): docks bottom-right (`bottom-6 right-6`)
// rather than top-right. Top-right collided with whatever fixed/sticky
// chrome occupies the TOP of the viewport (today's header) — fixing that by
// hard-coding a top offset around this app's current header height/z would
// silently re-break the moment that chrome changes shape, which Phase 1
// does (deletes the header outright). Nothing this app renders is anchored
// to the BOTTOM of the viewport, so docking there is clear of top chrome by
// construction, not by measuring it — the fix survives the header's
// deletion unchanged rather than merely outracing its z-index.
import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { Entry, EntryMeta, Section } from "@shared/types";
import { SECTIONS, SECTION_VALUES } from "@shared/sections";
import type { EntryInput } from "../api";
import { useCreateEntry, useUpdateEntry } from "../hooks/queries";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { META_FIELDS, SectionMetaFields, type MetaValues } from "./SectionMetaFields";
import { RepeatableList } from "./RepeatableList";
import { TagInput } from "./TagInput";

// label sections carry exactly one fact (the label itself) — mirrors
// @shared/schema's LABEL_SECTIONS; certification/reference allow zero.
const LABEL_SECTIONS = new Set<Section>(["skill", "interest", "language"]);
const NO_FACTS_REQUIRED = new Set<Section>(["certification", "reference"]);

const MAX_FACTS = 12;
const MAX_TAGS = 8;
const MAX_FRAMINGS = 6;
const META_MAX_LEN = 120;

// T034 (F305): coarse-pointer tap-target floor for this panel's save/close
// controls — gated to `pointer: coarse` (Tailwind 3.4 has no built-in coarse
// variant; this is an arbitrary-variant media query) so mouse/desktop
// rendering is untouched.
const TAP_TARGET_COARSE =
  "[@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]";

type FormState = {
  section: Section;
  meta: MetaValues;
  facts: string[];
  framings: string[];
  tags: string[];
  sortKey: string;
};

function metaToValues(meta: EntryMeta): MetaValues {
  const { section: _section, ...rest } = meta as Record<string, unknown>;
  const values: MetaValues = {};
  for (const [key, value] of Object.entries(rest)) {
    // level (§31.4) is numeric CONTENT; every other meta field is a string.
    // The form itself stays string-keyed either way (cleanMeta converts back).
    if (typeof value === "string" || typeof value === "number") values[key] = String(value);
  }
  return values;
}

function defaultSortKey(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function buildInitialState(entry: Entry | undefined, defaultSection: Section): FormState {
  if (entry) {
    return {
      section: entry.section,
      meta: metaToValues(entry.meta),
      facts: entry.facts.length > 0 ? [...entry.facts] : [""],
      framings: entry.framings ? [...entry.framings] : [],
      tags: [...entry.tags],
      sortKey: String(entry.sortKey),
    };
  }
  return {
    section: defaultSection,
    meta: {},
    facts: [""],
    framings: [],
    tags: [],
    sortKey: defaultSortKey(),
  };
}

function cleanMeta(section: Section, values: MetaValues): EntryMeta {
  const meta: Record<string, string | number> = { section };
  for (const field of META_FIELDS[section]) {
    const value = (values[field.key] ?? "").trim();
    if (!value) continue; // optional and unset — omit, never invent (§31.4)
    meta[field.key] = field.kind === "level" ? Number(value) : value;
  }
  return meta as EntryMeta;
}

function validate(state: FormState): string[] {
  const errors: string[] = [];
  const isLabel = LABEL_SECTIONS.has(state.section);
  const facts = state.facts.map((f) => f.trim()).filter(Boolean);

  if (isLabel && facts.length !== 1) {
    errors.push("This section requires exactly 1 fact.");
  } else if (!isLabel && !NO_FACTS_REQUIRED.has(state.section) && facts.length < 1) {
    errors.push("At least 1 fact is required.");
  }
  if (facts.length > MAX_FACTS) errors.push(`At most ${MAX_FACTS} facts allowed.`);
  if (facts.some((f) => f.length > 300)) errors.push("Each fact must be 300 characters or fewer.");

  if (state.tags.length > MAX_TAGS) errors.push(`At most ${MAX_TAGS} tags allowed.`);

  const framings = state.framings.map((f) => f.trim()).filter(Boolean);
  if (framings.length > MAX_FRAMINGS) errors.push(`At most ${MAX_FRAMINGS} framings allowed.`);

  for (const field of META_FIELDS[state.section]) {
    const value = (state.meta[field.key] ?? "").trim();
    if (field.required && !value) errors.push(`${field.label} is required.`);
    if (field.kind === "level") {
      if (value && !/^[1-5]$/.test(value)) errors.push(`${field.label} must be between 1 and 5.`);
    } else if (value.length > META_MAX_LEN) {
      errors.push(`${field.label} must be ${META_MAX_LEN} characters or fewer.`);
    }
  }

  if (!Number.isInteger(Number(state.sortKey))) errors.push("Sort key must be a whole number.");

  return errors;
}

export function EntryEditor({
  open,
  onOpenChange,
  entry,
  defaultSection = "experience",
  triggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: Entry;
  defaultSection?: Section;
  /** The control that opened this instance, captured by the caller at click
   * time — focused back manually on close (see file header comment). */
  triggerRef?: React.RefObject<HTMLElement | null>;
}) {
  const [state, setState] = useState<FormState>(() => buildInitialState(entry, defaultSection));
  const [errors, setErrors] = useState<string[]>([]);
  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry();

  useEffect(() => {
    if (open) {
      setState(buildInitialState(entry, defaultSection));
      setErrors([]);
    }
  }, [open, entry, defaultSection]);

  const isLabel = LABEL_SECTIONS.has(state.section);
  const isPending = createEntry.isPending || updateEntry.isPending;

  function handleSectionChange(next: Section) {
    setState((prev) => ({
      ...prev,
      section: next,
      meta: {},
      facts: LABEL_SECTIONS.has(next)
        ? [prev.facts[0] ?? ""]
        : prev.facts.length > 0
          ? prev.facts
          : [""],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationErrors = validate(state);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    const payload: EntryInput = {
      section: state.section,
      meta: cleanMeta(state.section, state.meta),
      facts: state.facts.map((f) => f.trim()).filter(Boolean),
      tags: state.tags,
      framings: state.framings.map((f) => f.trim()).filter(Boolean),
      sortKey: Number(state.sortKey),
    };

    try {
      if (entry) {
        await updateEntry.mutateAsync({ id: entry.id, input: payload });
      } else {
        await createEntry.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Save failed."]);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPrimitive.Content
        className="fixed bottom-6 right-6 z-20 flex max-h-[85vh] w-[30rem] max-w-[90vw] flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg"
        onOpenAutoFocus={(e) => {
          // Land focus on the first field rather than the panel container.
          e.preventDefault();
          document.getElementById("entry-section")?.focus();
        }}
        onCloseAutoFocus={(e) => {
          // No owned DialogTrigger to auto-restore to (see file header) —
          // return focus to whichever control the caller says opened us.
          e.preventDefault();
          triggerRef?.current?.focus();
        }}
      >
        <div className="flex items-start justify-between">
          <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight text-foreground">
            {entry ? "Edit entry" : "Add entry"}
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
            <Label htmlFor="entry-section">Section</Label>
            <Select
              value={state.section}
              onValueChange={(value) => handleSectionChange(value as Section)}
            >
              <SelectTrigger id="entry-section">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTION_VALUES.map((section) => (
                  <SelectItem key={section} value={section}>
                    {SECTIONS[section].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <SectionMetaFields
            section={state.section}
            meta={state.meta}
            onChange={(meta) => setState((prev) => ({ ...prev, meta }))}
          />

          {isLabel ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="entry-fact">Label</Label>
              <Input
                id="entry-fact"
                value={state.facts[0] ?? ""}
                onChange={(e) => setState((prev) => ({ ...prev, facts: [e.target.value] }))}
              />
            </div>
          ) : (
            <>
              <RepeatableList
                label="Facts"
                values={state.facts}
                onChange={(facts) => setState((prev) => ({ ...prev, facts }))}
                max={MAX_FACTS}
                placeholder="A fact"
              />
              <RepeatableList
                label="Framings (optional)"
                values={state.framings}
                onChange={(framings) => setState((prev) => ({ ...prev, framings }))}
                max={MAX_FRAMINGS}
                placeholder="An alternate framing"
              />
            </>
          )}

          <TagInput
            tags={state.tags}
            onChange={(tags) => setState((prev) => ({ ...prev, tags }))}
            max={MAX_TAGS}
          />

          <div className="flex flex-col gap-1">
            <Label htmlFor="entry-sortkey">Sort key (YYYYMM or YYYYMMDD)</Label>
            <Input
              id="entry-sortkey"
              type="number"
              value={state.sortKey}
              onChange={(e) => setState((prev) => ({ ...prev, sortKey: e.target.value }))}
            />
          </div>

          {errors.length > 0 ? (
            <ul role="alert" className="list-inside list-disc text-sm text-destructive">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2">
            <Button type="submit" disabled={isPending} className={TAP_TARGET_COARSE}>
              {entry ? "Save changes" : "Create entry"}
            </Button>
          </div>
        </form>
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}
