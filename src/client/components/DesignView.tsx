// Design view shell — E9-F1a, spec.md §28.3. A dedicated surface for the
// same Design controls ApplicationDetail's card hosts, given the room a
// side-by-side controls+preview layout needs (the card only has a column's
// width to work with). This ticket builds the SHELL + preview only — the
// Layout-group axis controls (columns/header-position/sidebar-width/
// section-placement) are E9-F1b, and the page-break token is E9-F1c; neither
// belongs on DesignPanel yet, so none is added here.
//
// resolvedFormat/isLocked/paper/targetPages mirror ApplicationDetail's own
// computation exactly (same application record, same rules for what "the
// current format" means) — useFit is imported from there rather than
// reimplemented, so the fit ladder this view's chip/preview/density read
// off can never drift from the one ApplicationDetail computes for the same
// application.
import { ArrowLeft, BookOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import type { UserPreset } from "@shared/schema";
import type { Paper } from "@shared/types";
import { useProfile, useSettings, useUpdateSettings } from "../hooks/queries";
import { useApplication, useUpdateApplication } from "../queries/useApplications";
import { useFit } from "./ApplicationDetail";
import { DesignPanel } from "./DesignPanel";
import { DocumentPreview } from "./DocumentPreview";
import { FitChip } from "./FitChip";
import { GenStateBadge } from "./GenStateBadge";
import { TemplateGallery } from "./TemplateGallery";
import { TemplatePicker } from "./TemplatePicker";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

// Rapid knob changes (a stepper's repeated clicks, a color swatch tried a
// few times) coalesce into ONE write instead of one PUT per change — the
// same 300ms window ApplicationDetail's per-change PUT never had, since a
// design view invites faster back-to-back experimentation than a single
// inline card did.
const DEBOUNCE_MS = 300;

// Below this width the side-by-side layout has no room to be two columns —
// collapse to a Design/Preview tab switch instead. jsdom (vitest) has no
// matchMedia, so this defaults to the desktop (side-by-side) layout there
// rather than throwing.
const NARROW_BREAKPOINT_PX = 768;

function useIsNarrowViewport(): boolean {
  const query = `(max-width: ${NARROW_BREAKPOINT_PX - 1}px)`;
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const handleChange = () => setIsNarrow(mql.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [query]);

  return isNarrow;
}

export function DesignView({ applicationId }: { applicationId: string }) {
  const { data: application, isLoading, isError } = useApplication(applicationId);
  const { data: profile } = useProfile();
  const { data: settings } = useSettings();
  const updateApplication = useUpdateApplication();
  const updateSettings = useUpdateSettings();
  const isNarrow = useIsNarrowViewport();

  // Same resolution rules as ApplicationDetail (§28.3): locked freezes the
  // look along with the resume, so a locked application reads its frozen
  // lockedFormat rather than the live format/settings fallback chain.
  const isLocked = Boolean(application?.locked);
  const resolvedFormat: DocumentFormatV2 = isLocked
    ? (application?.lockedFormat?.format ?? DEFAULT_FORMAT_V2)
    : (application?.format ?? settings?.defaultFormat ?? DEFAULT_FORMAT_V2);
  const paper: Paper = isLocked
    ? (application?.lockedFormat?.paper ?? settings?.paper ?? "letter")
    : (settings?.paper ?? "letter");
  const targetPages = application?.targetPages ?? 1;

  const { fit } = useFit({
    resume: application?.current ?? null,
    profile,
    format: resolvedFormat,
    paper,
    targetPages,
  });

  // The panel and preview echo every knob change immediately (a controlled
  // input that lagged behind its own keystrokes would feel broken); only the
  // PUT that persists the change is debounced. `draftFormat` is the
  // in-flight, not-yet-confirmed value — null once there's nothing pending,
  // at which point both fall back to the server's resolvedFormat.
  const [draftFormat, setDraftFormat] = useState<DocumentFormatV2 | null>(null);
  const displayFormat = draftFormat ?? resolvedFormat;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange(next: DocumentFormatV2) {
    if (isLocked) return;
    setDraftFormat(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateApplication.mutate(
        { id: applicationId, input: { format: next } },
        { onSuccess: () => setDraftFormat(null) },
      );
    }, DEBOUNCE_MS);
  }

  // Saves the FULL current in-memory format as a new named preset
  // (settings.presets, §9/E9-F5b) — a complete DocumentFormatV2 snapshot, not
  // a composition delta, so selecting it back later applies it directly
  // (TemplateGallery's onChange(savedPreset.format), never applyPreset).
  function handleSaveAsPreset() {
    const name = window.prompt("Name this preset")?.trim();
    if (!name) return;
    const preset: UserPreset = { id: crypto.randomUUID(), name, format: displayFormat };
    updateSettings.mutate({ presets: [...(settings?.presets ?? []), preset] });
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  if (isError || !application) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn't load application.
      </p>
    );
  }

  const controls = (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={isLocked} onClick={handleSaveAsPreset}>
          Save current design as preset
        </Button>
        <TemplateGallery
          format={displayFormat}
          onChange={handleChange}
          readOnly={isLocked}
          resume={application.current}
          profile={profile}
          paper={paper}
          applicationId={applicationId}
          savedPresets={settings?.presets ?? []}
        />
      </div>
      <TemplatePicker
        format={displayFormat}
        onChange={handleChange}
        readOnly={isLocked}
        resume={application.current}
        profile={profile}
        paper={paper}
      />
      <DesignPanel format={displayFormat} onChange={handleChange} readOnly={isLocked} />
    </div>
  );

  const preview = application.current ? (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">{fit ? <FitChip fit={fit} /> : null}</div>
      <DocumentPreview
        resume={application.current}
        format={displayFormat}
        density={fit?.density}
        allPages
      />
    </div>
  ) : (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong py-16 text-center">
      <BookOpen aria-hidden className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
      <p className="text-sm font-medium">No tailored resume yet</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to={`/applications/${applicationId}`}
          className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
          {application.role || "Application"}
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Design</h1>
          <GenStateBadge state={application.genState} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {isLocked
            ? "Locked — this reflects the look frozen at lock time. Unlock to edit."
            : "Template and formatting for this application's document. Changes repaint the preview live."}
        </p>
      </div>

      {isNarrow ? (
        <Tabs defaultValue="design">
          <TabsList>
            <TabsTrigger value="design">Design</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <TabsContent value="design">{controls}</TabsContent>
          <TabsContent value="preview">{preview}</TabsContent>
        </Tabs>
      ) : (
        <div className="grid grid-cols-2 items-start gap-6">
          <div className="max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">{controls}</div>
          <div className="sticky top-20">{preview}</div>
        </div>
      )}
    </div>
  );
}
