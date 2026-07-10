// Preset registry — spec.md §31.1. The six E7/E8 code templates are RETIRED
// as code (this ticket deletes their per-look composition directory); they're
// reborn as the first six PRESETS (./presets.ts) — named snapshots of
// DocumentFormatV2 rendered by the ONE engine (./engine/). This module
// carries only DISPLAY metadata (name/description/layout for the picker/
// gallery cards) + the graded-honesty cap — never a render function; the
// engine composes, presets configure.
import type { DocumentFormatV2 } from "@shared/format-v2";
import { PRESET_IDS, type PresetId } from "./presets";

export type { Paper } from "@shared/types";
export { PRESET_IDS };
export type { PresetId };

// Purely descriptive (picker/gallery labels) — the actual composition a
// preset produces is driven entirely by its DocumentFormatV2 (presets.ts),
// never by this field. 'single' | 'sidebar-left' | 'sidebar-right' mirror the
// six retired templates' own composition identity; 'two-column' (E9-F5c)
// covers the new-axis roster's spotlight preset — a columns:'mix' composition
// (full-width header above a sidebar/main split) with no single "which side"
// identity the sidebar-left/right labels imply.
export type PresetLayout = "single" | "sidebar-left" | "sidebar-right" | "two-column";
export type AtsGrade = "strict" | "good";

export type PresetManifest = {
  id: PresetId;
  name: string;
  description: string;
  layout: PresetLayout;
  // The preset's OWN intrinsic classification (§31.5) — effectiveAtsGrade
  // below is what callers should actually use; this is a display-time
  // ingredient, not the final grade (a live format can carry a shown photo
  // or a two-column layout regardless of which preset it started from).
  atsGrade: AtsGrade;
};

export const PRESET_MANIFESTS: Record<PresetId, PresetManifest> = {
  strict: {
    id: "strict",
    name: "Strict",
    description: "Single-column, ATS-strict layout — standard bullets, contact in body flow.",
    layout: "single",
    atsGrade: "strict",
  },
  classic: {
    id: "classic",
    name: "Classic",
    description:
      "Single-column, ATS-strict layout — centered profile header, hairline rule under each section heading.",
    layout: "single",
    atsGrade: "strict",
  },
  compact: {
    id: "compact",
    name: "Compact",
    description:
      "Single-column, ATS-strict layout — one-line header (name + contact on the same row), tighter section rhythm.",
    layout: "single",
    atsGrade: "strict",
  },
  "sidebar-left": {
    id: "sidebar-left",
    name: "Sidebar",
    description:
      "Two-column layout — skills/contact-adjacent sections in a left sidebar, narrative sections in the main column.",
    layout: "sidebar-left",
    atsGrade: "good",
  },
  "sidebar-right": {
    id: "sidebar-right",
    name: "Sidebar Right",
    description:
      "Two-column layout — skills/contact-adjacent sections in a right sidebar, narrative sections in the main column.",
    layout: "sidebar-right",
    atsGrade: "good",
  },
  banner: {
    id: "banner",
    name: "Banner",
    description:
      "Single-column, ATS-strict layout — full-bleed header band tinted with your accent color, name/contact set on the band.",
    layout: "single",
    atsGrade: "strict",
  },
  signature: {
    id: "signature",
    name: "Signature",
    description:
      "Single-column, ATS-strict layout — accent-bar section headings, a display name face, rich accent-color placement, dot-style skill/language levels.",
    layout: "single",
    atsGrade: "strict",
  },
  ledger: {
    id: "ledger",
    name: "Ledger",
    description:
      "Single-column, ATS-strict layout — thin-underline headings, split date/location placement, indented entry bodies, circle-filled contact icons.",
    layout: "single",
    atsGrade: "strict",
  },
  frame: {
    id: "frame",
    name: "Frame",
    description:
      "Single-column, ATS-strict layout — a 4-side accent-colored page frame, boxed section headings, a bold display name face.",
    layout: "single",
    atsGrade: "strict",
  },
  spotlight: {
    id: "spotlight",
    name: "Spotlight",
    description:
      "Two-column layout — a full-width header band above a sidebar/main split, distinct from the side-anchored Sidebar templates.",
    layout: "two-column",
    atsGrade: "good",
  },
} satisfies Record<PresetId, PresetManifest>;

export function getPreset(id: string): PresetManifest {
  const manifest = (PRESET_MANIFESTS as Record<string, PresetManifest>)[id];
  if (!manifest) throw new Error(`Unknown preset id: ${id}`);
  return manifest;
}

// §31.5/oracle [v3-038]: the shipped ATS classification table. atsGrade keys
// ONLY on the format's own axes — never on which preset (if any) produced it
// — so a live format always self-reports the grade it actually earns.
// atsGradeCauses is the same table read the other way: each condition that
// fails contributes its own human-readable reason (F5c caveat UI copy),
// rather than atsGrade collapsing them into one opaque "good".
//
// A colored PAGE background only exists in 'multi' mode over a 'full-page'
// or 'border' area (src/client/document/engine/document.tsx's
// resolvePageBackground) — 'single' mode always renders the page white
// regardless of area, and the 'header' band (colors.area 'header', e.g. the
// banner preset) paints with colors.accent, never colors.background, so it
// is never a page-background fill and never downgrades the grade.
function hasColoredPageBackground(colors: DocumentFormatV2["colors"]): boolean {
  return colors.mode === "multi" && (colors.area === "full-page" || colors.area === "border");
}

export function atsGradeCauses(format: DocumentFormatV2): string[] {
  const causes: string[] = [];
  if (format.layout.columns !== "one") {
    causes.push("Multi-column layout reads as non-linear to strict-order ATS parsers.");
  }
  if (format.layout.headerPosition !== "top") {
    causes.push("Header sits beside the body (sidebar) instead of above it.");
  }
  if (format.photo.hidden === false) {
    causes.push("A profile photo is shown.");
  }
  if (format.headings.icons !== "none") {
    causes.push("Section heading icons are enabled.");
  }
  if (hasColoredPageBackground(format.colors)) {
    causes.push("A colored page background is applied.");
  }
  return causes;
}

export function atsGrade(format: DocumentFormatV2): AtsGrade {
  return atsGradeCauses(format).length === 0 ? "strict" : "good";
}

// §31.5 (graded honesty): effectiveAtsGrade is kept as the two call sites'
// entry point (manifest + live format) but now fully DELEGATES to the pure
// atsGrade(format) above — the manifest's own declared atsGrade is never
// consulted; a live format always self-reports the grade its OWN axes earn,
// never what the preset it started from claims.
export function effectiveAtsGrade(_manifest: PresetManifest, format: DocumentFormatV2): AtsGrade {
  return atsGrade(format);
}
