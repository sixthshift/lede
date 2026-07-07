// Pure date formatting for the 12 curated presets (§31.2 DATE_FORMATS,
// src/shared/format-v2.ts). No date library, no locale negotiation — the
// preset list is a fixed, bounded enum (never a free-form format string,
// §31.1), so a fixed English month/ordinal table is the whole problem.
import type { DateFormatV2 } from "@shared/format-v2";

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 1st/2nd/3rd/4th…, with the 11th-13th exception every ordinal table needs.
function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

export function formatDate(value: Date, preset: DateFormatV2): string {
  const year = String(value.getFullYear());
  const month = value.getMonth() + 1;
  const day = value.getDate();
  const mm = pad2(month);
  const dd = pad2(day);
  const monthShort = MONTHS_SHORT[value.getMonth()];
  const monthLong = MONTHS_LONG[value.getMonth()];

  switch (preset) {
    case "MM/DD/YYYY":
      return `${mm}/${dd}/${year}`;
    case "MMM DD, YYYY":
      return `${monthShort} ${dd}, ${year}`;
    case "MMMM Do, YYYY":
      return `${monthLong} ${ordinal(day)}, ${year}`;
    case "DD/MM/YYYY":
      return `${dd}/${mm}/${year}`;
    case "DD.MM.YYYY":
      return `${dd}.${mm}.${year}`;
    case "DD MMM YYYY":
      return `${dd} ${monthShort} ${year}`;
    case "Do MMMM YYYY":
      return `${ordinal(day)} ${monthLong} ${year}`;
    case "YYYY-MM-DD":
      return `${year}-${mm}-${dd}`;
    case "YYYY.MM.DD":
      return `${year}.${mm}.${dd}`;
    case "YYYY/MM/DD":
      return `${year}/${mm}/${dd}`;
    case "YYYY MMM DD":
      return `${year} ${monthShort} ${dd}`;
    case "YYYY MMMM DD":
      return `${year} ${monthLong} ${dd}`;
  }
}

// The render seam's date INPUT is TailoredGroup.headingParts.date — the
// entry's own freeform period/date string (§4.1's meta.period/date, never
// re-shaped for this ticket), not a Date. A plain `new Date(raw)` is
// timezone-unsafe for bare "YYYY-MM-DD" strings (parsed as UTC midnight,
// which can shift a day in a negative-UTC-offset runtime) — so that one
// shape is parsed in local time explicitly; every other shape (e.g. "June
// 15, 2020") already parses in local time via the native constructor.
// Freeform ranges ("2020-2023", "Jan 2020 - Present") aren't parseable by
// design — undefined signals the caller to fall back to the raw string.
export function parseHeadingDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
