// Dedicated template gallery — spec.md §28.2, decided 2026-07-05: a
// full-screen BROWSE surface alongside TemplatePicker's inline grid, not a
// replacement for it. A dialog, not a route (§26 no-orphan-routes: a gallery
// route would have no resume to preview and nothing else links to it).
//
// Each card shows ONE LARGE live render (TemplateThumbnail, same component
// TemplatePicker uses, just a bigger pdf.js scale) plus the SAME
// effectiveAtsGrade badge + Workday/Taleo caveat + 'Sample content' fallback
// TemplatePicker shows for the identical card — the gallery is a bigger
// window onto the same decision, never a second source of truth for it.
// Selecting a card mirrors TemplatePicker's onChange contract exactly:
// onChange({...format, templateId}) — every other format field untouched —
// and then closes the gallery so the inline picker + preview reflect the
// choice immediately.

import { useState } from "react";
import { cn } from "../lib/utils";
import { TEMPLATES, effectiveAtsGrade } from "../document/registry";
import { SAMPLE_PROFILE, SAMPLE_RESUME } from "../document/sampleResume";
import { TemplateThumbnail } from "../document/thumbnail";
import type { DocumentFormat, Paper, Profile, TailoredResume } from "@shared/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

// Large enough to actually read as "one big preview per template" (vs. the
// inline picker's card-grid thumbnail) while staying well under a full-page
// render — the gallery still shows six of these at once.
const GALLERY_SCALE = 0.6;

// Duplicated from TemplatePicker deliberately (spec'd, §28.2): the gallery
// and the inline picker are two independent views of the same registry, and
// this caveat is tied to the 'good' grade wherever it's shown, not to either
// view's markup.
const ATS_CAVEAT =
  "Reads as 'good', not 'strict': strict-order ATS parsers (Workday/Taleo) read left-to-right, and a sidebar column or a shown photo can confuse that extraction even though the content itself still parses.";

export function TemplateGallery({
  format,
  onChange,
  readOnly = false,
  resume = null,
  profile,
  paper = "letter",
}: {
  format: DocumentFormat;
  onChange: (next: DocumentFormat) => void;
  readOnly?: boolean;
  resume?: TailoredResume | null;
  profile?: Profile;
  paper?: Paper;
}) {
  const [open, setOpen] = useState(false);
  const isSample = !resume;
  const previewResume = resume ?? SAMPLE_RESUME;
  const previewProfile = profile ?? SAMPLE_PROFILE;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Browse templates
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Browse templates</DialogTitle>
            <DialogDescription>
              {readOnly
                ? "Locked — this application's look is frozen. Unlock to change templates."
                : "One large preview per template. Pick one to use it for this application."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.values(TEMPLATES).map((manifest) => {
              const grade = effectiveAtsGrade(manifest, format);
              const selected = format.templateId === manifest.id;

              return (
                <button
                  key={manifest.id}
                  type="button"
                  disabled={readOnly}
                  aria-pressed={selected}
                  data-template-id={manifest.id}
                  onClick={() => {
                    onChange({ ...format, templateId: manifest.id });
                    setOpen(false);
                  }}
                  className={cn(
                    "rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                    selected ? "border-primary" : "border-border/70 hover:border-border-strong",
                  )}
                >
                  <Card className={cn("h-full border-0 shadow-none", selected && "bg-accent")}>
                    <div className="flex items-center justify-center overflow-hidden rounded-t-xl border-b border-border/70 bg-muted/40 p-3">
                      <TemplateThumbnail
                        resume={previewResume}
                        profile={previewProfile}
                        paper={paper}
                        format={format}
                        templateId={manifest.id}
                        scale={GALLERY_SCALE}
                      />
                    </div>
                    <CardHeader className="gap-1.5 space-y-0 pb-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-sm">{manifest.name}</CardTitle>
                        <div className="flex items-center gap-1.5">
                          {isSample ? <Badge variant="secondary">Sample content</Badge> : null}
                          <Badge variant={grade === "strict" ? "success" : "warn"}>
                            ATS: {grade}
                          </Badge>
                        </div>
                      </div>
                      <CardDescription>{manifest.description}</CardDescription>
                    </CardHeader>
                    {grade === "good" ? (
                      <CardContent className="pt-0 text-xs text-muted-foreground">
                        {ATS_CAVEAT}
                      </CardContent>
                    ) : null}
                  </Card>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
