---
status: locked           # locked 2026-07-13 — human go-ahead; de-risk order confirmed (contract-first); red-team folded (16 findings)
spec_version: 1          # bumped by change orders after lock
---

# Tailor Engine Hardening — Build Spec

Proactive hardening of Lede's tailoring engine *before* its first real use. Two
deliverables: (1) make the deterministic contract around the model's judgment
**airtight** — a malformed decision must fail loud, never degrade silently — so
the first live run yields either a clean document or a clear failure; and (2)
extend the always-on decision-report with a **JD-signal coverage** readout: which
of the job's weighted signals / hard requirements no lede addresses. Both are
mechanical and keyless. Explicitly NOT in scope: the model prompt or the
repositioning judgment itself — that is tuned against observed output, never
blind.

Context (reality at spec time, read from code — not inherited from any prior
spec):
- The tailoring engine is a single structured LLM call returning flat judgment
  (`TailorDecision`: `signals`, `summary`, `items[{entryId,text,rank,
  leadRationale?}]`, `cut[{entryId,reason}]`); the server assembles all
  structure (`src/server/tailor/assemble.ts`) and mechanically rejects
  fabricated *numbers* (`validate.ts`).
- The flip-eval quality gate **already exists** and is complete
  (`scripts/eval.ts` + `evalcore.ts`): key-gated, runs 3 contrast JDs against
  the seed library, asserts each lede flips + names a signal + a tag-shuffle
  control. Not in scope to rebuild.
- The decision-report **already exists** in-product
  (`src/client/components/ReasoningPanel.tsx`): renders `signals` (WeightBar),
  per-lede `leadRationale`, and the `CutList`. This drive *extends* it, does
  not rebuild it.

## Locked decisions

Standing constraints (CITED from `CLAUDE.md`, not restated — permanent policy
binding this drive):
- The model returns judgment only; the server assembles all structure. This
  drive hardens/reads the server side only.
- **No LLM-checks-LLM validation pass.** Every check added here is mechanical.
- Facts, not tags. The fact-lock. Keyless by default (both deliverables run
  with no API key).
- **`SYSTEM_PROMPT` is FROZEN for this drive** — no instruction edits, no
  tuning. *Over prompt tuning: deferred until after the first live runs; tuning
  judgment never observed is guessing.*

### Deliverable 1 — Contract invariants

A new **mechanical** validator (no LLM, sibling to `validateNoFabrication`)
enforces, over the flat `TailorDecision` + the entry library:
- **Partition** — the library's entry-id set equals `entryIds(items) ∪
  entryIds(cut)` *exactly*, and `items`/`cut` are disjoint: no library entry
  omitted from both; no id in both lists; **no id in `items` or `cut` that is
  absent from the library** (foreign/unknown ids rejected); **no id appearing
  twice within `items` or within `cut`**.
- **Rank** — each item's `rank` is an **integer `≥ 1`**, unique **within its
  section**, where an item's section is resolved by looking its `entryId` up in
  the library (`entry.section`) — the raw decision has no section field.
  Equal ranks in the **same** section are rejected; equal ranks in **different**
  sections are fine (each section leads with a rank-1). Matches `prompt.ts:76`;
  today `z.number()` allows floats/dupes/negatives.
- **Lede rationale** — every lede in a **`rephrase:"full"` section**
  (experience, project) carries a **non-empty (trimmed, non-blank)**
  `leadRationale`. A lede is the lowest-rank item within a group; groups are
  sub-partitions of a section (assemble groups a section's items by the
  registry `groupBy`). *Scoped to full-rephrase sections — see the loud default
  and precondition below; "lead" is a judged decision only where the model was
  asked to reason about it (jobs/projects), so requiring rationale on a
  skills-category or education lede would over-reject valid decisions.* Checked
  post-assemble, where grouping determines ledes.

Loud defaults (bare — nobody fought over these; listed for override in the
session report):
- **Failure mode mirrors fabrication exactly**: a violation throws a typed
  `DecisionContractError`; `mapTailorError` maps it to a distinct HTTP code;
  `genState → "failed"`; prior `current` untouched. No self-repair, no extra
  model retry. *Consistency with `validateNoFabrication` beats a marginal
  re-ask.*
- **Placement mirrors fabrication**: flat checks (partition, rank) on the raw
  decision before `assemble`; lede-rationale check post-assemble; both inside
  `tailor()`, outside the provider retry envelope.
- **Extra `leadRationale` on non-lede items is tolerated and discarded** (the
  current `assemble` behavior) — not rejected. *Harmless; policing it adds a
  rule guarding no failure.*
- **Lede-rationale invariant scoped to `rephrase:"full"` sections.** *Derived,
  not intent-guessed: the prompt emphasizes the lede only for jobs/projects, the
  flip-eval checks only those, and the recorded fixtures are the empirical
  ground truth (see precondition — if a fixture violates the scope, the scope is
  wrong, not the fixture). Listed for override.*

### Deliverable 2 — JD-signal coverage readout

A pure, keyless function derives, from the assembled `TailoredResume`, which of
its signals are **addressed** vs not, and the ReasoningPanel surfaces the
uncovered set.

- **Signal source: `resume.signals`** — specifically its `weights` and
  `hardRequirements` arrays, folded into one uncovered set. This is the model's
  extracted signals (`assemble` copies `decision.signals` through unchanged; it
  is the same object `WeightBar` already renders) — there is no separate
  "authoritative JD signals" object. `roleLevel` is excluded (a framing, not a
  coverage target).
- **Coverage reads lede rationales ONLY.** A signal is addressed iff a **lede's**
  `leadRationale` references it — never a non-lede item's rationale, never any
  item's `text`. *This is load-bearing: crediting a non-lede rationale or body
  text would let a signal read "covered" when no lede leads on it, defeating the
  "no lede addresses X" claim.*
- **Documented limit (the scar):** `rationaleReferencesSignal` matches on ANY
  shared ≥4-char token, so two signals sharing a token (e.g. "API versioning"
  and "content versioning") can both read as covered when only one is named.
  Accepted as a known limit — reuse/single-source with the flip-eval beats a
  bespoke tighter matcher — and disclosed here rather than silently shipped.

  *Chosen over kept-text matching: text matching risks a false "covered" — a
  stray token marking a signal addressed when the entry doesn't speak to it —
  the more misleading failure direction.*
- **Honest framing is load-bearing.** The readout says "no lede addresses X",
  never "your resume lacks X" — an uncovered signal may be touched by a non-lede
  bullet, and the copy must not imply otherwise. This is the whole reason the
  rationale-referenced definition was chosen; a build that mislabels it defeats
  the deliverable.
- Loud defaults:
  - Surface: extend `ReasoningPanel` (where the decision-report lives) with an
    "uncovered signals" section; keyless, always-on, derived per render from the
    assembled resume.
  - Reusing `rationaleReferencesSignal`/`tokenize` is mandatory (not a fresh
    matcher) — single source, so the readout and the flip-eval can never drift
    on what "references a signal" means.
  - **The section is hidden when the uncovered set is empty, and when the resume
    has zero ledes** (e.g. everything cut). *A zero-lede resume would otherwise
    mark every signal "uncovered" — factually "no lede addresses X", but with no
    ledes at all it reads as "your resume lacks X", the evaluative implication
    the deliverable forbids.*

## Out of scope

Tripwire — ailoop halts if a build crosses these:
- Any change to `SYSTEM_PROMPT` or the model's judgment/phrasing.
- Any **LLM-based** validation or LLM-judge quality/coverage scoring.
- Rebuilding the flip-eval or the ReasoningPanel — both exist; this drive
  extends/aliases at most.
- Mechanical *semantic* checks beyond numbers (e.g. "contributed to" vs "led"
  verb-strengthening). *Rejected: not reliably mechanizable without an
  LLM-judge; the no-strengthen rule stays prompt-only.*
- Fabrication self-repair / re-prompt loops. *Deferred: build recovery only
  after observing real fabrication rates.*
- A `bun run eval` alias / eval packaging. *Considered, dropped from this scope
  — run the existing eval via `bunx tsx scripts/eval.ts`.*
- New configurable settings/knobs — ambient defaults only.
- Cutting content to fit pages / altering the density ladder.
- Tag-scoring or level-scoring.
- Any coverage judgment about whether an uncovered signal is *good or bad* — the
  readout is factual ("no lede addresses X"), never evaluative.
- **Editing or re-recording existing fixture decisions** to satisfy the new
  validator (see Fixture reconciliation) — recorded model output is not ours to
  rewrite.

## Phases (de-risk order)

*Order confirmed with human at lock: contract-first. Rationale: the coverage
readout's only design risk (being honest without an LLM) is already retired by
its locked definition, so it is low-risk to build. The live uncertainty is
whether the lede-rationale invariant is correctly scoped — which only reveals
itself when the validator meets the real recorded fixtures — so the contract
work gates first, surfacing any mis-scoping before anything depends on it.*

### Phase 0 — Contract invariants

**Why first:** retires the one still-open risk — whether the invariants (esp.
lede-rationale scoping, #5) match the real recorded fixtures. A mis-scoped
invariant fails a fixture immediately here, before the coverage work builds on
the same assembled-resume shape.

**Deliverable:** the mechanical decision-contract validator, wired into
`tailor()` and `mapTailorError`, with unit tests.

**Done means (executable):**
- `bunx vitest run` green, incl. new contrast tests:
  - Partition: a decision **omitting** a library entry from both lists → throws;
    a decision partitioning the library exactly → passes. An id in **both**
    lists → throws; in exactly one → passes. An id in `items`/`cut` **absent
    from the library** → throws. The **same id twice within `items`** (or within
    `cut`) → throws.
  - Rank: two items in the **same** section with equal `rank` → throws; **two
    items in DIFFERENT sections sharing a `rank` → passes**; a non-integer or
    `< 1` rank → throws; unique integer ranks → passes.
  - Lede rationale: a `rephrase:"full"`-section group whose lowest-rank item has
    empty/whitespace/missing `leadRationale` → throws; every full-section lede
    with a non-blank rationale → passes. **A lede in a `rephrase:"light"`/`"none"`
    section (e.g. education, skill) with NO rationale → passes** (proves the
    invariant is scoped, not global).
- **Integration (not isolation):** feeding `tailor()` a genuinely
  contract-violating **fixture decision** (a recorded/constructed decision, not
  a hand-thrown error) drives the real pipeline to throw `DecisionContractError`
  — proving the validator is actually *called* by `tailor()`, not merely
  importable.
- `bun run check` clean.
- The route maps `DecisionContractError` to **its own HTTP code, distinct from
  the fabrication code**, sets `genState:"failed"`, and — with a **non-null
  prior `current` of known content** — leaves that `current` **byte-identical**
  after the failure (mirrors and extends the existing fabrication persistence
  test).

### Phase 1 — JD-signal coverage readout

**Deliverable:** the pure coverage function + ReasoningPanel surfacing.

**Done means (executable):**
- `bunx vitest run` green, incl. keyless contrast tests on the pure coverage
  function:
  - Given `weights = ["platform SDK productization", "API versioning"]` and one
    lede whose `leadRationale` = "leads with platform/SDK productization — the
    JD's top weighted requirement" → uncovered = `["API versioning"]`.
  - Given a second lede whose rationale also names "API versioning" → uncovered
    = `[]`.
  - **`hardRequirements` are folded into the same uncovered set as `weights`**:
    a signal present only in `hardRequirements`, named by no lede rationale →
    appears in uncovered; named by a lede rationale → does not.
  - `roleLevel` is excluded from both covered and uncovered computation.
  - **A signal named only by a NON-lede item's `leadRationale` → still
    uncovered** (proves lede-only, not any-rationale).
  - **A signal token present only in a lede item's `text` (not its rationale) →
    still uncovered** (proves rationale-referenced, not text-match).
  - **Documented-limit case:** two signals sharing a ≥4-char token, one named by
    a lede rationale → the test asserts BOTH read as covered, pinning the known
    ANY-token behavior as intended, not a bug.
- A component/e2e assertion (`applications` project) that drives the
  ReasoningPanel from **real decision data** (application fixture → assembled
  resume → derived uncovered), NOT an injected `uncovered` prop, with a fixture
  pinned so **≥1 signal is covered and ≥1 uncovered**: the uncovered one renders
  under non-evaluative copy ("no lede addresses …"); the covered one is
  **absent** from that list. A separate case with an empty uncovered set asserts
  the section is **not rendered**.
- `bun run check` clean.

## Environment & preconditions

- Both phases are **keyless** — vitest + fixtures, no API key. Commands: `bun
  run check`, `bunx vitest run`, `bunx playwright test --project=applications`
  (for any ReasoningPanel e2e; note design.spec lives in that project).
- The pre-use *test* the human will run separately (the existing flip-eval,
  `bunx tsx scripts/eval.ts`) needs `GOOGLE_GENERATIVE_AI_API_KEY` — but that is
  a run, not a build target of this spec.
- **Fixture reconciliation.** Wiring the validator into `tailor()` puts it on
  the keyless (`FixtureEngine`) path, so every recorded decision in
  `test/fixtures/decisions/` must satisfy the new invariants or the keyless
  suite breaks. Precondition: run the validator over all recorded fixtures. **If
  a fixture fails, that is evidence the invariant is mis-scoped — loosen the
  invariant; do NOT edit the recorded decision.** Recorded fixtures are captured
  real model output (fact-lock provenance); rewriting them to pass is
  out-of-scope fabrication-adjacent editing, not reconciliation.

## Open questions

*(empty — all resolved.)*

## Change orders

<!-- Post-lock only. -->

## Braindump (raw)

<!-- empty — first-session material was captured structured directly into the
     sections above (engine reality read from code; the five hardening
     candidates; the scope decisions). -->
