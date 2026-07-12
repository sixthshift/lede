// Preset gallery — spec.md §28.2/§28.3/§31. Each card's ATS badge is
// effectiveAtsGrade(manifest, format) (../document/registry), never the
// preset's own declared atsGrade — a two-column layout OR a shown photo caps
// the grade at 'good' regardless of the preset, so the caveat surfaces
// whenever that cap applies, not just for sidebar presets. E9-F5c: the
// caveat itself is now per-cause — atsGradeCauses(prospectiveFormat) lists
// the SPECIFIC axes (columns/headerPosition/photo/heading icons/page
// background) responsible for the 'good' grade, under the same generic
// Workday/Taleo framing sentence as before (ATS_CAVEAT). Selecting a card
// applies that preset's composition over the CURRENT format — every
// stylistic axis (colors.accent/text, fonts.body, margins, …) is untouched
// (presets.ts's applyPreset — same contract v1's "only templateId changes"
// had, since v2 splits the composition-defining axes onto the format itself
// instead of an opaque templateId).
//
// Each card also carries a LIVE mini-render (TemplateThumbnail, §28.2 —
// decided 2026-07-05: previews are real renders of this application's
// resume, never static images). Before an application has been tailored
// there's no real resume to show yet, so every card falls back to
// SAMPLE_RESUME/SAMPLE_PROFILE and says so with a badge — never silently
// passing sample content off as the user's own.

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

const ATS_CAVEAT =
  "Reads as 'good', not 'strict': strict-order ATS parsers (Workday/Taleo) read left-to-right, and a sidebar column or a shown photo can confuse that extraction even though the content itself still parses.";

export function TemplatePicker({
  format,
  onChange,
  readOnly = false,
  resume = null,
  profile,
  paper = "letter",
  savedPresets = [],
}: {
  format: DocumentFormatV2;
  onChange: (next: DocumentFormatV2) => void;
  readOnly?: boolean;
  resume?: TailoredResume | null;
  profile?: Profile;
  paper?: Paper;
  // User-saved format snapshots (E9-F5d, settings.presets) — rendered as
  // their own section below the built-in roster (v4-T041b: migrated inline
  // from the deleted TemplateGallery popover, this is now the single
  // template-choice surface). Passed in rather than fetched here: the picker
  // stays a pure view over whatever preset list its caller has.
  savedPresets?: UserPreset[];
}) {
  const isSample = !resume;
  const previewResume = resume ?? SAMPLE_RESUME;
  const previewProfile = profile ?? SAMPLE_PROFILE;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.values(PRESET_MANIFESTS).map((manifest) => {
          // The badge answers "what grade would clicking THIS card produce" —
          // graded on the prospective format (this preset's own composition +
          // the user's CURRENT photo/other settings via applyPreset), not the
          // currently-selected card's live format (which would make every
          // card's badge read the same as whichever preset is active).
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
              onClick={() => onChange(applyPreset(format, manifest.id))}
              className={cn(
                "rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                selected ? "border-primary" : "border-border/70 hover:border-border-strong",
              )}
            >
              <Card className={cn("h-full border-0 shadow-none", selected && "bg-accent")}>
                <div className="overflow-hidden rounded-t-xl border-b border-border/70 bg-muted/40 p-2">
                  <TemplateThumbnail
                    resume={previewResume}
                    profile={previewProfile}
                    paper={paper}
                    format={format}
                    templateId={manifest.id}
                  />
                </div>
                <CardHeader className="gap-1.5 space-y-0 pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm">{manifest.name}</CardTitle>
                    <div className="flex items-center gap-1.5">
                      {isSample ? <Badge variant="secondary">Sample content</Badge> : null}
                      <Badge variant={grade === "strict" ? "success" : "warn"}>ATS: {grade}</Badge>
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
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Your saved presets</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {savedPresets.map((preset) => {
              // A saved preset is a COMPLETE format snapshot, not a
              // composition delta — graded directly via atsGrade(format)
              // rather than effectiveAtsGrade(manifest, format), since there
              // is no PRESET_MANIFESTS entry for a user preset id (and
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
                  onClick={() => onChange(preset.format)}
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
    </div>
  );
}
