// Browse/delete entries, grouped by Section — spec.md §13. Grouping/labels
// come from the section registry only; never from tag-based scoring (§1).

import { useMemo, useState } from "react";
import type { Entry, Section } from "@shared/types";
import { SECTIONS, SECTION_VALUES } from "@shared/sections";
import { useEntries, useDeleteEntry } from "../hooks/queries";
import { LibraryToolbar } from "./LibraryToolbar";
import { SectionAccordion } from "./SectionAccordion";
import { EntryEditor } from "./EntryEditor";
import { ProfileEditor } from "./ProfileEditor";
import { LayoutEditor } from "./LayoutEditor";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import {
  LibraryFilter,
  DEFAULT_LIBRARY_FILTER,
  filterEntries,
  type LibraryFilterState,
} from "./LibraryFilter";

function groupBySection(entries: Entry[]): Map<Section, Entry[]> {
  const groups = new Map<Section, Entry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.section) ?? [];
    list.push(entry);
    groups.set(entry.section, list);
  }
  return groups;
}

export function LibraryView() {
  const { data: entries, isLoading, isError } = useEntries();
  const deleteEntry = useDeleteEntry();

  const [filter, setFilter] = useState<LibraryFilterState>(DEFAULT_LIBRARY_FILTER);
  const filteredEntries = useMemo(() => filterEntries(entries ?? [], filter), [entries, filter]);
  const bySection = useMemo(() => groupBySection(filteredEntries), [filteredEntries]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | undefined>(undefined);
  const [editTargetId, setEditTargetId] = useState<string>("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);

  function openCreate() {
    setEditingEntry(undefined);
    setEditorOpen(true);
  }

  function openEdit(entry: Entry) {
    setEditingEntry(entry);
    setEditorOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every fact tailoring can draw from, grouped by section.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LibraryToolbar />
          <div aria-hidden className="mx-1 h-5 w-px bg-border" />
          {/* Profile identity + resume layout entry points — E1-F3. */}
          <Button size="sm" variant="outline" onClick={() => setProfileOpen(true)}>
            Edit profile
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLayoutOpen(true)}>
            Edit layout
          </Button>
          <Button size="sm" onClick={openCreate}>
            Add entry
          </Button>
        </div>
      </div>

      {/* Filter on the left; picking an existing entry to edit on the right
          (EntryCard itself only deletes) — E1-F2/E6-C1. */}
      {entries && entries.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LibraryFilter
            entries={entries}
            filter={filter}
            onFilterChange={setFilter}
            resultCount={filteredEntries.length}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Select value={editTargetId} onValueChange={setEditTargetId}>
              <SelectTrigger aria-label="Choose entry to edit" className="w-64">
                <SelectValue placeholder="Select an entry to edit…" />
              </SelectTrigger>
              <SelectContent>
                {entries.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {SECTIONS[entry.section].label}: {entry.facts[0] ?? entry.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!editTargetId}
              onClick={() => {
                const target = entries.find((e) => e.id === editTargetId);
                if (target) openEdit(target);
              }}
            >
              Edit selected
            </Button>
          </div>
        </div>
      ) : null}

      {isLoading ? <Skeleton className="h-48 rounded-xl" /> : null}
      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load entries.
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {SECTION_VALUES.filter((section) => (bySection.get(section)?.length ?? 0) > 0).map(
          (section) => (
            <SectionAccordion
              key={section}
              section={section}
              entries={bySection.get(section) ?? []}
              onDelete={(id) => deleteEntry.mutate(id)}
            />
          ),
        )}
      </div>

      <EntryEditor open={editorOpen} onOpenChange={setEditorOpen} entry={editingEntry} />
      <ProfileEditor open={profileOpen} onOpenChange={setProfileOpen} />
      <LayoutEditor open={layoutOpen} onOpenChange={setLayoutOpen} />
    </div>
  );
}
