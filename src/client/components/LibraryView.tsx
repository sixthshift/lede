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

  const bySection = useMemo(() => groupBySection(entries ?? []), [entries]);

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
    <div>
      <LibraryToolbar />

      {/* Profile identity + resume layout entry points — E1-F3. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setProfileOpen(true)}>
          Edit profile
        </Button>
        <Button size="sm" variant="outline" onClick={() => setLayoutOpen(true)}>
          Edit layout
        </Button>
      </div>

      {/* Add/edit entry points — E1-F2. EntryCard's own "Edit" affordance is a
          disabled stub (EntryCard.tsx is not a file this ticket may touch);
          this picker is the working edit entry point until that lands. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={openCreate}>
          Add entry
        </Button>

        {entries && entries.length > 0 ? (
          <>
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
          </>
        ) : null}
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {isError ? <p role="alert" className="text-sm text-destructive">Couldn't load entries.</p> : null}

      <div className="flex flex-col gap-4">
        {SECTION_VALUES.filter((section) => (bySection.get(section)?.length ?? 0) > 0).map((section) => (
          <SectionAccordion
            key={section}
            section={section}
            entries={bySection.get(section) ?? []}
            onDelete={(id) => deleteEntry.mutate(id)}
          />
        ))}
      </div>

      <EntryEditor open={editorOpen} onOpenChange={setEditorOpen} entry={editingEntry} />
      <ProfileEditor open={profileOpen} onOpenChange={setProfileOpen} />
      <LayoutEditor open={layoutOpen} onOpenChange={setLayoutOpen} />
    </div>
  );
}
