// 'sidebar-right' template — the mirror of sidebar-left (spec.md §28.2): same
// section split (skills/contact-adjacent sections in the sidebar, narrative
// sections in the main column) and the same shared section renderers, but
// the sidebar column sits on the right. Composition only — never redefines
// section features. Shares its composition with sidebar-left via
// ./sidebar's renderSidebarComposition; sidebar-left's own rendered output
// is untouched by this file.

import type { TemplateProps } from "../registry";
import { renderSidebarComposition } from "./sidebar";

export function SidebarRightTemplate(props: TemplateProps) {
  return renderSidebarComposition(props, "right");
}
