// Template registry — react-pdf document composition (spec.md §28.2, the
// same pattern as @shared/sections' section registry). Each template is a
// manifest around a `render` function that composes the shared section
// renderers (./sections.tsx) into a full react-pdf Document; templates
// differ from each other in composition (layout, header treatment, rules),
// never in which sections/features they render (rx-resume's rule, §28.2).

import type { ReactElement } from "react";
import type { DocumentFormat, Profile, TailoredResume } from "@shared/types";
import { StrictTemplate } from "./templates/strict";
import { SidebarTemplate } from "./templates/sidebar";
import { ClassicTemplate } from "./templates/classic";
import { CompactTemplate } from "./templates/compact";

export type TemplateLayout = "single" | "sidebar-left" | "sidebar-right";
export type AtsGrade = "strict" | "good";
export type Paper = "letter" | "a4";
// §28.4 fit ladder — auto density, template-declared multipliers land in a later ticket.
export type Density = "comfortable" | "standard" | "compact";

export type TemplateProps = {
  resume: TailoredResume;
  profile: Profile;
  paper: Paper;
  format: DocumentFormat;
};

export type TemplateManifest = {
  id: string;
  name: string;
  description: string;
  layout: TemplateLayout;
  atsGrade: AtsGrade;
  densityLadder: Density[];
  // §28.4 fit ladder — scale factors applied to type size/line-height/page
  // gaps only; comfortable is always 1 (exactly as authored).
  densityMultipliers: Record<Density, number>;
  render: (props: TemplateProps) => ReactElement;
};

export const TEMPLATES = {
  strict: {
    id: "strict",
    name: "Strict",
    description: "Single-column, ATS-strict layout — standard bullets, contact in body flow.",
    layout: "single",
    atsGrade: "strict",
    densityLadder: ["comfortable", "standard", "compact"],
    densityMultipliers: { comfortable: 1, standard: 0.94, compact: 0.88 },
    render: StrictTemplate,
  },
  classic: {
    id: "classic",
    name: "Classic",
    description:
      "Single-column, ATS-strict layout — centered profile header, hairline rule under each section heading.",
    layout: "single",
    atsGrade: "strict",
    densityLadder: ["comfortable", "standard", "compact"],
    densityMultipliers: { comfortable: 1, standard: 0.94, compact: 0.88 },
    render: ClassicTemplate,
  },
  compact: {
    id: "compact",
    name: "Compact",
    description:
      "Single-column, ATS-strict layout — one-line header (name + contact on the same row), tighter section rhythm.",
    layout: "single",
    atsGrade: "strict",
    densityLadder: ["comfortable", "standard", "compact"],
    densityMultipliers: { comfortable: 1, standard: 0.94, compact: 0.88 },
    render: CompactTemplate,
  },
  "sidebar-left": {
    id: "sidebar-left",
    name: "Sidebar",
    description:
      "Two-column layout — skills/contact-adjacent sections in a left sidebar, narrative sections in the main column.",
    layout: "sidebar-left",
    // Two-column; modern parsers handle it but strict-order ATS parsers
    // (Workday/Taleo) read left-to-right — that caveat belongs in the
    // picker UI later, not here.
    atsGrade: "good",
    densityLadder: ["comfortable", "standard", "compact"],
    densityMultipliers: { comfortable: 1, standard: 0.94, compact: 0.88 },
    render: SidebarTemplate,
  },
} satisfies Record<string, TemplateManifest>;

export type TemplateId = keyof typeof TEMPLATES;

export function getTemplate(id: string): TemplateManifest {
  const template = (TEMPLATES as Record<string, TemplateManifest>)[id];
  if (!template) throw new Error(`Unknown template id: ${id}`);
  return template;
}

// §28.2: a sidebar layout or a shown photo reads to an ATS parser as
// something less linear than plain top-to-bottom text, no matter how
// ATS-strict the template's own composition claims to be — so both cap the
// grade at 'good', never letting a template's declared atsGrade overstate
// what the chosen format actually produces.
export function effectiveAtsGrade(manifest: TemplateManifest, format: DocumentFormat): AtsGrade {
  const capped = format.photo.hidden === false || manifest.layout !== "single";
  return capped ? "good" : manifest.atsGrade;
}
