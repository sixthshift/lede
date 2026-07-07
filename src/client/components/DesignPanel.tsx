// Bounded per-document design controls — spec.md §28.3/§31.2. Every control
// is a select/stepper/palette-swatch, never free-form text, so a saved
// DocumentFormatV2 can never drift outside formatV2Schema's ranges
// (@shared/schema). Bound to either application.format (ApplicationDetail) or
// settings.defaultFormat (SettingsView) by the caller; `readOnly` reflects a
// locked application's frozen lockedFormat, where editing the look is out of
// scope (it froze what was sent).
//
// §31/E9-F0d1 field map (v1 -> v2, this ticket's cutover): body font ->
// fonts.body · body size -> typeScale.bodySize · line height ->
// spacing.lineHeight · heading weight -> header.nameWeight (v2 collapses the
// old 4-value {400,500,600,700} weight to a 2-value normal/bold toggle — no
// other weight axis exists on the engine's one composition) · primary/text
// color -> colors.accent/colors.text · margins -> spacing.marginsMm (v2's
// NATIVE unit is mm, not pt — the stepper UI is kept as-is, just relabeled
// and re-bounded to mm directly; no pt<->mm conversion happens in this
// component) · section gap -> spacing.elementSpacing (0-4 discrete scale) ·
// per-section columns (previously a control for EVERY section) -> narrowed
// to the two sections v2 actually gives a grid axis (§31.2's per-section
// display group): skillsLanguages.gridColumns and interests.gridColumns —
// every other section's columns had no v2 destination (format-v2.ts's
// migration repair comment explains the same drop). The "Heading font"
// control is DROPPED: v2 has no independent heading-family axis (the engine
// always renders headings in the body face; a separate NAME font is
// fonts.name, unwired until a later ticket lands its render seam) — keeping
// a control with no observable effect would be a phantom knob.
import type { ReactNode } from "react";
import type { BodyFontId } from "@shared/format-v2";
import { SECTIONS } from "@shared/sections";
import type { DocumentFormatV2 } from "@shared/format-v2";
import { FONT_FACES } from "../document/fonts";
import { Alert, AlertDescription } from "./ui/alert";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

// FONT_FACES (../document/fonts) registers a curated 6-face subset of v2's
// full 31-face BODY_FONT_IDS roster (§31.2's other 25 faces land in a later
// ticket, F2) — the picker only offers faces that actually render distinctly
// today, never a phantom choice with no visible effect.
const FONT_IDS = Object.keys(FONT_FACES) as Array<Extract<BodyFontId, keyof typeof FONT_FACES>>;
const NAME_WEIGHT_OPTIONS = ["normal", "bold"] as const;
const GRID_COLUMN_OPTIONS = [1, 2, 3, 4] as const;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

// A curated set, not an open picker — every swatch here is already a valid
// formatV2Schema hex; the text input next to it is the escape hatch for
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
  value: BodyFontId;
  onChange: (family: BodyFontId) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as BodyFontId)}
      disabled={disabled}
    >
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
  format: DocumentFormatV2;
  onChange: (next: DocumentFormatV2) => void;
  readOnly?: boolean;
}) {
  function set(next: DocumentFormatV2) {
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
            value={format.fonts.body}
            disabled={readOnly}
            onChange={(body) => set({ ...format, fonts: { ...format.fonts, body } })}
          />
        </FieldRow>

        <FieldRow label="Body size (pt)" htmlFor="design-body-size">
          <NumberStepper
            id="design-body-size"
            value={format.typeScale.bodySize}
            min={9}
            max={12}
            step={0.5}
            disabled={readOnly}
            onChange={(bodySize) =>
              set({ ...format, typeScale: { ...format.typeScale, bodySize } })
            }
          />
        </FieldRow>

        <FieldRow label="Line height" htmlFor="design-line-height">
          <NumberStepper
            id="design-line-height"
            value={format.spacing.lineHeight}
            min={1.15}
            max={1.5}
            step={0.05}
            disabled={readOnly}
            onChange={(lineHeight) =>
              set({ ...format, spacing: { ...format.spacing, lineHeight } })
            }
          />
        </FieldRow>

        <FieldRow label="Heading weight" htmlFor="design-heading-weight">
          <Select
            value={format.header.nameWeight}
            disabled={readOnly}
            onValueChange={(next) =>
              set({
                ...format,
                header: {
                  ...format.header,
                  nameWeight: next as "normal" | "bold",
                  titleWeight: next as "normal" | "bold",
                },
              })
            }
          >
            <SelectTrigger id="design-heading-weight" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NAME_WEIGHT_OPTIONS.map((weight) => (
                <SelectItem key={weight} value={weight}>
                  {weight === "bold" ? "Bold" : "Normal"}
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
            value={format.colors.accent}
            disabled={readOnly}
            onChange={(accent) => set({ ...format, colors: { ...format.colors, accent } })}
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
        <FieldRow label="Side margin (mm)" htmlFor="design-margin-x">
          <NumberStepper
            id="design-margin-x"
            value={format.spacing.marginsMm.x}
            min={10}
            max={28}
            step={1}
            disabled={readOnly}
            onChange={(x) =>
              set({
                ...format,
                spacing: { ...format.spacing, marginsMm: { ...format.spacing.marginsMm, x } },
              })
            }
          />
        </FieldRow>

        <FieldRow label="Top/bottom margin (mm)" htmlFor="design-margin-y">
          <NumberStepper
            id="design-margin-y"
            value={format.spacing.marginsMm.y}
            min={10}
            max={28}
            step={1}
            disabled={readOnly}
            onChange={(y) =>
              set({
                ...format,
                spacing: { ...format.spacing, marginsMm: { ...format.spacing.marginsMm, y } },
              })
            }
          />
        </FieldRow>

        <FieldRow label="Element spacing" htmlFor="design-element-spacing">
          <NumberStepper
            id="design-element-spacing"
            value={format.spacing.elementSpacing}
            min={0}
            max={4}
            step={1}
            disabled={readOnly}
            onChange={(elementSpacing) =>
              set({ ...format, spacing: { ...format.spacing, elementSpacing } })
            }
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

      {/* ── structure — the two sections v2 gives a grid axis (§31.2); every
          other section's columns has no v2 destination (see module comment) ── */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Section columns</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow
            label={`${SECTIONS.skill.label} & ${SECTIONS.language.label} columns`}
            htmlFor="design-columns-skills-languages"
          >
            <GridColumnsSelect
              id="design-columns-skills-languages"
              value={format.sectionDisplay.skillsLanguages.gridColumns}
              disabled={readOnly}
              onChange={(gridColumns) =>
                set({
                  ...format,
                  sectionDisplay: {
                    ...format.sectionDisplay,
                    skillsLanguages: { ...format.sectionDisplay.skillsLanguages, gridColumns },
                  },
                })
              }
            />
          </FieldRow>
          <FieldRow label={`${SECTIONS.interest.label} columns`} htmlFor="design-columns-interests">
            <GridColumnsSelect
              id="design-columns-interests"
              value={format.sectionDisplay.interests.gridColumns}
              disabled={readOnly}
              onChange={(gridColumns) =>
                set({
                  ...format,
                  sectionDisplay: {
                    ...format.sectionDisplay,
                    interests: { ...format.sectionDisplay.interests, gridColumns },
                  },
                })
              }
            />
          </FieldRow>
        </div>
      </div>
    </div>
  );
}

function GridColumnsSelect({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <Select
      value={String(value)}
      disabled={disabled}
      onValueChange={(next) => onChange(Number(next))}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {GRID_COLUMN_OPTIONS.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {n}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
