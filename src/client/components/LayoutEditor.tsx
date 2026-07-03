// Section order/visibility for the resume — spec.md §17. This orders and
// toggles WHOLE sections (settings.layout); the tailor orders items WITHIN a
// section (@shared/sections). Labels come from the section registry only.

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Layout } from "@shared/types";
import { SECTIONS } from "@shared/sections";
import { useSettings, useUpdateSettings } from "../hooks/queries";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

function labelFor(section: Layout[number]["section"]): string {
  return section === "summary" ? "Summary" : SECTIONS[section].label;
}

export function LayoutEditor({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const [layout, setLayout] = useState<Layout>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setLayout(settings?.layout ? [...settings.layout] : []);
      setError(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settings]);

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= layout.length) return;
    const next = [...layout];
    [next[i], next[j]] = [next[j], next[i]];
    setLayout(next);
  }

  function toggle(i: number) {
    setLayout((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, enabled: !row.enabled } : row)),
    );
  }

  async function handleSave() {
    try {
      await updateSettings.mutateAsync({ layout });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit layout</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {layout.map((row, i) => (
            <div
              key={row.section}
              data-layout-row={row.section}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
            >
              <label className="flex flex-1 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={`Enable ${labelFor(row.section)}`}
                  checked={row.enabled}
                  onChange={() => toggle(i)}
                />
                {labelFor(row.section)}
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={i === 0}
                aria-label={`Move ${labelFor(row.section)} up`}
                onClick={() => move(i, -1)}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={i === layout.length - 1}
                aria-label={`Move ${labelFor(row.section)} down`}
                onClick={() => move(i, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" onClick={handleSave} disabled={updateSettings.isPending}>
            Save layout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
