// deriveContentBudget — spec.md §28.5. Pure, keyless: proves the budget
// heuristic actually responds to its inputs (anti-gaming — a derivation that
// returns "" or a constant string must fail this suite).
import { describe, it, expect } from "vitest";

import type { DocumentFormat } from "@shared/types";
import { DEFAULT_FORMAT } from "@shared/format";
import { deriveContentBudget } from "../src/server/tailor/budget";

function counts(budget: string): { bullets: number; words: number } {
  const match = budget.match(/roughly (\d+) bullets \(~(\d+) words\)/);
  if (!match) throw new Error(`budget string didn't match expected shape: ${budget}`);
  return { bullets: Number(match[1]), words: Number(match[2]) };
}

describe("deriveContentBudget — contrast (anti-gaming)", () => {
  it("is non-empty and names an approximate count", () => {
    const budget = deriveContentBudget({
      paper: "letter",
      targetPages: 1,
      format: DEFAULT_FORMAT,
    });
    expect(budget.length).toBeGreaterThan(0);
    expect(() => counts(budget)).not.toThrow();
  });

  it("targetPages=1 yields a strictly smaller budget than targetPages=2, same paper/format", () => {
    const one = deriveContentBudget({ paper: "letter", targetPages: 1, format: DEFAULT_FORMAT });
    const two = deriveContentBudget({ paper: "letter", targetPages: 2, format: DEFAULT_FORMAT });

    const oneCounts = counts(one);
    const twoCounts = counts(two);

    expect(oneCounts.bullets).toBeGreaterThan(0);
    expect(oneCounts.bullets).toBeLessThan(twoCounts.bullets);
    expect(oneCounts.words).toBeLessThan(twoCounts.words);
    expect(one).toContain("1 page");
    expect(two).toContain("2 pages");
  });

  it("a4 (larger usable area than letter, same margins) shifts the budget up, not down", () => {
    const letter = counts(
      deriveContentBudget({ paper: "letter", targetPages: 1, format: DEFAULT_FORMAT }),
    );
    const a4 = counts(deriveContentBudget({ paper: "a4", targetPages: 1, format: DEFAULT_FORMAT }));

    expect(a4.words).toBeGreaterThanOrEqual(letter.words);
  });

  it("tighter typography (smaller body size) fits more content, shifting the budget up", () => {
    const roomy = counts(
      deriveContentBudget({ paper: "letter", targetPages: 1, format: DEFAULT_FORMAT }),
    );

    const tighter: DocumentFormat = {
      ...DEFAULT_FORMAT,
      typography: {
        ...DEFAULT_FORMAT.typography,
        body: { ...DEFAULT_FORMAT.typography.body, size: 9 },
      },
    };
    const tight = counts(deriveContentBudget({ paper: "letter", targetPages: 1, format: tighter }));

    expect(tight.words).toBeGreaterThan(roomy.words);
  });

  it("does not return a constant/empty string across differing inputs", () => {
    const a = deriveContentBudget({ paper: "letter", targetPages: 1, format: DEFAULT_FORMAT });
    const b = deriveContentBudget({ paper: "letter", targetPages: 2, format: DEFAULT_FORMAT });
    expect(a).not.toBe("");
    expect(a).not.toBe(b);
  });
});
