// Fit ladder ENGINE (spec.md §28.4). The renderer never cuts — the item set
// rendered is identical at every density; only type size, line-height, and
// page rhythm scale down the ladder (comfortable → standard → compact)
// looking for a density whose rendered page count fits the target. Density
// is a pure, per-render computation — it is never persisted (§28.4).

import type { DocumentFormat, Paper, Profile, TailoredResume } from "@shared/types";
import { type Density, getTemplate } from "./registry";
import { renderResumeToBuffer } from "./renderResume";

const BODY_SIZE_FLOOR_PT = 9.5;
const DENSITY_LADDER: Density[] = ["comfortable", "standard", "compact"];

export function applyDensity(
  format: DocumentFormat,
  density: Density,
  multipliers: Record<Density, number>,
): DocumentFormat {
  const multiplier = multipliers[density];
  const scaledBodySize = Math.max(format.typography.body.size * multiplier, BODY_SIZE_FLOOR_PT);

  return {
    ...format,
    typography: {
      ...format.typography,
      body: {
        ...format.typography.body,
        size: scaledBodySize,
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

async function pageCountAt(args: {
  resume: TailoredResume;
  profile: Profile;
  format: DocumentFormat;
  paper: Paper;
  density: Density;
  multipliers: Record<Density, number>;
}): Promise<number> {
  const densedFormat = applyDensity(args.format, args.density, args.multipliers);
  const buffer = await renderResumeToBuffer({
    resume: args.resume,
    profile: args.profile,
    paper: args.paper,
    templateId: args.format.templateId,
    format: densedFormat,
  });
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  return doc.numPages;
}

export type FitResult = { density: Density; pageCount: number; fits: boolean };

export async function fitToPages(args: {
  resume: TailoredResume;
  profile: Profile;
  format: DocumentFormat;
  paper: Paper;
  targetPages: number;
}): Promise<FitResult> {
  const { densityMultipliers } = getTemplate(args.format.templateId);

  let last: { density: Density; pageCount: number } | null = null;
  for (const density of DENSITY_LADDER) {
    const pageCount = await pageCountAt({ ...args, density, multipliers: densityMultipliers });
    last = { density, pageCount };
    if (pageCount <= args.targetPages) {
      return { density, pageCount, fits: true };
    }
  }

  // last is guaranteed set — DENSITY_LADDER is non-empty
  const overflow = last as { density: Density; pageCount: number };
  return { density: overflow.density, pageCount: overflow.pageCount, fits: false };
}
