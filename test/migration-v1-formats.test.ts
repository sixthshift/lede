// Fixture-driven v1 -> v2 migration tests, ticket E9-F0d2 (spec.md §31.1/§31.6
// F0's "migration is deterministic and content-preserving" clause). Consumes
// test/fixtures/pre-e9-formats/ VERBATIM — read-only, zero diff under that
// directory (this file only reads it; nothing here mutates the fixtures).
// The integration half (raw v1 JSON inserted into a real sqlite DB, read back
// through the API) lives in test/api.migration-boundary.test.ts; this file is
// the pure migrateFormat/resolveStoredFormat half.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { migrateFormat, resolveStoredFormat, formatV2Schema } from "@shared/format-v2";
import type { DocumentFormat } from "@shared/types";
import { LEGACY_PRESET_IDS, PRESETS } from "../src/client/document/presets";

const FIXTURES_DIR = path.join(process.cwd(), "test/fixtures/pre-e9-formats");

function readFixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, name), "utf8")) as T;
}

// The six LEGACY template-default fixtures (strict/classic/compact/banner/
// sidebar-left/sidebar-right .json) are each `{...DEFAULT_FORMAT,
// templateId}` — exactly what src/client/document/presets.ts's PRESETS[id]
// is built from (migrateFormat(v1DefaultFor(id)) + presetId). Comparing
// against the real PRESETS export (read-only import — presets.ts is client
// code, untouched by this ticket) proves the fixtures migrate to the SHIPPED
// preset shape, not just to some hand-rolled expectation that could drift
// from it. Scoped to the six legacy ids (E9-F5c): the new-axis presets are
// v2-native, with no v1 fixture to migrate from.
describe("template-default fixtures migrate to their preset, modulo presetId", () => {
  for (const id of LEGACY_PRESET_IDS) {
    it(`${id}.json migrates to a config deep-equal to PRESETS['${id}'] once presetId is added`, () => {
      const raw = readFixture<DocumentFormat>(`${id}.json`);
      const migrated = migrateFormat(raw);
      expect(migrated.presetId).toBeUndefined(); // provenance-only field; a raw v1 value never carries it
      expect({ ...migrated, presetId: id }).toEqual(PRESETS[id]);
    });
  }
});

describe("non-empty-sections.json — [v3-044] section-columns repair", () => {
  it("sections.skill.columns:2 migrates to sectionDisplay.skillsLanguages {layout:'grid', gridColumns:2}", () => {
    const raw = readFixture<DocumentFormat>("non-empty-sections.json");
    const migrated = migrateFormat(raw);
    expect(migrated.sectionDisplay.skillsLanguages).toEqual({
      layout: "grid",
      gridColumns: 2,
      levelDisplay: "text",
      levelLabels: ["Beginner", "Elementary", "Intermediate", "Advanced", "Expert"],
    });
    // untouched sibling axis — the repair is scoped to skillsLanguages only.
    expect(migrated.sectionDisplay.interests).toEqual({ layout: "rows", gridColumns: 1 });
  });
});

describe("non-default-photo.json — photo axes preserved across migration", () => {
  it("hidden:false, shape:'square', size:96 all survive migrateFormat unchanged", () => {
    const raw = readFixture<DocumentFormat>("non-default-photo.json");
    expect(raw.photo).toEqual({ hidden: false, size: 96, shape: "square" });

    const migrated = migrateFormat(raw);
    expect(migrated.photo).toEqual({
      hidden: false,
      shape: "square",
      size: 96,
      crop: { x: 50, y: 50 }, // new v2 axis, no v1 analog -> deterministic baseline
      zoom: 1,
    });
  });
});

describe("locked-format.json — the LockedFormat wrapper's nested .format", () => {
  it("migrates identically to the bare strict.json fixture (same v1 config, just wrapped)", () => {
    const wrapper = readFixture<{
      format: DocumentFormat;
      resolvedDensity: string;
      paper: string;
    }>("locked-format.json");
    expect(wrapper.resolvedDensity).toBe("comfortable");
    expect(wrapper.paper).toBe("letter");

    const bareStrict = readFixture<DocumentFormat>("strict.json");
    const migratedFromWrapper = migrateFormat(wrapper.format);
    expect(migratedFromWrapper).toEqual(migrateFormat(bareStrict));
    expect(formatV2Schema.safeParse(migratedFromWrapper).success).toBe(true);
  });
});

describe("settings-default-format.json — an instance-level default distinct from DEFAULT_FORMAT", () => {
  it("migrates to a schema-valid v2 config with its distinguishing axes carried over", () => {
    const raw = readFixture<DocumentFormat>("settings-default-format.json");
    const migrated = migrateFormat(raw);
    expect(formatV2Schema.safeParse(migrated).success).toBe(true);
    expect(migrated.fonts.body).toBe("ibm-plex-serif"); // typography.body.family
    expect(migrated.typeScale.bodySize).toBe(11); // typography.body.size
    expect(migrated.spacing.lineHeight).toBe(1.3); // typography.body.lineHeight
    expect(migrated.colors.accent).toBe("#2e3a1a"); // colors.primary
    expect(migrated.colors.text).toBe("#1a1a1a"); // colors.text
    expect(migrated.header.alignment).toBe("center"); // templateId 'classic' overlay
  });
});

describe("idempotence over every fixture (§31.1: a v2 value passes through untouched)", () => {
  // Legacy-only (E9-F5c): a v1 fixture only exists for the six original
  // templates — the new-axis presets have no v1 predecessor to fixture.
  const allTemplateFixtures = LEGACY_PRESET_IDS.map((id) => `${id}.json`);
  const allFixtures = [
    ...allTemplateFixtures,
    "non-empty-sections.json",
    "non-default-photo.json",
    "settings-default-format.json",
  ];

  for (const file of allFixtures) {
    it(`migrating ${file} twice is identical to migrating it once`, () => {
      const raw = readFixture<DocumentFormat>(file);
      const once = migrateFormat(raw);
      const twice = migrateFormat(once as unknown as DocumentFormat);
      expect(twice).toEqual(once);
      expect(twice).toBe(once); // isFormatV2 short-circuit returns the same reference

      const viaResolve = resolveStoredFormat(once);
      expect(viaResolve).toBe(once);
    });
  }

  it("resolveStoredFormat migrates a raw v1 fixture exactly like migrateFormat", () => {
    const raw = readFixture<DocumentFormat>("strict.json");
    expect(resolveStoredFormat(raw)).toEqual(migrateFormat(raw));
  });
});
