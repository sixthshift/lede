// Per-section meta inputs, driven by one field descriptor table — spec.md
// §4.1/§4.3. Switching `section` swaps the rendered fields; there is no
// per-section component (§13: one EntryEditor, not one editor per section).

import type { Section } from "@shared/types";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export type MetaValues = Record<string, string>;
export type MetaFieldDescriptor = { key: string; label: string; required: boolean };

// Mirrors the meta shape for each section in @shared/types EntryMeta /
// @shared/schema entryMetaZ — the UI's view of the same discriminated union.
export const META_FIELDS: Record<Section, MetaFieldDescriptor[]> = {
  experience: [
    { key: "company", label: "Company", required: true },
    { key: "role", label: "Role", required: true },
    { key: "period", label: "Period", required: true },
    { key: "location", label: "Location", required: false },
  ],
  project: [
    { key: "name", label: "Name", required: true },
    { key: "role", label: "Role", required: false },
    { key: "period", label: "Period", required: false },
    { key: "url", label: "URL", required: false },
  ],
  education: [
    { key: "school", label: "School", required: true },
    { key: "degree", label: "Degree", required: true },
    { key: "field", label: "Field", required: false },
    { key: "period", label: "Period", required: false },
    { key: "location", label: "Location", required: false },
  ],
  award: [
    { key: "title", label: "Title", required: true },
    { key: "issuer", label: "Issuer", required: false },
    { key: "date", label: "Date", required: false },
  ],
  certification: [
    { key: "name", label: "Name", required: true },
    { key: "issuer", label: "Issuer", required: false },
    { key: "date", label: "Date", required: false },
    { key: "credentialId", label: "Credential ID", required: false },
    { key: "url", label: "URL", required: false },
  ],
  publication: [
    { key: "title", label: "Title", required: true },
    { key: "venue", label: "Venue", required: false },
    { key: "date", label: "Date", required: false },
    { key: "authors", label: "Authors", required: false },
    { key: "url", label: "URL", required: false },
  ],
  reference: [
    { key: "name", label: "Name", required: true },
    { key: "relationship", label: "Relationship", required: false },
    { key: "company", label: "Company", required: false },
    { key: "email", label: "Email", required: false },
    { key: "phone", label: "Phone", required: false },
  ],
  skill: [
    { key: "category", label: "Category", required: false },
    { key: "level", label: "Level", required: false },
  ],
  interest: [],
  language: [{ key: "level", label: "Level", required: false }],
};

export function SectionMetaFields({
  section,
  meta,
  onChange,
}: {
  section: Section;
  meta: MetaValues;
  onChange: (meta: MetaValues) => void;
}) {
  const fields = META_FIELDS[section];

  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">This section has no additional fields.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1">
          <Label htmlFor={`entry-meta-${field.key}`}>
            {field.label}
            {field.required ? " *" : ""}
          </Label>
          <Input
            id={`entry-meta-${field.key}`}
            value={meta[field.key] ?? ""}
            onChange={(e) => onChange({ ...meta, [field.key]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}
