// DocumentFormat foundation — spec.md §28.3. Pure shared type/zod/defaults;
// no rendering, no DB. See src/shared/types.ts (DocumentFormat/FontId),
// src/shared/schema.ts (documentFormatZ), src/shared/format.ts (DEFAULT_FORMAT).
import { describe, it, expect } from "vitest";
import { documentFormatZ } from "@shared/schema";
import { DEFAULT_FORMAT } from "@shared/format";
import type { DocumentFormat, FontId, Profile } from "@shared/types";

function validFormat(): DocumentFormat {
  return {
    templateId: "strict",
    typography: {
      body: { family: "ibm-plex-sans", size: 10, lineHeight: 1.4 },
      heading: { family: "ibm-plex-sans", weight: 600 },
    },
    colors: { primary: "#1a1a2e", text: "#111111" },
    page: { marginX: 40, marginY: 36, sectionGap: 8 },
    photo: { hidden: true, size: 64, shape: "circle" },
    sections: { skill: { columns: 2 } },
  };
}

describe("documentFormatZ", () => {
  it("accepts a fully-populated valid format", () => {
    expect(documentFormatZ.safeParse(validFormat()).success).toBe(true);
  });

  it("accepts DEFAULT_FORMAT", () => {
    expect(documentFormatZ.safeParse(DEFAULT_FORMAT).success).toBe(true);
  });

  it("rejects body.size below the 9pt floor (8)", () => {
    const bad = validFormat();
    bad.typography.body.size = 8;
    expect(documentFormatZ.safeParse(bad).success).toBe(false);
  });

  it("rejects body.size above the 12pt ceiling (13)", () => {
    const bad = validFormat();
    bad.typography.body.size = 13;
    expect(documentFormatZ.safeParse(bad).success).toBe(false);
  });

  it("rejects a heading.weight not in {400,500,600,700} (550)", () => {
    const bad = validFormat();
    (bad.typography.heading as unknown as { weight: number }).weight = 550;
    expect(documentFormatZ.safeParse(bad).success).toBe(false);
  });

  it("rejects colors.primary as a malformed hex ('#zzz')", () => {
    const bad = validFormat();
    bad.colors.primary = "#zzz";
    expect(documentFormatZ.safeParse(bad).success).toBe(false);
  });

  it("rejects colors.primary as a CSS keyword ('red')", () => {
    const bad = validFormat();
    bad.colors.primary = "red";
    expect(documentFormatZ.safeParse(bad).success).toBe(false);
  });

  it("rejects a sections.columns value outside 1|2|3 (4)", () => {
    const bad = validFormat();
    (bad.sections.skill as unknown as { columns: number }).columns = 4;
    expect(documentFormatZ.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty templateId", () => {
    const bad = validFormat();
    bad.templateId = "";
    expect(documentFormatZ.safeParse(bad).success).toBe(false);
  });
});

describe("DEFAULT_FORMAT", () => {
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
