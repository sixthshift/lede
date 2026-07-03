// Add/remove/reorder rows of free text — used for `facts` and `framings`
// (spec.md §4.1). Order here is the user's manual order; it is never derived
// from tags (§1).

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function RepeatableList({
  label,
  values,
  onChange,
  max,
  placeholder,
  addLabel = "Add",
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  max?: number;
  placeholder?: string;
  addLabel?: string;
}) {
  const atMax = max !== undefined && values.length >= max;

  function updateAt(i: number, value: string) {
    const next = [...values];
    next[i] = value;
    onChange(next);
  }

  function removeAt(i: number) {
    onChange(values.filter((_, idx) => idx !== i));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= values.length) return;
    const next = [...values];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  function add() {
    if (atMax) return;
    onChange([...values, ""]);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button type="button" variant="outline" size="sm" disabled={atMax} onClick={add}>
          {addLabel}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {values.map((value, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are controlled by index (value={value}); order IS the data, and strings carry no stable id
          <div key={i} className="flex items-center gap-2">
            <Input
              aria-label={`${label} ${i + 1}`}
              value={value}
              placeholder={placeholder}
              onChange={(e) => updateAt(i, e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={i === 0}
              aria-label={`Move ${label} ${i + 1} up`}
              onClick={() => move(i, -1)}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={i === values.length - 1}
              aria-label={`Move ${label} ${i + 1} down`}
              onClick={() => move(i, 1)}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${label} ${i + 1}`}
              onClick={() => removeAt(i)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
