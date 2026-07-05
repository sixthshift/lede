// Bounded per-document design controls — spec.md §28.3. Every control is a
// select/stepper/palette-swatch, never free-form text, so a saved
// DocumentFormat can never drift outside documentFormatZ's ranges (@shared/schema).
// Structure here stops at per-section column count — drag-drop/reorder/
// visibility stays LayoutEditor's job, deferred (§28.3). Bound to either
// application.format (ApplicationDetail) or settings.defaultFormat
// (SettingsView) by the caller; `readOnly` reflects a locked application's
// frozen lockedFormat, where editing the look is out of scope (it froze
// what was sent).

import type { ReactNode } from "react";
import type { DocumentFormat, FontId, Section } from "@shared/types";
import { SECTIONS, SECTION_VALUES } from "@shared/sections";
import { FONT_FACES } from "../document/fonts";
import { Alert, AlertDescription } from "./ui/alert";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const FONT_IDS = Object.keys(FONT_FACES) as FontId[];
const HEADING_WEIGHTS = [400, 500, 600, 700] as const;
const COLUMN_OPTIONS = [1, 2, 3] as const;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

// A curated set, not an open picker — every swatch here is already a valid
// documentFormatZ hex; the text input next to it is the escape hatch for
// anything outside the curated set, still bounded by the same regex.
const COLOR_SWATCHES = [
  "#1a1a2e",
  "#0f172a",
  "#1e3a5f",
  "#2a2a4e",
  "#3f3f46",
  "#7c2d12",
  "#14532d",
  "#111111",
];

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function FontSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: FontId;
  onChange: (family: FontId) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as FontId)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FONT_IDS.map((fontId) => (
          <SelectItem key={fontId} value={fontId}>
            {FONT_FACES[fontId].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NumberStepper({
  id,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(clamp(e.target.valueAsNumber, min, max))}
    />
  );
}

function ColorField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {COLOR_SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={hex}
            aria-pressed={value.toLowerCase() === hex}
            disabled={disabled}
            onClick={() => onChange(hex)}
            style={{ backgroundColor: hex }}
            className={
              "h-6 w-6 rounded-full border-2 transition-transform disabled:cursor-not-allowed disabled:opacity-50" +
              (value.toLowerCase() === hex
                ? " border-ring scale-110"
                : " border-transparent hover:scale-105")
            }
          />
        ))}
      </div>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        placeholder="#rrggbb"
        onChange={(e) => {
          const next = e.target.value;
          if (HEX_PATTERN.test(next)) onChange(next);
        }}
      />
    </div>
  );
}

export function DesignPanel({
  format,
  onChange,
  readOnly = false,
}: {
  format: DocumentFormat;
  onChange: (next: DocumentFormat) => void;
  readOnly?: boolean;
}) {
  function set(next: DocumentFormat) {
    if (readOnly) return;
    onChange(next);
  }

  const showPhoto = format.photo.hidden === false;

  return (
    <div className="flex flex-col gap-6">
      {/* ── typography ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldRow label="Body font" htmlFor="design-body-family">
          <FontSelect
            id="design-body-family"
            value={format.typography.body.family}
            disabled={readOnly}
            onChange={(family) =>
              set({
                ...format,
                typography: { ...format.typography, body: { ...format.typography.body, family } },
              })
            }
          />
        </FieldRow>

        <FieldRow label="Heading font" htmlFor="design-heading-family">
          <FontSelect
            id="design-heading-family"
            value={format.typography.heading.family}
            disabled={readOnly}
            onChange={(family) =>
              set({
                ...format,
                typography: {
                  ...format.typography,
                  heading: { ...format.typography.heading, family },
                },
              })
            }
          />
        </FieldRow>

        <FieldRow label="Body size (pt)" htmlFor="design-body-size">
          <NumberStepper
            id="design-body-size"
            value={format.typography.body.size}
            min={9}
            max={12}
            step={0.5}
            disabled={readOnly}
            onChange={(size) =>
              set({
                ...format,
                typography: { ...format.typography, body: { ...format.typography.body, size } },
              })
            }
          />
        </FieldRow>

        <FieldRow label="Line height" htmlFor="design-line-height">
          <NumberStepper
            id="design-line-height"
            value={format.typography.body.lineHeight}
            min={1}
            max={1.8}
            step={0.1}
            disabled={readOnly}
            onChange={(lineHeight) =>
              set({
                ...format,
                typography: {
                  ...format.typography,
                  body: { ...format.typography.body, lineHeight },
                },
              })
            }
          />
        </FieldRow>

        <FieldRow label="Heading weight" htmlFor="design-heading-weight">
          <Select
            value={String(format.typography.heading.weight)}
            disabled={readOnly}
            onValueChange={(next) =>
              set({
                ...format,
                typography: {
                  ...format.typography,
                  heading: {
                    ...format.typography.heading,
                    weight: Number(next) as 400 | 500 | 600 | 700,
                  },
                },
              })
            }
          >
            <SelectTrigger id="design-heading-weight" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HEADING_WEIGHTS.map((weight) => (
                <SelectItem key={weight} value={String(weight)}>
                  {weight}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      </div>

      {/* ── color ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldRow label="Primary color" htmlFor="design-color-primary">
          <ColorField
            id="design-color-primary"
            value={format.colors.primary}
            disabled={readOnly}
            onChange={(primary) => set({ ...format, colors: { ...format.colors, primary } })}
          />
        </FieldRow>

        <FieldRow label="Text color" htmlFor="design-color-text">
          <ColorField
            id="design-color-text"
            value={format.colors.text}
            disabled={readOnly}
            onChange={(text) => set({ ...format, colors: { ...format.colors, text } })}
          />
        </FieldRow>
      </div>

      {/* ── page ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <FieldRow label="Side margin (pt)" htmlFor="design-margin-x">
          <NumberStepper
            id="design-margin-x"
            value={format.page.marginX}
            min={18}
            max={72}
            step={2}
            disabled={readOnly}
            onChange={(marginX) => set({ ...format, page: { ...format.page, marginX } })}
          />
        </FieldRow>

        <FieldRow label="Top/bottom margin (pt)" htmlFor="design-margin-y">
          <NumberStepper
            id="design-margin-y"
            value={format.page.marginY}
            min={18}
            max={72}
            step={2}
            disabled={readOnly}
            onChange={(marginY) => set({ ...format, page: { ...format.page, marginY } })}
          />
        </FieldRow>

        <FieldRow label="Section gap (pt)" htmlFor="design-section-gap">
          <NumberStepper
            id="design-section-gap"
            value={format.page.sectionGap}
            min={0}
            max={24}
            step={1}
            disabled={readOnly}
            onChange={(sectionGap) => set({ ...format, page: { ...format.page, sectionGap } })}
          />
        </FieldRow>
      </div>

      {/* ── photo ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            id="design-photo-shown"
            type="checkbox"
            checked={showPhoto}
            disabled={readOnly}
            onChange={(e) =>
              set({ ...format, photo: { ...format.photo, hidden: !e.target.checked } })
            }
            className="h-4 w-4 rounded border-border"
          />
          <Label htmlFor="design-photo-shown">Show photo on resume</Label>
        </div>
        {showPhoto ? (
          <Alert>
            <AlertDescription>
              Photos are expected on DACH/JP CVs, but discouraged for US/UK resumes — check the
              norms for your target market before enabling this.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      {/* ── structure — per-section column count only; order/visibility is LayoutEditor's job ── */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Section columns</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SECTION_VALUES.map((section) => (
            <FieldRow
              key={section}
              label={SECTIONS[section].label}
              htmlFor={`design-columns-${section}`}
            >
              <ColumnsSelect
                id={`design-columns-${section}`}
                section={section}
                format={format}
                disabled={readOnly}
                onChange={set}
              />
            </FieldRow>
          ))}
        </div>
      </div>
    </div>
  );
}

function ColumnsSelect({
  id,
  section,
  format,
  disabled,
  onChange,
}: {
  id: string;
  section: Section;
  format: DocumentFormat;
  disabled?: boolean;
  onChange: (next: DocumentFormat) => void;
}) {
  const columns = format.sections[section]?.columns ?? 1;
  return (
    <Select
      value={String(columns)}
      disabled={disabled}
      onValueChange={(next) =>
        onChange({
          ...format,
          sections: {
            ...format.sections,
            [section]: { ...format.sections[section], columns: Number(next) as 1 | 2 | 3 },
          },
        })
      }
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {COLUMN_OPTIONS.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {n}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
