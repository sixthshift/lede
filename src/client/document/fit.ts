// Fit ladder — spec.md §28.4. The renderer never cuts — the item set rendered
// is identical at every density; only type size, line-height, and page
// rhythm scale down the ladder (comfortable → standard → compact) looking
// for a density whose rendered page count fits the target. Density is a
// pure, per-render computation — it is never persisted (§28.4).
//
// §31/E9-F0d1: THE ONE ENGINE is the only render path — this module is now a
// thin re-export of the engine's own fit-ladder walk (./engine/render.ts),
// which already does this over DocumentFormatV2 without a per-template
// lookup (there is no more "per-template density ladder": one engine, one
// ladder, src/client/document/engine/density.ts). v1's public `applyDensity`
// (format, density, multipliers) -> scaled-copy-of-format is RETIRED with it:
// EngineDocument applies the ladder internally from a `density` sibling prop
// (see renderResume.ts/document.tsx), so no caller needs to pre-scale a
// format anymore. The engine's own applyEngineDensity (density.ts) is an
// internal implementation detail over the LEGACY-adapted shape, not this
// module's concern.
export {
  DENSITY_LADDER,
  DENSITY_MULTIPLIERS,
  fitEngineToPages as fitToPages,
  type EngineDensity as Density,
  type EngineFitResult as FitResult,
} from "./engine";
