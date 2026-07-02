// Browse/delete entries, grouped by Section — spec.md §13. Grouping/labels
// come from the section registry only; never from tag-based scoring (§1).

import { useMemo } from "react";
import type { Entry, Section } from "@shared/types";
import { SECTION_VALUES } from "@shared/sections";
import { useEntries, useDeleteEntry } from "../hooks/queries";
import { LibraryToolbar } from "./LibraryToolbar";
import { SectionAccordion } from "./SectionAccordion";

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

  return (
    <div>
      <LibraryToolbar />

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
    </div>
  );
}
