// Template registry — react-pdf document composition (spec.md §28.2, the
// same pattern as @shared/sections' section registry). Each template is a
// manifest around a `render` function that composes the shared section
// renderers (./sections.tsx) into a full react-pdf Document; templates
// differ from each other in composition (layout, header treatment, rules),
// never in which sections/features they render (rx-resume's rule, §28.2).

import type { ReactElement } from "react";
import type { Profile, TailoredResume } from "@shared/types";
import { StrictTemplate } from "./templates/strict";
import { SidebarTemplate } from "./templates/sidebar";

export type TemplateLayout = "single" | "sidebar-left" | "sidebar-right";
export type AtsGrade = "strict" | "good";
export type Paper = "letter" | "a4";
// §28.4 fit ladder — auto density, template-declared multipliers land in a later ticket.
export type Density = "comfortable" | "standard" | "compact";

export type TemplateProps = { resume: TailoredResume; profile: Profile; paper: Paper };

export type TemplateManifest = {
  id: string;
  name: string;
  description: string;
  layout: TemplateLayout;
  atsGrade: AtsGrade;
  densityLadder: Density[];
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
    render: StrictTemplate,
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
    render: SidebarTemplate,
  },
} satisfies Record<string, TemplateManifest>;

export type TemplateId = keyof typeof TEMPLATES;

export function getTemplate(id: string): TemplateManifest {
  const template = (TEMPLATES as Record<string, TemplateManifest>)[id];
  if (!template) throw new Error(`Unknown template id: ${id}`);
  return template;
}
