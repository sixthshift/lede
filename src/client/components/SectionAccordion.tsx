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
      <CardHeader>
        <CardTitle>{SECTIONS[section].label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {entries.map((entry) => (
          <EntryCard key={entry.id} entry={entry} onDelete={() => onDelete(entry.id)} />
        ))}
      </CardContent>
    </Card>
  );
}
