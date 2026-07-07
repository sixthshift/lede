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
// six retired templates' own composition identity.
export type PresetLayout = "single" | "sidebar-left" | "sidebar-right";
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
} satisfies Record<PresetId, PresetManifest>;

export function getPreset(id: string): PresetManifest {
  const manifest = (PRESET_MANIFESTS as Record<string, PresetManifest>)[id];
  if (!manifest) throw new Error(`Unknown preset id: ${id}`);
  return manifest;
}

// §31.5 (graded honesty): a shown photo or any non-single-column layout reads
// to an ATS parser as something less linear than plain top-to-bottom text, no
// matter how ATS-strict the preset's own composition claims to be — so both
// cap the grade at 'good', never letting a preset's declared atsGrade
// overstate what the LIVE format (not just the preset it started from)
// actually produces. Unlike v1 (where layout was entirely templateId-
// dispatched), v2's layout lives on the format itself — so the cap reads the
// format's own `layout.columns` / `photo.hidden`, not the manifest.
export function effectiveAtsGrade(manifest: PresetManifest, format: DocumentFormatV2): AtsGrade {
  const capped = format.photo.hidden === false || format.layout.columns !== "one";
  return capped ? "good" : manifest.atsGrade;
}
