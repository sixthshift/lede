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
//
// Non-modal by construction (v3-T024, same approach as v3-T020's
// NewApplication / v3-T021's EntryEditor / v3-T022's LayoutEditor / v3-T023's
// ProfileEditor): built directly on @radix-ui/react-dialog's `modal={false}`
// mode with an owned `DialogPrimitive.Trigger` (like NewApplication — the
// gallery has always self-rendered its own "Browse templates" button, so
// there's no external triggerRef to thread) rather than the shared
// ui/dialog.tsx wrapper (which stays modal for its other, legitimately-modal
// consumers). `modal={false}` skips the overlay entirely and disables the
// focus trap/outside-pointer lock; Radix's default `onCloseAutoFocus`
// already restores focus to the Trigger on Escape/selection, so — unlike
// LayoutEditor/EntryEditor, which have no owned trigger — no explicit
// triggerRef bookkeeping is needed here. It renders in place (no
// DialogPortal) as a `relative`-anchored dropdown under the trigger, so the
// rest of the workspace stays in the tab order and clickable underneath it.

import { useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
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
  savedPresets = [],
}: {
  format: DocumentFormatV2;
  onChange: (next: DocumentFormatV2) => void;
  readOnly?: boolean;
  resume?: TailoredResume | null;
  profile?: Profile;
  paper?: Paper;
  // User-saved format snapshots (E9-F5d, settings.presets) — rendered as
  // their own section below the built-in roster. Passed in rather than
  // fetched here: the gallery stays a pure view over whatever preset list
  // its caller has (ApplicationDetail's Design card reads useSettings() once;
  // a settings-less caller simply passes none).
  savedPresets?: UserPreset[];
}) {
  const [open, setOpen] = useState(false);
  const isSample = !resume;
  const previewResume = resume ?? SAMPLE_RESUME;
  const previewProfile = profile ?? SAMPLE_PROFILE;
  // Focus target on open — the first built-in template card. PRESET_MANIFESTS
  // is a static registry (unlike LayoutEditor's settings-backed rows), so
  // it's always populated the instant the panel mounts; no open+loaded-gated
  // effect is needed, just a ref assigned to the first mapped card.
  const firstCardRef = useRef<HTMLButtonElement>(null);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen} modal={false}>
      <div className="relative inline-block text-left">
        <DialogPrimitive.Trigger asChild>
          <Button type="button" variant="outline">
            Browse templates
          </Button>
        </DialogPrimitive.Trigger>

        {/* F102 (TEMPORARY, Phase 0 — Phase 4/T041 deletes this popover
            entirely and re-targets the assertion onto the surviving inline
            presentation): `absolute right-0` anchored to the trigger's own
            box, but the trigger sits wherever the right-justified button row
            places it — not at the editor pane's edge — so a panel this wide
            hung off the left of that anchor and slid under the rail. `fixed`
            anchored to the SAME width tokens WorkspaceShell already defines
            for its own rail (`w-56`) and preview pane (`w-96`) pins this to
            the editor pane's actual boundaries regardless of where the
            trigger renders; `top-16` clears AppShell's `h-14` header. */}
        <DialogPrimitive.Content
          className="fixed left-56 top-16 z-20 max-h-[80vh] w-[42rem] max-w-[90vw] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg"
          onOpenAutoFocus={(e) => {
            // Land focus on the first template card rather than the panel container.
            e.preventDefault();
            firstCardRef.current?.focus();
          }}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight text-foreground">
                Browse templates
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1.5 text-sm text-muted-foreground">
                {readOnly
                  ? "Locked — this application's look is frozen. Unlock to change templates."
                  : "One large preview per template. Pick one to use it for this application."}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </DialogPrimitive.Close>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.values(PRESET_MANIFESTS).map((manifest, i) => {
              // See TemplatePicker.tsx's identical comment: graded on the
              // prospective per-card format, not the live selection's format.
              const prospectiveFormat = applyPreset(format, manifest.id);
              const grade = effectiveAtsGrade(manifest, prospectiveFormat);
              const causes = grade === "good" ? atsGradeCauses(prospectiveFormat) : [];
              const selected = format.presetId === manifest.id;

              return (
                <button
                  key={manifest.id}
                  ref={i === 0 ? firstCardRef : undefined}
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
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Root>
  );
}
