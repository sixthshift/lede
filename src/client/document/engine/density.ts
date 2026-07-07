// The §28.4 fit ladder, ported for the engine's legacy-adapted format shape.
// NOT imported from ../fit.ts: fit.ts's applyDensity is already exactly this
// logic, but fit.ts also imports the six-look lookup module (getTemplate) at
// module scope — pulling that in transitively would defeat this directory's
// grep-guarded "carries neither" lock. The multiplier table below matches
// what every one of the six retired looks currently declares in that lookup
// module (they all share one ladder today); the 9.5pt floor matches fit.ts's
// BODY_SIZE_FLOOR_PT.
import type { DocumentFormat } from "@shared/types";

export type EngineDensity = "comfortable" | "standard" | "compact";
export const DENSITY_LADDER: EngineDensity[] = ["comfortable", "standard", "compact"];

const BODY_SIZE_FLOOR_PT = 9.5;
export const DENSITY_MULTIPLIERS: Record<EngineDensity, number> = {
  comfortable: 1,
  standard: 0.94,
  compact: 0.88,
};

// Density scales type size, line-height, and page rhythm only — the item set
// rendered never changes (§28.4, the renderer never cuts).
export function applyEngineDensity(format: DocumentFormat, density: EngineDensity): DocumentFormat {
  const multiplier = DENSITY_MULTIPLIERS[density];
  return {
    ...format,
    typography: {
      ...format.typography,
      body: {
        ...format.typography.body,
        size: Math.max(format.typography.body.size * multiplier, BODY_SIZE_FLOOR_PT),
        lineHeight: format.typography.body.lineHeight * multiplier,
      },
    },
    page: {
      ...format.page,
      marginY: format.page.marginY * multiplier,
      sectionGap: format.page.sectionGap * multiplier,
    },
  };
}
