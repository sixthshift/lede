# Oracle — Tailor Engine Hardening

**Contract:** `SPEC.md` · spec_version 1 · sha256 `092dcb73de810a75c5726db9873887ec2542cd7fbce9f531f0d1f3735b017571`
<!-- Resume recomputes the hash and refuses to dispatch on a mismatch. -->

Definition of done for the two-deliverable hardening drive: (1) an airtight
mechanical decision-contract validator around the model's judgment; (2) a
JD-signal coverage readout in the ReasoningPanel. Both keyless & mechanical.

## Locked decisions (never re-litigated — cite in every worker prompt)

- **The model returns judgment only; the server assembles all structure.** This
  drive hardens/reads the SERVER side only.
- **No LLM-checks-LLM validation.** Every check added here is mechanical (no
  `generate*` / no model call in any validator or the coverage function).
- **`SYSTEM_PROMPT` is FROZEN** — no instruction edits, no tuning (`prompt.ts`,
  `letter-prompt.ts` are off-limits for content).
- Facts, not tags. The fact-lock. Keyless by default (both deliverables run with
  no API key; `NODE_ENV=test` → `FixtureEngine`).
- **Recorded fixtures are captured real model output — NOT ours to rewrite.** If
  the validator rejects a recorded fixture, the INVARIANT is mis-scoped: loosen
  the invariant, never edit `test/fixtures/decisions/*.json`.
- Standing (CLAUDE.md): react-pdf only; renderer never cuts; reasoning strings
  (`leadRationale`/`cut`) never enter the PDF subtree; de-modal; bounded axes.

## Scope tripwire (halt if crossed)

- Any change to `SYSTEM_PROMPT` or the model's judgment/phrasing.
- Any LLM-based validation or LLM-judge quality/coverage scoring.
- Rebuilding the flip-eval (`scripts/eval.ts` + `evalcore.ts`) or the
  ReasoningPanel — both exist; extend/alias at most.
- Mechanical *semantic* checks beyond numbers (verb-strengthening etc.).
- Fabrication self-repair / re-prompt loops.
- A `bun run eval` alias / eval packaging.
- New configurable settings/knobs — ambient defaults only.
- Cutting content to fit pages / altering the density ladder.
- Tag-scoring or level-scoring.
- Any evaluative coverage judgment (good/bad) — the readout is FACTUAL only
  ("no lede addresses X"), never "your resume lacks X".
- **Editing or re-recording existing fixture decisions** to satisfy the
  validator.

## Baseline gate (every ticket, no exceptions)

Fast tier (per ticket — independent verifier always runs the FULL tier):
- [ ] type-check: `bun run check` → exit 0 (both client + server tsconfigs)
- [ ] build: `bun run build` → exit 0
- [ ] lint: `bun run lint` → exit 0 (biome)
- [ ] full unit suite: `bunx vitest run` → all pass
- [ ] new behavior ships with new tests, green under the above

Gate tier (per phase close, merged tree):
- [ ] e2e: `bunx playwright test --project=applications` → all pass
  <!-- design.spec.ts lives in this project; --project=chromium finds no
       ReasoningPanel test. Run `bun run build` first (stale dist/ fails
       design.spec with fitToPages fetch errors). Never run suites
       concurrently (each boots its own webServer on PORT-derived ports). -->

A ticket shipping a NEW gate-tier (playwright) test runs THAT test itself
(builder + verifier); everything else defers to phase close.

## Flake quarantine

<!-- Known env quirks (CLAUDE.md), not yet observed here — recorded so a verify
     applies the discriminator without re-deriving. A quarantined test failing
     IN ISOLATION is still a hard red. -->

| Test | Failure mode | Discriminator | Root cause (out of scope because…) |
|---|---|---|---|
| any playwright spec | `@fontsource` fetch flake under full-suite run | re-run the spec ALONE 3–5× | pre-existing test-infra font-path timing (CLAUDE.md documents it) |
| `test/library-filter.test.tsx`, `test/fit-ui.test.tsx`, `test/application-detail-design.test.tsx` | timeout (30–46s durations) under the loaded full 84-file `bunx vitest run` — timing-fragile jsdom UI tests (debounce/async waits) | re-run the 3 files together in isolation 3× → 12/12 pass (confirmed T001: ISO_1/2/3 EXIT=0) | jsdom component-test timing under suite load; product code they exercise is client UI unrelated to this server-side spec — a vitest EXIT=1 whose ONLY reds are these three files, all passing in isolation, is green for acceptance. Failing IN ISOLATION is still a hard red. |

## Per-phase acceptance (executable — pass on the MERGED tree)

### Phase 0 — Contract invariants
- [ ] `bun run check` → exit 0; `bun run build` → exit 0; `bun run lint` → exit 0
- [ ] `bunx vitest run` → all pass, INCLUDING new contract tests:
  - **Partition:** decision omitting a library entry from both lists → throws;
    exact partition → passes. Id in BOTH lists → throws; in exactly one →
    passes. Id in `items`/`cut` ABSENT from library → throws. Same id twice
    within `items` (or within `cut`) → throws.
  - **Rank:** two items in the SAME section with equal `rank` → throws; two
    items in DIFFERENT sections sharing a `rank` → passes; non-integer or `<1`
    → throws; unique integer ranks → passes. (Section resolved by entryId
    lookup in the library — raw decision has no section field.)
  - **Lede rationale:** a `rephrase:"full"`-section group whose lowest-rank
    item has empty/whitespace/missing `leadRationale` → throws; full-section
    lede with non-blank rationale → passes. A lede in a `light`/`none` section
    (education/skill) with NO rationale → passes (proves scoping). *Final scope
    is whatever survives fixture reconciliation — see below; a loosening is
    documented in this file + ledger, not silent.*
- [ ] **Integration (not isolation):** a genuinely contract-violating fixture
  decision fed through the real `tailor()` pipeline throws
  `DecisionContractError` — proving the validator is CALLED by `tailor()`, not
  merely importable.
- [ ] **Fixture reconciliation:** the validator, run over ALL recorded fixtures
  (`test/fixtures/decisions/*.json`) via the real `assemble()`, passes every
  one, AND a NON-ZERO count of full-rephrase-section ledes was actually checked
  across the set (a loosening to near-vacuous fails this count — keeps any
  loosening minimal + visible). A failure means loosen the invariant (record
  the final scope here); the wired keyless `bunx vitest run` staying green is
  the proof. **Lede = lowest-RANK item of its group, not `items[0]` in decision
  order** (a contract test with out-of-order raw items proves this).
- [ ] **Route persistence:** `mapTailorError` maps `DecisionContractError` to
  its OWN HTTP code, **pinned to a specific value distinct from EVERY code the
  map already returns** (422/502/401/429); sets `genState:"failed"` (transition
  from `"tailored"`, not checked in isolation); and with a non-null prior
  `current` of known content leaves that `current` **byte-identical** after the
  failure (mirrors & extends RED-TEAM #11 at
  `test/api.applications-tailor.test.ts:233`). The check runs pre-assemble
  (a violation assemble doesn't itself guard proves it) and `decide()` is
  called exactly once (no retry).

### Phase 1 — JD-signal coverage readout
- [ ] `bun run check` → exit 0; `bun run build` → exit 0; `bun run lint` → exit 0
- [ ] `bunx vitest run` → all pass, INCLUDING keyless contrast tests on the pure
  coverage function (uncovered = signals named by NO lede rationale):
  - `weights=["platform SDK productization","API versioning"]`, one lede
    rationale naming platform/SDK → uncovered `["API versioning"]`; a second
    lede naming "API versioning" → uncovered `[]`.
  - `hardRequirements` fold into the SAME uncovered set as `weights`.
  - `roleLevel` excluded from covered AND uncovered.
  - a signal named only by a NON-lede item's `leadRationale` → still uncovered
    (lede-only, not any-rationale).
  - a signal token present only in a lede item's `text` (not its rationale) →
    still uncovered (rationale-referenced, not text-match).
  - **documented-limit case:** two signals sharing a ≥4-char token, one named by
    a lede rationale → the test asserts BOTH read covered (pins ANY-token
    behavior as intended).
- [ ] `bunx playwright test --project=applications` → all pass, INCLUDING a new
  spec (added to the applications testMatch, matched by NO other project)
  driving the ReasoningPanel from REAL decision data (fixture → assembled
  resume → derived uncovered, NOT an injected `uncovered` prop), fixture pinned
  so ≥1 signal covered AND ≥1 uncovered, asserting EXACT signal identities (not
  cardinality): the uncovered one renders under non-evaluative copy matching
  `/no lede addresses/i` verbatim; the covered one is ABSENT from that list.
- [ ] Component guard (`test/reasoning-coverage.test.tsx`): `<ReasoningPanel>`
  takes ONLY `resume` (no coverage-shaped prop — `bun run check` enforces);
  TWO distinct hide cases — (a) ≥1 lede all-covered → hidden, (b) zero ledes +
  non-empty signals → hidden.
- [ ] **Reuse enforced:** the coverage matcher is the SAME token logic as the
  flip-eval's `rationaleReferencesSignal`/`tokenize` (single source, extracted
  to a client-safe shared module) — not a fresh matcher. No `node:*` import
  reaches the client bundle (`bun run build` proves it).

## Coverage map (spec → delivery)

| Spec § | Requirement (one line) | Delivered by |
|---|---|---|
| D1 Partition | entry-id partition: exact ∪, disjoint, no foreign, no dup | T001 |
| D1 Rank | integer ≥1, unique within section (section via library lookup) | T001 |
| D1 Lede rationale | every full-rephrase-section lede has non-blank rationale (scope survives reconciliation) | T001 |
| D1 failure mode | `DecisionContractError` thrown; no self-repair/retry | T001, T002 |
| D1 placement | flat checks pre-assemble, lede check post-assemble, inside `tailor()` outside provider retry | T002 |
| D1 tolerate extra rationale | extra `leadRationale` on non-lede tolerated & discarded | T001 (asserted) |
| Fixture reconciliation | validator passes all recorded fixtures (loosen, don't edit fixtures) | T001 |
| D1 route | `mapTailorError` → distinct code; `genState:"failed"`; `current` byte-identical | T002 |
| D2 signal source | `weights ∪ hardRequirements`, `roleLevel` excluded | T003 |
| D2 lede-only | covered iff a LEDE's rationale references the signal | T003 |
| D2 documented limit | ANY shared ≥4-char token (reuse `rationaleReferencesSignal`) | T003 |
| D2 reuse/single-source | shared client-safe matcher; `evalcore` re-imports it | T003 |
| D2 honest framing | "no lede addresses X" copy; hide when uncovered empty OR zero ledes | T004 |
| D2 surface | extend ReasoningPanel; keyless, always-on, per-render | T004 |
| D2 e2e | applications-project spec from real decision data | T004 |
| Out-of-scope list | none crossed | per-ticket scope check + tripwire |

## Caps

`backlog.json` `caps`: maxAttempts 3 · thrash 2. No dispatch cap — run to
completion. Builders: `model: sonnet`. Gates/verify/coordinator: session model.
