// The artifact-side coverage readout (SPEC.md "Content-ATS Coverage") — a
// sibling surface to ReasoningPanel (judgment) and AtsView (raw extracted
// text). Never part of the react-pdf render: it only ever consumes the SAME
// extracted text AtsView shows, via the shared useExtractedText hook, and
// reports against it in plain DOM.
//
// Report-only (fact-lock, locked decision): this panel never inserts a term
// into the document or an entry. `unsupported` rows point at the honest
// choice — accept the gap, or capture a real entry for it — never an
// add/insert-style imperative aimed at the keyword itself.

import { DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import type { Entry, EntryMeta, Paper, Profile, TailoredResume } from "@shared/types";
import { assembleCandidates, classifyCoverage, type CoverageRow } from "@shared/content-coverage";
import { useExtractedText } from "../document/useExtractedText";
import type { EngineDensity } from "../document/engine";

// Human label for the grounding entry named in an `in-facts` row — never the
// raw id slug. Each EntryMeta variant carries its own natural name; the
// label-less variants (skill/interest/language) fall back to the entry's
// own facts, titleized, since those entries have no meta.name to begin with.
function titleize(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

function humanEntryLabel(meta: EntryMeta, facts: string[], id: string): string {
  switch (meta.section) {
    case "experience":
      return `${meta.company} · ${meta.role}`;
    case "project":
      return meta.role ? `${meta.name} · ${meta.role}` : meta.name;
    case "education":
      return `${meta.school} · ${meta.degree}`;
    case "award":
      return meta.title;
    case "certification":
      return meta.name;
    case "publication":
      return meta.title;
    case "reference":
      return meta.name;
    case "skill":
    case "interest":
    case "language":
      return facts[0] ? titleize(facts[0]) : titleize(meta.section);
    default:
      return titleize(id.replace(/[-_]+/g, " "));
  }
}

function groundingLabel(entries: Entry[], entryIds: string[]): string {
  return entryIds
    .map((id) => entries.find((e) => e.id === id))
    .filter((entry): entry is Entry => entry !== undefined)
    .map((entry) => humanEntryLabel(entry.meta, entry.facts, entry.id))
    .join(", ");
}

function CoverageRowView({ row, entries }: { row: CoverageRow; entries: Entry[] }) {
  return (
    <li
      className={`coverage-panel__row coverage-panel__row--${row.bucket}`}
      data-term={row.term}
      data-bucket={row.bucket}
      data-provenance={row.provenance}
    >
      <span className="coverage-panel__term">{row.term}</span>
      {row.provenance === "raw-jd" && <span className="coverage-panel__badge">best-effort</span>}
      {row.bucket === "in-facts" ? (
        <p className="coverage-panel__copy">
          Not on the page yet, but grounded in {groundingLabel(entries, row.entryIds)}.
        </p>
      ) : (
        <p className="coverage-panel__copy">
          No entry supports this — accept the gap, or capture a real entry for it.
        </p>
      )}
    </li>
  );
}

export function CoveragePanel({
  resume,
  profile,
  jd,
  entries,
  format = DEFAULT_FORMAT_V2,
  paper = "letter",
  density,
}: {
  resume: TailoredResume;
  profile: Profile;
  jd: string;
  entries: Entry[];
  format?: DocumentFormatV2;
  paper?: Paper;
  density?: EngineDensity;
}) {
  const candidates = assembleCandidates(resume.signals, jd);
  const extraction = useExtractedText({ resume, profile, format, paper, density });

  // Degenerate hides (locked): never render an empty wrapper, and never
  // render a state that reads "your resume lacks everything."
  if (candidates.length === 0) return null;
  if (extraction.status !== "ready") return null;
  if (extraction.items.every((item) => item.trim() === "")) return null;

  const rows = classifyCoverage({ extractedText: extraction.items, candidates, entries });
  const actionable = rows.filter((row) => row.bucket !== "on-page");
  if (actionable.length === 0) return null;

  return (
    <div className="coverage-panel" data-testid="coverage-panel">
      <h2 className="coverage-panel__heading">Keyword coverage</h2>
      <ul className="coverage-panel__rows">
        {actionable.map((row) => (
          <CoverageRowView key={`${row.provenance}:${row.term}`} row={row} entries={entries} />
        ))}
      </ul>
    </div>
  );
}
