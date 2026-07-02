// Chip add/remove for `tags` — spec.md §1/§17: tags are grouping/filter
// metadata only. This component only edits the list; it never sorts or
// scores anything by it.

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function TagInput({
  tags,
  onChange,
  max = 8,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const atMax = tags.length >= max;

  function commit() {
    const value = draft.trim();
    setDraft("");
    if (!value || atMax || tags.includes(value)) return;
    onChange([...tags, value]);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Tags</Label>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => onChange(tags.filter((t) => t !== tag))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Input
          aria-label="New tag"
          value={draft}
          placeholder="Add a tag"
          disabled={atMax}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={atMax || !draft.trim()} onClick={commit}>
          Add tag
        </Button>
      </div>

      {atMax ? <p className="text-xs text-muted-foreground">Max {max} tags.</p> : null}
    </div>
  );
}
