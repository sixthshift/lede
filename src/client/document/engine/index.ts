// Barrel — the engine's public surface for consumers (later cutover
// tickets) and for this ticket's tests.
export { EngineDocument, type EngineDocumentProps } from "./document";
export { renderEngineToBuffer, fitEngineToPages, type EngineFitResult } from "./render";
export {
  applyEngineDensity,
  DENSITY_LADDER,
  DENSITY_MULTIPLIERS,
  type EngineDensity,
} from "./density";
export { toLegacyFormat } from "./legacyAdapt";
