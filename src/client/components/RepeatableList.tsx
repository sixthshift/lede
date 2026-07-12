// Add/remove/reorder rows of free text — used for `facts` and `framings`
// (spec.md §4.1). Order here is the user's manual order; it is never derived
// from tags (§1).
//
// The row field is an auto-grow textarea, not a single-line input (T055/F508):
// facts routinely run past one line, and a fixed-height input clipped them.
// Height tracks content — measured from scrollHeight on every value change —
// so a multi-line fact is fully visible as it's typed.

import { useLayoutEffect, useRef } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Label } from "./ui/label";

function AutoGrowTextarea({
  value,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Re-fit on every value change (typing, and the initial populated value on
  // edit): collapse to auto first so the box can SHRINK, then grow to content.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `value` IS the re-fit trigger — height is read from the DOM (scrollHeight) rather than referenced directly, so biome can't see the dependency, but the box must re-measure whenever content changes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      className={cn(
        "flex min-h-9 w-full resize-none overflow-hidden rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-weak focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50",
      )}
      {...props}
    />
  );
}

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
          <div key={i} className="flex items-start gap-2">
            <AutoGrowTextarea
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
