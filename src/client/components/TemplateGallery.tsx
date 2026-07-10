// Dedicated preset gallery — spec.md §28.2/§31, decided 2026-07-05: a
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
// onChange(applyPreset(format, presetId)) — every stylistic axis untouched —
// and then closes the gallery so the inline picker + preview reflect the
// choice immediately.

import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";
import {
  PRESET_MANIFESTS,
  atsGrade,
  atsGradeCauses,
  effectiveAtsGrade,
} from "../document/registry";
import { applyPreset } from "../document/presets";
import { SAMPLE_PROFILE, SAMPLE_RESUME } from "../document/sampleResume";
import { TemplateThumbnail } from "../document/thumbnail";
import type { Paper, Profile, TailoredResume } from "@shared/types";
import type { DocumentFormatV2 } from "@shared/format-v2";
import type { UserPreset } from "@shared/schema";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

// Large enough to actually read as "one big preview per preset" (vs. the
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
  applicationId,
  savedPresets = [],
}: {
  format: DocumentFormatV2;
  onChange: (next: DocumentFormatV2) => void;
  readOnly?: boolean;
  resume?: TailoredResume | null;
  profile?: Profile;
  paper?: Paper;
  // When provided, the dialog offers a way into the E9-F1a design view (a
  // bigger surface than this dialog) — omitted wherever the gallery is used
  // with no application to navigate to (e.g. SettingsView's default-format
  // editor has no /applications/:id to point at).
  applicationId?: string;
  // User-saved format snapshots (E9-F5d, settings.presets) — rendered as
  // their own section below the built-in roster. Passed in rather than
  // fetched here: the gallery stays a pure view over whatever preset list
  // its caller has (DesignView reads useSettings() once; a settings-less
  // caller simply passes none).
  savedPresets?: UserPreset[];
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DialogTitle>Browse templates</DialogTitle>
              {applicationId ? (
                <Link
                  to={`/applications/${applicationId}/design`}
                  onClick={() => setOpen(false)}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Open design view
                </Link>
              ) : null}
            </div>
            <DialogDescription>
              {readOnly
                ? "Locked — this application's look is frozen. Unlock to change templates."
                : "One large preview per template. Pick one to use it for this application."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.values(PRESET_MANIFESTS).map((manifest) => {
              // See TemplatePicker.tsx's identical comment: graded on the
              // prospective per-card format, not the live selection's format.
              const prospectiveFormat = applyPreset(format, manifest.id);
              const grade = effectiveAtsGrade(manifest, prospectiveFormat);
              const causes = grade === "good" ? atsGradeCauses(prospectiveFormat) : [];
              const selected = format.presetId === manifest.id;

              return (
                <button
                  key={manifest.id}
                  type="button"
                  disabled={readOnly}
                  aria-pressed={selected}
                  data-template-id={manifest.id}
                  onClick={() => {
                    onChange(applyPreset(format, manifest.id));
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
                        <p>{ATS_CAVEAT}</p>
                        <ul className="list-disc space-y-0.5 pl-4">
                          {causes.map((cause) => (
                            <li key={cause}>{cause}</li>
                          ))}
                        </ul>
                      </CardContent>
                    ) : null}
                  </Card>
                </button>
              );
            })}
          </div>

          {savedPresets.length > 0 ? (
            <div className="mt-6 flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Your saved presets</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {savedPresets.map((preset) => {
                  // A saved preset is a COMPLETE format snapshot, not a
                  // composition delta — graded directly via atsGrade(format)
                  // rather than effectiveAtsGrade(manifest, format), since
                  // there is no PRESET_IDS manifest for a user preset id (and
                  // effectiveAtsGrade only ever delegates to atsGrade anyway).
                  const grade = atsGrade(preset.format);
                  const causes = grade === "good" ? atsGradeCauses(preset.format) : [];

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={readOnly}
                      aria-pressed={false}
                      data-user-preset-id={preset.id}
                      onClick={() => {
                        onChange(preset.format);
                        setOpen(false);
                      }}
                      className="rounded-xl border border-border/70 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Card className="h-full border-0 shadow-none">
                        <CardHeader className="gap-1.5 space-y-0 pb-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <CardTitle className="text-sm">{preset.name}</CardTitle>
                            <Badge variant={grade === "strict" ? "success" : "warn"}>
                              ATS: {grade}
                            </Badge>
                          </div>
                        </CardHeader>
                        {grade === "good" ? (
                          <CardContent className="pt-0 text-xs text-muted-foreground">
                            <p>{ATS_CAVEAT}</p>
                            <ul className="list-disc space-y-0.5 pl-4">
                              {causes.map((cause) => (
                                <li key={cause}>{cause}</li>
                              ))}
                            </ul>
                          </CardContent>
                        ) : null}
                      </Card>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
