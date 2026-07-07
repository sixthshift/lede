// E7-C1a -> E9-F0d1: the fit ladder ENGINE (spec.md §28.4). Density is
// AUTO-ONLY, computed per-render, and never persisted — fitToPages is a
// pure function of (resume, profile, format, paper, targetPages) that
// returns the density it picked, nothing more. The renderer never cuts:
// the same item set survives at every density, only type size/line-height/
// page gaps scale.
//
// §31/E9-F0d1: reparameterized onto DocumentFormatV2 + the ONE engine
// (fit.ts is now a thin re-export of engine/render.ts's fitEngineToPages —
// there is no more per-preset density ladder, just one shared ladder,
// engine/density.ts). v1's public `applyDensity(format, density,
// multipliers) -> scaled copy` is retired with it: the engine takes density
// as a sibling render prop and applies the ladder internally — see
// engine-single-column.test.ts's/engine-two-column.test.ts's own
// "density is REAL, not vacuous" cases for that proof, and this file's
// "applyEngineDensity" describe below for the internal scaling unit itself.
import { describe, expect, it } from "vitest";
import type { Profile, TailoredResume } from "@shared/types";
import { DEFAULT_FORMAT_V2 } from "@shared/format-v2";
import { DEFAULT_FORMAT } from "@shared/format";
import { fitToPages } from "../src/client/document/fit";
import { applyEngineDensity } from "../src/client/document/engine";
import { extractPdfText } from "../src/client/document/extractText";
import { PRESET_IDS, PRESETS } from "../src/client/document/presets";
import { renderResumeToBuffer } from "../src/client/document/renderResume";

function profileFixture(): Profile {
  return {
    name: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Remote",
    links: [{ type: "github", label: "github.com/jordan", url: "https://github.com/jordan" }],
  };
}

// Same shape at every item count — only the number of experience bullets
// grows, so the fixtures differ in size, not in structure.
function resumeFixture(itemCount: number): TailoredResume {
  const filler =
    "Shipped and scaled backend systems handling millions of requests per day reliably.";
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "A track record of shipping backend systems at scale across multiple companies.",
    sections: [
      {
        section: "experience",
        groups: [
          {
            heading: "Acme · Engineer · 2020-2023",
            items: Array.from({ length: itemCount }, (_, i) => ({
              entryId: `e${i}`,
              text: `ITEM_${i} ${filler}`,
            })),
          },
        ],
      },
    ],
    cut: [],
  };
}

describe("fitToPages (§28.4 fit ladder engine)", () => {
  it("LADDER WALK: escalates comfortable -> standard -> compact as the fixture grows, at LETTER/targetPages=1", async () => {
    const profile = profileFixture();

    // §31/E9-F0d1: DEFAULT_FORMAT_V2's margins/line-height are migrateFormat's
    // mm-rounded v2 equivalents of v1's DEFAULT_FORMAT (not byte-identical
    // pt values) — the exact item counts that trip each density threshold
    // shifted slightly from v1's ladder walk; re-measured directly against
    // the engine (comfortable through 22, standard at 23, compact by 24).
    const small = await fitToPages({
      resume: resumeFixture(20),
      profile,
      format: DEFAULT_FORMAT_V2,
      paper: "letter",
      targetPages: 1,
    });
    expect(small.density).toBe("comfortable");
    expect(small.fits).toBe(true);
    expect(small.pageCount).toBe(1);

    const medium = await fitToPages({
      resume: resumeFixture(23),
      profile,
      format: DEFAULT_FORMAT_V2,
      paper: "letter",
      targetPages: 1,
    });
    expect(medium.density).toBe("standard");
    expect(medium.fits).toBe(true);
    expect(medium.pageCount).toBe(1);

    const large = await fitToPages({
      resume: resumeFixture(25),
      profile,
      format: DEFAULT_FORMAT_V2,
      paper: "letter",
      targetPages: 1,
    });
    expect(large.density).toBe("compact");
    expect(large.fits).toBe(true);
    expect(large.pageCount).toBe(1);
  });

  it("OVERFLOW: a fixture too large even for compact returns fits:false with the true page count, never cutting items", async () => {
    const result = await fitToPages({
      resume: resumeFixture(40),
      profile: profileFixture(),
      format: DEFAULT_FORMAT_V2,
      paper: "letter",
      targetPages: 1,
    });
    expect(result.density).toBe("compact");
    expect(result.fits).toBe(false);
    expect(result.pageCount).toBeGreaterThan(1);
  });

  it("density is NOT persisted: fitToPages returns the density but writes to no store/format", async () => {
    const format = DEFAULT_FORMAT_V2;
    const frozen = JSON.stringify(format);
    await fitToPages({
      resume: resumeFixture(22),
      profile: profileFixture(),
      format,
      paper: "letter",
      targetPages: 1,
    });
    expect(JSON.stringify(format)).toBe(frozen); // input format untouched
    expect(format).toBe(DEFAULT_FORMAT_V2); // same reference, no reassignment side effect
  });

  it("ITEM-COUNT INVARIANT (§28.4, never-cut): every selected item.text is present in the extraction at comfortable, standard, AND compact", async () => {
    const resume = resumeFixture(24);
    const profile = profileFixture();
    const expectedItems = resume.sections[0].groups[0].items.map((item) => item.text);

    for (const density of ["comfortable", "standard", "compact"] as const) {
      const buffer = await renderResumeToBuffer({
        resume,
        profile,
        format: DEFAULT_FORMAT_V2,
        density,
      });
      const extracted = (await extractPdfText(buffer)).join(" ");
      for (const text of expectedItems) {
        expect(extracted).toContain(text);
      }
    }
  });
});

// Same never-cut guard as above, generalized over every registered preset
// (not just DEFAULT_FORMAT_V2's) — a preset swap must never change which
// items survive at a given density.
describe.each(PRESET_IDS)("ITEM-COUNT INVARIANT (§28.4, never-cut) — %s", (presetId) => {
  it("every selected item.text is present in the extraction at every density in the shared ladder", async () => {
    const resume = resumeFixture(24);
    const profile = profileFixture();
    const expectedItems = resume.sections[0].groups[0].items.map((item) => item.text);

    for (const density of ["comfortable", "standard", "compact"] as const) {
      const buffer = await renderResumeToBuffer({
        resume,
        profile,
        format: PRESETS[presetId],
        density,
      });
      const extracted = (await extractPdfText(buffer)).join(" ");
      for (const text of expectedItems) {
        expect(extracted).toContain(text);
      }
    }
  });
});

// The engine's internal density-scaling unit (applyEngineDensity, over the
// LEGACY-adapted shape EngineDocument feeds it) — v1's equivalent public
// `applyDensity(format, density, multipliers)` is retired (see module
// comment); this is the same scaling logic's only surviving unit, now
// parameterless (one shared multiplier table, engine/density.ts).
describe("applyEngineDensity (§28.4)", () => {
  it("comfortable is exactly as authored (multiplier 1)", () => {
    const result = applyEngineDensity(DEFAULT_FORMAT, "comfortable");
    expect(result.typography.body.size).toBe(DEFAULT_FORMAT.typography.body.size);
    expect(result.typography.body.lineHeight).toBe(DEFAULT_FORMAT.typography.body.lineHeight);
    expect(result.page.marginY).toBe(DEFAULT_FORMAT.page.marginY);
    expect(result.page.sectionGap).toBe(DEFAULT_FORMAT.page.sectionGap);
  });

  it("scales body.size, lineHeight, sectionGap, and marginY down at standard/compact", () => {
    const result = applyEngineDensity(DEFAULT_FORMAT, "compact");
    expect(result.typography.body.lineHeight).toBeCloseTo(
      DEFAULT_FORMAT.typography.body.lineHeight * 0.88,
    );
    expect(result.page.sectionGap).toBeCloseTo(DEFAULT_FORMAT.page.sectionGap * 0.88);
    expect(result.page.marginY).toBeCloseTo(DEFAULT_FORMAT.page.marginY * 0.88);
  });

  it("9.5pt FLOOR: body.size never drops below 9.5pt, even at compact", () => {
    const tiny = {
      ...DEFAULT_FORMAT,
      typography: {
        ...DEFAULT_FORMAT.typography,
        body: { ...DEFAULT_FORMAT.typography.body, size: 9.6 },
      },
    };
    const result = applyEngineDensity(tiny, "compact");
    expect(result.typography.body.size).toBe(9.5);
  });

  it("does not mutate the input format", () => {
    const format = DEFAULT_FORMAT;
    const frozen = JSON.stringify(format);
    applyEngineDensity(format, "compact");
    expect(JSON.stringify(format)).toBe(frozen);
  });
});
