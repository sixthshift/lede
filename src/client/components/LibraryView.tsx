// Browse/delete entries, grouped by Section — spec.md §13. Grouping/labels
// come from the section registry only; never from tag-based scoring (§1).
//
// v3-T040: rendered inside WorkspaceShell (rail | editor, no preview — a
// non-doc surface degrades, §locked constraints) rather than a single
// scrolling column. The rail is nav-only over the SAME section groups the
// editor pane already renders in SECTION_VALUES order (no second ordering
// source) — clicking a row scrolls/focuses that group's card, exactly the
// nav-without-reorder contract ApplicationDetail's rail already established
// for its own sections (§WORKSPACE_SECTIONS there). The de-modal editor
// panels (EntryEditor/ProfileEditor/LayoutEditor) are unchanged: they're
// `position: fixed` (not absolute), so they aren't affected by the editor
// pane's `overflow-y-auto` — the toolbar/Import control they must leave
// clickable lives in-flow at the top of that same scrollable pane.

import { useMemo, useRef, useState } from "react";
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
import { WorkspaceShell } from "./WorkspaceShell";

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

  // Whichever control (Add entry / Edit selected) most recently opened
  // EntryEditor — a non-modal panel with no owned trigger of its own (see
  // EntryEditor.tsx). Captured at click time so EntryEditor can focus it back
  // on close, regardless of which of the two buttons invoked it.
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  // Same contract for LayoutEditor's single "Edit layout" trigger (v3-T022).
  const layoutTriggerRef = useRef<HTMLElement | null>(null);
  // Same contract for ProfileEditor's single "Edit profile" trigger (v3-T023).
  const profileTriggerRef = useRef<HTMLElement | null>(null);

  function openCreate() {
    editorTriggerRef.current = document.activeElement as HTMLElement | null;
    setEditingEntry(undefined);
    setEditorOpen(true);
  }

  function openEdit(entry: Entry) {
    editorTriggerRef.current = document.activeElement as HTMLElement | null;
    setEditingEntry(entry);
    setEditorOpen(true);
  }

  function openLayout() {
    layoutTriggerRef.current = document.activeElement as HTMLElement | null;
    setLayoutOpen(true);
  }

  function openProfile() {
    profileTriggerRef.current = document.activeElement as HTMLElement | null;
    setProfileOpen(true);
  }

  // Rail nav targets — one per section group actually rendered below, in the
  // SAME SECTION_VALUES order the editor pane renders them in (no second
  // ordering source). Scrolls the group's card into view within the editor
  // pane's own scroll container; never touches the URL.
  const sectionCardRefs = useRef<Partial<Record<Section, HTMLDivElement | null>>>({});
  const presentSections = SECTION_VALUES.filter(
    (section) => (bySection.get(section)?.length ?? 0) > 0,
  );

  function navigateToSection(section: Section) {
    sectionCardRefs.current[section]?.scrollIntoView({ block: "start" });
  }

  const rail = (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every fact tailoring can draw from, grouped by section.
        </p>
      </div>

      <nav aria-label="Sections" data-testid="rail-nav" className="flex flex-col gap-1">
        {presentSections.map((section) => (
          <button
            key={section}
            type="button"
            data-testid={`rail-nav-${section}`}
            onClick={() => navigateToSection(section)}
            className="truncate rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SECTIONS[section].label}
          </button>
        ))}
      </nav>
    </div>
  );

  const editor = (
    <div className="flex flex-col gap-6 p-6">
      {/* Left-aligned (not justify-end): the de-modal EntryEditor/
          ProfileEditor/LayoutEditor panels dock at a fixed viewport corner
          (`fixed right-6 top-6`, up to 30rem wide — see EntryEditor.tsx),
          which would cover a right-aligned toolbar while a panel is open.
          Left-aligning keeps Import/Export and the editor triggers clear of
          that dock zone regardless of which panel is open. */}
      <div className="flex flex-wrap items-center gap-2">
        <LibraryToolbar />
        <div aria-hidden className="mx-1 h-5 w-px bg-border" />
        {/* Profile identity + resume layout entry points — E1-F3. */}
        <Button size="sm" variant="outline" onClick={openProfile}>
          Edit profile
        </Button>
        <Button size="sm" variant="outline" onClick={openLayout}>
          Edit layout
        </Button>
        <Button size="sm" onClick={openCreate}>
          Add entry
        </Button>
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
        {presentSections.map((section) => (
          <div key={section} ref={(el) => (sectionCardRefs.current[section] = el)}>
            <SectionAccordion
              section={section}
              entries={bySection.get(section) ?? []}
              onDelete={(id) => deleteEntry.mutate(id)}
            />
          </div>
        ))}
      </div>

      <EntryEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        entry={editingEntry}
        triggerRef={editorTriggerRef}
      />
      <ProfileEditor
        open={profileOpen}
        onOpenChange={setProfileOpen}
        triggerRef={profileTriggerRef}
      />
      <LayoutEditor open={layoutOpen} onOpenChange={setLayoutOpen} triggerRef={layoutTriggerRef} />
    </div>
  );

  return <WorkspaceShell rail={rail} editor={editor} />;
}
