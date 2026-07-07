// Preset v2 configs (spec.md §31.1: "the six E7/E8 code templates are
// RETIRED as code and reborn as the first six presets"). Each preset is a
// pure migration of that template's v1 default config, plus its own
// identity — never a hand-authored fork of the axes (migrateFormat already
// encodes each retired template's composition delta, see
// src/shared/format-v2.ts's TEMPLATE_V2_OVERLAYS).
import { DEFAULT_FORMAT } from "@shared/format";
import { migrateFormat, type DocumentFormatV2 } from "@shared/format-v2";
import type { DocumentFormat } from "@shared/types";

export const PRESET_IDS = [
  "strict",
  "classic",
  "compact",
  "banner",
  "sidebar-left",
  "sidebar-right",
] as const;
export type PresetId = (typeof PRESET_IDS)[number];

// The only field that varies across the six templates' v1 defaults is
// templateId — colors/typography/page/photo start from the same instance
// default (src/shared/format.ts's DEFAULT_FORMAT) today.
function v1DefaultFor(templateId: PresetId): DocumentFormat {
  return { ...DEFAULT_FORMAT, templateId };
}

export const PRESETS: Record<PresetId, DocumentFormatV2> = Object.fromEntries(
  PRESET_IDS.map((id) => [id, { ...migrateFormat(v1DefaultFor(id)), presetId: id }]),
) as Record<PresetId, DocumentFormatV2>;

export const SINGLE_COLUMN_PRESET_IDS = ["strict", "classic", "compact", "banner"] as const;
