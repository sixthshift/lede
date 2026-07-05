// Document engine barrel (spec.md §28) — template registry, shared section
// renderers, and the render entrypoints.

export * from "./registry";
export * from "./sections";
export { renderResumeDocument, renderResumeToBuffer } from "./renderResume";
export type { RenderResumeArgs } from "./renderResume";
