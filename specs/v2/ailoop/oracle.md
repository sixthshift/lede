# Oracle — Lede v2 (Cover Letters & Authored Capture)

**Contract:** `SPEC.md` · spec_version 1 · sha256 `f6028f095dbbdbb40fea8144209d42feaf2942ea6037bad01410a7ce9fd30357`

The definition of done. Written at intake, before any build. Workers cite it; the
coordinator gates against it. Frozen means never *silently* changed — mechanical
fixes (wrong command/path) are self-serve with a ledger entry; any change to what
behavior counts as done escalates.

## Intake decisions (2026-07-10 — coordinator + human)

Two facts the spec's prose got wrong or left open; resolved before the drive:

1. **Baseline reality (grep-confirmed, 3 independent reads).** The spec's
   "Already exists" section claims the resume has `previous` snapshots,
   `undo-tailor`, `duplicate`, and typed `failedReason`. **None exist in `src/`.**
   v1 specified them (§27) but never shipped them. `genState:'tailoring'` is
   client-side only; there is **no server-side 409 in-flight guard** today.
   → **Human decision: letter-only lifecycle.** Build `letterCurrent` /
   `letterPrevious` / undo / `letterFailedReason` fresh for the letter, plus the
   **net-new cross-document 409 in-flight guard** (a v2 locked decision) on BOTH
   generation routes. Do **NOT** retrofit resume `previous`/undo-tailor/duplicate.
   Every written acceptance check is satisfiable this way (Phase 3's undo
   assertion pins to the letter, which has the machinery). This is a factual
   correction to the spec's premise, not a semantic weakening of any check.

2. **Key-gated steps.** Phase 0's proving run and Phase 4's voice-on/off eval
   need `GOOGLE_GENERATIVE_AI_API_KEY` (gemini-2.5-flash). → **Human decision:
   key dropped in `/workspace/.env`.** The recording tickets (T05, T45) run
   autonomously once the key is present; if a recording ticket is reached with
   the key still absent, **escalate** (do not fake a recording — a recording
   without live provenance does not count, per the spec's loud default).

## Locked decisions (never re-litigated — copied verbatim from SPEC.md §"Locked decisions")

**Standing constraints (CLAUDE.md § Standing policies bind every ticket):**
facts-not-tags · the fact-lock (context/voice/motivation never a fact source) ·
model returns judgment only, server assembles · PDFs only via react-pdf, the
pdf.js preview IS the artifact (no `window.print()`) · renderer never cuts ·
ATS grades earned via extraction CI · bounded design axes only · not a tracker ·
keyless by default · secrets discipline · no scraping · snapshots self-contained.
Tenancy settled: single-tenant self-hosted.

**From the spec (frozen):**

- **Grounding generalizes; it never weakens.** The model may phrase only what the
  user authored (`facts` or voice sources). A voice source lends **voice, never
  facts**: `validateNoFabrication`'s grounding set stays `entries`; voice sources,
  `context`, and `motivation` are all excluded from grounding. A number tracing
  only to a voice source / context / motivation ⇒ `FabricationError`
  (anti-laundering). A real claim enters the Library as an entry before any
  generation may state it.
- **Output is a working draft; re-tailor/regenerate overwrites it wholesale** —
  edits included. No edit history. The one way to keep authored work is to flag it.
- **Editing is text-level only on the resume; letter prose structure is the
  user's.** Resume: summary + any item text editable in place; structure
  (which items, order, grouping) stays the model's. Letter: additionally allows
  paragraph insert/remove; a hand-added paragraph carries `groundedOn: []`;
  hand-edits are not fabrication-validated.
- **Lock is joint.** "Lock final" freezes resume + letter together; a letter
  absent at lock is locked as absent. Unlock (`DELETE /lock`) clears both. On a
  locked application, generation and editing return **409**; **flagging a locked
  output as a voice source is permitted** (flagging copies, never edits).
- **Edits mutate the current draft in place; they never displace snapshots.**
  Undo swaps `current`↔`previous` (letter: `letterCurrent`↔`letterPrevious`);
  one-level semantics, flagging is the only preservation.
- **Purely-generated output is excluded by default; opt-in only** via an
  affirmative "use as a voice source" flag.
- **A voice source is a frozen snapshot copy** into `profile.voiceSources`
  (**cap = 5, a code constant, not user-configurable**): `{ id, kind:
  'cover-letter'|'resume', text, at }`. Flagging copies a frozen snapshot; never
  points at mutable `current`. **A voice source is always prose:** flagging a
  resume freezes its plain-text extraction ("what the ATS sees"), never the
  structured snapshot.
- **Pre-Lede letters enter via retroactive applications** (create app →
  hand-author letter → flag). Flagging application output is the **only** door
  into `voiceSources`. No Profile paste-in box; the `'other'` kind is cut.
- **Voice sources are style exemplars, never templates** — condition on register,
  never copy sentences. Selection/ordering/cutting/fabrication untouched: voice
  changes phrasing only.
- **Voice conditions both documents** — resume composition (summary, ledes,
  rephrased text) AND the letter.
- **Cover letters come from the same honest engine shape:** judgment + grounding
  over Library + JD (+ context + motivation + voice); rendered/exported via the
  react-pdf path; editable and flaggable; a claim appearing only in a letter is
  unusable by future generations until promoted to an entry (tripwire).
- **Motivation is a dedicated per-application field** ("why you, why this role"),
  stored beside `context`, **excluded from the grounding set**, and reaching
  **only** the letter pipeline — never the resume-selection emphasis.
- **The letter is lightly structured:** the model returns parts — greeting,
  body paragraphs[], closing — and the server assembles. Hand-editing edits parts.
- **A letter draft may be created blank** (empty parts skeleton, no model call).
- **"Voice works" is a key-gated model-quality claim.** The machinery (voice
  reaches composition input; excluded from grounding; flagging freezes a copy;
  re-tailor overwrites) is keyless-testable and gates the build.

**Loud defaults (locked; override any):**

- Voice sources + letter-specific inputs ride the **user message**, like
  `context`. `prompt.ts` (the resume SYSTEM_PROMPT) stays frozen; **absent voice
  ⇒ byte-identical user message ⇒ existing decision fixtures replay untouched.**
- **Hand-edits are not fabrication-validated** (trusted authorship).
- **Letter rendering: minimal letter layout inside the one engine** — header
  (profile identity) + date + recipient/greeting + prose body + sign-off,
  sharing the application format's typography/colors. No letter-specific design
  axes this epic.
- Letter storage mirrors the resume lifecycle: `letterCurrent`/`letterPrevious`,
  overwrite-on-regenerate, one-level undo. (Exact field naming is the builder's;
  the semantics are not.)
- **Each body paragraph returns `groundedOn: entryId[]`** — the entries whose
  facts it draws on. The server verifies numbers against those entries' facts
  (mechanical); the letter-flip is computable (cited-entry sets differ across JDs).
- **Letters have their own generation state** (`letterGenState` +
  `letterFailedReason`, mirroring the resume taxonomy). **One generation in
  flight per application across BOTH documents** (409 otherwise).
- **Letter generation is an independent action** — re-tailor never regenerates
  the letter and vice versa; each draws on the live Library + JD (+ inputs) at
  its own generate time.
- Letter downloads named `<Name> — <Company> — <Role> — Cover Letter.pdf`;
  PDF title/author from profile.
- **The edit API is a per-part text PATCH** — a part addressed by a stable path
  (summary; section/group/item position; letter part id), carrying only a
  string. Structural change is **unrepresentable by construction**; unknown
  parts and non-string bodies are **400**.
- **Recorded evals carry provenance**: model id, token usage, timestamp, plus a
  verdict line per case. A recording without provenance is indistinguishable
  from hand-authored text and **does not count**.

## Scope tripwire (halt if crossed)

- Learning voice from anything but affirmatively-flagged sources.
- Auto-mining facts from a flagged letter (voice is voice, full stop).
- Multiple distinct voices / per-application voice.
- A voice-profile form / questionnaire.
- A Profile paste-in voice box (flagging application output is the only door).
- Letter-specific design panel axes.
- Edit history / versioning of drafts.
- Retrofitting resume `previous`/undo-tailor/duplicate (intake decision 1 — out
  of scope this epic).
- Everything in CLAUDE.md standing policies (tracker features, `window.print()`,
  scraping, unbounded axes, tag-scoring, LLM-checks-LLM…).

## Baseline gate (every ticket, no exceptions)

The independent verifier always runs the FULL suite (builders may scope the
vitest step to affected tests; the verifier never scopes).

- [ ] type-check: `bun run check` → exit 0
- [ ] build: `NODE_OPTIONS=--max-old-space-size=1024 bun run build` → exit 0
- [ ] lint: `bun run lint` → exit 0
- [ ] full test suite: `bunx vitest run` → all pass (regression guard)
- [ ] new behavior ships with new tests, green under the above (exempt only pure
      scaffold/config with nothing to test — say so in the ticket)

**Amendment (mechanical, 2026-07-10, ledger 0006 — discovered at T01):** `bun run check`
typechecks only `src/**` (`tsconfig.json` include `src/**/*`, `tsconfig.server.json`
`src/server/**/*`); **`test/**` is NOT typechecked, and vitest has no typecheck step.**
So a `// @ts-expect-error` in a test proves nothing at the baseline. Consequence for
acceptance: negative-type assertions (`@ts-expect-error`, "z.infer has no field X") are
**dev-time guards** — verify them by inspection or an out-of-band scratch tsconfig, NOT by
the baseline. Where a guarantee must be enforced, prefer a **runtime** assertion (zod
`.strict()` rejection, a signature with no such parameter, a route returning 400). This is
a factual correction to the intake oracle, not a weakening of any behavioral check. (We do
NOT add test typechecking to the project — out of epic scope; 877 existing tests are
type-unchecked today and that's the standing state.)

**Amendment (mechanical, 2026-07-10, ledger 0015 — discovered at T04):** `scripts/**` is
ALSO not covered by either tsconfig `include`, so `bun run check` does not typecheck the
eval/record scripts (pre-existing: `scripts/eval.ts`/`eval-budget.ts` are unchecked too).
When a ticket adds/edits a `scripts/*.ts`, the verifier typechecks it out-of-band (a temp
tsconfig extending `tsconfig.server.json` with `files:[the script(s)]`, so tsc follows the
import graph without pulling in JSX client files). This matters most before the KEY-GATED
runs (T05, T45) that execute scripts live — confirm they typecheck first.

Playwright is **not** per-ticket baseline (slow, needs build). It is part of the
**phase oracle** for UI phases (2, 3, 4): `bunx playwright test --project=applications`.
**`design.spec.ts` + `applications.spec.ts` live in the `applications` project**
(`testMatch: /(applications|design)\.spec\.ts/`) — a new `letter.spec.ts` is NOT
picked up unless added to that testMatch. Never run playwright projects
concurrently. Docker e2e (`bun run test:docker`) runs at the **final gate only**.

## Per-phase acceptance (executable — on the merged tree)

### Phase 0 — Letter judgment proving run (KEY-GATED)
- [ ] `bun run scripts/record-letter-fixtures.ts` (live key) records
      `test/fixtures/letters/*.json` + provenance manifest (model id, usage,
      timestamp) + an eval transcript with a verdict line per letter.
- [ ] Grounding validator exits non-zero on any number in a letter not tracing to
      the cited entries' facts (mechanical).
- [ ] **Letter-flip (mechanical):** the **lead body paragraph's** `groundedOn`
      includes `cloudcase-platform-sdk` for the platform/API JD,
      `cloudcase-rules-engine` for the legacy/velocity JD,
      `cloudcase-frontend-rewrite` for the frontend JD; each pairwise difference
      of the letters' `groundedOn` unions is non-empty **in both directions** (no
      ground-on-everything letter passes by superset).
- [ ] Motivation excluded from the grounding set (mechanical); its intent
      reflected = judged verdict line, not a green exit.
- [ ] Thereafter the mechanical assertions replay **keylessly** against the
      recorded fixtures.

### Phase 1 — Letter machinery, keyless
- [ ] `bun run check` + `bunx vitest run` green with new tests asserting:
- [ ] letter zod accepts the recorded fixtures; rejects a paragraph whose
      `groundedOn` names a nonexistent entry.
- [ ] a number only in motivation/context/voice (not any entry's facts) ⇒
      `FabricationError`; the same number in a grounding entry's facts ⇒ passes
      (contrast pair).
- [ ] generate persists `letterCurrent`; regenerate displaces to `letterPrevious`;
      undo swaps; a failed generation leaves both untouched + sets
      `letterFailedReason`; a second generate while one is in flight (either
      document) ⇒ **409** — in-flight produced by a **real held-open generation**
      (blocking FixtureEngine), never by writing genState directly.
- [ ] **motivation isolation:** with motivation set, the *resume* tailor's
      composed user message is byte-identical to motivation-absent.
- [ ] generating a letter does not mutate `current` (resume snapshot stability).
- [ ] boot smoke applies the new migration on a fresh `DATA_DIR`.

### Phase 2 — Letter rendering + UI
- [ ] vitest + `playwright --project=applications` green:
- [ ] fixture letter renders to PDF; extraction yields greeting, every body
      paragraph, and closing **in order**; `leadRationale`/`cut[]` sentinel
      strings absent.
- [ ] changing the format's typography visibly re-renders the letter preview
      (pixel-diff); the resume is untouched by letter generation.
- [ ] e2e: generate → preview paints → download →
      `<Name> — <Company> — <Role> — Cover Letter.pdf`; an application with no
      letter shows the generate affordance, never an empty document.
- [ ] e2e: motivation enterable in the UI, persists across reload (fresh server
      fetch), reaches the letter request (asserted via the fixture engine's
      received input).

### Phase 3 — Editable output
- [ ] vitest + playwright green:
- [ ] edit a letter paragraph and a resume item's text → each persists across
      reload (non-vacuous).
- [ ] re-tailor after editing the resume ⇒ edit gone; regenerate after editing
      the letter ⇒ same.
- [ ] edit → undo → the edited draft sits in `previous` (one re-undo restores it);
      a subsequent generation overwrites `previous` and the edit is gone.
- [ ] the per-part edit API cannot express **resume** structural change: unknown/
      removed part, or writing non-text fields (`entryId`/`groundedOn`/structure)
      ⇒ **400** (concrete attempts, not just malformed bodies).
- [ ] **letter** paragraph insert/remove works; hand-added paragraph carries
      `groundedOn: []`; a blank letter can be created without a generation and
      edited into content.
- [ ] an edited draft still passes extraction checks.
- [ ] locked application ⇒ every edit affordance disabled + the edit route
      returns **409**.

### Phase 4 — Voice capture + conditioning
- [ ] vitest + playwright green + one key-gated recording:
- [ ] flag an output → a copy lands in `profile.voiceSources`; editing/deleting
      the draft leaves the copy byte-identical; flagging a resume freezes its
      plain-text extraction (prose); flagging works on a **locked** application.
- [ ] e2e retroactive-import: create app → blank letter → hand-author → flag →
      the authored text is a voice source, byte-identical to what was typed.
- [ ] the cap rejects a 6th source with a typed error; delete works.
- [ ] a number only in a voice source ⇒ `FabricationError` (end-to-end).
- [ ] fixture-replay guard: no voice ⇒ composed user message byte-identical to
      pre-epic (all existing decision fixtures replay); with voice ⇒ message
      contains the voice block.
- [ ] **KEY-GATED:** voice-on vs voice-off over a fixed JD + Library ⇒ different
      phrasing (letter/summary text differs) with identical selection and order
      (same `entryId` sets, same ranks), recorded with provenance.

### Final gate
- [ ] `bun run test:docker` green.
- [ ] Coverage pass: every SPEC.md requirement maps to a done ticket or a green
      check (below), or sits explicitly under Cut/deferred.

## Coverage map (spec → delivery)

| Spec § | Requirement | Delivered by |
|---|---|---|
| Phase 0 | letter decision schema (greeting/body+groundedOn/closing) | T01 |
| Phase 0 | letter prompt + engine path (behind TailorEngine split) | T02 |
| Phase 0 | letter grounding validator + assemble | T03 |
| Phase 0 | eval + record scripts + letter-flip predicate | T04 |
| Phase 0 | letter-flip contrast asserted KEYLESSLY over committed fixtures (+ negative controls) | T06 (coverage-audit repair) |
| Phase 0 | recorded letter fixtures + provenance + verdict transcript (KEY-GATED) | T05 |
| Phase 1 | motivation + letter snapshot columns + migration + types | T11 |
| Phase 1 | zod: motivation + letter snapshot + backup round-trip | T12 |
| Phase 1 | letter generate/undo routes + genState/failedReason + letterPrevious | T13 |
| Phase 1 | cross-document 409 in-flight guard (blocking FixtureEngine) | T14 |
| Phase 1 | motivation isolation (resume message byte-identical) | T15 |
| Phase 1 | grounding/fabrication pipeline tests (contrast pair) + boot smoke | T16 |
| Phase 2 | letter layout in the engine + extraction-order invariant | T21 |
| Phase 2 | letter download + filename + PDF title/author | T22 |
| Phase 2 | letter preview (pdf.js) + typography re-render pixel-diff | T23; T07 (direct letter-canvas typography pixel-diff, coverage-audit repair) |
| Phase 2 | application-page letter surface + motivation field UI (e2e) | T24 |
| Phase 3 | per-part text PATCH (resume) + 400 on structural/non-text + locked 409 | T31 |
| Phase 3 | letter paragraph PATCH + insert/remove + blank letter | T32 |
| Phase 3 | overwrite/undo semantics tests | T33 |
| Phase 3 | editing UI + locked read-only (e2e) | T34 |
| Phase 4 | profile.voiceSources column + cap + migration | T41 |
| Phase 4 | flag route (frozen copy) + delete + resume plain-text + locked | T42 |
| Phase 4 | voice conditioning into both documents + fixture-replay guard | T43 |
| Phase 4 | voice UI (Profile mgmt + flag affordance) + retroactive-import e2e | T44 |
| Phase 4 | voice-on/off eval recorded with provenance (KEY-GATED) | T45 |
| all | standing baseline green each phase; docker at final gate | baseline gate + final gate |

## Caps

`backlog.json` `caps`: maxAttempts 3 · thrash 2 · chunk 20 dispatches/invocation.
