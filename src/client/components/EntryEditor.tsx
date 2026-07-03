// ONE Dialog for create + edit, for every Section — spec.md §13. The section
// registry (@shared/sections) + META_FIELDS (SectionMetaFields) decide which
// fields render; there is no per-section editor. Selection/ordering is out of
// scope here — this only edits an Entry's own facts/tags/meta (§1: never
// derived from tags).

import { useEffect, useState } from "react";
import type { Entry, EntryMeta, Section } from "@shared/types";
import { SECTIONS, SECTION_VALUES } from "@shared/sections";
import type { EntryInput } from "../api";
import { useCreateEntry, useUpdateEntry } from "../hooks/queries";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
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
    if (typeof value === "string") values[key] = value;
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
  const meta: Record<string, string> = { section };
  for (const field of META_FIELDS[section]) {
    const value = (values[field.key] ?? "").trim();
    if (value) meta[field.key] = value;
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
    if (value.length > META_MAX_LEN)
      errors.push(`${field.label} must be ${META_MAX_LEN} characters or fewer.`);
  }

  if (!Number.isInteger(Number(state.sortKey))) errors.push("Sort key must be a whole number.");

  return errors;
}

export function EntryEditor({
  open,
  onOpenChange,
  entry,
  defaultSection = "experience",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: Entry;
  defaultSection?: Section;
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit entry" : "Add entry"}</DialogTitle>
        </DialogHeader>

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

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {entry ? "Save changes" : "Create entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
