---
status: locked           # locked 2026-07-10 — human go-ahead after red-team pass
spec_version: 1          # bumped by change orders after lock
---

# Lede v2 — Cover Letters & Authored Capture — Build Spec

Lede v1 models the past, fact-grounded world: entries → tailoring, every claim
traced to a `fact`. This epic adds what a fact-list omits — **authored
synthesis** (the throughline connecting facts into an argument) and
**forward-looking fit** (why you, why this role) — as a cover-letter document
from the same honest engine, plus the capture loop that makes the output become
input: an output you edited until it sounds like you, affirmatively flagged, is
the richest record of *how you write* (a voice source). Origin:
`docs/proposals/authored-capture-cover-letters.md` (ailoop ledger v3-080).

## Standing constraints (cited, not restated)

`/workspace/CLAUDE.md` § Standing policies binds every ticket: facts-not-tags ·
the fact-lock (context/voice never a fact source) · model returns judgment
only, server assembles · PDFs only via react-pdf, preview IS the artifact ·
renderer never cuts · ATS grades earned via extraction CI · bounded design axes
only · not a tracker · keyless by default (model-quality claims key-gated,
opt-in) · secrets discipline · no scraping · snapshots self-contained.
**Tenancy is settled** (CLAUDE.md + v1 close): single-tenant self-hosted; cloud
future = instance-per-tenant; no multi-tenant seams built speculatively.

## Already exists (read from the code, not v1's prose)

- `applications` with `current`/`previous`/`locked` `TailoredResume` snapshots,
  `genState`/`failedReason`, `currentMeta` (provenance + usage), undo-tailor,
  duplicate, lock/unlock (`src/server/routes/`).
- Tailor pipeline engine-split (`ProviderEngine`/`FixtureEngine` behind
  `TailorEngine`), frozen `prompt.ts`, per-app `context` riding the user
  message, `validateNoFabrication` grounding against `entries` alone.
- Document engine v2: one parameterized react-pdf composition
  (`src/shared/format-v2.ts`), presets incl. user-saved `settings.presets[]`,
  pdf.js preview, fit ladder, extraction-order CI invariants.
- `profile` table (identity, links, `baseSummary`, `photoUrl`).
- 870-test keyless suite + recorded decision fixtures + playwright projects
  (`chromium`/`auth`/`applications`/`docker`).

## Locked decisions

<!-- ailoop copies this block into oracle.md verbatim; workers cite it. -->

**From the proposal (human-reviewed, ledger v3-080):**

- **Grounding generalizes; it never weakens.** The model may phrase only what
  the user authored — `facts` or voice sources. A voice source lends **voice,
  never facts**: `validateNoFabrication`'s grounding set stays `entries`;
  voice sources are excluded exactly as `context` is. A number tracing only to
  a voice source throws `FabricationError` (the anti-laundering control). A
  real claim enters the Library as an entry before any generation may state it.
- **Output is a working draft; re-tailor overwrites it wholesale** — edits
  included. No edit history (consistent with v1's no-history stance). The one
  way to keep authored work is to flag it.
- **Editing is text-level only on the resume; the letter's prose structure is
  the user's** (2026-07-10): the summary and any item's text are editable in
  place, but resume structure (which items, order, grouping) stays the
  model's — over structural editing, which would silently orphan the
  reasoning panel's rationale ("why this leads" no longer matching what the
  model decided); removing an item is what re-tailor and `cut[]` are for. The
  **letter** additionally allows paragraph insert/remove: the structural
  prohibition protects model selection + rationale, and letter prose has
  neither — a hand-added paragraph carries `groundedOn: []` (authored, and
  hand-edits are not validated). This is what makes the retroactive-import
  path workable.
- **Lock is joint** (2026-07-10): "Lock final" freezes resume + letter
  together — "what I actually sent" is one artifact — over independent locks,
  whose two lock states blur what "final" means. A letter absent at lock time
  is locked as absent. Unlock (the existing `DELETE /lock`) is joint too — it
  clears both. On a locked application, generation and editing return **409**;
  **flagging a locked output as a voice source is permitted** — flagging
  copies, never edits, and the locked artifact is exactly "what I sent," the
  best flag candidate.
- **Edits mutate the current draft in place; they never displace snapshots.**
  An edit is not a generation. Undo swaps `current` ↔ `previous` as always, so
  an edited draft displaced by undo sits in `previous` (one re-undo restores
  it) until the next generation overwrites `previous` — at which point the
  edit is gone. Exactly v1's one-level semantics; flagging is the only
  preservation.
- **Purely-generated output is excluded by default; opt-in only.** An output
  becomes a voice source only via an affirmative "use as a voice source" flag.
  The loop never learns from its own unblessed machine output.
- **A voice source is a frozen snapshot copy** into a bounded Profile-scope
  set (`profile.voiceSources`, **cap = 5 — a code constant, not
  user-configurable this epic**): `{ id, kind: 'cover-letter' | 'resume',
  text, at }`. Flagging copies; it never points at the mutable `current` — no
  byte-stability violation. **A voice source is always prose:** flagging a
  resume freezes its plain-text extraction (the existing "what the ATS sees"
  text), never the structured snapshot.
- **Pre-Lede letters enter via retroactive applications** (2026-07-10): to
  import a letter written before Lede, create the application it belonged to,
  hand-author the letter content there, and flag it — over a Profile
  paste-in box, which would add a second capture surface and its edge cases.
  Flagging application output is the **only** door into `voiceSources`; the
  `'other'` kind is cut with the paste-in path.
- **Voice sources are style exemplars, never templates** — composition is
  conditioned on register, never copies sentences. Selection, ordering,
  cutting, and fabrication validation are untouched: voice changes phrasing
  only.
- **Voice conditions both documents** (2026-07-10): the resume tailor's
  composition step (summary, ledes, rephrased text) *and* the letter — over
  letters-only-until-proven; one consistent voice beat a cautious split, and
  the voice-on/off eval covers both surfaces.
- **Cover letters come from the same honest engine shape**: judgment +
  grounding over Library + JD (+ context + motivation + voice), never
  invention; rendered and exported through the react-pdf document path;
  editable and flaggable like the resume; a claim appearing only in a letter
  is unusable by future generations until promoted to an entry (not a fact
  backdoor — tripwire).
- **Motivation is a dedicated per-application field** (2026-07-10): the
  letter's "why you, why this role" is authored intent, stored beside (not
  inside) `context` — over reusing `context`, so motivation prose never leaks
  into resume-selection emphasis; over an editable letter brief, which is more
  UI than the job needs. Like `context` and voice, motivation is **excluded
  from the grounding set** — it guides, it is never a quotable fact source.
- **The letter is lightly structured** (2026-07-10): the model returns parts —
  greeting, body paragraphs[], closing — and the server assembles, matching
  the standing "model returns judgment, server assembles" architecture — over
  a single prose blob, which would make validation and rendering treat the
  letter as opaque. Hand-editing edits the parts.
- **A letter draft may be created blank** (loud default): an empty parts
  skeleton, no generation required — the retroactive-import path must not
  cost a model call. A blank letter is hand-authored content like any edit.
- **"Voice works" is a key-gated model-quality claim**: voice-on vs voice-off
  over a fixed JD + Library ⇒ measurably different phrasing, identical
  facts/selection/order. The machinery (voice reaches composition input; is
  excluded from grounding; flagging freezes a copy; re-tailor overwrites) is
  keyless-testable and is what gates the build.

**Loud defaults (locked by aispec; override any):**

- Voice sources and any letter-specific inputs ride the **user message**, like
  `context` — `prompt.ts` stays frozen; absent voice ⇒ byte-identical user
  message ⇒ existing fixtures replay untouched.
- **Hand-edits are not fabrication-validated.** The fact-lock constrains the
  model, not the person: `validateNoFabrication` gates generation; a human
  editing their own document is trusted authorship (same as any word
  processor). Flagged voice sources inherit whatever the human saved.
- **Letter rendering: minimal letter layout inside the one engine** — header
  (profile identity) + date + recipient/greeting + prose body + sign-off,
  sharing the application format's typography/colors. No letter-specific
  design axes this epic (deferral below).
- Letter storage mirrors the resume lifecycle on the application:
  `letterCurrent`/`letterPrevious` with the same overwrite-on-regenerate and
  one-level undo semantics (exact field naming is the builder's; the
  semantics are not).
- **The letter decision carries its grounding**: each body paragraph returns
  `groundedOn: entryId[]` — the entries whose facts it draws on. The server
  verifies numbers against those entries' facts (mechanical) and the
  letter-flip becomes computable (cited-entry sets differ across JDs). Same
  shape as the resume's `entryId` traceability.
- **Letters have their own generation state** (`letterGenState` +
  `letterFailedReason`, mirroring the resume's taxonomy), and **one
  generation in flight per application** across both documents (409
  otherwise) — serial keeps the UI and provider usage honest; parallel
  generation is complexity without a user.
- **Letter generation is an independent action** — re-tailor never
  regenerates the letter and vice versa; each draws on the live Library + JD
  (+ motivation/context/voice) at its own generate time.
- Letter downloads named `<Name> — <Company> — <Role> — Cover Letter.pdf`;
  PDF title/author from profile (v1 file-hygiene convention extended).
- **The edit API is per-part text PATCH** — a part is addressed by a stable
  path (summary; section/group/item position; letter part id) and carries
  only a string. Structural change is **unrepresentable by construction**
  (over whole-snapshot PUT + server-side diffing: illegal states
  unrepresentable beats illegal states rejected); unknown parts and
  non-string bodies are 400.
- **Recorded evals carry provenance**: every key-gated recording (Phase 0
  letters, Phase 4 voice-on/off) commits, alongside the fixtures, the run's
  model id, token usage, and timestamp plus a verdict line per case (the v1
  `currentMeta` pattern applied to fixtures) — a recording without provenance
  is indistinguishable from hand-authored text and does not count.

## Out of scope

<!-- The tripwire list — ailoop halts if a build crosses it. -->

- **Learning voice from anything but affirmatively flagged sources** —
  rejected (self-imitation drift).
- **Auto-mining facts from a flagged letter** — fact capture stays the
  explicit entry-promotion / resume-import path. A voice source is voice,
  full stop.
- **Multiple distinct voices / per-application voice** — one curated
  Profile-scope set until demanded.
- **A voice-profile form / questionnaire** — capture is a byproduct of normal
  use (edit → flag), never a form.
- **A Profile paste-in voice box** — rejected 2026-07-10 in favor of the
  retroactive-application path; flagging application output is the only door
  into `voiceSources`.
- **Letter-specific design panel axes** — the letter shares the application's
  format; letter design controls are a later epic if demanded.
- **Edit history / versioning of drafts** — overwrite + one-level undo +
  lock, exactly as v1 resolved for the resume.
- Everything in CLAUDE.md's standing policies (tracker features, browser
  printing, scraping, unbounded axes…) remains tripwire.

**Epic scope (2026-07-10): the full authored-capture package** — letters +
editable drafts + voice sources, in the phase order below — over letters-first
(would re-litigate editable-output semantics in a later spec) and letters-only
(shelves the capture insight the proposal exists for).

## Phases (de-risk order)


### Phase 0 — Letter judgment proving run (the risk: is a grounded letter any good?)

**Why first:** v1's Phase 0 precedent — if the model can't write a grounded,
JD-specific letter a human would actually send, nothing downstream saves it.
Key-gated proving run; outputs recorded as fixtures so every later phase is
keyless.

**Deliverable:** letter decision schema (greeting / body paragraphs with
`groundedOn` / closing) + prompt + engine path (behind the existing
`TailorEngine` split); eval over the seed Library with the three v1 §22 JDs;
recorded letter fixtures.

**Done means (executable — the blessed probe, 2026-07-10):** with a live key,
the letter eval script runs the three v1 eval JDs over the seed Library
(rules-engine / frontend-rewrite / platform-sdk) and asserts, per letter:
- every number in the letter traces to entry facts (grounding validator exits
  non-zero on violation — mechanical);
- motivation's text is never quoted as fact (mechanical: excluded from the
  grounding set); whether its *intent* is reflected is a judged check — the
  verdict line in the committed eval transcript (below), not a green exit code;
- **the letter-flip (contrast check, mechanical):** the **lead body
  paragraph's** `groundedOn` includes `cloudcase-platform-sdk` for the
  platform/API-productization JD, `cloudcase-rules-engine` for the
  legacy-taming/velocity JD, `cloudcase-frontend-rewrite` for the
  frontend-platform JD — and each pairwise difference of the letters'
  `groundedOn` unions is non-empty **in both directions** (no
  ground-on-everything letter passes by superset).
The recording commits fixtures **with provenance** (model id, usage,
timestamp) and an eval transcript containing each letter plus a verdict line
(argument quality, motivation reflected — the judged half, on the record).
Thereafter the mechanical assertions replay keylessly. If the letters don't
flip, the letter prompt is wrong — nothing downstream saves it.

### Phase 1 — Letter machinery, keyless

**Deliverable:** application schema additions (motivation, letter snapshots,
`letterGenState`/`letterFailedReason` + migration), API routes, grounding
validation, fixture-driven pipeline tests.

**Done means (executable):** `bun run check` + `bunx vitest run` green with
new tests asserting:
- letter zod schema accepts the recorded fixtures and rejects a paragraph
  whose `groundedOn` names a nonexistent entry;
- a number present only in motivation, `context`, or a voice source (not in
  any entry's facts) ⇒ `FabricationError`; the same number present in a
  grounding entry's facts ⇒ passes (contrast pair);
- generate persists `letterCurrent`; regenerate displaces it to
  `letterPrevious`; undo swaps; a failed generation leaves both untouched and
  sets `letterFailedReason`; a second generate while one is in flight (either
  document) ⇒ 409 — with the in-flight state produced by a **real held-open
  generation** (a blocking FixtureEngine), never by writing `genState`
  directly;
- **motivation isolation:** with motivation set, the *resume* tailor's
  composed user message is byte-identical to motivation-absent — motivation
  reaches only the letter pipeline (the leak the dedicated field exists to
  prevent, asserted);
- boot smoke applies the new migration on a fresh `DATA_DIR`.

### Phase 2 — Letter rendering + UI

**Deliverable:** minimal letter layout in the one engine; pdf.js preview +
download; application-page surface for generate/regenerate/undo.

**Done means (executable):** vitest + playwright (`applications` project)
green:
- the fixture letter renders to PDF; extraction yields greeting, every body
  paragraph, and closing **in order**; `leadRationale`/`cut[]` sentinel
  strings absent (v1's extraction-gate pattern);
- changing the application format's typography visibly re-renders the letter
  preview (pixel-diff, the established pattern); the resume is untouched by
  letter generation (snapshot byte-stability);
- e2e: generate → preview paints → download produces
  `<Name> — <Company> — <Role> — Cover Letter.pdf`; an application with no
  letter shows the generate affordance, never an empty document;
- e2e: **motivation is enterable in the UI**, persists across reload (fresh
  server fetch), and reaches the letter request (asserted via the fixture
  engine's received input) — the field exists end-to-end, not just as a
  column.

### Phase 3 — Editable output

**Deliverable:** text-level in-place editing of both drafts; re-tailor /
regenerate overwrite semantics; locked read-only.

**Done means (executable):** vitest + playwright green:
- edit a letter paragraph and a resume item's text → each persists across
  reload (fresh server fetch, non-vacuous);
- re-tailor after editing the resume ⇒ the edit is gone (fixture text is
  back); regenerate after editing the letter ⇒ same (the overwrite contract,
  asserted not assumed);
- edit → undo → the edited draft sits in `previous` (one re-undo restores
  it); a subsequent generation overwrites `previous` and the edit is gone —
  the locked one-level semantics, asserted;
- the per-part edit API cannot express **resume** structural change: requests
  addressing an unknown/removed part, or writing non-text fields (`entryId`,
  `groundedOn`, structure), are rejected 400 — asserted with concrete
  attempts, not just malformed bodies;
- **letter** paragraph insert/remove works; a hand-added paragraph carries
  `groundedOn: []`; a blank letter can be created without a generation and
  edited into content (the retroactive-import mechanics);
- an edited draft still passes extraction checks (edits render);
- locked application ⇒ every edit affordance disabled and the edit route
  returns **409** (the in-flight/lock-conflict convention).

### Phase 4 — Voice capture + conditioning

**Deliverable:** "use as a voice source" flag → frozen copy into
`profile.voiceSources` (bounded, manageable in the Profile editor); voice
conditioning riding the user message into both documents' composition; the
key-gated voice-on/off eval recorded honestly.

**Done means (executable):** vitest + playwright green, plus one key-gated
recording:
- flag an output → a copy lands in `profile.voiceSources`; subsequently
  editing or deleting the application's draft leaves the copy byte-identical
  (frozen-snapshot contrast check); flagging a **resume** freezes its
  plain-text extraction (prose, asserted); flagging works on a **locked**
  application;
- **the retroactive-import flow end-to-end (e2e):** create an application →
  blank letter → hand-author paragraphs → flag → the authored text is a
  voice source, byte-identical to what was typed;
- the cap rejects a 6th source with a typed error; delete works;
- a number present only in a voice source ⇒ `FabricationError` (the
  anti-laundering control, asserted again end-to-end);
- **fixture-replay guard:** with no voice sources, the composed user message
  is byte-identical to the pre-epic message — all existing decision fixtures
  replay untouched; with voice sources, the message contains the voice block;
- **key-gated (recorded once, honestly):** voice-on vs voice-off over a fixed
  JD + Library ⇒ different phrasing (letter/summary text differs) with
  identical selection and order (same `entryId` sets, same ranks) — the
  "voice works" claim, recorded like v1's T014 **with provenance** (model id,
  usage, timestamp committed beside the recording), never inferred from a
  green suite.

Every phase keeps the full standing baseline green (`bun run check` / `build`
/ `lint`, full vitest, playwright per-project; docker e2e at final gate — the
v1 cadence).

## Environment & preconditions

- Existing toolchain only (bun + tsx + vitest + playwright + docker) — no new
  services.
- **A provider API key, once**, for Phase 0's proving run + fixture recording
  and the Phase 4 voice eval (same posture as v1's Phase 0 / `scripts/eval.ts`).
  All other phases and the default suite stay keyless.

## Open questions

<!-- riskiest first; two exits: answered or cut. Empty = ready for the lock
     gate (red-team pass + human go-ahead). -->

_None — all forks answered 2026-07-10._

## Change orders

<!-- Post-lock only. -->
