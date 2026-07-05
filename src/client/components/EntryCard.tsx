// One entry, library view — spec.md §13. Renders facts/tags only (never
// scores or reorders by tag — §1). Delete is inline; editing goes through
// LibraryView's entry picker.

import type { Entry } from "@shared/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function EntryCard({ entry, onDelete }: { entry: Entry; onDelete: () => void }) {
  return (
    <div data-entry-id={entry.id} className="flex items-start justify-between gap-4 py-4">
      <div className="flex min-w-0 flex-col gap-2.5">
        <ul className="list-inside list-disc text-sm leading-relaxed">
          {entry.facts.map((fact, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: facts are raw strings (may repeat) in fixed manual order — no stable id in the data model
            <li key={i}>{fact}</li>
          ))}
        </ul>

        {entry.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {entry.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <Button
        variant="destructive-ghost"
        size="sm"
        className="shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
      >
        Delete
      </Button>
    </div>
  );
}
