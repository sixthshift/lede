# Proposal: Authored capture — editable output, voice sources & cover letters

> **Status: PROPOSAL — not part of the locked spec.** This is a future-epic
> sketch (post-E9) for human review. It does **not** modify `spec.md` and no
> tickets are seeded from it. It originated as an unsolicited draft during the
> E9-F4d build; the coordinator reverted it out of the locked contract and, per
> the human's decision (ailoop ledger v3-080), captured it here for later
> go/no-go. If accepted, it becomes a new numbered spec section (§32) via the
> normal spec-amendment path.

## The reframe (why this might exist)

Lede models the **past, fact-grounded** world well: §4 entries → §6 tailoring,
every claim traced to a `fact` by `validateNoFabrication`. A hand-written cover
letter exposes two things a fact-list omits:

- **Authored synthesis** — the throughline that connects facts into an argument.
- **Forward-looking fit** — motivation: why you, why this role.

Both are *authored*: subjective and yours, not verifiable facts, but not
fabrication either, because **you** wrote them. The insight: **the output
becomes input.** A letter you edited until it sounds like you is the richest
capture of *how you write*. This proposal makes that capture a byproduct of
normal use (edit an output, then flag it) rather than a "voice profile" form,
and un-defers cover letters (§31.2) as the natural payoff.

## Proposed locked decisions (the guardrails that keep it honest)

- **Grounding generalizes; it never weakens (thesis-preserving rule).** Today
  the model may only *phrase* what your `facts` contain. Extended: it may phrase
  only what **you authored** — facts *or* your voice sources. A **voice source
  lends voice, never facts.** Any real claim in a flagged artifact must enter
  the Library as an entry (§6.2 / §27 promotion) before any generation may state
  it. `validateNoFabrication`'s grounding set stays `entries`; voice sources are
  **excluded** exactly as `context` is — a number that traces only to a voice
  source still throws `FabricationError`. Blur this and Lede becomes the
  claim-laundering keyword-matcher it exists to reject (§1).
- **Output is a working draft; re-tailor overwrites it wholesale.** Generated
  output (resume *and* cover letter) is hand-editable, but re-tailor replaces
  `current` entirely — edits included. Editing is not a version history
  (consistent with §27's no-history stance). The one way to keep authored work
  is to flag it.
- **Purely-generated output is excluded by default; opt-in only.** Each output
  is `purely-generated` until the user checks **"use as a voice source."** The
  loop learns *only* from what you affirmatively bless, so it can never drift
  into imitating its own machine output. Prefer ground-up authored letters as
  voice bases; a lightly-edited AI draft is a weak, self-referential signal.
- **A voice source is a frozen snapshot tagged `voice`** (reuses §28.1). Flagging
  *copies* the authored text into a durable, Profile-scope set — it does not
  point at the mutable `current`. So editable output introduces **no** §28.1
  byte-stability violation: the frozen artifact is a new copy, never an edited
  snapshot.
- **Voice sources are style exemplars, not templates.** Future composition is
  *conditioned* on them ("write in this register"), never copies their
  sentences. This touches the composition step of §6.2; it is **additive** and
  gated by the eval below.
- **Bounded, curated, Profile-scope set** (default cap ~5) — your voice is your
  voice, reused across every application. The cap is a tunable, not a contract.

## The model (sketch)

- **Editable output.** `current` (resume) and the new cover-letter output are
  working drafts the user may edit in place. `locked` stays immutable (§27).
  Re-tailor overwrites the draft.
- **Voice-source flag → Profile voice set.** A per-output "use as a voice
  source" action freezes a copy into `profile.voiceSources`: a bounded list of
  `{ id, kind: 'cover-letter' | 'resume' | 'other', text, at }`. Besides
  `baseSummary`, the only Profile-scope input that reaches the composition
  prompt — and only for voice.
- **Voice conditioning in composition.** When voice sources exist, the tailor's
  composition step (summary, per-group lede, rephrased text) is conditioned on
  them. Selection, ordering, cutting, and `validateNoFabrication` are
  **untouched** — voice changes phrasing only.

## Cover letters (un-deferring §31.2)

- A second document type from the **same honest engine** shape: select and
  sequence *authored content* (voice sources for register; motivation /
  `context` and Library framings for substance) against the JD — judgment +
  grounding, never invention. Facts in the letter are grounded in the Library
  exactly as the résumé's are.
- Editable and flaggable like the résumé; the letter is the **richest** voice
  source (prose, unstructured, most "you").
- Rendered and exported through the §28 document path (react-pdf — the letter is
  a document like any other; `window.print()` stays rejected, §28.0).
- **Not a fact backdoor** (tripwire): a claim appearing only in a letter is
  unusable by any future generation until promoted to an entry.

## Honesty (the key-gated caveat)

"Voice works" is a **model-quality** claim, like the lede-flip (T014) and
context-shift claims — its proof is **key-gated**: with a live key, an eval
shows voice-on vs voice-off over a fixed JD + Library yields **measurably
different phrasing** but **identical facts / selection / order**. The
*machinery* (voice sources reach the composition input; are excluded from
grounding; re-tailor overwrites; flagging freezes a copy) is
**keyless-testable** and is what would gate the build. Recorded honestly like
T014 — never assumed from a green suite.

## Acceptance shape (if this epic is ever built)

- generate → hand-edit the output → re-tailor **overwrites** the edit (no
  history); an **unflagged** output never influences a later tailor.
- flag an output → a **frozen copy** lands in `profile.voiceSources`;
  editing/deleting the application's `current` afterward leaves that copy
  byte-identical (snapshot, §28.1).
- a number present only in a voice source (not in any entry) still throws
  `FabricationError` — grounding excludes voice sources (the anti-laundering
  control).
- cover letter: create → generate over Library + JD (+ voice/context) → renders
  through react-pdf; extraction contains only Library-grounded content,
  `leadRationale`/`cut[]` sentinels absent (§11); editable + flaggable; §28.1
  byte-stability holds.
- **key-gated (deferred, honest):** voice-on vs voice-off → different phrasing,
  identical selection/order.

## Deferrals (recorded, not silent)

- **Learning voice from anything but flagged sources** — rejected
  (self-imitation risk); only affirmative, authored flags.
- **Auto-mining facts from a flagged letter** — out of scope; fact capture stays
  the explicit §27 promotion / §29 import path. A voice source is voice, full
  stop.
- **Multiple distinct voices / per-application voice** — deferred; one curated
  Profile-scope set until demanded.
