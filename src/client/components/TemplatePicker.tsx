// Template gallery — spec.md §28.2/§28.3. Each card's ATS badge is
// effectiveAtsGrade(manifest, format) (../document/registry), never the
// template's own declared atsGrade — a sidebar layout OR a shown photo caps
// the grade at 'good' regardless of the template, so the caveat text
// (Workday/Taleo read left-to-right) surfaces whenever that cap applies,
// not just for sidebar templates. Selecting a card only changes
// format.templateId — every other field is untouched.
//
// Each card also carries a LIVE mini-render (TemplateThumbnail, §28.2 —
// decided 2026-07-05: previews are real renders of this application's
// resume, never static images). Before an application has been tailored
// there's no real resume to show yet, so every card falls back to
// SAMPLE_RESUME/SAMPLE_PROFILE and says so with a badge — never silently
// passing sample content off as the user's own.

import { cn } from "../lib/utils";
import { TEMPLATES, effectiveAtsGrade } from "../document/registry";
import { SAMPLE_PROFILE, SAMPLE_RESUME } from "../document/sampleResume";
import { TemplateThumbnail } from "../document/thumbnail";
import type { DocumentFormat, Paper, Profile, TailoredResume } from "@shared/types";
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
}: {
  format: DocumentFormat;
  onChange: (next: DocumentFormat) => void;
  readOnly?: boolean;
  resume?: TailoredResume | null;
  profile?: Profile;
  paper?: Paper;
}) {
  const isSample = !resume;
  const previewResume = resume ?? SAMPLE_RESUME;
  const previewProfile = profile ?? SAMPLE_PROFILE;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
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
            onClick={() => onChange({ ...format, templateId: manifest.id })}
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
                  {ATS_CAVEAT}
                </CardContent>
              ) : null}
            </Card>
          </button>
        );
      })}
    </div>
  );
}
