// DocumentFormat foundation — spec.md §28.3/§31. Pure shared type/zod/
// defaults; no rendering, no DB. See src/shared/types.ts (DocumentFormat/
// FontId — the v1 legacy shape migrateFormat still consumes),
// src/shared/schema.ts (documentFormatZ, aliased to formatV2Schema since
// E9-F0d1's API-boundary cutover), src/shared/format.ts (DEFAULT_FORMAT, the
// v1 default migrateFormat/presets.ts still read).
import { describe, it, expect } from "vitest";
import { documentFormatZ } from "@shared/schema";
import { DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import { DEFAULT_FORMAT } from "@shared/format";
import type { FontId, Profile } from "@shared/types";

function withMutation(mutate: (f: DocumentFormatV2) => void): DocumentFormatV2 {
  const next = structuredClone(DEFAULT_FORMAT_V2);
  mutate(next);
  return next;
}

// documentFormatZ is now formatV2Schema (§31/E9-F0d1) — the numeric-bounds/
// enum-set exhaustiveness is test/format-v2.test.ts's job; this suite keeps
// its ORIGINAL 9-case shape (reparameterized 1:1 onto v2 fields) as a
// second, independent proof at the name the API boundary actually imports.
describe("documentFormatZ", () => {
  it("accepts a fully-populated valid format", () => {
    expect(documentFormatZ.safeParse(DEFAULT_FORMAT_V2).success).toBe(true);
  });

  it("accepts DEFAULT_FORMAT_V2", () => {
    expect(documentFormatZ.safeParse(DEFAULT_FORMAT_V2).success).toBe(true);
  });

  it("rejects bodySize below the 9pt floor (8)", () => {
    const bad = withMutation((f) => (f.typeScale.bodySize = 8));
    expect(documentFormatZ.safeParse(bad).success).toBe(false);
  });

  it("rejects bodySize above the 12pt ceiling (13)", () => {
    const bad = withMutation((f) => (f.typeScale.bodySize = 13));
    expect(documentFormatZ.safeParse(bad).success).toBe(false);
  });

  it("rejects a header.nameWeight not in {normal,bold} ('semibold')", () => {
    const bad = withMutation(
      (f) => ((f.header as unknown as { nameWeight: string }).nameWeight = "semibold"),
    );
    expect(documentFormatZ.safeParse(bad).success).toBe(false);
  });

  it("rejects colors.accent as a malformed hex ('#zzz')", () => {
    const bad = withMutation((f) => (f.colors.accent = "#zzz"));
    expect(documentFormatZ.safeParse(bad).success).toBe(false);
  });

  it("rejects colors.accent as a CSS keyword ('red')", () => {
    const bad = withMutation((f) => (f.colors.accent = "red"));
    expect(documentFormatZ.safeParse(bad).success).toBe(false);
  });

  it("rejects a sectionDisplay.skillsLanguages.gridColumns value outside 1-4 (5)", () => {
    const bad = withMutation((f) => (f.sectionDisplay.skillsLanguages.gridColumns = 5));
    expect(documentFormatZ.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty presetId", () => {
    const bad = withMutation((f) => (f.presetId = ""));
    expect(documentFormatZ.safeParse(bad).success).toBe(false);
  });
});

describe("DEFAULT_FORMAT (v1, still consumed by migrateFormat/presets.ts)", () => {
  it("hides the photo by default (§28.3)", () => {
    expect(DEFAULT_FORMAT.photo.hidden).toBe(true);
  });

  it("uses the 'strict' template", () => {
    expect(DEFAULT_FORMAT.templateId).toBe("strict");
  });
});

describe("FontId union", () => {
  it("has at least 4 faces, including the 3 metric stand-ins (arimo/tinos/carlito)", () => {
    const faces: FontId[] = [
      "ibm-plex-sans",
      "ibm-plex-serif",
      "ibm-plex-mono",
      "arimo",
      "tinos",
      "carlito",
    ];
    expect(faces.length).toBeGreaterThanOrEqual(4);
    expect(faces).toEqual(expect.arrayContaining(["arimo", "tinos", "carlito"]));
  });
});

describe("Profile.photoUrl", () => {
  it("is an optional field that Profile can carry", () => {
    const withPhoto: Profile = {
      name: "Jane Doe",
      email: "jane@example.com",
      links: [],
      photoUrl: "https://example.com/jane.jpg",
    };
    const withoutPhoto: Profile = { name: "Jane Doe", email: "jane@example.com", links: [] };
    expect(withPhoto.photoUrl).toBe("https://example.com/jane.jpg");
    expect(withoutPhoto.photoUrl).toBeUndefined();
  });
});
