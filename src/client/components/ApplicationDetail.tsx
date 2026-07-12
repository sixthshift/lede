// One application's detail page body — spec.md §27. Routing/nav is a
// separate ticket (E6-B2); this takes an id and renders the record.
// The tailor/lock lifecycle actions live up here in the page header — always
// visible — while JobPanel below is just the editable record.
//
// v3-T011: rendered inside WorkspaceShell (rail | editor | preview) rather
// than a single scrolling column. The preview pane hosts EXACTLY one
// document at a time — the resume side (FitChip/Preview-ATS toggle/
// ResultView-or-AtsView, unchanged internally) or the letter side
// (LetterPreview, unchanged internally, editor fields and all) — switched
// via the docTab buttons below. Action buttons, JobPanel, the cover-letter
// card's controls (never its preview), and the design card all live in the
// editor pane instead, since they aren't the artifact itself.

import { BookOpen, ChevronDown, Clock, Mail } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import type { UserPreset } from "@shared/schema";
import type { Paper, Profile, TailoredResume } from "@shared/types";
import { ApiError } from "../api";
import { downloadLetterPdf, downloadResumePdf, downloadResumeText } from "../document/download";
import { fitToPages, type FitResult } from "../document/fit";
import { useProfile, useSettings, useUpdateSettings } from "../hooks/queries";
import { cn } from "../lib/utils";
import {
  useApplication,
  useCreateBlankLetter,
  useFlagVoice,
  useGenerateLetter,
  useLockApplication,
  useTailorApplication,
  useUndoLetter,
  useUnlockApplication,
  useUpdateApplication,
} from "../queries/useApplications";
import { AtsView } from "./AtsView";
import { DesignPanel } from "./DesignPanel";
import { FitChip } from "./FitChip";
import { GenStateBadge } from "./GenStateBadge";
import { JobPanel } from "./JobPanel";
import { LetterPreview } from "./LetterPreview";
import { ResultView } from "./ResultView";
import { TemplateGallery } from "./TemplateGallery";
import { TemplatePicker } from "./TemplatePicker";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { WorkspaceShellSurface } from "./WorkspaceShellSlots";

// Same 300ms coalescing window the former dedicated design view used for its
// format PUTs (v3-T012 carries that behavior into this card).
const DEBOUNCE_MS = 300;

// T034 (F305): coarse-pointer tap-target floor for the editor pane's primary
// action strip (Lock/Tailor/Download/Plain text/voice-source) — gated to
// `pointer: coarse` (Tailwind 3.4 has no built-in coarse variant; this is an
// arbitrary-variant media query) so mouse/desktop rendering is untouched.
const TAP_TARGET_COARSE =
  "[@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]";

function formatStaleDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// The fit ladder (§28.4) is a per-render computation, never persisted — this
// hook just re-runs it whenever the inputs that could change the outcome
// change, so the chip/preview/download always agree on the SAME FitResult.
//
// fitToPages THROWING is a bug (e.g. its render path broke), never a
// legitimate outcome — the ladder already reports "doesn't fit" via
// FitResult.fits:false. A thrown render must stay visibly distinct from that
// so a broken render can't hide behind the same blank state overflow never
// produces (that swallow is exactly how this feature went silently broken in
// the browser once already).
// Exported as a named hook rather than inlined below purely for readability;
// v3-T012 dropped its one other consumer, the dedicated design view (its own
// fit computation folded into this same hook call below).
export function useFit(args: {
  resume: TailoredResume | null;
  profile: Profile | undefined;
  format: DocumentFormatV2;
  paper: Paper;
  targetPages: number;
}): { fit: FitResult | null; fitError: boolean } {
  const { resume, profile, format, paper, targetPages } = args;
  const [fit, setFit] = useState<FitResult | null>(null);
  const [fitError, setFitError] = useState(false);

  useEffect(() => {
    setFit(null);
    setFitError(false);
    if (!resume || !profile) return;
    let cancelled = false;
    fitToPages({ resume, profile, format, paper, targetPages }).then(
      (result) => {
        if (!cancelled) setFit(result);
      },
      (error) => {
        if (cancelled) return;
        console.error(
          "fitToPages threw — the fit chip and fitted density were not computed",
          error,
        );
        setFitError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [resume, profile, format, paper, targetPages]);

  return { fit, fitError };
}

// v3-T013: the rail's own list of navigable/collapsible editor regions —
// deliberately the SAME three cards the editor pane already renders in this
// fixed JSX order (Job details -> Cover letter -> Design). This registry
// only supplies labels for the rail; it is not a second ordering source —
// section ORDER still comes from the JSX below (which itself defers to
// sectionDisplay.order/settings.layout for anything document-facing).
const WORKSPACE_SECTIONS = [
  { key: "job", label: "Job details" },
  { key: "letter", label: "Cover letter" },
  { key: "design", label: "Design" },
] as const;
type WorkspaceSectionKey = (typeof WORKSPACE_SECTIONS)[number]["key"];

// T023/F202 — the scroll-spy rule, pinned exactly: active = the LAST section
// whose top edge has crossed a line 30% down from the CONTAINER's viewport
// (the editor pane, not the window — it's its own scroll container), except
// when scrolled to the very bottom, where the final section wins regardless
// (the short-last-section escape — a trailing section shorter than 30% of
// the viewport could otherwise never cross the line). A surface with <2
// sections has nothing to spy on (no vacuous spy) — that's the caller's job
// (don't render the zone), not this function's.
function computeActiveSection(
  container: HTMLElement,
  sections: readonly { key: WorkspaceSectionKey }[],
  headingEls: Partial<Record<WorkspaceSectionKey, HTMLDivElement | null>>,
): WorkspaceSectionKey | null {
  if (sections.length < 2) return null;

  const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1;
  if (atBottom) return sections[sections.length - 1].key;

  const lineY = container.getBoundingClientRect().top + container.clientHeight * 0.3;
  let active: WorkspaceSectionKey | null = null;
  for (const section of sections) {
    const el = headingEls[section.key];
    if (el && el.getBoundingClientRect().top <= lineY) {
      active = section.key;
    }
  }
  // Nothing has crossed the line yet (scrolled to the very top) — the first
  // section is the honest answer, not "none".
  return active ?? sections[0].key;
}

// Collapse is editor VIEW-STATE only (§ locked constraints) — persisted to
// localStorage, scoped per application, and NEVER written to the server:
// settings.layout/sectionDisplay/format stay untouched by anything in this
// file.
function collapseStorageKey(applicationId: string): string {
  return `lede.workspace.sectionCollapse.${applicationId}`;
}

function readCollapsedSections(
  applicationId: string,
): Partial<Record<WorkspaceSectionKey, boolean>> {
  try {
    const raw = window.localStorage.getItem(collapseStorageKey(applicationId));
    return raw ? (JSON.parse(raw) as Partial<Record<WorkspaceSectionKey, boolean>>) : {};
  } catch {
    return {};
  }
}

// A collapsible editor region: the heading stays mounted and focusable
// regardless of collapse state (it's the rail's scroll/focus target — a
// collapsed section must still be navigable-TO, just folded once you get
// there), and only `children` folds away. Deliberately NOT a heading role —
// the cards it wraps (Cover letter, Design) already carry their own real
// CardTitle heading, so a second element with an overlapping accessible
// name would break any `getByRole("heading", { name: ... })` lookup against
// them. This is a rail/nav landmark, not new document outline content — the
// label reuses the rail's own company/eyebrow token treatment rather than
// introducing a new style.
//
// F209/T023: collapse lives HERE now, on the editor's own section header —
// not in the rail row, which used to split "click the label to scroll" from
// "click the chevron to collapse" with no visual seam between the two
// (ambiguous, chevron direction only legible after clicking). The rail row
// is now a single whole-row navigate affordance (see `rail` below); folding
// content is something you do once you've arrived at a section, from the
// section itself.
function EditorSection({
  sectionKey,
  label,
  collapsed,
  onToggleCollapse,
  headingRef,
  children,
}: {
  sectionKey: WorkspaceSectionKey;
  label: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  headingRef: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  return (
    <section data-testid={`workspace-section-${sectionKey}`} className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <div
          ref={headingRef}
          tabIndex={-1}
          data-testid={`workspace-section-heading-${sectionKey}`}
          className="font-mono text-xs uppercase tracking-wider text-muted-foreground outline-none"
        >
          {label}
        </div>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
          data-testid={`section-collapse-${sectionKey}`}
          onClick={onToggleCollapse}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-[var(--ring-weak)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            aria-hidden
            className={cn("h-3.5 w-3.5 transition-transform", collapsed && "-rotate-90")}
          />
        </button>
      </div>
      {/* F403/T043: grid-rows collapse — the row's fr size (not display/mount)
          carries the open/closed state so the height change can transition.
          Children stay mounted through collapse (unlike the old `collapsed ?
          null : …`); the grid item's own overflow-hidden gives it an
          automatic minimum size of 0 (CSS Grid §algo), letting the 0fr track
          actually reach zero instead of clamping to content's min-content
          height. */}
      <div
        data-testid={`section-collapse-track-${sectionKey}`}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:duration-0 motion-reduce:transition-none",
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
      >
        <div
          data-testid={`workspace-section-body-${sectionKey}`}
          className="flex flex-col gap-6 overflow-hidden"
        >
          {children}
        </div>
      </div>
    </section>
  );
}

// A flag mutation's error surfaced next to its button — the cap (§ voice-
// source epic, VOICE_SOURCES_CAP=5, server-enforced) is the one expected
// failure worth naming distinctly; anything else is a generic retry prompt.
function flagVoiceErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "voice_cap") {
    return "Voice source cap reached (5) — delete one in Profile to flag another.";
  }
  return "Couldn't flag as a voice source.";
}

// F105: a tailor failure surfaced next to the Tailor/Re-tailor button — same
// co-located pattern as flagVoiceErrorMessage above. "no_fixture" is the one
// keyless, deterministic failure (an unmatched JD, FixtureEngine's
// NoFixtureError) worth naming distinctly; anything else is a generic retry
// prompt.
function tailorErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "no_fixture") {
    return "No recorded fixture matches this job description — couldn't tailor.";
  }
  return "Couldn't tailor this application.";
}

export function ApplicationDetail({ applicationId }: { applicationId: string }) {
  const { data: application, isLoading, isError } = useApplication(applicationId);
  const { data: profile } = useProfile();
  const { data: settings } = useSettings();
  const tailorApplication = useTailorApplication();
  const generateLetter = useGenerateLetter();
  const undoLetter = useUndoLetter();
  const lockApplication = useLockApplication();
  const unlockApplication = useUnlockApplication();
  const updateApplication = useUpdateApplication();
  const updateSettings = useUpdateSettings();
  const createBlankLetter = useCreateBlankLetter();
  // Two independent mutation instances — one per output — so a cap-409 on
  // one (e.g. the resume) never renders its error under the other's button.
  const flagVoiceResume = useFlagVoice();
  const flagVoiceLetter = useFlagVoice();

  // Preview vs "what the ATS sees" (§28.6) — a view toggle, not a route:
  // both read the SAME current resume + resolvedFormat/density computed
  // below, so switching never re-tailors or re-fits.
  const [view, setView] = useState<"preview" | "ats">("preview");

  // Which document the (co-visible) preview pane currently shows — a purely
  // client-side switch, independent of `view` above (that toggle only
  // matters once the resume side is showing).
  const [docTab, setDocTab] = useState<"resume" | "letter">("resume");

  // Rapid design-knob changes (a stepper's repeated clicks, a color swatch
  // tried a few times) coalesce into ONE PUT instead of one per change — the
  // same 300ms debounce the former dedicated design view used, carried over
  // now that its controls live in this card instead (v3-T012). The panel and
  // preview echo every change immediately (a controlled input lagging behind
  // its own keystrokes would feel broken); only the PUT that persists it is
  // debounced. `draftFormat` is the in-flight, not-yet-confirmed value — null
  // once nothing is pending, at which point both fall back to resolvedFormat.
  const [draftFormat, setDraftFormat] = useState<DocumentFormatV2 | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // T042/F402: export busy state. react-pdf rendering (PDF) and the
  // plain-text derivation both run on the client with no query/mutation of
  // their own to source an isPending flag from, so each gets a local pending
  // flag — disabling its control and swapping its label while in flight, and
  // guarding a second activation mid-flight into a no-op (exactly one
  // download per user intent).
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingText, setIsExportingText] = useState(false);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Locked freezes the look along with the resume — editing a locked app's
  // format is out of scope (it froze what was actually sent), so the design
  // panel reflects lockedFormat.format/paper read-only rather than the live
  // application.format/settings fallback chain. Computed ahead of the
  // isLoading/isError early returns below so useFit (a hook) is never called
  // conditionally.
  const isLocked = Boolean(application?.locked);
  const resolvedFormat: DocumentFormatV2 = isLocked
    ? (application?.lockedFormat?.format ?? DEFAULT_FORMAT_V2)
    : (application?.format ?? settings?.defaultFormat ?? DEFAULT_FORMAT_V2);
  const paper: Paper = isLocked
    ? (application?.lockedFormat?.paper ?? settings?.paper ?? "letter")
    : (settings?.paper ?? "letter");
  const targetPages = application?.targetPages ?? 1;

  // The design controls/preview echo the in-flight draft immediately; once
  // its debounced PUT resolves (or there is no pending edit) this collapses
  // back to resolvedFormat.
  const displayFormat = draftFormat ?? resolvedFormat;

  // Fit once, here — the SAME FitResult drives the chip, the preview, and
  // the download, so the density the chip claims is the density the file
  // actually renders at (§28.4). Unlike v1 (applyDensity pre-scaled a COPY of
  // format), the engine takes density as a sibling prop of format and applies
  // the ladder itself (EngineDocument) — so `resolvedFormat` rides unscaled
  // to every renderer, with `fit?.density` threaded alongside it.
  const { fit, fitError } = useFit({
    resume: application?.current ?? null,
    profile,
    format: resolvedFormat,
    paper,
    targetPages,
  });
  const density = fit?.density;

  // v3-T013: rail-driven nav + collapse over the editor pane's sections
  // (above). Computed ahead of the isLoading/isError early returns for the
  // same reason as useFit — hooks can't be called conditionally — even
  // though `application` itself isn't needed yet: `applicationId` alone is
  // enough to key the localStorage-persisted collapse state.
  const [collapsedSections, setCollapsedSections] = useState<
    Partial<Record<WorkspaceSectionKey, boolean>>
  >(() => readCollapsedSections(applicationId));
  const headingRefs = useRef<Partial<Record<WorkspaceSectionKey, HTMLDivElement | null>>>({});

  // T023/F202: which section nav item is "current". Null until the scroll
  // listener below gets its first reading (nothing renders as active for
  // one frame on mount, rather than guessing).
  const [activeSection, setActiveSection] = useState<WorkspaceSectionKey | null>(null);

  // Reseed collapse state whenever a different application is loaded.
  useEffect(() => {
    setCollapsedSections(readCollapsedSections(applicationId));
  }, [applicationId]);

  // Scroll-spy: the editor pane (`data-testid="editor-pane"`, rendered by
  // WorkspaceShell) is this route's OWN scroll container — found via the
  // heading refs rather than threaded down as a prop, since `editor` renders
  // as that container's direct child whether portaled (real app) or embedded
  // (component tests) — see WorkspaceShellSlots. Re-attaches whenever the
  // heading DOM nodes could have moved: a different application's headings
  // mounting (isLoading flip) or a collapse toggle reflowing the sections
  // below it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: applicationId/isLoading/collapsedSections aren't read in the body — they're re-attach TRIGGERS for when the heading DOM could have moved (a new application's headings mounting, or a collapse reflowing layout).
  useEffect(() => {
    if (WORKSPACE_SECTIONS.length < 2) return;
    const anyHeading = Object.values(headingRefs.current).find(
      (el): el is HTMLDivElement => el != null,
    );
    const container = anyHeading?.closest<HTMLElement>('[data-testid="editor-pane"]');
    if (!container) return;

    function update() {
      if (!container) return;
      setActiveSection(computeActiveSection(container, WORKSPACE_SECTIONS, headingRefs.current));
    }
    update();
    container.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      container.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [applicationId, isLoading, collapsedSections]);

  function setHeadingRef(key: WorkspaceSectionKey, el: HTMLDivElement | null) {
    headingRefs.current[key] = el;
  }

  // Collapse never reaches the server — the toggle only flips local state
  // and re-serializes it to localStorage; nothing here calls a mutation.
  function toggleSection(key: WorkspaceSectionKey) {
    setCollapsedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      window.localStorage.setItem(collapseStorageKey(applicationId), JSON.stringify(next));
      return next;
    });
  }

  // Scrolls the section's heading to the top of the editor pane's scroll
  // container and focuses it — never touches the URL or the preview pane.
  function navigateToSection(key: WorkspaceSectionKey) {
    const el = headingRefs.current[key];
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    el.focus();
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (isError || !application) {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        Couldn't load application.
      </p>
    );
  }

  const isTailoring = tailorApplication.isPending || application.genState === "tailoring";
  const tailorLabel = application.genState === "untailored" ? "Tailor" : "Re-tailor";

  const isLetterGenerating = generateLetter.isPending || application.letterGenState === "tailoring";
  const letterLabel =
    application.letterGenState === "untailored" ? "Generate letter" : "Regenerate letter";

  // T042/F402: guarded on the pending flag itself, not just the button's
  // `disabled` (belt-and-suspenders against a second activation landing
  // before React has flushed the first click's state update).
  const handleDownloadPdf = async () => {
    if (isExportingPdf || !application.current || !profile) return;
    setIsExportingPdf(true);
    try {
      await downloadResumePdf({
        resume: application.current,
        profile,
        company: application.company,
        role: application.role,
        format: resolvedFormat,
        paper,
        density,
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadText = async () => {
    if (isExportingText || !application.current || !profile) return;
    setIsExportingText(true);
    try {
      await downloadResumeText({
        resume: application.current,
        profile,
        company: application.company,
        role: application.role,
      });
    } finally {
      setIsExportingText(false);
    }
  };

  const handleFormatChange = (next: DocumentFormatV2) => {
    if (isLocked) return;
    setDraftFormat(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateApplication.mutate(
        { id: applicationId, input: { format: next } },
        { onSuccess: () => setDraftFormat(null) },
      );
    }, DEBOUNCE_MS);
  };

  // Saves the FULL current in-memory format as a new named preset
  // (settings.presets, §9/E9-F5b) — a complete DocumentFormatV2 snapshot, not
  // a composition delta, so selecting it back later applies it directly
  // (TemplateGallery's onChange(savedPreset.format), never applyPreset).
  const handleSaveAsPreset = () => {
    const name = window.prompt("Name this preset")?.trim();
    if (!name) return;
    const preset: UserPreset = { id: crypto.randomUUID(), name, format: displayFormat };
    updateSettings.mutate({ presets: [...(settings?.presets ?? []), preset] });
  };

  // F204/F205/T021: the rail carries no title of its own — the active
  // global-nav item ("Applications") already answers "where am I" (the
  // former "← Applications" back-link duplicated that exact same
  // destination 30px below it), and the surface title itself lives ONLY in
  // the editor pane's h1 below (one-title convention). What the rail's
  // surface-context zone contributes instead is standing STATUS that has no
  // home in the global nav: which application this is (company) and its
  // gen-state.
  const rail = (
    <div className="flex flex-col gap-5 p-4">
      <div className="min-w-0">
        {application.company ? (
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {application.company}
          </p>
        ) : null}
        <div className="mt-2 flex flex-col items-start gap-1.5">
          <GenStateBadge state={application.genState} />
          {isTailoring ? <span className="text-xs text-muted-foreground">Tailoring…</span> : null}
        </div>
      </div>

      {/* Section zone: a mono-caps micro-label — same kicker treatment as
          the editor pane's own section headings (EditorSection below) —
          scopes the nav that follows to "sections of THIS surface", as
          opposed to the global-nav zone above it. v3-T013: one row per
          editor section — order follows the SAME fixed JSX order the editor
          pane below renders in (no second ordering source). F209/T023: the
          WHOLE row navigates (scrolls/focuses the section's heading, never
          the URL) — collapse is no longer a second control here, it moved to
          the editor's own section header (EditorSection above). F202/T023:
          exactly one row is "current" — driven by the scroll-spy above, not
          by which row was last clicked — carrying BOTH `aria-current` and
          the accent-pill treatment on this same <button>, the same visual
          language NavTabs uses for the active global-nav item. A surface
          with fewer than 2 sections has no "current" to track, so the WHOLE
          zone (kicker + nav) is absent, not merely hidden (no vacuous spy). */}
      {WORKSPACE_SECTIONS.length >= 2 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            SECTIONS
          </p>
          <nav aria-label="Sections" data-testid="rail-nav" className="flex flex-col gap-1">
            {WORKSPACE_SECTIONS.map((section) => {
              const isActive = activeSection === section.key;
              return (
                <button
                  key={section.key}
                  type="button"
                  data-testid={`rail-nav-${section.key}`}
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => navigateToSection(section.key)}
                  className={cn(
                    "truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-accent font-medium text-primary"
                      : "text-muted-foreground hover:bg-[var(--ring-weak)] hover:text-foreground",
                  )}
                >
                  {section.label}
                </button>
              );
            })}
          </nav>
        </div>
      ) : null}
    </div>
  );

  const editor = (
    <div className="flex flex-col gap-6 p-6">
      <div>
        {/* One-title convention (F205/T021): the surface title lives here,
            in the editor pane's h1, and ONLY here — the rail no longer
            renders it (surface-context zone above shows company/status
            instead). */}
        <h1 tabIndex={-1} className="text-lg font-semibold tracking-tight outline-none">
          {application.role || "Untitled application"}
        </h1>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={() =>
              application.locked
                ? unlockApplication.mutate(application.id)
                : lockApplication.mutate(application.id)
            }
            disabled={
              (!application.locked && !application.current) ||
              lockApplication.isPending ||
              unlockApplication.isPending
            }
            className={TAP_TARGET_COARSE}
          >
            {application.locked ? "Unlock" : "Lock final"}
          </Button>
          <Button
            data-testid="tailor-button"
            onClick={() => tailorApplication.mutate(application.id)}
            disabled={isTailoring}
            className={TAP_TARGET_COARSE}
          >
            {tailorLabel}
          </Button>
          <Button
            variant="outline"
            data-testid="download-pdf-button"
            disabled={!application.current || !profile || isExportingPdf}
            onClick={handleDownloadPdf}
            className={TAP_TARGET_COARSE}
          >
            {isExportingPdf ? "Preparing…" : "Download PDF"}
          </Button>
          <Button
            variant="outline"
            data-testid="download-text-button"
            disabled={!application.current || !profile || isExportingText}
            onClick={handleDownloadText}
            className={TAP_TARGET_COARSE}
          >
            {isExportingText ? "Preparing…" : "Plain text"}
          </Button>
          <Button
            variant="outline"
            disabled={!application.current || flagVoiceResume.isPending}
            data-testid="flag-voice-resume"
            onClick={() => flagVoiceResume.mutate({ id: application.id, kind: "resume" })}
            className={TAP_TARGET_COARSE}
          >
            Use as a voice source
          </Button>
        </div>
        {tailorApplication.isError ? (
          <p
            role="alert"
            data-testid="tailor-error"
            className="mt-2 text-right text-xs text-destructive"
          >
            {tailorErrorMessage(tailorApplication.error)}
          </p>
        ) : null}
        {flagVoiceResume.isError ? (
          <p role="alert" className="mt-2 text-right text-xs text-destructive">
            {flagVoiceErrorMessage(flagVoiceResume.error)}
          </p>
        ) : null}
      </div>

      {/* F301/T030: below `lg` the rail (and the "SECTIONS" nav portaled
          into it above) is gone entirely — this is the SAME nav, folded
          into the editor pane itself so section-jumping stays reachable.
          `lg:hidden` (not a conditional render) is fine here: unlike the
          rail/bottom-bar pair, nothing asserts this node's ABSENCE at
          desktop widths, only its reachability below `lg`. Distinct
          testids from the rail's `rail-nav`/`rail-nav-<key>` — both can be
          in the DOM at once (the rail's copy portals in from outside this
          component), and scroll-spy.spec.ts's `getByTestId("rail-nav-*")`
          locators must keep matching exactly one element. */}
      {WORKSPACE_SECTIONS.length >= 2 ? (
        <nav
          aria-label="Sections"
          data-testid="editor-section-nav"
          className="flex flex-col gap-1 lg:hidden"
        >
          {WORKSPACE_SECTIONS.map((section) => {
            const isActive = activeSection === section.key;
            return (
              <button
                key={section.key}
                type="button"
                data-testid={`editor-section-nav-${section.key}`}
                aria-current={isActive ? "true" : undefined}
                onClick={() => navigateToSection(section.key)}
                className={cn(
                  "truncate rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-accent font-medium text-primary"
                    : "text-muted-foreground hover:bg-[var(--ring-weak)] hover:text-foreground",
                )}
              >
                {section.label}
              </button>
            );
          })}
        </nav>
      ) : null}

      <EditorSection
        sectionKey="job"
        label="Job details"
        collapsed={Boolean(collapsedSections.job)}
        onToggleCollapse={() => toggleSection("job")}
        headingRef={(el) => setHeadingRef("job", el)}
      >
        <JobPanel application={application} />
      </EditorSection>

      <EditorSection
        sectionKey="letter"
        label="Cover letter"
        collapsed={Boolean(collapsedSections.letter)}
        onToggleCollapse={() => toggleSection("letter")}
        headingRef={(el) => setHeadingRef("letter", el)}
      >
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                {/* v4-T024/F208: h2, not the default h3 — the editor's h1
                    has no h2 between it and here, so h3 would skip a level. */}
                <CardTitle as="h2" className="text-md">
                  Cover letter
                </CardTitle>
                <CardDescription>
                  Generated independently of the resume — its own draw on your Library, this job's
                  JD, and Motivation above.
                </CardDescription>
              </div>
              <GenStateBadge state={application.letterGenState} kind="letter" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {isLetterGenerating ? (
                <span className="text-sm text-muted-foreground">Generating…</span>
              ) : null}
              <Button
                onClick={() => generateLetter.mutate(application.id)}
                disabled={isLetterGenerating}
              >
                {letterLabel}
              </Button>
              <Button
                variant="outline"
                onClick={() => undoLetter.mutate(application.id)}
                disabled={!application.letterPrevious || undoLetter.isPending}
              >
                Undo letter
              </Button>
              <Button
                variant="outline"
                disabled={!application.letterCurrent || !profile}
                onClick={() =>
                  profile &&
                  application.letterCurrent &&
                  downloadLetterPdf({
                    letter: application.letterCurrent,
                    profile,
                    paper,
                    format: resolvedFormat,
                    company: application.company,
                    role: application.role,
                  })
                }
              >
                Download cover letter
              </Button>
              <Button
                variant="outline"
                disabled={!application.letterCurrent || flagVoiceLetter.isPending}
                data-testid="flag-voice-letter"
                onClick={() => flagVoiceLetter.mutate({ id: application.id, kind: "cover-letter" })}
              >
                Use as a voice source
              </Button>
            </div>
            {flagVoiceLetter.isError ? (
              <p role="alert" className="text-xs text-destructive">
                {flagVoiceErrorMessage(flagVoiceLetter.error)}
              </p>
            ) : null}

            {!application.letterCurrent ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong py-12 text-center">
                <BookOpen
                  aria-hidden
                  className="h-8 w-8 text-muted-foreground/60"
                  strokeWidth={1.5}
                />
                <div>
                  <p className="text-sm font-medium">No cover letter yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Generate pulls from your Library, this job's JD, and Motivation above — or{" "}
                    hand-author one from scratch.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isLocked || createBlankLetter.isPending}
                  data-testid="create-blank-letter"
                  onClick={() => createBlankLetter.mutate(application.id)}
                >
                  Create blank letter
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </EditorSection>

      <EditorSection
        sectionKey="design"
        label="Design"
        collapsed={Boolean(collapsedSections.design)}
        onToggleCollapse={() => toggleSection("design")}
        headingRef={(el) => setHeadingRef("design", el)}
      >
        <Card>
          <CardHeader>
            <div>
              {/* v4-T024/F208: see the Cover letter heading above — same
                  h3-would-skip-a-level reasoning. */}
              <CardTitle as="h2" className="text-md">
                Design
              </CardTitle>
              <CardDescription>
                {isLocked
                  ? "Locked — this reflects the look frozen at lock time. Unlock to edit."
                  : "Template and formatting for this application's document. Changes repaint the preview live."}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLocked}
                  onClick={handleSaveAsPreset}
                >
                  Save current design as preset
                </Button>
                <TemplateGallery
                  format={displayFormat}
                  onChange={handleFormatChange}
                  readOnly={isLocked}
                  resume={application.current}
                  profile={profile}
                  paper={paper}
                  savedPresets={settings?.presets ?? []}
                />
              </div>
              <TemplatePicker
                format={displayFormat}
                onChange={handleFormatChange}
                readOnly={isLocked}
                resume={application.current}
                profile={profile}
                paper={paper}
              />
            </div>
            <DesignPanel format={displayFormat} onChange={handleFormatChange} readOnly={isLocked} />
          </CardContent>
        </Card>
      </EditorSection>

      {application.currentMeta ? (
        <p className="flex items-center gap-2 rounded-lg bg-warn-soft px-4 py-2.5 text-sm text-warn">
          <Clock aria-hidden className="h-4 w-4 shrink-0" />
          Tailored from your Library as of {formatStaleDate(application.currentMeta.at)} — re-tailor
          to fold in newer entries.
        </p>
      ) : null}
    </div>
  );

  const preview = (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant={docTab === "resume" ? "default" : "outline"}
          aria-pressed={docTab === "resume"}
          onClick={() => setDocTab("resume")}
        >
          Resume
        </Button>
        <Button
          size="sm"
          variant={docTab === "letter" ? "default" : "outline"}
          aria-pressed={docTab === "letter"}
          onClick={() => setDocTab("letter")}
        >
          Letter
        </Button>
      </div>

      {docTab === "resume" ? (
        application.current ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {fit ? <FitChip fit={fit} /> : null}
              {fitError ? (
                <span role="alert" className="text-xs text-destructive">
                  Couldn't measure the fitted page count.
                </span>
              ) : null}
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={view === "preview" ? "default" : "outline"}
                  aria-pressed={view === "preview"}
                  onClick={() => setView("preview")}
                >
                  Preview
                </Button>
                <Button
                  size="sm"
                  variant={view === "ats" ? "default" : "outline"}
                  aria-pressed={view === "ats"}
                  onClick={() => setView("ats")}
                >
                  What the ATS sees
                </Button>
              </div>
            </div>

            {fit && !fit.fits ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
                <span>
                  Exceeds the {targetPages}-page target — even at the tightest density this renders
                  at {fit.pageCount} pages. Nothing was cut.
                </span>
                <div className="flex gap-2">
                  {targetPages === 1 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateApplication.mutate({ id: applicationId, input: { targetPages: 2 } })
                      }
                    >
                      Allow 2 pages
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    title="Re-tailoring to a tighter budget is coming in a later update (E7-D1)."
                  >
                    Re-tailor to a tighter budget
                  </Button>
                </div>
              </div>
            ) : null}

            {view === "ats" && profile ? (
              <AtsView
                resume={application.current}
                profile={profile}
                format={displayFormat}
                paper={paper}
                density={density}
              />
            ) : (
              <ResultView
                resume={application.current}
                format={displayFormat}
                density={density}
                applicationId={applicationId}
                readOnly={isLocked}
                allPages
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong py-16 text-center">
            <BookOpen aria-hidden className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
            <div>
              <p className="text-sm font-medium">No tailored resume yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tailor pulls from your Library —{" "}
                <Link to="/library" className="text-primary underline underline-offset-4">
                  add missing facts in Library →
                </Link>
              </p>
            </div>
          </div>
        )
      ) : application.letterCurrent ? (
        <div data-testid="letter-preview">
          <LetterPreview
            letter={application.letterCurrent}
            format={resolvedFormat}
            applicationId={applicationId}
            readOnly={isLocked}
          />
        </div>
      ) : (
        <div
          data-testid="letter-empty"
          className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong py-16 text-center"
        >
          <Mail aria-hidden className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-medium">No cover letter yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Generated or hand-authored in the{" "}
              <span className="whitespace-nowrap text-primary underline underline-offset-4">
                <span data-testid="letter-cta-text">Cover letter panel</span>{" "}
                <span data-testid="letter-cta-arrow" aria-hidden>
                  →
                </span>
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );

  // v3-T050: WorkspaceShell is hoisted above the router's Outlet (App.tsx) in
  // the real app — WorkspaceShellSurface portals rail/preview into it there,
  // or (rendered standalone, e.g. under test) falls back to an embedded
  // WorkspaceShell of its own. Either way `editor` is this route's actual
  // Outlet content.
  return <WorkspaceShellSurface rail={rail} editor={editor} preview={preview} />;
}
