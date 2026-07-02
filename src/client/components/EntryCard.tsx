// One entry, library view — spec.md §13. Renders facts/tags only (never
// scores or reorders by tag — §1); edit/delete are the only user actions.

import type { Entry } from "@shared/types";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function EntryCard({ entry, onDelete }: { entry: Entry; onDelete: () => void }) {
  return (
    <Card data-entry-id={entry.id} className="p-4">
      <CardContent className="flex flex-col gap-2 p-0">
        <ul className="list-inside list-disc text-sm">
          {entry.facts.map((fact, i) => (
            <li key={i}>{fact}</li>
          ))}
        </ul>

        {entry.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {entry.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled title="Coming soon">
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
