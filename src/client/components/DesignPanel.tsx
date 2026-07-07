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
// always renders headings in the body face) — keeping a control with no
// observable effect would be a phantom knob. The NAME font (fonts.name) is
// its own control below, distinct from both body and heading — it now has a
// render seam (E9-F2a, engine/document.tsx).
import type { ReactNode } from "react";
import type {
  BodyFontId,
  ColumnsMode,
  DateFormatV2,
  EntryDateLocationOrder,
  EntryDateLocationPlacement,
  EntryFontStyle,
  EntryListStyle,
  EntryStructure,
  EntrySubtitlePlacement,
  HeaderPosition,
  HeadingCapitalization,
  HeadingIconStyle,
  HeadingStyle,
  NameFontId,
  SectionColumn,
} from "@shared/format-v2";
import { DATE_FORMATS, NAME_DISPLAY_FONT_IDS } from "@shared/format-v2";
import { SECTIONS, SECTION_VALUES } from "@shared/sections";
import type { DocumentFormatV2 } from "@shared/format-v2";
import { FONT_FACES } from "../document/fonts";
import { Alert, AlertDescription } from "./ui/alert";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

// FONT_FACES (../document/fonts) registers a face for every one of §31.2's
// full 31-face BODY_FONT_IDS roster (E9-F2a) — the picker offers the whole
// roster now, matching what actually renders.
const FONT_IDS = Object.keys(FONT_FACES) as Array<Extract<BodyFontId, keyof typeof FONT_FACES>>;
// The name-slot picker (fonts.name): "same-as-body" (default) plus §31.2's 8
// NAME_DISPLAY_FONT_IDS — a materially different list from FONT_IDS (body
// faces aren't valid name-slot values and vice versa), so it gets its own
// select rather than reusing FontSelect.
const NAME_FONT_IDS: readonly NameFontId[] = ["same-as-body", ...NAME_DISPLAY_FONT_IDS];
const NAME_WEIGHT_OPTIONS = ["normal", "bold"] as const;
const GRID_COLUMN_OPTIONS = [1, 2, 3, 4] as const;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

const COLUMNS_MODE_OPTIONS: { value: ColumnsMode; label: string }[] = [
  { value: "one", label: "One column" },
  { value: "two", label: "Two columns (sidebar)" },
  { value: "mix", label: "Mixed (banner + two columns)" },
];
const HEADER_POSITION_OPTIONS: { value: HeaderPosition; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];
const SECTION_COLUMN_OPTIONS: { value: SectionColumn; label: string }[] = [
  { value: "main", label: "Main" },
  { value: "sidebar", label: "Sidebar" },
];
// headings.style's 8 treatments (§31.2, sections.tsx's renderSectionHeading)
// — distinct from the "Heading weight" control below, which binds
// header.nameWeight/titleWeight (the PROFILE header), not this axis.
const HEADING_STYLE_OPTIONS: { value: HeadingStyle; label: string }[] = [
  { value: "underline", label: "Underline" },
  { value: "boxed", label: "Boxed" },
  { value: "outline-short-rule", label: "Short rule below" },
  { value: "rules-above-below", label: "Rules above & below" },
  { value: "accent-bar", label: "Accent bar" },
  { value: "plain", label: "Plain" },
  { value: "thin-underline", label: "Thin underline" },
  { value: "tick-marks", label: "Tick marks" },
];
const HEADING_CAPITALIZATION_OPTIONS: { value: HeadingCapitalization; label: string }[] = [
  { value: "capitalize", label: "Capitalize" },
  { value: "uppercase", label: "Uppercase" },
];
const HEADING_ICON_OPTIONS: { value: HeadingIconStyle; label: string }[] = [
  { value: "none", label: "None" },
  { value: "outline", label: "Outline" },
  { value: "filled", label: "Filled" },
];
// document.dateFormat's 12 presets (§31.2) — the pattern string IS the
// label; each is already the exact shape it renders (formatDate.ts).
const DATE_FORMAT_OPTIONS: { value: DateFormatV2; label: string }[] = DATE_FORMATS.map((value) => ({
  value,
  label: value,
}));

// entries.* (§31.2, E9-F2e — sections.tsx's per-entry header composition).
const ENTRY_STRUCTURE_OPTIONS: { value: EntryStructure; label: string }[] = [
  { value: "full-width", label: "Full width" },
  { value: "columns", label: "Two columns (date/location aside)" },
];
const ENTRY_DATE_LOCATION_PLACEMENT_OPTIONS: {
  value: EntryDateLocationPlacement;
  label: string;
}[] = [
  { value: "right", label: "Right, inline" },
  { value: "left", label: "Left, inline" },
  { value: "split", label: "Split to the far edge" },
];
const ENTRY_DATE_LOCATION_ORDER_OPTIONS: { value: EntryDateLocationOrder; label: string }[] = [
  { value: "date-first", label: "Date first" },
  { value: "location-first", label: "Location first" },
];
const ENTRY_SUBTITLE_PLACEMENT_OPTIONS: { value: EntrySubtitlePlacement; label: string }[] = [
  { value: "same-line", label: "Same line as title" },
  { value: "below", label: "Below title" },
];
const ENTRY_LIST_STYLE_OPTIONS: { value: EntryListStyle; label: string }[] = [
  { value: "bullet", label: "Bullet (•)" },
  { value: "hyphen", label: "Hyphen (-)" },
];
const ENTRY_FONT_STYLE_OPTIONS: { value: EntryFontStyle; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "bold", label: "Bold" },
  { value: "italic", label: "Italic" },
];

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

function NameFontSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: NameFontId;
  onChange: (family: NameFontId) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as NameFontId)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {NAME_FONT_IDS.map((fontId) => (
          <SelectItem key={fontId} value={fontId}>
            {fontId === "same-as-body" ? "Same as body" : FONT_FACES[fontId].label}
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

// A generic bounded-enum picker — entries.* alone needs 6 of these (structure,
// placement, order, subtitle placement, list style, ×3 font styles), so this
// factors the Select/SelectTrigger/SelectContent boilerplate every other
// group above hand-rolls per axis; existing groups are left as-is (not this
// ticket's scope).
function EnumSelect<T extends string>({
  id,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (next: T) => void;
}) {
  return (
    <Select value={value} disabled={disabled} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  const isColumnar = format.layout.columns !== "one";

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

        <FieldRow label="Name font" htmlFor="design-name-family">
          <NameFontSelect
            id="design-name-family"
            value={format.fonts.name}
            disabled={readOnly}
            onChange={(name) => set({ ...format, fonts: { ...format.fonts, name } })}
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

        <FieldRow label="Name size offset (pt over body)" htmlFor="design-name-offset">
          <NumberStepper
            id="design-name-offset"
            value={format.typeScale.nameOffset}
            min={4}
            max={12}
            step={1}
            disabled={readOnly}
            onChange={(nameOffset) =>
              set({ ...format, typeScale: { ...format.typeScale, nameOffset } })
            }
          />
        </FieldRow>

        <FieldRow label="Title size offset (pt over body)" htmlFor="design-title-offset">
          <NumberStepper
            id="design-title-offset"
            value={format.typeScale.titleOffset}
            min={0}
            max={4}
            step={1}
            disabled={readOnly}
            onChange={(titleOffset) =>
              set({ ...format, typeScale: { ...format.typeScale, titleOffset } })
            }
          />
        </FieldRow>

        <FieldRow
          label="Section heading size offset (pt over body)"
          htmlFor="design-section-heading-offset"
        >
          <NumberStepper
            id="design-section-heading-offset"
            value={format.typeScale.sectionHeadingOffset}
            min={0}
            max={3}
            step={1}
            disabled={readOnly}
            onChange={(sectionHeadingOffset) =>
              set({ ...format, typeScale: { ...format.typeScale, sectionHeadingOffset } })
            }
          />
        </FieldRow>

        <FieldRow
          label="Entry header size offset (pt over body)"
          htmlFor="design-entry-header-offset"
        >
          <NumberStepper
            id="design-entry-header-offset"
            value={format.typeScale.entryHeaderOffset}
            min={0}
            max={2}
            step={1}
            disabled={readOnly}
            onChange={(entryHeaderOffset) =>
              set({ ...format, typeScale: { ...format.typeScale, entryHeaderOffset } })
            }
          />
        </FieldRow>
      </div>

      {/* ── section headings — headings.{style,capitalization,icons} (§31.2,
          sections.tsx's renderSectionHeading). Distinct from "Heading
          weight" above, which binds header.nameWeight/titleWeight (the
          PROFILE header's name/title) — this group never touches that
          axis. ── */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Section headings</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="Heading treatment" htmlFor="design-heading-style">
            <Select
              value={format.headings.style}
              disabled={readOnly}
              onValueChange={(next) =>
                set({ ...format, headings: { ...format.headings, style: next as HeadingStyle } })
              }
            >
              <SelectTrigger id="design-heading-style" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEADING_STYLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Heading capitalization" htmlFor="design-heading-capitalization">
            <Select
              value={format.headings.capitalization}
              disabled={readOnly}
              onValueChange={(next) =>
                set({
                  ...format,
                  headings: { ...format.headings, capitalization: next as HeadingCapitalization },
                })
              }
            >
              <SelectTrigger id="design-heading-capitalization" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEADING_CAPITALIZATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Heading icon" htmlFor="design-heading-icons">
            <Select
              value={format.headings.icons}
              disabled={readOnly}
              onValueChange={(next) =>
                set({
                  ...format,
                  headings: { ...format.headings, icons: next as HeadingIconStyle },
                })
              }
            >
              <SelectTrigger id="design-heading-icons" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEADING_ICON_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
        </div>
      </div>

      {/* ── dates — document.dateFormat (§31.2, E9-F2d). A group's own
          date (assemble()'s structured headingParts, sections.tsx's
          resolveGroupHeadingText) re-renders through this preset; a group
          with no structured date falls back to its raw heading string. ── */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Dates</p>
        <FieldRow label="Date format" htmlFor="design-date-format">
          <Select
            value={format.document.dateFormat}
            disabled={readOnly}
            onValueChange={(next) =>
              set({
                ...format,
                document: { ...format.document, dateFormat: next as DateFormatV2 },
              })
            }
          >
            <SelectTrigger id="design-date-format" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMAT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      </div>

      {/* ── entries — entries.* (§31.2, E9-F2e). The per-ENTRY internal
          header layout (title/subtitle/date/location + item list), distinct
          from the Layout group below (page-level columns/section
          placement) — see legacyAdapt.ts's EntriesRenderConfig comment. ── */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Entries</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="Entry structure" htmlFor="design-entries-structure">
            <EnumSelect
              id="design-entries-structure"
              value={format.entries.structure}
              options={ENTRY_STRUCTURE_OPTIONS}
              disabled={readOnly}
              onChange={(structure) =>
                set({ ...format, entries: { ...format.entries, structure } })
              }
            />
          </FieldRow>

          <FieldRow
            label="Date/location placement"
            htmlFor="design-entries-date-location-placement"
          >
            <EnumSelect
              id="design-entries-date-location-placement"
              value={format.entries.dateLocationPlacement}
              options={ENTRY_DATE_LOCATION_PLACEMENT_OPTIONS}
              disabled={readOnly}
              onChange={(dateLocationPlacement) =>
                set({ ...format, entries: { ...format.entries, dateLocationPlacement } })
              }
            />
          </FieldRow>

          <FieldRow label="Date/location order" htmlFor="design-entries-date-location-order">
            <EnumSelect
              id="design-entries-date-location-order"
              value={format.entries.dateLocationOrder}
              options={ENTRY_DATE_LOCATION_ORDER_OPTIONS}
              disabled={readOnly}
              onChange={(dateLocationOrder) =>
                set({ ...format, entries: { ...format.entries, dateLocationOrder } })
              }
            />
          </FieldRow>

          <FieldRow label="Subtitle placement" htmlFor="design-entries-subtitle-placement">
            <EnumSelect
              id="design-entries-subtitle-placement"
              value={format.entries.subtitlePlacement}
              options={ENTRY_SUBTITLE_PLACEMENT_OPTIONS}
              disabled={readOnly}
              onChange={(subtitlePlacement) =>
                set({ ...format, entries: { ...format.entries, subtitlePlacement } })
              }
            />
          </FieldRow>

          <FieldRow label="List style" htmlFor="design-entries-list-style">
            <EnumSelect
              id="design-entries-list-style"
              value={format.entries.listStyle}
              options={ENTRY_LIST_STYLE_OPTIONS}
              disabled={readOnly}
              onChange={(listStyle) =>
                set({ ...format, entries: { ...format.entries, listStyle } })
              }
            />
          </FieldRow>

          <FieldRow label="Subtitle font style" htmlFor="design-entries-subtitle-font-style">
            <EnumSelect
              id="design-entries-subtitle-font-style"
              value={format.entries.subtitleFontStyle}
              options={ENTRY_FONT_STYLE_OPTIONS}
              disabled={readOnly}
              onChange={(subtitleFontStyle) =>
                set({ ...format, entries: { ...format.entries, subtitleFontStyle } })
              }
            />
          </FieldRow>

          <FieldRow label="Date font style" htmlFor="design-entries-date-font-style">
            <EnumSelect
              id="design-entries-date-font-style"
              value={format.entries.dateFontStyle}
              options={ENTRY_FONT_STYLE_OPTIONS}
              disabled={readOnly}
              onChange={(dateFontStyle) =>
                set({ ...format, entries: { ...format.entries, dateFontStyle } })
              }
            />
          </FieldRow>

          <FieldRow label="Location font style" htmlFor="design-entries-location-font-style">
            <EnumSelect
              id="design-entries-location-font-style"
              value={format.entries.locationFontStyle}
              options={ENTRY_FONT_STYLE_OPTIONS}
              disabled={readOnly}
              onChange={(locationFontStyle) =>
                set({ ...format, entries: { ...format.entries, locationFontStyle } })
              }
            />
          </FieldRow>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="design-entries-body-indent"
            type="checkbox"
            checked={format.entries.bodyIndent}
            disabled={readOnly}
            onChange={(e) =>
              set({ ...format, entries: { ...format.entries, bodyIndent: e.target.checked } })
            }
            className="h-4 w-4 rounded border-border"
          />
          <Label htmlFor="design-entries-body-indent">Indent bullet body text</Label>
        </div>
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

      {/* ── layout — layout.columns/headerPosition/sidebarWidthPct/sectionPlacement
          (§31.2, engine already renders these axes per E9-F0c). sectionPlacement
          here is the per-document FORMAT axis, distinct from the global
          settings.layout section-order/visibility store edited by
          LayoutEditor.tsx — this group never touches that store. ── */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Layout</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="Columns" htmlFor="design-layout-columns">
            <Select
              value={format.layout.columns}
              disabled={readOnly}
              onValueChange={(next) =>
                set({ ...format, layout: { ...format.layout, columns: next as ColumnsMode } })
              }
            >
              <SelectTrigger id="design-layout-columns" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLUMNS_MODE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Header position" htmlFor="design-layout-header-position">
            <Select
              value={format.layout.headerPosition}
              disabled={readOnly}
              onValueChange={(next) =>
                set({
                  ...format,
                  layout: { ...format.layout, headerPosition: next as HeaderPosition },
                })
              }
            >
              <SelectTrigger id="design-layout-header-position" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEADER_POSITION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          {isColumnar ? (
            <FieldRow label="Sidebar width (%)" htmlFor="design-layout-sidebar-width">
              <NumberStepper
                id="design-layout-sidebar-width"
                value={format.layout.sidebarWidthPct}
                min={25}
                max={40}
                step={1}
                disabled={readOnly}
                onChange={(sidebarWidthPct) =>
                  set({ ...format, layout: { ...format.layout, sidebarWidthPct } })
                }
              />
            </FieldRow>
          ) : null}
        </div>

        {isColumnar ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Section placement</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {SECTION_VALUES.map((section) => (
                <FieldRow
                  key={section}
                  label={`${SECTIONS[section].label} column`}
                  htmlFor={`design-layout-section-${section}`}
                >
                  <Select
                    value={format.layout.sectionPlacement[section]?.column ?? "main"}
                    disabled={readOnly}
                    onValueChange={(next) =>
                      set({
                        ...format,
                        layout: {
                          ...format.layout,
                          sectionPlacement: {
                            ...format.layout.sectionPlacement,
                            [section]: { column: next as SectionColumn },
                          },
                        },
                      })
                    }
                  >
                    <SelectTrigger id={`design-layout-section-${section}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTION_COLUMN_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>
              ))}
            </div>
          </div>
        ) : null}

        {/* ── page breaks — layout.manualPageBreaks (§31.2/E9-F1c). The one
            F1 layout axis the engine renders as a real react-pdf page
            boundary rather than a style; applies in every column mode, so
            unlike sidebar width/section placement above it is never gated
            on isColumnar. ── */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Page breaks</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SECTION_VALUES.map((section) => {
              const id = `design-layout-page-break-${section}`;
              const checked = format.layout.manualPageBreaks.includes(section);
              return (
                <div key={section} className="flex items-center gap-2">
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    disabled={readOnly}
                    onChange={(e) =>
                      set({
                        ...format,
                        layout: {
                          ...format.layout,
                          manualPageBreaks: e.target.checked
                            ? [...format.layout.manualPageBreaks, section]
                            : format.layout.manualPageBreaks.filter((s) => s !== section),
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor={id}>{`Page break before ${SECTIONS[section].label}`}</Label>
                </div>
              );
            })}
          </div>
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
