---
status: locked           # locked 2026-07-13 — human go-ahead; de-risk order confirmed (classifier-first); red-team folded (11 findings)
spec_version: 1          # bumped by change orders after lock
---

# Content-ATS Coverage — Build Spec

An honest **gap report**, never a gap filler. Lede's design-axis ATS grade
already tells you the *file* is parseable; nothing yet tells you whether the
*words* an ATS scores for are actually on the page. This adds a read-only,
keyless coverage layer that compares the job's signals against the **actual
extracted document text** (what a parser reads), and sorts every uncovered
signal into one of three honest buckets:

1. **On the page** — the term is already in the rendered document. Not reported.
2. **In your facts, not on the page** — the term is absent from the document but
   grounded in a real entry's `facts`. *Actionable, fact-lock-safe:* name the
   entry(ies) that could legitimately carry it, so the user can re-lead or
   re-phrase to surface it.
3. **No entry supports it** — the term is absent from the document *and* from
   every entry's facts. *The fabrication boundary, stated plainly:* adding it
   would be a lie; the honest move is a new real entry or accepting the gap.

The value is exactly the honesty the fact-lock forces: this layer can *surface*
a keyword gap but can never *fill* one, and it says so. It is display only — it
never feeds the tailor's selection, ordering, or prompt.

## Context (reality at spec time, read from code — not inherited from any prior spec)

- **Tailor Engine Hardening (v6)** shipped the *rationale*-based coverage readout:
  `uncoveredSignals(resume)` (`src/shared/signal-coverage.ts`) lists JD signals
  no group's `leadRationale` names, surfaced in `ReasoningPanel` as "No lede
  addresses these signals: …". This measures the model's **reasoning**, not the
  **artifact** — a signal present only in body prose still reads "uncovered"
  there (documented limit). This new layer is the artifact-side complement; the
  two coexist and measure different things.
- **`AtsView`** (`src/client/components/AtsView.tsx`) already renders the real
  react-pdf export to a blob and runs `extractPdfText` over it (`useAtsExtraction`
  → `state.items: string[]`) — "exactly what a real ATS text parser reads." The
  extracted artifact text this feature needs **already lives in this component.**
  `ReasoningPanel` has only `resume` (no extracted text).
- **`extractPdfText`** (`src/client/document/extractText.ts`) — pdf.js text items
  in draw order; works in Node and jsdom (worker fallback + FileReader shim).
- **The model's JD read** is `TailorDecisionZ.signals = { roleLevel, weights[],
  hardRequirements[] }` (`src/shared/schema.ts`), the model's prose reading of
  the JD ("read from its prose, not scraped keywords" — `prompt.ts` §6).
- **`atsGrade`** (`src/client/document/registry.ts`) is a pure function of the
  **design format axes** (columns, header position, photo, heading icons, page
  background) — the *parseability* grade. Orthogonal to this feature; untouched.
- **`tokenize` / `rationaleReferencesPhrase`** (`signal-coverage.ts`) are the
  existing client-safe matching primitives (any shared ≥4-char token, loose on
  purpose). Reused/extended, not rebuilt.

## Locked decisions

Standing constraints are CITED from `CLAUDE.md`, not restated. This feature
lives entirely inside them.

- **Read-only, post-assembly display.** Never feeds `engine.decide`, `assemble`,
  ranking, or the prompt. Cites CLAUDE.md "the model returns judgment only" and
  "de-modal/display" posture. This is the load-bearing tripwire — and it is
  **mechanized, not asserted in prose**: a P0 test asserts the tailor pipeline
  modules (`server/tailor/engine.ts`, `assemble.ts`, `prompt.ts`) contain no
  import of the new coverage module, and the coverage module's output type
  appears in no `engine.decide`/`assemble` signature. Data flows document→report,
  never report→tailor.
- **Keyless & deterministic.** No LLM call, no semantic/synonym matching, no
  LLM-checks-LLM. Cites CLAUDE.md "Keyless by default" and the no-LLM-validation
  policy. Matching is token/string only.
- **Fact-lock respected — report, never fill.** The layer surfaces gaps and
  points at grounding entries; it never inserts a term into the document or an
  entry. Cites CLAUDE.md fact-lock / `validateNoFabrication`.
- **Facts-not-tags.** Candidate terms come from the model's `signals`, never
  from `tags ∩ jd`. No tag/level scoring anywhere. Cites CLAUDE.md "Facts, not
  tags."
- **Candidate term set = model signals ∪ raw-JD terms.** Signals contribute the
  **raw `weights ∪ hardRequirements` union read directly from
  `TailorDecision.signals`** (`roleLevel` excluded — that exclusion is the only
  thing "reused" from the `uncoveredSignals` convention; the candidate set is
  emphatically NOT the rationale-filtered `uncoveredSignals()` return value —
  coupling to the reasoning filter is the exact confusion this feature exists to
  end). Union with raw-JD terms, deduped case-insensitively; on a term present in
  both sources, **signal-derived wins** (authoritative). *Raw-JD inclusion over
  signals-only: a real ATS matches the literal JD, so a verbatim keyword the
  model abstracted away must still be checkable — accepted cost is a noise filter
  and the standing rule that these terms are DISPLAY candidates only, never a
  scoring/ranking input.*
- **Raw-JD extraction = stop-word-filtered unigrams + adjacent bigrams.** Every
  token and every adjacent non-stop-word token pair from the JD, minus a
  **committed, exported stop-word constant** (standard-English core + a
  JD/resume-generic set: experience, team, role, candidate, responsibilities,
  years, strong, ability, looking, join, work, … — pinned in the source as a
  named constant, not an inline "…", so it is testable as a set). Short tokens
  (<4 char) are admitted from the JD **only if acronym-shaped** (uppercase in the
  source: AWS, SQL, CI, ML) — lowercase short tokens are dropped as noise;
  signal-derived terms are admitted at any length (the model already vetted them).
  *Over a curated tech lexicon: a lexicon silently drops off-list keywords — a
  hidden gap, the one error an honesty-first report must not make; visible noise
  is dismissable, a silent miss is a lie (same error-direction as the match
  rule).* Bounds the noise it admits: raw-JD-only candidates (those not already
  signal-derived) are **capped at 15, ranked by JD frequency then first
  appearance** (loud default — override the cap/ordering); signal-derived
  candidates are never capped.
- **Provenance on every reported term, and it must be CORRECT.** Each row is
  tagged signal-derived (authoritative — the model's JD read) or raw-JD
  (best-effort — literal text mining); raw-JD rows read as lower-confidence,
  never as the model's judgment. Correctness is pinned, not just presence: a
  signal-only term tags `signal`, a raw-JD-only term tags `raw-jd`, a term in
  both tags `signal`. This keeps the admitted noise honest rather than hidden.
- **The match rule — both page-side and facts-side — = all tokens present,
  case-insensitive.** A term reads matched against a text (the extracted
  document for `on-page`, an entry's `facts` for `in-facts`) only if every one of
  its tokens appears there; the SAME rule decides both buckets, so `in-facts`
  can never be looser than `on-page`. *All-tokens over any-shared-token:
  any-token hides a real page gap AND, on the facts side, misfiles an
  `unsupported` term as `in-facts` on one incidental word — both dishonest; over
  whole-phrase substring: brittle to PDF spacing/line-breaks, manufacturing false
  gaps.* Matching is **case-insensitive**; tokenization splits on
  non-alphanumerics, so `CI/CD`→`ci,cd`, `front-end`→`front,end`, and
  `design-system` / `design system` tokenize identically and match each other.
  **Token floor for matching = ≥2 chars** (`tokenize`'s ≥4 floor would silently
  drop `AWS`/`SQL`/`Go`/`ML`, the canonical short ATS keywords — the exact
  silent miss the axiom forbids). *Disclosed limit: 1-char skills (`R`, `C`)
  still can't be represented — accepted, not fixed in v7.* P0 pins the rule with
  tests that fail under each rejected variant.
- **UI home = a new sibling surface.** A dedicated coverage panel, separate from
  both `ReasoningPanel` (judgment) and `AtsView` (raw extracted text), mounted as
  a sibling of the document preview in `ResultView` and reached the same way
  `AtsView` is (loud default — override the mount/nav if a different placement is
  wanted). *Over folding into `AtsView`/`ReasoningPanel`: two distinct coverage
  notions in one panel crowd each other; a clean third surface keeps each
  honest.* Never part of the react-pdf render.
- **Artifact text source = the SAME `extractPdfText` over the real rendered
  export** — never a re-derivation from `resume` that could drift from the PDF
  bytes. Reuses `AtsView`'s extraction path.
- **New matching logic is a client-safe module** (no `node:*` imports, sibling
  to `signal-coverage.ts`) so client and any server/test use share one source
  and can never drift — the same discipline `signal-coverage.ts` already states.
- **The three-bucket classifier is the contract** (on-page / in-facts-not-on-page
  / no-entry-supports). Reporting is report-only: name + locate the entry, no
  edit/re-tailor action from the report (v7).
- **Honest degenerate-case framing** (mirrors `ReasoningPanel`'s locked rule):
  when there are no signals, or extraction is unavailable/empty, the layer
  **hides** rather than rendering a state that reads as "your resume lacks
  everything."
- **`atsGrade` and design-axis ATS untouched.**

## Out of scope

Tripwire — ailoop halts if a build crosses it.

- **Auto-filling / inserting any keyword** into the document or an entry. The
  whole point is that it can't.
- **Feeding coverage into the tailor** — decision, ranking, prompt, or fixtures.
- **LLM / semantic / synonym matching** (e.g. "k8s" ↔ "Kubernetes"). Keyless,
  deterministic only; the resulting synonym blind spot is a *disclosed limit*.
- **Editing entries/facts or re-tailoring** from the gap report (report-only v7).
- **Changing `atsGrade`** or any design-axis ATS behavior.
- **Touching** `prompt.ts`, `letter-prompt.ts`, recorded fixtures,
  `TailorDecisionZ`, `assemble.ts`, or the repositioning judgment.
- **Raw JD terms as a scoring/ranking/selection target.** They are a display
  candidate source only (locked above); they never score, reorder, filter, or
  select entries, and never reach the tailor — that would rebuild Teal.

## Phases (de-risk order)

### Phase 0 — the coverage classifier (pure, keyless)

**Why first:** this is where the feature can silently lie. A false "on the page"
hides a real gap; a false "no entry supports it" wrongly tells the user their
truthful experience is unspeakable. The matching semantics ARE the honesty
contract — they must be pinned and tested before any UI depends on them.

**Deliverable:** two pure functions in a new client-safe module (sibling to
`signal-coverage.ts`, no `node:*` imports, reusing `tokenize`): (1) candidate
assembly — the raw `weights ∪ hardRequirements` union from
`TailorDecision.signals` (`roleLevel` excluded) unioned with raw-JD terms mined
per the extraction rule in Locked decisions, each tagged `signal | raw-jd`
provenance, deduped case-insensitively (signal wins on a tie); (2)
`classifyCoverage({ extractedText: string[], candidates, entries }) → { term:
string; provenance: "signal" | "raw-jd"; bucket: "on-page" | "in-facts" |
"unsupported"; entryIds: string[] }[]`, `entryIds` populated only for
`"in-facts"`, matching = all-tokens-present, case-insensitive, both sides.

**Done means (executable):**
- `bunx vitest run <new classifier test>` → green, keyless.
- **Bucket contrast** (concrete inputs, each forcing a *flip*):
  - Term present in `extractedText` (all tokens) → `on-page`.
  - Term absent from `extractedText` but all its tokens present in some entry's
    `facts` → `in-facts`, that entry's id in `entryIds`. **Flip:** the same term
    once it IS in `extractedText` → `on-page`, `entryIds` empty.
  - Term absent from `extractedText` and from every entry's `facts` →
    `unsupported`, `entryIds` empty. **Flip:** add one entry whose `facts`
    contain the term → `in-facts`.
- **Match rule pinned on BOTH sides**, each test failing under a rejected variant:
  - Page-side: a term sharing one incidental token with the text must NOT read
    `on-page` (fails under any-shared-token); a true multi-token match split by
    PDF spacing/word-order MUST read `on-page` (fails under whole-phrase substr).
  - Facts-side: a term sharing one incidental token with an entry's `facts` must
    land `unsupported`, NOT `in-facts` (fails if the facts side is looser than
    the page side).
  - Casing/splitting: `AWS` in the JD matches `aws` in the text (case-insensitive,
    ≥2-char floor — fails under case-sensitive or the ≥4 floor); `design-system`
    on the page covers the `design system` bigram.
- **Disclosed-limit test:** a true abbreviation gap where both forms tokenize
  (e.g. `postgres` in facts vs `postgresql` in the JD) lands `unsupported` — the
  no-synonym decision, exercised (not a length artifact), with a documenting
  comment.
- **Candidate assembly:** the signals portion equals the raw `weights ∪
  hardRequirements` union from `TailorDecision.signals` (roleLevel excluded) —
  asserted NOT equal to `uncoveredSignals()` when a signal is rationale-covered
  (proves it is the raw union, not the filtered set). Raw-JD extraction tested
  against the committed stop-word constant: a representative *set* of generics
  (the standard-English core + named JD-generics) are all absent from candidates;
  a JD sentence stuffed with generics must yield a named real skill in the top-15
  AND the named generic absent. Acronym rule: uppercase `AWS` becomes a candidate,
  lowercase `go`/`in` does not.
- **Cap ordering forces frequency, not appearance:** a high-frequency term
  appearing LATE in the JD is KEPT while a low-frequency term appearing EARLY is
  DROPPED — a case where frequency and first-appearance orderings disagree (a
  single "low-freq dropped" assertion would pass under appearance-only).
- **Provenance correctness:** a signal-only term tags `signal`, a raw-JD-only
  term tags `raw-jd`, a term in both tags `signal` (not merely "a provenance
  field exists").
- **Read-only tripwire (mechanized):** a test asserts `server/tailor/engine.ts`,
  `assemble.ts`, `prompt.ts` import nothing from the coverage module, and its
  output type appears in no `engine.decide`/`assemble` signature.

### Phase 1 — the coverage surface (UI)

**Deliverable:** a new sibling coverage panel in `ResultView` (separate from
`AtsView` and `ReasoningPanel`), running the SAME render→blob→`extractPdfText`
path `AtsView` uses over the real export — factored into a shared extraction hook
rather than duplicating that logic. The three buckets shown with honest copy;
`in-facts` items name their grounding entry.

**Done means (executable):**
- `bun run build` then `bunx playwright test --project=applications --grep <slug>`
  → passes. e2e drives REAL fixture data (platform-sdk) and asserts EXACT bucket
  membership and the named entry id for at least one `in-facts` signal — not
  mere presence of a heading.
- Component test — degenerate hides AND healthy shows (so always-hide fails
  here, not only via e2e): no signals / extraction error / empty extraction →
  the panel is absent (`queryByTestId(panel)` is null); healthy data → the panel
  is present with ≥1 coverage row.
- Component test — `unsupported` copy, checkable concepts not a magic string:
  the copy contains NO add/insert/include imperative (asserted against a banned-
  word list) AND references a real-entry / accept-the-gap path; `in-facts` copy
  names the grounding entry.
- Component test: raw-JD-derived rows are visually distinguished as best-effort /
  lower-confidence; signal-derived rows are not — provenance is legible, not
  collapsed into one undifferentiated list.
- Extraction-neutrality preserved: the report is a sibling of the document, never
  part of the react-pdf render (mirrors `AtsView`/`ReasoningPanel` — asserted).

## Environment & preconditions

- **Keyless** — runs on recorded fixtures; no API key. (CLAUDE.md keyless policy.)
- **pdf.js extraction** — via `extractText.ts` (Node worker fallback + jsdom
  FileReader shim already in place).
- **Playwright `applications` project** — the e2e home (design/reasoning specs
  live here, not `chromium`). Build before running (stale `dist/` fails
  extraction specs). Never run projects concurrently.
- No new services, runtimes, or secrets.

## Open questions

_(empty — all forks resolved; pending the lock checklist: red-team pass,
de-risk-order confirmation, human go-ahead.)_

## Change orders

<!-- Post-lock only. -->
