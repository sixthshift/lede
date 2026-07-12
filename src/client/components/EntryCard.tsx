// One entry, library view — spec.md §13. Renders facts/tags only (never
// scores or reorders by tag — §1). Delete is inline; editing goes through
// LibraryView's entry picker.
//
// F106: Delete is an inline two-step armed confirm, mirroring the dashboard's
// ApplicationCard.tsx:172-188 pattern verbatim — first activation arms
// ("Confirm delete"), second calls onDelete; blur or Escape disarms. State is
// local to THIS card instance (not lifted/shared), so each row arms
// independently; clicking a different row's Delete button shifts DOM focus
// away from this one first, which fires onBlur here before the other row's
// click handler runs — the two-row isolation falls out of ordinary focus
// management, not a second coordination mechanism.

import { useState } from "react";
import type { Entry } from "@shared/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function EntryCard({ entry, onDelete }: { entry: Entry; onDelete: () => void }) {
  const [deleteArmed, setDeleteArmed] = useState(false);

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
        type="button"
        variant={deleteArmed ? "destructive" : "destructive-ghost"}
        size="sm"
        className={
          deleteArmed ? "shrink-0" : "shrink-0 text-muted-foreground hover:text-destructive"
        }
        onBlur={() => setDeleteArmed(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setDeleteArmed(false);
        }}
        onClick={() => {
          if (deleteArmed) {
            onDelete();
          } else {
            setDeleteArmed(true);
          }
        }}
      >
        {deleteArmed ? "Confirm delete" : "Delete"}
      </Button>
    </div>
  );
}
