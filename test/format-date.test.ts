// E9-F2d acceptance: formatDate covers every DATE_FORMATS preset (§31.2) and
// produces 12 mutually distinct strings for one fixed date. parseHeadingDate
// covers the render seam's timezone-unsafe ISO case explicitly.
import { describe, expect, it } from "vitest";
import { DATE_FORMATS } from "@shared/format-v2";
import { formatDate, parseHeadingDate } from "../src/client/document/formatDate";

// March 5th, 2024 — a single-digit day (exercises padding AND ordinal "5th"
// in the same fixture) and a month whose short/long forms both differ from
// every other token in the expected strings below.
const FIXED_DATE = new Date(2024, 2, 5);

describe("formatDate (§31.2 DATE_FORMATS)", () => {
  const expected: Record<string, string> = {
    "MM/DD/YYYY": "03/05/2024",
    "MMM DD, YYYY": "Mar 05, 2024",
    "MMMM Do, YYYY": "March 5th, 2024",
    "DD/MM/YYYY": "05/03/2024",
    "DD.MM.YYYY": "05.03.2024",
    "DD MMM YYYY": "05 Mar 2024",
    "Do MMMM YYYY": "5th March 2024",
    "YYYY-MM-DD": "2024-03-05",
    "YYYY.MM.DD": "2024.03.05",
    "YYYY/MM/DD": "2024/03/05",
    "YYYY MMM DD": "2024 Mar 05",
    "YYYY MMMM DD": "2024 March 05",
  };

  it("covers all 12 presets with the exact expected string", () => {
    expect(DATE_FORMATS).toHaveLength(12);
    for (const preset of DATE_FORMATS) {
      expect(formatDate(FIXED_DATE, preset)).toBe(expected[preset]);
    }
  });

  it("produces 12 mutually distinct strings for one fixed date", () => {
    const outputs = DATE_FORMATS.map((preset) => formatDate(FIXED_DATE, preset));
    expect(new Set(outputs).size).toBe(12);
  });

  it("ordinal day handles the 11th-13th exception (not 11st/12nd/13rd)", () => {
    expect(formatDate(new Date(2024, 0, 1), "Do MMMM YYYY")).toBe("1st January 2024");
    expect(formatDate(new Date(2024, 0, 2), "Do MMMM YYYY")).toBe("2nd January 2024");
    expect(formatDate(new Date(2024, 0, 3), "Do MMMM YYYY")).toBe("3rd January 2024");
    expect(formatDate(new Date(2024, 0, 11), "Do MMMM YYYY")).toBe("11th January 2024");
    expect(formatDate(new Date(2024, 0, 12), "Do MMMM YYYY")).toBe("12th January 2024");
    expect(formatDate(new Date(2024, 0, 13), "Do MMMM YYYY")).toBe("13th January 2024");
    expect(formatDate(new Date(2024, 0, 21), "Do MMMM YYYY")).toBe("21st January 2024");
  });
});

describe("parseHeadingDate (render-seam parsing of freeform meta.period/date)", () => {
  it("parses a bare ISO date in local time (no UTC day-shift)", () => {
    const parsed = parseHeadingDate("2024-03-05");
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getFullYear()).toBe(2024);
    expect(parsed?.getMonth()).toBe(2);
    expect(parsed?.getDate()).toBe(5);
  });

  it("parses a natural-language date", () => {
    const parsed = parseHeadingDate("June 15, 2020");
    expect(parsed?.getFullYear()).toBe(2020);
    expect(parsed?.getMonth()).toBe(5);
    expect(parsed?.getDate()).toBe(15);
  });

  it("returns undefined for unparseable freeform ranges (e.g. '2020-2023')", () => {
    expect(parseHeadingDate("2020-2023")).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(parseHeadingDate(undefined)).toBeUndefined();
  });
});
