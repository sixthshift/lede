// One block per Section, labeled from the registry — spec.md §4.3/§13.
// Grouping is structural (by `section`), never a tag∩signals score (§1).

import type { Entry, Section } from "@shared/types";
import { SECTIONS } from "@shared/sections";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { EntryCard } from "./EntryCard";

export function SectionAccordion({
  section,
  entries,
  onDelete,
}: {
  section: Section;
  entries: Entry[];
  onDelete: (id: string) => void;
}) {
  return (
    <Card data-section={section}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-1">
        <CardTitle className="text-md">{SECTIONS[section].label}</CardTitle>
        <span className="text-sm tabular-nums text-muted-foreground">{entries.length}</span>
      </CardHeader>
      <CardContent className="divide-y divide-border/60">
        {entries.map((entry) => (
          <EntryCard key={entry.id} entry={entry} onDelete={() => onDelete(entry.id)} />
        ))}
      </CardContent>
    </Card>
  );
}
