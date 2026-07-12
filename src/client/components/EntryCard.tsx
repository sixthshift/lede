// One entry, library view — spec.md §13. Renders facts/tags only (never
// scores or reorders by tag — §1). Delete and Edit are both inline,
// per-row controls (F502/T051) — editing no longer goes through a
// separate picker.
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
import { Pencil } from "lucide-react";
import type { Entry, Section } from "@shared/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { META_FIELDS } from "./SectionMetaFields";

// Label sections (mirrors EntryEditor.tsx's LABEL_SECTIONS): the fact itself
// IS the label ("TypeScript", "Spanish"), and their only meta fields
// (category/level) are filter/format dimensions, not a distinct identity —
// showing them as an "identity line" would just echo the tag chips already
// rendered below.
const NO_IDENTITY_LINE = new Set<Section>(["skill", "interest", "language"]);

// F509: "Role · Company · Period" (or whichever fields the section has) — the
// natural order already encoded in META_FIELDS (the same table EntryEditor's
// form reads), so this reuses that order rather than re-deriving a second
// per-section field list.
function identityLine(entry: Entry): string {
  if (NO_IDENTITY_LINE.has(entry.section)) return "";
  const meta = entry.meta as Record<string, unknown>;
  const line = META_FIELDS[entry.section]
    .map((field) => meta[field.key])
    .filter((value): value is string | number => value !== undefined && value !== "")
    .map(String)
    .join(" · ");
  // A line that just repeats a fact verbatim (common for certification/award/
  // publication, whose sole fact often restates the title — Entry's own
  // comment: "certification/reference: often []") would render the identical
  // string twice on one card. Suppress it rather than show a redundant echo.
  return entry.facts.includes(line) ? "" : line;
}

export function EntryCard({
  entry,
  onDelete,
  onEdit,
}: {
  entry: Entry;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [deleteArmed, setDeleteArmed] = useState(false);
  const identity = identityLine(entry);

  return (
    <div data-entry-id={entry.id} className="flex items-start justify-between gap-4 py-4">
      <div className="flex min-w-0 flex-col gap-2.5">
        {identity ? (
          <p data-testid="entry-identity" className="font-mono text-xs text-muted-foreground">
            {identity}
          </p>
        ) : null}
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

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          type="button"
          variant={deleteArmed ? "destructive" : "destructive-ghost"}
          size="sm"
          className={deleteArmed ? "" : "text-muted-foreground hover:text-destructive"}
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
    </div>
  );
}
