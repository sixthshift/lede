// Progressive filter controls for the library (E6-C1, spec.md §26). A
// small/empty library is easy to scan by eye — search/tag controls would
// just be clutter — so only the section filter (the existing baseline
// grouping) renders below the threshold. Tag + free-text controls earn
// their space once the corpus is big enough that scanning stops working.
//
// Tags are grouping/filtering metadata ONLY (spec §1). Filtering entries by
// an exact tag match is the sanctioned use of tags here. Never
// intersect/sort/score entry.tags against a JD or its signals — that
// happens nowhere in this file.

import { useMemo } from "react";
import type { Entry, Section } from "@shared/types";
import { SECTIONS, SECTION_VALUES } from "@shared/sections";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

// Below this many entries, section grouping alone is enough to find things.
// Picked as a small, sensible threshold — big enough that a handful of
// entries doesn't get a search bar nobody needs, small enough that a
// growing library isn't stuck without one for long.
const SEARCH_THRESHOLD = 8;

export type LibraryFilterState = {
  section: Section | "all";
  tag: string | "all";
  query: string;
};

export const DEFAULT_LIBRARY_FILTER: LibraryFilterState = {
  section: "all",
  tag: "all",
  query: "",
};

// Free-text search covers facts (the fact-locked content, §1) and meta
// (provenance fields like company/school/name) — never tags, which are
// filtered separately via the tag select above.
function searchableText(entry: Entry): string {
  const metaValues = Object.values(entry.meta).filter((v): v is string => typeof v === "string");
  return [...entry.facts, ...metaValues].join(" ").toLowerCase();
}

export function filterEntries(entries: Entry[], filter: LibraryFilterState): Entry[] {
  const query = filter.query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter.section !== "all" && entry.section !== filter.section) return false;
    if (filter.tag !== "all" && !entry.tags.includes(filter.tag)) return false;
    if (query && !searchableText(entry).includes(query)) return false;
    return true;
  });
}

export function LibraryFilter({
  entries,
  filter,
  onFilterChange,
  resultCount,
}: {
  entries: Entry[];
  filter: LibraryFilterState;
  onFilterChange: (filter: LibraryFilterState) => void;
  resultCount: number;
}) {
  const sections = useMemo(
    () => SECTION_VALUES.filter((section) => entries.some((entry) => entry.section === section)),
    [entries],
  );
  const tags = useMemo(
    () => Array.from(new Set(entries.flatMap((entry) => entry.tags))).sort(),
    [entries],
  );

  const showSearchControls = entries.length >= SEARCH_THRESHOLD;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filter.section}
        onValueChange={(value) => onFilterChange({ ...filter, section: value as Section | "all" })}
      >
        <SelectTrigger aria-label="Filter by section" className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sections</SelectItem>
          {sections.map((section) => (
            <SelectItem key={section} value={section}>
              {SECTIONS[section].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showSearchControls ? (
        <>
          <Select
            value={filter.tag}
            onValueChange={(value) => onFilterChange({ ...filter, tag: value })}
          >
            <SelectTrigger aria-label="Filter by tag" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {tags.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="search"
            aria-label="Search library"
            placeholder="Search facts…"
            value={filter.query}
            onChange={(e) => onFilterChange({ ...filter, query: e.target.value })}
            className="w-56"
          />
        </>
      ) : null}

      <span className="text-sm tabular-nums text-muted-foreground">
        {resultCount} of {entries.length}
      </span>
    </div>
  );
}
