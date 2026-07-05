// Template gallery — spec.md §28.2/§28.3. Each card's ATS badge is
// effectiveAtsGrade(manifest, format) (../document/registry), never the
// template's own declared atsGrade — a sidebar layout OR a shown photo caps
// the grade at 'good' regardless of the template, so the caveat text
// (Workday/Taleo read left-to-right) surfaces whenever that cap applies,
// not just for sidebar templates. Selecting a card only changes
// format.templateId — every other field is untouched.

import { cn } from "../lib/utils";
import { TEMPLATES, effectiveAtsGrade } from "../document/registry";
import type { DocumentFormat } from "@shared/types";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

const ATS_CAVEAT =
  "Reads as 'good', not 'strict': strict-order ATS parsers (Workday/Taleo) read left-to-right, and a sidebar column or a shown photo can confuse that extraction even though the content itself still parses.";

export function TemplatePicker({
  format,
  onChange,
  readOnly = false,
}: {
  format: DocumentFormat;
  onChange: (next: DocumentFormat) => void;
  readOnly?: boolean;
}) {
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
            onClick={() => onChange({ ...format, templateId: manifest.id })}
            className={cn(
              "rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
              selected ? "border-primary" : "border-border/70 hover:border-border-strong",
            )}
          >
            <Card className={cn("h-full border-0 shadow-none", selected && "bg-accent")}>
              <CardHeader className="gap-1.5 space-y-0 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">{manifest.name}</CardTitle>
                  <Badge variant={grade === "strict" ? "success" : "warn"}>ATS: {grade}</Badge>
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
