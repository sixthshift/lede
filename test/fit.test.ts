// E7-C1a acceptance: the fit ladder ENGINE (spec.md §28.4). Density is
// AUTO-ONLY, computed per-render, and never persisted — fitToPages is a
// pure function of (resume, profile, format, paper, targetPages) that
// returns the density it picked, nothing more. The renderer never cuts:
// the same item set survives at every density, only type size/line-height/
// page gaps scale.
import { describe, expect, it } from "vitest";
import type { Profile, TailoredResume } from "@shared/types";
import { DEFAULT_FORMAT } from "@shared/format";
import { applyDensity, fitToPages } from "../src/client/document/fit";
import { extractPdfText } from "../src/client/document/extractText";
import { getTemplate } from "../src/client/document/registry";
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

    const small = await fitToPages({
      resume: resumeFixture(20),
      profile,
      format: DEFAULT_FORMAT,
      paper: "letter",
      targetPages: 1,
    });
    expect(small.density).toBe("comfortable");
    expect(small.fits).toBe(true);
    expect(small.pageCount).toBe(1);

    const medium = await fitToPages({
      resume: resumeFixture(22),
      profile,
      format: DEFAULT_FORMAT,
      paper: "letter",
      targetPages: 1,
    });
    expect(medium.density).toBe("standard");
    expect(medium.fits).toBe(true);
    expect(medium.pageCount).toBe(1);

    const large = await fitToPages({
      resume: resumeFixture(24),
      profile,
      format: DEFAULT_FORMAT,
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
      format: DEFAULT_FORMAT,
      paper: "letter",
      targetPages: 1,
    });
    expect(result.density).toBe("compact");
    expect(result.fits).toBe(false);
    expect(result.pageCount).toBeGreaterThan(1);
  });

  it("density is NOT persisted: fitToPages returns the density but writes to no store/format", async () => {
    const format = DEFAULT_FORMAT;
    const frozen = JSON.stringify(format);
    await fitToPages({
      resume: resumeFixture(22),
      profile: profileFixture(),
      format,
      paper: "letter",
      targetPages: 1,
    });
    expect(JSON.stringify(format)).toBe(frozen); // input format untouched
    expect(format).toBe(DEFAULT_FORMAT); // same reference, no reassignment side effect
  });

  it("ITEM-COUNT INVARIANT (§28.4, never-cut): every selected item.text is present in the extraction at comfortable, standard, AND compact", async () => {
    const resume = resumeFixture(24);
    const profile = profileFixture();
    const { densityMultipliers } = getTemplate(DEFAULT_FORMAT.templateId);
    const expectedItems = resume.sections[0].groups[0].items.map((item) => item.text);

    for (const density of ["comfortable", "standard", "compact"] as const) {
      const densedFormat = applyDensity(DEFAULT_FORMAT, density, densityMultipliers);
      const buffer = await renderResumeToBuffer({ resume, profile, format: densedFormat });
      const extracted = (await extractPdfText(buffer)).join(" ");
      for (const text of expectedItems) {
        expect(extracted).toContain(text);
      }
    }
  });
});

describe("applyDensity (§28.4)", () => {
  it("comfortable is exactly as authored (multiplier 1)", () => {
    const result = applyDensity(DEFAULT_FORMAT, "comfortable", {
      comfortable: 1,
      standard: 0.94,
      compact: 0.88,
    });
    expect(result.typography.body.size).toBe(DEFAULT_FORMAT.typography.body.size);
    expect(result.typography.body.lineHeight).toBe(DEFAULT_FORMAT.typography.body.lineHeight);
    expect(result.page.marginY).toBe(DEFAULT_FORMAT.page.marginY);
    expect(result.page.sectionGap).toBe(DEFAULT_FORMAT.page.sectionGap);
  });

  it("scales body.size, lineHeight, sectionGap, and marginY down at standard/compact", () => {
    const multipliers = { comfortable: 1, standard: 0.94, compact: 0.7 };
    const result = applyDensity(DEFAULT_FORMAT, "compact", multipliers);
    expect(result.typography.body.lineHeight).toBeCloseTo(
      DEFAULT_FORMAT.typography.body.lineHeight * 0.7,
    );
    expect(result.page.sectionGap).toBeCloseTo(DEFAULT_FORMAT.page.sectionGap * 0.7);
    expect(result.page.marginY).toBeCloseTo(DEFAULT_FORMAT.page.marginY * 0.7);
  });

  it("9.5pt FLOOR: body.size never drops below 9.5pt, even at compact with an aggressive multiplier", () => {
    const aggressive = { comfortable: 1, standard: 0.94, compact: 0.3 };
    const result = applyDensity(DEFAULT_FORMAT, "compact", aggressive);
    expect(result.typography.body.size).toBe(9.5);
  });

  it("does not mutate the input format", () => {
    const format = DEFAULT_FORMAT;
    const frozen = JSON.stringify(format);
    applyDensity(format, "compact", { comfortable: 1, standard: 0.94, compact: 0.3 });
    expect(JSON.stringify(format)).toBe(frozen);
  });
});
