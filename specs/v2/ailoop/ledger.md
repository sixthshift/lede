# Ledger — Lede v2 (Cover Letters & Authored Capture)

Append-only journal. How the loop got where it is. Newest entry at the bottom.

## Run header
- **spec:** SPEC.md · spec_version 1 · sha256 `f6028f095dbbdbb40fea8144209d42feaf2942ea6037bad01410a7ce9fd30357`
- **started:** 2026-07-10
- **caps:** max 3 attempts/ticket · thrash=2 · chunk=20 dispatches/invocation
- **toolchain:** bun (pkg mgr) / Node+tsx (runtime); check `bun run check`; build
  `NODE_OPTIONS=--max-old-space-size=1024 bun run build`; lint `bun run lint`;
  tests `bunx vitest run`; e2e `bunx playwright test --project=applications`;
  docker `bun run test:docker` (final gate only).

## Journal

[0001] intake — seeded backlog (24 tickets, P0–P4), oracle derived, contract identity recorded
  decision: proceed
  why: every phase oracle is executable; keyless machinery drives autonomously, the two
       recordings (T05, T45) are key-gated and run once GOOGLE_GENERATIVE_AI_API_KEY is in .env.

[0002] intake — resolved two forks with the human before the drive (the one allowed interruption)
  decision: proceed
  why: (1) BASELINE MISMATCH — spec's "Already exists" claims resume previous/undo-tailor/
       duplicate/failedReason; grep-confirmed NONE exist (v1 spec'd, never shipped). Human chose
       LETTER-ONLY lifecycle + net-new cross-document 409; do NOT retrofit resume undo/duplicate.
       Recorded as oracle.md intake-decision 1 + scope tripwire. Not a semantic weakening — every
       written acceptance check is satisfiable letter-side.
       (2) KEY — Phase 0/4 recordings need GOOGLE_GENERATIVE_AI_API_KEY (gemini-2.5-flash), unset.
       Human will drop it in .env; T05/T45 escalate if reached with the key still absent.

[0003] intake — Stage 1.5 red-team (5 fresh agents, one per phase) sharpened all 24 tickets' acceptance
  decision: proceed
  why: adversarial pass found real gameable checks; each sharpened to a contrast/anti-cheat form. Highest-risk:
       - T43 fixture-replay byte-identity was VACUOUS (FixtureEngine keys on hashKey, never calls buildUserPrompt)
         → now a GOLDEN string diff (pre-T43 capture) + end-to-end captured-message assertion through the real route.
       - T45 'phrasing differs' passes on sampling noise alone → pin low temperature + affirmative register verdict.
       - T15 motivation isolation could pass unwired (signature-only) → mandate the REAL /tailor route, two identical apps.
       - T31 structural-unrepresentability → require `.strict()` zod (default zod silently strips, not rejects).
       - T32 blank-letter no-model-call → spy engine that THROWS if called, assert zero invocations.
       - T05/T16/T45 fixture provenance → require token usage > 0 (the un-fakeable signal; resume record-fixtures omits it).
       - T24 letter e2e could observe the RESUME canvas (.first() on shared .document-preview) → distinct [data-testid=letter-preview];
         and exit-0 with 0 new tests run doesn't count → verifier confirms new test titles ran.
       - T11 migration provenance → assert __drizzle_migrations 0006 tag + upgrade-path + drizzle-kit-generate no-op.
       - T13/T33 vacuous null-state contrasts → distinct fixtures + non-null seed before fail/undo/isolation checks.
       Scheduler re-validated: 0 problems, 0 cycles, ready=[T01].

[0004] run — execution-model adaptation (mechanical, env-driven)
  decision: amend-approach
  why: CLAUDE.md documents agent worktrees are unreliable here (branch stale; in-worktree `bun run build`
       hits font-path ENOENTs — would fail the baseline). Builders therefore run single-agent on a git BRANCH
       in the main working tree (git checkout -b ailoop/<id> from baseSha), NOT isolation:'worktree'. Preserves
       both ailoop guarantees — a branch to reconcile on interruption + a defined baseSha..branch scope diff —
       while dodging the documented failure. Serial only; if a file-disjoint batch ever needs true parallelism,
       revisit worktree viability then. Not a semantic change to any oracle.

[0005] T01 — dispatch (attempt 1) — single builder on branch ailoop/T01, baseSha 298ea1d
  decision: continue
  why: sole ready ticket (P0 schema/types, keyless). chunk dispatches this run: 1/20.

[0006] oracle — MECHANICAL amendment (self-serve, cite evidence)
  decision: amend-oracle
  why: T01 builder surfaced (verifier-confirmed) that `bun run check` typechecks only src/** — test/** is
       NOT typechecked and vitest has no typecheck step. My acceptance clauses said `@ts-expect-error` is
       "enforced by bun run check" — factually wrong. Amended oracle.md baseline section: negative-type
       assertions are dev-time guards (verify by inspection / scratch tsconfig), not baseline-enforced;
       prefer runtime assertions where enforcement matters. Softened T03's compile-time bullet to inspection.
       NOT a semantic weakening — no behavioral check changed; we do not add test-typechecking (out of scope).
  evidence: tsconfig.json include=src/**/*; tsconfig.server.json include=src/server/**/*; vitest.config.ts no typecheck.

[0007] T01 — JUDGE: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (3 declared files, diff vs baseSha 298ea1d); full baseline green (check 0 / build 0 /
       lint 0 / vitest 64 files 877 pass, +7); gaming read clean (real schema, real reject tests via
       destructure/delete/empty, hand-declared types no z.infer/any). @ts-expect-error intent verified by
       inspection (see 0006). Merged --ff-only into main (baseSha==main HEAD, integration trivially green).
       main now 4c81865.
  attempt: 1/3
  evidence: .ailoop/evidence/T01.txt

[0008] T02 — dispatch (attempt 1) — single builder on branch ailoop/T02, baseSha 4c81865
  decision: continue
  why: ready set [T02,T11] file-disjoint, but SERIALIZED (worktree parallelism unreliable here, ledger 0004;
       two agents can't safely branch one shared tree). T02 first (P0 chain). chunk dispatches this run: 2/20.

[0009] T02 — JUDGE: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (3 declared files vs baseSha 4c81865); prompt.ts UNTOUCHED (frozen SYSTEM_PROMPT intact);
       full baseline green (check 0/build 0/lint 0/vitest 65 files 894 pass). Builder-reported fit-ui flake did
       NOT reproduce in my full run → the documented @fontsource flake, not a regression. Gaming read clean:
       real fact-lock system prompt, guarded byte-identity buildLetterUserPrompt, hashKey key-match test.
       Merged --ff-only; main 18e5a61.
  attempt: 1/3
  evidence: .ailoop/evidence/T02.txt

[0010] run — GOOGLE_GENERATIVE_AI_API_KEY confirmed present in .env
  decision: continue
  why: the human dropped the key (intake fork 2). T05 (letter fixtures) + T45 (voice eval) can now run
       autonomously when reached — no escalation stop expected at the key gates.

[0011] T03 — dispatch (attempt 1) — single builder on branch ailoop/T03, baseSha 18e5a61
  decision: continue
  why: ready [T03,T11] disjoint, serialized; T03 first to keep driving the P0 chain toward T04/T05 (the
       key-gated proving run that retires the epic's core risk). chunk dispatches this run: 3/20.

[0012] T03 — JUDGE: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (letter.ts + test; validate.ts untouched, helpers reused); baseline green (check 0/lint 0/
       build 0/vitest 66 files 900 pass). Gaming read: validateLetterNoFabrication is genuinely PER-CITATION
       (blob = only the paragraph's cited entries' facts; uncited-entry number still throws), signature has no
       motivation param, assembleLetter pass-through. Merged --ff-only; main 0928a74.
  attempt: 1/3
  evidence: .ailoop/evidence/T03.txt

[0013] T04 — dispatch (attempt 1) — single builder on branch ailoop/T04, baseSha 0928a74
  decision: continue
  why: ready [T04,T11] disjoint, serialized; T04 first — it unblocks T05, the key-gated proving run that closes
       P0 (key now present in .env). chunk dispatches this run: 4/20.

[0014] T04 — JUDGE: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (4 declared files); baseline green (check 0/lint 0/build 0/vitest 912; the one fit-ui failure
       didn't reproduce + isolated 4/4 = documented flake). Scripts typecheck clean (isolated temp tsconfig, since
       baseline doesn't cover scripts/). Gaming read: letterFlipPredicate strict on body[0]; letterFlipContrast is a
       REAL superset trap (both directions non-empty); recordOneLetter pure + no-write-on-fail; usage capture is REAL
       per-call tokens via a LetterRecordEngine seam (no engine.ts edit, not fabricated). Merged --ff-only; main 7614022.
  attempt: 1/3
  evidence: .ailoop/evidence/T04.txt

[0015] oracle — MECHANICAL amendment (self-serve, cite evidence)
  decision: amend-oracle
  why: T04 surfaced that scripts/** is also outside both tsconfig includes (extends the ledger-0006 test/** gap).
       Amended oracle.md: verifier typechecks added/edited scripts out-of-band (temp tsconfig extending server config,
       files:[script]); confirm before the key-gated live runs (T05/T45). Not a semantic change.
  evidence: tsconfig.json include=src/**/*; tsconfig.server.json include=src/server/**/*; scripts/ absent from both.

[0016] T05 — attempt 1 (coordinator-run, KEY-GATED live recording) — FAILED the letter-flip CONTRAST
  decision: retry (via repair T02R, then re-record)
  why: ran scripts/record-letter-fixtures.ts live (GOOGLE key present, 53 chars); all 3 letters recorded, real
       provenance/usage captured (8202 total tokens; per-call recorded). Independent KEYLESS re-verify over the
       recorded fixtures: lead-flip TRUE for all 3, validateLetterNoFabrication clean — BUT letterFlipContrast=FALSE.
       SEED_ENTRIES is exactly 3 entries; the frontend-rewrite letter (3 paras) grounded on ALL 3
       {frontend-rewrite,platform-sdk,rules-engine} → its union is a SUPERSET of platform-sdk {platform-sdk} and
       rules-engine {rules-engine} → empty pairwise diff one direction → the spec's 'no ground-on-everything by
       superset' guard fires. This is Phase 0 doing its job (the record script's own PASS only checks lead-flip; my
       independent contrast check caught it). Root cause upstream: LETTER_SYSTEM_PROMPT (T02) lacks a focus
       instruction. Discarded the recording (NOT committed), deleted branch ailoop/T05, removed test/fixtures/letters.
  attempt: 1/3
  evidence: manifest usage total 8202 tokens; keyless check — platform-sdk union {psdk}, rules-engine {re},
            frontend-rewrite {fr,psdk,re}; letterFlipContrast=false.

[0017] T02R — repair ticket created + red-teamed (mid-flight)
  decision: decompose/repair
  why: added T02R (focus LETTER_SYSTEM_PROMPT so letters don't ground-on-everything); T05 rewired to depend on it.
       Red-teamed: keyless acceptance is necessarily WEAK (contrast needs the live model) — the SUFFICIENT gate is
       T05's live re-record. Added a fact-lock-intact assertion so the focus edit can't gut grounding. Escaped-bug
       rule N/A: nothing let this through — T05 (the live contrast) caught it; the oracle worked as designed.
       Graph re-validated: 0 problems, 0 cycles, 25 tickets, ready [T02R,T11].

[0018] T02R — dispatch (attempt 1) — single builder on branch ailoop/T02R, baseSha 7614022
  decision: continue
  why: repair the letter prompt; T05 re-records after. chunk dispatches this run: 5/20.

[0019] T02R — JUDGE: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (letter-prompt.ts + test); buildLetterUserPrompt UNTOUCHED (byte-identity contract); focus
       section added, fact-lock intact; baseline green (check 0/build 0/lint 0/vitest 67 files 915 pass, +3 focus
       tests). Merged --ff-only; main c9128a1.
  attempt: 1/3
  evidence: .ailoop/evidence/T02R.txt

[0020] T05 — attempt 2 (coordinator-run re-record) FAILED on sampling variance; DIAGNOSED, no escalation
  decision: retry (via repair T04R)
  why: with the focused prompt, a re-record had 2/3 JDs slip (platform-sdk body[0] ungrounded ⇒ lead-flip false;
       rules-engine '30,000' misattributed ⇒ fabrication). A coordinator diagnostic (3 fresh live calls, output in
       tasks/br600k7ex.output) then produced CLEAN letters for ALL 3: each lead-flips and grounds on a SINGLE
       distinct entry {platform-sdk}/{rules-engine}/{frontend-rewrite} ⇒ letterFlipContrast=true, no fabrication.
       CONCLUSION: the model reliably CAN write good letters (Phase 0's core risk is retired in substance); the
       failure is that the single-attempt record script doesn't tolerate gemini's sampling noise. NOT a model/prompt
       capability problem → no human escalation; a recording-robustness fix. Discarded the incomplete recording +
       branch. T05 attempt 2 logged.
  attempt: 2/3
  evidence: tasks/br600k7ex.output (diagnostic: all 3 clean, distinct-singleton unions).

[0021] T04R — repair ticket created + red-teamed (mid-flight)
  decision: repair
  why: added T04R (per-JD retry loop K=5 in record-letter-fixtures.ts; same mechanical flip+grounding gates each
       attempt; honest usage + attempts count). T05 rewired to depend on it. Red-teamed: acceptance forbids weakening
       the checks (grep-confirm letterFlipPredicate + validateLetterNoFabrication still gate) and forbids keeping a
       failing result; keyless-necessary, T05 live re-record is sufficient. Escaped-bug rule N/A (T05 caught it).

[0022] T04R — dispatch (attempt 1) — single builder on branch ailoop/T04R, baseSha c9128a1
  decision: continue
  why: make recording robust to sampling; then re-record T05. chunk dispatches this run: 6/20.

[0023] T04R — JUDGE: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (only record-letter-fixtures.ts; no temp tsconfig committed); baseline green (check 0/lint 0/
       build 0/vitest 915); script typechecks out-of-band (exit 0). Gaming read: MAX_ATTEMPTS=5 loop calls UNCHANGED
       recordOneLetter (flip+grounding gates intact each attempt), keeps first ok, real per-JD attempts count, no
       fixture on all-fail. Merged --ff-only; main 27701da.
  attempt: 1/3
  evidence: .ailoop/evidence/T04R.txt

[0024] T05 — attempt 3 (retry-backed re-record) — CAP REACHED (3/3). Deterministic fabrication on rules-engine.
  decision: ESCALATE (cap breach; converging, high-confidence fix identified)
  why: platform-sdk + frontend-rewrite PASSED attempt 1 (clean, lead-flip, focused, distinct singleton unions).
       rules-engine FAILED all 5 retries IDENTICALLY: fact 'rules engine ~30k lines of unstructured rules' vs the
       model writing '30,000' — normalizeToken('30,000')='30000' has no token in '~30k' -> FabricationError. The
       fact-lock is CORRECT (model expanded ~30k into 30,000 = strengthening). Deterministic (5/5), not sampling.
       Fix is clear+high-confidence: letter-prompt hardening to reproduce numbers VERBATIM from facts. Failing set
       across T05 attempts SHRANK 1->2->1 (contrast -> lead-flip+fabrication -> fabrication) = CONVERGING, not
       thrashing. But T05 hit maxAttempts=3, so per discipline I STOP and escalate with the diagnosis + the specific
       decision needed rather than auto-doing attempt 4. Discarded the partial recording (platform-sdk+frontend
       written, rules-engine failed) + branch. Chunk: 6 builder dispatches + 3 coordinator recordings.
  attempt: 3/3 (CAP)
  evidence: tasks/b1tcxw1yo.output (5/5 rules-engine fabrication '30,000'); fact is '~30k'.

[0025] run — HUMAN DECISION on the T05 cap-breach wall
  decision: continue (human-authorized cap extension for T05, +1 attempt)
  why: presented 3 options (prompt-verbatim / matcher-numeric-equivalence / seed-edit). Human chose PROMPT-VERBATIM
       (Recommended): harden LETTER_SYSTEM_PROMPT to reproduce numbers exactly as facts write them (keep the
       fact-lock strict; do NOT touch validate.ts). Authorized one T05 attempt past the 3-attempt cap. Global
       caps.maxAttempts stays 3 (guard intact for other tickets); the scheduler will flag T05 in capBreaches —
       I interpret that as human-overridden for this one wall, documented here. If the re-record still fails,
       escalate again (no further auto-retry).

[0026] T02R2 — repair ticket created (verbatim numbers) + red-teamed; dispatch (attempt 1), branch ailoop/T02R2, baseSha 27701da
  decision: repair
  why: add the verbatim-number instruction to the letter prompt; T05 (rewired to depend on T02R2) re-records after.
       Red-teamed: keyless acceptance necessary-not-sufficient (substring + byte-identity + fact-lock/focus intact);
       sufficient gate is T05 re-record (rules-engine must ground '~30k'). chunk dispatches this run: 7/20.

[0027] T02R2 — JUDGE: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (letter-prompt.ts + test); buildLetterUserPrompt untouched; verbatim-numbers instruction added
       to §1, fact-lock + focus intact; baseline green (vitest 916). Merged --ff-only; main 0f3610e.
  attempt: 1/3
  evidence: .ailoop/evidence/T02R2.txt

[0028] T05 — JUDGE: accept (attempt 4, human-authorized past cap) — PHASE 0 CORE RISK RETIRED
  decision: continue
  why: re-record with retry + verbatim-numbers prompt: all 3 JDs PASS on attempt 1. Independent keyless re-verify
       (run twice, incl. post-biome-format): lead-flip TRUE all 3, letterFlipContrast TRUE (distinct singleton unions
       {platform-sdk}/{rules-engine}/{frontend-rewrite}), grounding clean (rules-engine grounds '~30k' verbatim).
       Provenance real (gemini-2.5-flash, 9344 tokens, attempts=1 each). eval-transcript.md has per-letter verdicts.
       Scope CLEAN (5 fixture files). Merged --ff-only; main 231a08a.
  attempt: 4 (human-authorized past the 3-cap; ledger 0025)
  evidence: .ailoop/evidence/T05.txt
  residual: record-letter-fixtures.ts JSON.stringify output must be biome-formatted before commit (single-element
            groundedOn arrays); pre-commit hook enforces; cosmetic, semantics identical.

[0029] PHASE 0 — CLOSE (phase oracle green on the merged tree)
  decision: close-phase
  why: scheduler reports phasesDrained=['P0'], done 8/8, capBreaches [] , problems []. P0 phase oracle (oracle.md):
       recorded fixtures + provenance + verdict transcript ✓; grounding validator ✓; letter-flip lead + contrast
       both-directions ✓ (coordinator keyless re-verify) — all GREEN. Motivation-excluded is a Phase 1 check (T15).
       The permanent keyless flip/contrast/grounding vitest test is T16 (Phase 1); P0's keyless replay is currently
       coordinator-verified. Pruned merged P0 worker branches (ailoop/T01..T05,T02R,T04R,T02R2); git worktree n/a
       (single-tree serial execution).

[0030] RUN — chunk end (healthy checkpoint at the Phase 0 milestone)
  decision: end-chunk
  why: 7 builder dispatches + 4 coordinator recordings this run; P0 (the central de-risk phase) complete + verified,
       incl. a human escalation resolved and a real inspectable result. A deliberate human checkpoint before the
       larger P1–P4 machinery build. Next chunk ready set: T11 (P1 schema/migration), T21 (P2 letter rendering).
       Invoke /ailoop to continue.

## Chunk 2 (2026-07-10) — P1/P2 machinery

[0031] resume — reconciled clean: spec sha256 unchanged (contract intact), git tree clean at main 231a08a,
  no stale in-progress, no ailoop/* branches, scheduler 0 problems/0 cycles, ready [T11,T21] (file-disjoint batch).
  Single-tree serial execution stands (ledger 0004) → dispatch one at a time.

[0032] T11 — dispatch (attempt 1) — single builder on branch ailoop/T11, baseSha 231a08a
  decision: continue
  why: ready [T11,T21] disjoint but serialized; T11 first — P1 schema/migration foundation that unblocks the
       rest of P1 (T12/T13/T15/T16 all depend on it). chunk dispatches this run: 1/20.

[0033] T11 — JUDGE attempt 1: FAILED re-verify (baseline full-suite red) — under-declared footprint
  decision: retry (declared-files amendment + re-dispatch)
  why: independent re-verify on ailoop/T11 @78a4ea3: scope CLEAN (6 declared files), check 0/build 0/lint 0,
       BUT full vitest 1 failed/919 passed — test/db.test.ts:182 asserts the FULL applications column list via
       toEqual; the 5 new letter/motivation columns necessarily break that exact-match enumeration. Builder was
       correctly disciplined (test/db.test.ts not in declared files → did not touch it). This is an intake
       under-declaration, not a behavioral regression: the test's real not-a-tracker invariant (not.toContain
       status/hiring_status, :198-199) is preserved; the 5 columns are generation-state + emphasis-input.
       → amended T11.files to add test/db.test.ts; appended attempts[1] (failed:[full-test-suite]); re-dispatch
       attempt 2 onto the SAME branch (78a4ea3 work is correct) for the one-line column-list fix. NOT a semantic
       oracle change — no behavioral check altered.
  attempt: 1/3

[0034] T11 — dispatch (attempt 2) — single builder on branch ailoop/T11, baseSha 231a08a
  decision: continue
  why: one-line fix (test/db.test.ts column enumeration) per fixNote. chunk dispatches this run: 2/20.

[0035] T11 — JUDGE attempt 2: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (7 declared files vs baseSha 231a08a); full baseline green (check 0/build 0/lint 0/vitest 67
       files 920 pass). Acceptance non-vacuous: 4 new boot-smoke blocks (0006 applies + __drizzle_migrations
       bookkeeping, additive UPGRADE PATH w/ row survival, SQL defaults, letterCurrent JSON round-trip) all ran
       and passed. PHANTOM-DIFF confirmed: bunx drizzle-kit generate → "No schema changes" (applications 19 cols;
       0006_snapshot.json matches schema.ts). Gaming read: db.test.ts diff = exactly +5 columns, not.toContain
       status/hiring_status intact; migration is 5 hand-written ALTERs. Merged --ff-only; main 59cf308. Pruned
       branch ailoop/T11. Unblocks P1 chain (ready now [T12,T21,T41]).
  attempt: 2/3
  evidence: .ailoop/evidence/T11.txt

[0036] T12 — dispatch (attempt 1) — single builder on branch ailoop/T12, baseSha 59cf308
  decision: continue
  why: ready [T12,T21,T41] serialized; T12 next to advance the P1 chain (zod contracts + import round-trip,
       unblocked by T11). chunk dispatches this run: 3/20.

[0037] T12 — JUDGE attempt 1: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (3 declared files); full baseline green (check 0/build 0/lint 0/vitest 67 files 928 pass, +8).
       Acceptance non-vacuous: motivation accepts well-formed+absence, rejects ''/>4000/non-string (bounded, not
       z.any); coverLetterZ rejects groundedOn-key-deleted / accepts groundedOn:[]; round-trip proven by server
       logs (DELETE then GET->404 BEFORE import restores motivation+letterCurrent deep-equal). Gaming read:
       coverLetterZ = LetterDecisionZ reused (no divergent shape); import letter* .optional() for pre-epic-backup
       compat but validated when present; settings/secrets stay excluded. Merged --ff-only; main 39cddf1. Pruned
       branch. Ready now [T13,T16,T21,T31,T41].
  attempt: 1/3
  evidence: .ailoop/evidence/T12.txt

[0038] T13 — dispatch (attempt 1) — single builder on branch ailoop/T13, baseSha 39cddf1
  decision: continue
  why: ready [T13,T16,T21,T31,T41] serialized; T13 next (letter generate/undo routes — the P1 lifecycle spine).
       Enriched the ticket with verified seams (tailorLetter sig, resolveEngine deps.engine injection, mapTailorError,
       3 recorded letter fixtures) + the key gotcha: FixtureEngine.decideLetter keys on (jd,entries) only, so the
       regenerate-distinct test MUST vary the JD, not motivation. chunk dispatches this run: 4/20.

[0039] T13 — JUDGE attempt 1: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (4 declared files); full baseline green (check 0/build 0/lint 0/vitest 68 files 936 pass, +8).
       Acceptance non-vacuous (8/8): current-isolation byte-equal, regenerate-distinct via a different recorded JD
       moves prior→letterPrevious, undo swap, fail-path from non-null start preserves both snapshots + genState
       'failed' + TWO distinct reasons (NoFixtureError vs FabricationError — classification, not hardcoded), 404,
       no_api_key 400, PUT-motivation separate-GET. Gaming read: real mapTailorError-derived reason, snapshots
       untouched on failure, current never mutated, LIST_COLUMNS still omits heavy letter payloads, voice correctly
       omitted (later ticket). Merged --ff-only; main 0255d2b. Pruned branch. Ready now
       [T14,T15,T16,T21,T31,T41]; T14 (409 guard) unblocked.
  attempt: 1/3
  evidence: .ailoop/evidence/T13.txt

[0040] T14 — dispatch (attempt 1) — single builder on branch ailoop/T14, baseSha 0255d2b
  decision: continue
  why: ready serialized; T14 next (net-new cross-document 409 in-flight guard). Pinned the red-team requirement:
       409 must come from a REAL held-open generation (blocking engine via deps.engine w/ an entered-signal to
       avoid TOCTOU), never a pre-written 'tailoring'; guard released on both success AND failure paths. Noted
       better-sqlite3 is synchronous so the pre-await 'tailoring' write is visible to the concurrent request.
       chunk dispatches this run: 5/20.

[0041] T14 — JUDGE attempt 1: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (2 declared files); baseline green (check 0/build 0/lint 0/vitest 69 files 939 pass, +3).
       Guard: 409-on-entry if either doc 'tailoring'; flag set AFTER resolveEngine (no-key 400 never marks) BEFORE
       await; success->tailored / catch->failed both release. Test is REAL held-open generation: BlockingEngine
       signals entered synchronously then awaits a manual deferred; mid-flight 'tailoring' asserted via a SEPARATE
       GET; 409 off the persisted flag, never pre-written; symmetric + failure-release both proven. Merged --ff-only;
       main a0c7fce. Pruned branch. Ready [T15,T16,T21,T31,T41]; P1 has T15,T16 left before phase-oracle.
  attempt: 1/3
  evidence: .ailoop/evidence/T14.txt

[0042] T15 — dispatch (attempt 1) — single builder on branch ailoop/T15, baseSha a0c7fce
  decision: continue
  why: ready serialized; T15 next (motivation isolation, test-only). Pinned the red-team requirement: MUST drive
       the REAL /tailor + /generate-letter routes with a spy engine capturing decide/decideLetter args (signature-
       only unit check is insufficient); byte-identical resume args across two identical-but-motivation apps +
       decideLetter contrast. chunk dispatches this run: 6/20.

[0043] T15 — JUDGE attempt 1: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (1 test file); baseline green (check 0/build 0/lint 0/vitest 70 files 940 pass, +1; no fit-ui
       flake this run). Test drives REAL /tailor + /generate-letter via a delegating SpyEngine; resume decide()
       args byte-identical (JSON.stringify) across two identical-but-motivation apps + not.toContain(motivation)
       on both; decideLetter contrast (motivation present/null, all else equal). Anti-cheat holds both directions.
       No production change, no leak found. Merged --ff-only; main 76cc7cc. Pruned branch. P1: 5/6 done, T16 left.
  attempt: 1/3
  evidence: .ailoop/evidence/T15.txt

[0044] T16 — dispatch (attempt 1) — single builder on branch ailoop/T16, baseSha 76cc7cc
  decision: continue
  why: last P1 ticket (keyless letter grounding/fabrication pipeline proof over the recorded fixtures). Draining
       it triggers the P1 phase oracle. Test-only; depends on T05 fixtures (present). chunk dispatches: 7/20.

[0045] T16 — JUDGE attempt 1: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (1 test file); check 0/build 0/lint 0; full vitest 953 pass, 1 fail = test/fit-ui.test.tsx
       OVERFLOW (waitForWrapper timeout = DOCUMENTED @fontsource flake per CLAUDE.md; isolated re-run 4/4 PASS;
       unrelated to letter-pipeline). letter-pipeline 14/14. Fabrication three-case genuinely proves per-citation
       scoping (case c: ~30k in rules-engine facts cited against frontend-rewrite only -> throws; would PASS under
       a library-pool bug). Provenance asserts un-fakeable token count >0. Merged --ff-only; main 9fe12cc. Pruned.
  attempt: 1/3
  evidence: .ailoop/evidence/T16.txt

[0046] PHASE 1 — CLOSE (phase oracle green on merged tree main 9fe12cc)
  decision: close-phase
  why: scheduler phasesDrained=['P0','P1'], P1 done 6/6, problems []. P1 oracle (oracle.md) all GREEN on the merged
       tree: check 0; the 6 P1 behavioral test files pass (49 tests) — boot.smoke (0006 migration/upgrade/defaults),
       api.applications-letter (generate/regenerate/undo/failedReason + current-isolation), api.applications-inflight
       (409 via REAL held-open generation, cross-doc + failure-release), motivation-isolation (resume message
       byte-identical + letter contrast), letter-pipeline (zod accept/reject + fabrication three-case + provenance +
       e2e replay), api.export-import (motivation + letterCurrent round-trip). Full suite green modulo the documented
       fit-ui flake. No worker branches to prune (single-tree serial; each merged branch already deleted per accept).
       Playwright is NOT part of P1's oracle (UI phases 2-4 only). Ready next: [T21(P2),T31(P3),T41(P4)].

## P2 — letter rendering + UI

[0047] T21 — dispatch (attempt 1) — single builder on branch ailoop/T21, baseSha 9fe12cc
  decision: continue
  why: P2 foundation (letter layout in the ONE react-pdf engine + extraction-order invariant). Loop healthy at
       7 dispatches; budget remains, drive into P2. Enriched with verified seams (renderResume.ts pattern,
       toLegacyFormat/resolveNameFont, PAGE_SIZE, formatDate, extractPdfText) + tripwire reminders (no letter
       design axes, never render groundedOn/leadRationale/cut). chunk dispatches: 8/20.

[0048] T21 — JUDGE attempt 1: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (5 declared files); baseline green (build 0/check 0/lint 0/vitest 73 files 958 pass, +4;
       fit-ui passed this run). Acceptance: ordered extraction (greeting<3 body markers<closing via increasing
       lastIndex), groundedOn id absent from extracted text, non-empty %PDF, title/author=profile.name over TWO
       profiles (via pdfjs getMetadata — Info dict is FlateDecode-compressed). Gaming read: EngineLetter renders
       ONLY paragraph.text, reuses toLegacyFormat/resolveNameFont (no new axes — tripwire respected), no
       column/band/density machinery, resume document.tsx untouched. Merged --ff-only; main 22e1bfd. Pruned.
  attempt: 1/3
  evidence: .ailoop/evidence/T21.txt

[0049] T22 — dispatch (attempt 1) — single builder on branch ailoop/T22, baseSha 22e1bfd
  decision: continue
  why: P2 letter download + filename (<Name> — <Company> — <Role> — Cover Letter.pdf) + PDF title/author. chunk
       dispatches: 9/20.

[0050] T22 — JUDGE attempt 1: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (2 files); build 0/check 0/lint 0; full vitest 963 pass, 1 fail = fit-ui (documented flake,
       isolated 4/4); letter-download 6/6. Property holds BY CONSTRUCTION (letterPdfFilename derives from
       pdfFilename via suffix replace — shared sanitizer, not parallel); spy asserts renderLetterToBlob called +
       renderResumeToBlob NOT + anchor .download exact. Merged --ff-only; main 63c169a. Pruned. P2 2/4 done.
  attempt: 1/3
  evidence: .ailoop/evidence/T22.txt

[0051] T23 — dispatch (attempt 1) — single builder on branch ailoop/T23, baseSha 63c169a
  decision: continue
  why: P2 letter pdf.js preview (RTL/jsdom, NOT playwright). Pre-added DocumentPreview.tsx to declared files so
       the builder may export shared PdfCanvas/PdfPages helpers cleanly (pure additions, no resume-preview behavior
       change) — the elegant reuse path won't trip the scope check. Pinned the input-bound + re-render-on-prop-
       change assertions (the usePDF empty-dep bug DocumentPreview fixes). chunk dispatches: 10/20.

[0052] T23 — JUDGE attempt 1: accept (independent re-verify green)
  decision: continue
  why: scope CLEAN (3 declared files incl. pre-authorized DocumentPreview.tsx); baseline green (build 0/check 0/
       lint 0/vitest 75 files 969 pass, +5; fit-ui passed). DocumentPreview change PURE-ADDITIVE (optional
       className defaulting to original + export; existing call sites unaffected, design-view canvas tests pass).
       5 letter-preview tests non-vacuous: input-bound exact-props, re-render on letter AND format prop change
       (real anti-cheat vs usePDF's inert empty-dep effect), positive loading + canvas DOM. Merged --ff-only;
       main 8b71c0b. Pruned. P2 3/4 done.
  attempt: 1/3
  evidence: .ailoop/evidence/T23.txt

[0053] T24 — dispatch (attempt 1) — single builder on branch ailoop/T24, baseSha 8b71c0b
  decision: continue
  why: LAST P2 ticket (COARSE — letter surface + motivation UI + playwright e2e). Draining it triggers the P2
       phase oracle. Enriched with verified seams (LetterPreview required props, existing letter hooks,
       ApplicationDetail resolvedFormat/paper, JobPanel context mirror, e2e CONTRAST_JDS[0]+SEED_ENTRIES+
       expectCanvasPainted) + anti-cheat crux: distinct [data-testid=letter-preview] scope (not shared
       .document-preview), verifier confirms new e2e titles ran, resume-canvas isolation. Invited tooBig
       decomposition. chunk dispatches: 11/20.

[0054] T24 — JUDGE attempt 1: accept (independent re-verify green on a RECONCILED clean tree)
  decision: continue
  why: builder left test/setup.ts + vite.config.ts modified UNCOMMITTED (undeclared @fontsource backstop +
       maxForks bump) — coordinator DISCARDED them (merge takes the commit, not the working tree) and re-verified
       on the clean tree. Scope CLEAN (4 declared files committed; api.ts/useApplications.ts untouched — T13 hooks
       sufficed). Baseline green (build 0/check 0/lint 0/vitest 75 files 969 pass — backstop NOT needed). P2 PHASE
       ORACLE green: playwright --project=applications 4/4 incl. the 2 NEW letter e2e titles (generate/paint
       isolation + download filename + undo + motivation persistence; failed-badge-never-stub). Gaming read:
       distinct [data-testid=letter-preview] (not shared .document-preview), GenStateBadge kind prop (resume
       default unchanged), JobPanel motivation->PUT, LetterPreview untouched; isolation proven via resume-canvas
       pixels + server `current` JSON both unchanged; download filename via real letterPdfFilename() + fired
       download event (browser suggestedFilename mis-reports em-dash — documented Chromium quirk; exact string
       unit-proven in T22). Merged --ff-only; main a26f38b. Pruned.
  attempt: 1/3
  evidence: .ailoop/evidence/T24.txt

[0055] PHASE 2 — CLOSE (phase oracle green on merged tree main a26f38b)
  decision: close-phase
  why: scheduler phasesDrained=['P0','P1','P2'], P2 done 4/4, problems []. P2 oracle (oracle.md) GREEN: fixture
       letter renders to PDF + extraction order + no sentinel leakage (T21); download filename + PDF title/author
       (T22); letter preview + typography re-render (T23 unit; T24 e2e canvas paint); e2e generate->preview->
       download->filename + no-empty-doc affordance + motivation persistence + resume isolation (T24, playwright
       applications 4/4). Ran playwright on the ailoop/T24 branch which ff-merges to the SAME commit as main
       (baseSha 8b71c0b == main HEAD pre-merge) -> merged tree byte-identical to the tested tree. No worker
       branches to prune (single-tree serial). P0+P1+P2 all complete.

[0056] DRIFT CAUGHT — out-of-band working-tree pollution (flake mitigations by a non-ticket process)
  decision: discard + surface (do not silently absorb)
  why: during the T24 run, test/setup.ts (@fontsource font-fetch backstop), vite.config.ts (maxForks 3->6), and
       later test/fit-ui.test.tsx (findByText timeout 1s->15s) appeared MODIFIED + UNCOMMITTED in the shared
       working tree — none authored by a ticket, all are mitigations for the documented @fontsource/fit-ui flake.
       The T24 builder flagged "likely a concurrent process/agent touching the shared working tree." Per discipline
       (don't commit unattributed changes; verify on committed state) I discarded all three and re-verified T24
       clean. Tree confirmed clean (only ?? .ailoop + SPEC.md untracked). NOTE FOR HUMAN: these fixes are
       genuinely useful (would durably kill the recurring vitest flake I've isolated-re-run around all chunk) but
       adopting them is OUT OF SCOPE for the letter epic — a candidate for a dedicated test-infra ticket/commit if
       desired. Flagging so the human is aware something is editing test files out-of-band.

[0057] RUN — chunk end (healthy checkpoint at the P0+P1+P2 milestone)
  decision: end-chunk
  why: 11 builder dispatches this run (T11 x2 incl. 1 retry, T12, T13, T14, T15, T16, T21, T22, T23, T24) — all
       accepted, all merged, three phases (P0 pre-existing + P1 + P2) closed with green phase oracles incl. the
       playwright applications gate. The entire letter machinery (schema/migration/routes/409-guard/grounding),
       rendering (react-pdf engine + download + pdf.js preview), and application-page UI (letter surface +
       motivation + e2e) are done. Deliberate human checkpoint before P3 (editing) + P4 (voice) — and so the
       human can glance at the out-of-band test-file pollution (ledger 0056). Next chunk ready set: T31 (P3
       per-part edit API), T41 (P4 voiceSources column). Invoke /ailoop to continue.

---
## RUN 2026-07-10 (chunk resume — P3/P4 drive)
caps: maxAttempts 3, thrash 2, chunk 20. Resume: contract sha256 f6028f… MATCHES SPEC.md (unchanged). Scheduler: 18/27 done, P0/P1/P2 closed, no problems/cycles/stale/breaches. main advanced a26f38b→5dd3204 (human adopted flagged test-infra fixes ledger 0056 as own commit — expected checkpoint action). Ready: T31(P3), T41(P4) — share src/shared/schema.ts so serialized.

[0058] T31 — dispatch (attempt 1) — single builder, worktree, baseSha 5dd3204
  decision: continue
  why: FIRST P3 ticket (per-part text PATCH resume + .strict() structural-unrepresentable + locked 409). Cold-start ready (context self-contained: EXISTS pointers applications.ts PUT/lock, TailoredResume shape; BUILD steps; DO-NOT list). Acceptance red-teamed at intake (contrast: well-formed structural attempt with valid text+entryId ⇒ 400 not silent-strip; index one-past-end ⇒ 400 no append; locked ⇒ 409 row byte-unchanged). chunk dispatches: 1/20.

[0059] T31 — JUDGE attempt 1: ACCEPT (independent re-verify green on merged tree)
  decision: continue
  why: builder branched stale (78a9be5, ancestor of baseSha) and ff-merged to 5dd3204 before building — known
       worktree quirk (CLAUDE.md); verified 5dd3204 IS ancestor, single clean commit 9b75724. Scope CLEAN (exactly
       3 declared files). Re-verified FULL baseline on merged main 9b75724 (not scoped): check 0 / build 0 / lint 0
       / vitest 76 files 987 pass (+18). Gaming read CLEAN: resumePartPatchZ .strict() outer+both path variants
       (structural fields rejected 400, not stripped to 200); applyResumePartPatch immutable, null->400 on unknown/
       past-end (no silent append); 409-locked before mutation; snapshots/genState/currentMeta/letter untouched;
       tests via real routes + real /lock incl. it.each stray-key + full-row-diff + index==len count-unchanged.
       Merged --ff-only to main 9b75724; worktree pruned. P3 1/4.
  attempt: 1/3
  evidence: .ailoop/evidence/T31.txt

[0060] T32 — dispatch (attempt 1) — single builder, worktree, baseSha 9b75724
  decision: continue
  why: 2nd P3 ticket (letter paragraph PATCH + insert/remove + blank-letter creation). Deps T31+T13 done. Cold-start
       ready; embedded verified seams (CoverLetter {greeting,body:[{text,groundedOn:string[]}],closing} types.ts:133;
       letterGenState "untailored"|"tailoring"|"tailored"|"failed" — blank stays "untailored"; PATCH resume-part +
       generate-letter/undo-letter patterns in applications.ts). Anti-cheat crux (red-teamed at intake): blank via
       INJECTED SPY engine that THROWS if decide/decideLetter called (proves no model call, not merely keyless);
       INSERT forces groundedOn:[] regardless of input (anti-laundering); positional insert/remove by exact text.
       chunk dispatches: 2/20.

[0061] T32 — JUDGE attempt 1: ACCEPT (independent re-verify green on merged tree)
  decision: continue
  why: baseSha 9b75724 IS ancestor, single clean commit 7a82be4, scope CLEAN (3 declared files). Full baseline on
       merged main 7a82be4: check 0 / build 0 / lint 0 / vitest 77 files 1005 pass (+18). Gaming read CLEAN:
       letterPartPatchZ .strict() (groundedOn unrepresentable in text PATCH); INSERT forces groundedOn:[] at
       construction regardless of client input (test asserts []) — anti-laundering closed; BLANK builds skeleton
       with ZERO engine reference (spy-throws test = 0 invocations); positional insert/remove by exact text;
       locked->409 before mutation on all 4 routes; only letterCurrent+updatedAt written. Merged --ff-only main
       7a82be4; worktree pruned. P3 2/4.
  attempt: 1/3
  evidence: .ailoop/evidence/T32.txt

[0062] BATCH dispatch (attempt 1 each) — T33 + T34 + T41 fan-out, worktrees, baseSha 7a82be4
  decision: continue
  why: scheduler batched all three file-disjoint (T33 test-only; T34 client+e2e; T41 db/migration — no shared
       files now T31/T32 released schema.ts). Deps all done (T33:T31/T32/T13; T34:T31/T32/T24; T41:T11/T01).
       Only T34 runs playwright -> no concurrent-playwright violation. Each ff-merges to baseSha in-worktree
       (stale-branch quirk). T34 is COARSE — invited tooBig; playwright flake documented (isolated-retry).
       Anti-cheat cruxes carried: T33 two-assertion pre/post (no-op PATCH fails) + unrecoverable-after-fresh-gen;
       T34 run-unique marker persists across reload + artifact reflects edit (pixeldiff/extractPdfText, not
       'canvas paints') + 4 individual disabled asserts + well-formed PATCH->409 byte-unchanged; T41 default
       resolves on READ (deep-equal [] not just pragma) + rejects cut 'other' kind + max(5) + CAP===5 (NOT cap
       enforced — that's T42). chunk dispatches: 3,4,5/20.

[0063] T33 — VERIFY (pre-integration, on worktree branch): PASS pending merge
  decision: hold-merge-until-batch-drains
  why: baseSha 7a82be4 IS ancestor, single commit 3380718, scope CLEAN (1 declared file
       test/api.applications-overwrite.test.ts, no production code). Gaming read CLEAN + NON-VACUOUS: every
       overwrite case asserts the edit PRESENT pre-overwrite then GONE post (deep toEqual(original) via
       deterministic FixtureEngine replay keyed on jd+entries); one-level undo uses two DISTINCT fixtures
       (CONTRAST_JDS[0]/[1] via JD swap), asserts swap byte-exact BOTH directions + re-undo restores;
       unrecoverable case asserts edited draft in NEITHER letterCurrent NOR letterPrevious after fresh gen
       (deep-equal AND exact-text). Real routes, no hardcoding/weakening. Builder's full suite 1008/1009 =
       documented fit-ui @fontsource flake (isolated re-run 4/4), not a regression (test-only change).
       DEFERRING merge + full integration baseline to one clean gate after T34/T41 land (avoids concurrent-
       vitest contention with the two live builders).

[0064] T41 — VERIFY (pre-integration, on worktree branch): PASS pending merge + MECHANICAL scope-amendment
  decision: hold-merge-until-batch-drains; amend declared files (self-serve, mechanical)
  why: baseSha 7a82be4 IS ancestor, single commit 5bbce5c. Scope: 7 declared files as-authored PLUS two
       undeclared: src/client/document/sampleResume.ts + test/api.profile-settings.test.ts. JUDGED legitimate
       required-field cascade, NOT gaming: adding NOT-NULL Profile.voiceSources (correctly required — the DB
       column always returns []) forces every Profile literal to carry it (sampleResume SAMPLE_PROFILE) and any
       full-body equality test on /api/profile to include it (api.profile-settings). BOTH diffs are one-liners
       that STRENGTHEN assertions (toMatchObject gains a key; toEqual({...payload,voiceSources:[]})) — no
       assertion deleted/loosened. No overlap with concurrently-running T34's files -> no batch merge-conflict
       risk. Amended T41.files to include the two cascade files (mechanical scope-contract correction, not a
       semantic oracle change). Core diffs CLEAN: voice_sources json notNull default [] (links idiom), voiceSourceZ
       rejects cut 'other' kind, VOICE_SOURCES_CAP=5, profileInput .max(CAP).optional() secondary guard, migration
       ALTER ... DEFAULT '[]' NOT NULL + journal 0007, drizzle-kit generate NO-OP (builder-confirmed). Builder full
       suite 1017 pass (1 fit-ui flake, isolated green). DEFERRING merge + integration baseline to the post-T34
       clean gate.

[0065] T34 — VERIFY (pre-integration, on worktree branch): PASS
  decision: continue
  why: baseSha ancestor, commit b1f641d, scope CLEAN (6 declared files). Gaming read CLEAN: no resume structural
       affordance (grep = comment only); api.ts wires 4 real routes correct methods; disabled bound to readOnly
       prop (+isPending). e2e rigorous+non-vacuous (pre-edit baselines; markers+PATCH200; artifact via canvas
       pixel-diff AND downloaded-PDF extractPdfText marker; reload persist verbatim AND !=baseline; 4 individual
       .toBeDisabled(); locked PATCH->409 + GET byte-identical; 0 page/console errors). Before/after-lock contrast
       proves disabled+wiring real.
  evidence: .ailoop/evidence/T34.txt

[0066] INTEGRATION GATE — merged T33+T41+T34 into main; merged tree e0270cd
  decision: continue
  why: all three branches forked from 7a82be4 with mutually DISJOINT files -> T33 ff, T41 & T34 clean ort
       auto-merge (no conflicts). Full baseline on merged tree: check 0 / build 0 / lint 0 / vitest 78 files
       1021 pass (+16: T33 4, T41 boot/unit 12; T34 e2e is playwright). Cross-ticket integration risk CLEARED:
       T41's required Profile.voiceSources typechecks against T34's merged client components. No flake this run.

[0067] PHASE 3 — CLOSE (phase oracle green on merged tree e0270cd)
  decision: close-phase
  why: P3 tickets T31/T32/T33/T34 all done+integrated. P3 oracle (oracle.md): vitest+playwright green — per-part
       resume PATCH 400/409 (T31), letter paragraph PATCH+insert/remove+blank (T32), overwrite+one-level-undo
       both docs (T33), editing UI + locked read-only e2e (T34). bunx playwright test --project=applications
       -> 5/5 PASS incl. new in-place-editing test (applications.spec.ts:700) + design.spec locked-read-only.
       T41 (P4) rode this integration; P4 NOT drained (T42-T45 remain).

[0068] PRUNE — P3 closed, batch merged: remove worker branches + worktrees for T33/T34/T41
  decision: continue
  why: phase oracle green -> no gate-red bisection needs the branches. Pruning worktree-agent-{a0affc2..,a31b627..,
       a0308e360..} branches + worktrees. chunk dispatches so far: 5/20.

[0069] T42 — PRE-DISPATCH refinement: declared-files amendment for the plainText move
  decision: refine ticket before dispatch (planning, not mid-flight amendment)
  why: T42 resume-freeze must store text EXACT-EQUAL to plainText(current,profile) — so the server must call the
       SAME pure fn, not a re-impl (drift risk). plainText lives at src/client/document/plainText.ts; server
       tsconfig includes only src/server/** with no @client alias, and server->client import is a layering
       violation. plainText imports only @shared/types (pure) and is contract-layer material. Decision: MOVE it to
       src/shared/plainText.ts, update its one importer src/client/document/download.ts. Amended T42.files with
       both; the old client path stays declared (removed by the move). Anti-cheat unaffected.

[0070] T42 — dispatch (attempt 1) — single builder, worktree, baseSha e0270cd
  decision: continue
  why: 1st P4 flag ticket (flag-voice frozen copy + delete + resume plainText freeze + cap + locked-permitted).
       Deps T41+T21 done. Files pre-amended for the plainText client->shared move (ledger 0069). Anti-cheat cruxes
       (red-teamed at intake): frozen AFTER mutation (edit/regen/re-tailor -> source byte-identical); resume freeze
       EXACT-EQUAL plainText (deep string, not includes) + unchanged after re-tailor (true snapshot); locked-
       permitted BOTH kinds -> 200; 6th flag -> exact 409 {error:'voice_cap'}, length stays 5, 6th text NOWHERE
       (no ring-buffer evict); DELETE by id. chunk dispatches: 6/20. T43 serialized (shares applications.ts).

[0071] T42 — JUDGE attempt 1: ACCEPT (independent re-verify green on merged main ad39d47)
  decision: continue
  why: baseSha ancestor, commit ad39d47, plainText moved client->shared VERBATIM. One overflow test/ats-view.test.tsx
       = legit move-cascade (import-path-only, 2nd importer in test/ my pre-amend grep missed; assertions untouched)
       -> files amended. Gaming read CLEAN: flag-voice .strict() body, cap-before-append 409 {voice_cap} no-evict,
       NO locked gate (locked-permitted), frozen string snapshot, rowToProfile null-bridge; delete 404s missing id.
       INTEGRATION baseline on HEALTHY main: check 0 / build 0 / lint 0 / vitest 79 files 1031 pass (+10) — ats-view/
       boot.smoke/fit-ui all GREEN, confirming builder's 7 worktree failures were unhealthy-worktree-node_modules
       artifacts (missing .bin/tsx + @fontsource ENOENT), NOT regressions. Merged --ff-only; worktree pruned.
       P4 1/5 (T42). chunk dispatches: 6/20.
  attempt: 1/3
  evidence: .ailoop/evidence/T42.txt

[0072] T43 — dispatch (attempt 1) — single builder, worktree, baseSha ad39d47
  decision: continue
  why: P4 voice-conditioning (voice reaches BOTH docs' composition input; excluded from grounding; absent-voice
       byte-identical). Deps T41/T02/T13 done. Verified seams: letter path ALREADY plumbed (buildLetterUserPrompt
       appends voice block T02; tailorLetter/decideLetter carry voice?) -> only route-wiring needed; RESUME path has
       NO voice (buildUserPrompt/decide/attempt/tailor) -> main code work. /tailor loads profileRow; /generate-letter
       does NOT (must add). CRITICAL anti-tautology: golden byte-identity captured from PRE-T43 source literal (NOT
       self-generated); FixtureEngine-replay labelled KEYING-only (matches hashKey(jd,entries), never calls
       buildUserPrompt). E2E spy captures ACTUAL route-composed message contains voice block on BOTH surfaces;
       fabrication e2e: voice-only number echoed by spy decision -> FabricationError from orchestrator (proves voice
       never in grounding args). chunk dispatches: 7/20.

[0073] T43 — JUDGE attempt 1: ACCEPT (independent re-verify green on merged main 5a03f1b)
  decision: continue
  why: baseSha ancestor, commit 5a03f1b, scope CLEAN (3 files; letter-prompt.ts correctly untouched — T02 seam
       already complete). BYTE-IDENTITY confirmed by diff inspection: buildUserPrompt no-voice branches identical to
       pre-T43, only voice-present case new; tailor() does NOT pass voice to validateNoFabrication. GOLDEN test uses
       hardcoded pre-change literals (not self-generated), asserted char-for-char + undefined/null/"" variants; KEYING
       check labelled non-proof; e2e SpyEngine through REAL routes shows voice block on both surfaces (present) /
       neither (absent); fabrication e2e: voice-only 918273 -> FabricationError both docs. INTEGRATION baseline:
       check 0/build 0/lint 0/vitest 80 files 1043 pass (+12), all existing fixture replays green. Merged --ff-only;
       worktree pruned. P4 2/5. chunk dispatches: 7/20.
  attempt: 1/3
  evidence: .ailoop/evidence/T43.txt

[0074] T44 — dispatch (attempt 1) — single builder, worktree, baseSha 5a03f1b
  decision: continue
  why: P4 voice UI (flag affordance on outputs + ProfileEditor voiceSources list/delete + retroactive-import e2e).
       Deps T42/T43/T34 done. COARSE — invited tooBig. Seams: flag-voice/delete client fns+hooks DON'T exist yet
       (add to api.ts/useApplications.ts); ProfileEditor links-list idiom :166-222 to replicate (NO paste-in add —
       tripwire); ApplicationDetail letter+resume surfaces (flag buttons, enabled-when-locked). Blank-letter UI
       affordance may need adding (retroactive-import entry). Anti-cheat: e2e CLICKS real affordances (not API
       backdoor), fresh /api/profile fetch (not cache), EXACT-equal literal incl. part-join delimiter; flag-on-locked
       clicks the button; delete verified server-side after reload. chunk dispatches: 8/20. T45 (key-gated) will be
       coordinator-run in parallel (disjoint: scripts/+fixtures vs client/+e2e).

[0075] T45 — JUDGE: ACCEPT (KEY-GATED, coordinator-run per T05 precedent; committed main 5180ba4)
  decision: continue
  why: worktrees lack .env so key-gated live recording is coordinator-run (as T05 was). Wrote scripts/eval-voice.ts
       (key-gate hard-exit, temp 0 pinned both runs + recorded, generateObject direct to capture usage while reusing
       REAL buildUserPrompt/buildLetterUserPrompt + assemble). Typecheck exit 0 (out-of-band tsconfig, removed after);
       biome clean. LIVE gemini-2.5-flash: resume selection+order IDENTICAL position-for-position (rules-engine#1|
       platform-sdk#2|frontend-rewrite#3 both runs) + cut identical; phrasing differs (summary + 3/3 items); letter
       grounding identical + phrasing differs. Provenance script-written, usage 13872 tok (un-fakeable). Register
       verdict AFFIRMED (judged): voice-ON terse/blunt ("Hello,"/"Thank you,", short declaratives) vs OFF corporate;
       ~30k/~50% verbatim -> fact-lock intact, voice = phrasing only. Baseline on 5180ba4: check 0/lint 0/vitest 80
       files 1043 pass. Committed only the 3 declared files. P4 3/5 (T42,T43,T45). chunk dispatches: 8/20 (T45
       coordinator-run, not a worker dispatch).
  evidence: .ailoop/evidence/T45.txt

[0076] T44 — JUDGE attempt 1: ACCEPT (independent re-verify green on merged main cc27a74)
  decision: continue
  why: baseSha ancestor, commit 250679f. Scope: declared queries.ts path was an intake TYPO (real file
       src/client/hooks/queries.ts — builder touched the real one); amended. Gaming read CLEAN: ProfileEditor
       list+delete only (NO paste-in tripwire); flag buttons NOT locked-gated (stay enabled on locked),
       create-blank-letter locked-gated, voice_cap surfaced; 3 e2e rigorous (retroactive-import via REAL affordances
       + fresh-fetch exact literal w/ \n\n join; locked-flag real 200 + count delta; delete server-side via reload+
       fetch). INTEGRATION: check 0/build 0/lint 0/vitest 80 files 1043. Merged --no-ff (disjoint from T45). Worktree
       pruned. P4 4/... done. chunk dispatches: 9/20.

[0077] PHASE 4 — CLOSE (phase oracle green on merged tree cc27a74)
  decision: close-phase
  why: P4 tickets T41/T42/T43/T44/T45 all done. P4 oracle (oracle.md): vitest + playwright green + one key-gated
       recording. vitest 1043 incl. voice-flag (frozen-after-mutation, cap 409, locked-permitted, delete),
       voice-conditioning (golden byte-identity + e2e spy both surfaces + fabrication e2e), boot smoke 0007.
       playwright applications 8/8 incl. retroactive-import (blank->author->flag->exact text), locked-flag-permitted,
       delete-server-side. KEY-GATED T45 recorded live (gemini-2.5-flash, temp 0): voice = phrasing only, selection/
       order + grounding byte-identical, provenance usage 13872 tok, register verdict AFFIRMED. All 5 phases closed.

[0078] FINAL GATE — docker e2e green
  decision: continue
  why: bun run test:docker -> 1/1 pass (dockerized SPA mounts + round-trips /api/* through the authed session,
       27.6s, exit 0). The coverage-map "all" row (docker at final gate) satisfied. Docker was available this env.

[0079] COVERAGE PASS + EPIC CLOSE — Lede v2 (Cover Letters & Authored Capture)
  decision: DONE
  why: scheduler complete:true, 27/27 done, phasesDrained all 5, problems []. Coverage map (oracle.md) re-read
       against SPEC.md: every requirement row maps to a done ticket (P0 T01-05+repairs T02R/T02R2/T04R; P1 T11-16;
       P2 T21-24; P3 T31-34; P4 T41-45) or a green gate; the "all" baseline+docker row green. Out-of-scope tripwires
       all HELD (verified in ticket reviews): no paste-in voice box (T44 list+delete only), no auto-mining, no
       multiple/per-app voices, no letter design axes, no edit history (overwrite+one-level-undo+lock via T33),
       CLAUDE.md standing policies intact (facts-not-tags, fact-lock, react-pdf-only, bounded axes, not-a-tracker,
       keyless-by-default, secrets discipline). No unmapped requirement. Final tree main cc27a74: check 0 / build 0 /
       lint 0 / vitest 80 files 1043 / playwright applications 8/8 / docker 1/1. Chunk: 9 worker dispatches + 1
       coordinator-run key-gated (T45). All worktrees/branches pruned.

---
## RUN 2026-07-10 (post-completion COVERAGE AUDIT — user: "check the spec again and really make sure")
Independent spec-text-vs-code audit: 5 parallel verification agents, one per phase, each ruling every "Done means"
bullet CONFIRMED/WEAK/GAP with file:line evidence (NOT re-reading the intake coverage map — auditing the spec's own
words against delivered code). Results:
  P1: 5/5 CONFIRMED. P3: 7/7 CONFIRMED. P4: 12/12 CONFIRMED (all out-of-scope tripwires HELD).
  P2: CONFIRMED except 1 WEAK — bullet 2A "typography change -> letter preview pixel-diff" not directly asserted
      (covered by MOCKED re-render call-count on format change + a REAL letter-canvas pixel-diff on a TEXT-EDIT
      trigger; design.spec typography pixel-diff hits only the resume). Behavior near-certain (shared format engine)
      but the literal spec pattern is not a single assertion. Recommend follow-up; not seeding (marginal, playwright-
      flake-prone).
  P0: 1 GAP (real, high-value) — bullet 4 "letter-flip contrast, replayed keylessly". VERIFIED by coordinator:
      letterFlipContrast/letterFlipPredicate tested only on SYNTHETIC data (test/evalcore-letter.test.ts);
      manifest.leadingEntryId read by NO test; the flip-over-fixtures assertion exists only in the KEY-GATED
      scripts/eval-letter.ts. -> a hand-edit to a committed fixture (broken lead, or ground-on-everything superset)
      would leave the keyless suite green. Spec explicitly requires "the mechanical assertions replay keylessly".
      Introduced in the earlier P0 chunk (T04/T05/T16 delivered predicate+live+fabrication, none the keyless flip-
      over-fixtures guard). ESCAPED-BUG / under-verification -> seed repair ticket T06.

[0080] T06 — SEED (repair / escaped-bug: keyless letter-flip guard over committed fixtures)
  decision: seed + dispatch
  origin: "repair: P0 coverage-audit gap — no keyless flip/contrast over test/fixtures/letters/*"
  red-team of its acceptance: a lazy builder could assert letterFlipContrast(fixtures)===true alone (weak). REQUIRE
    (a) per-fixture lead assertion (each fixture's LEAD body paragraph groundedOn includes manifest.leadingEntryId),
    (b) pairwise-non-empty-both-directions contrast over the 3 real fixtures, AND (c) a NEGATIVE CONTROL proving the
    test would CATCH a broken fixture (mutate a loaded copy: swap the lead entry / make unions a superset -> assert
    the predicate/contrast FAILS). (c) is the anti-vacuity guard that directly proves the gap is closed. Must READ
    the committed .json files, not inline data.

[0081] T06 — dispatch (attempt 1) — single builder, worktree, baseSha cc27a74
  decision: continue
  why: repair the P0 keyless-flip gap. Test-only keyless addition reusing letterFlipPredicate/letterFlipContrast
       (evalcore.ts) over the committed test/fixtures/letters/*. Acceptance red-teamed (ledger 0080): requires
       per-fixture lead assertion + pairwise-both-directions contrast + a NEGATIVE CONTROL (mutated copy must FAIL)
       as the anti-vacuity guard proving the gap is closed. post-completion repair dispatch: 1.

[0082] T06 — JUDGE attempt 1: ACCEPT (independent re-verify green on merged main 14dfaec)
  decision: continue
  why: baseSha ancestor, commit 14dfaec, scope CLEAN (1 test file; committed fixtures UNTOUCHED on disk). Gaming
       read CLEAN + non-vacuous: reads committed .json+manifest, per-fixture lead via letterFlipPredicate + manifest
       .leadingEntryId assertion, contrast true over 3 real letters, AND two negative controls (wrong-lead ->
       predicate false; superset -> contrast false) on structuredClone copies — positive+negative on the same
       predicates prove a broken/laundered fixture now FAILS the keyless suite. Baseline on merged main: check 0/
       build 0/lint 0/vitest 81 files 1049 pass (+6). Merged --ff-only; worktree pruned. P0 keyless-flip GAP CLOSED.

[0083] ORACLE amendment (escaped-bug rule) + P0 coverage strengthened
  decision: continue
  why: the audited gap = a check too weak (flip verified live/synthetic, never keyless-over-fixtures). Per the
       escaped-bug rule the repair STRENGTHENS the oracle: added a P0 coverage-map row (T06) so the keyless flip
       guard is now part of the definition of done. Note: NO defect shipped in behavior (the fixtures ARE correct —
       T05 recorded them live-verified); this closed a REGRESSION-NET hole, not a live bug.

[0084] COVERAGE AUDIT — CLOSE (all findings resolved or dispositioned)
  decision: DONE (audit)
  why: 5-phase independent spec-vs-code audit complete. P1 5/5, P3 7/7, P4 12/12 CONFIRMED (tripwires held). P0
       gap CLOSED by T06 (keyless flip guard + negative controls). P2 bullet-2A (typography->letter-preview
       pixel-diff) WEAK: dispositioned as a low-severity residual + recommendation to the human (behavior covered by
       shared-format-engine + resume typography pixel-diff + real letter-canvas repaint on content-edit; a direct
       letter-typography pixel assertion would be a playwright addition — not seeded, flake-prone/marginal). Final
       tree main 14dfaec: check 0/build 0/lint 0/vitest 81 files 1049/playwright applications 8/8 (from cc27a74,
       T06 is vitest-only)/docker 1/1. 28/28 tickets done.

[0085] T07 — SEED ONLY (not dispatched) — P2 coverage-audit repair, per user request to backlog it for a later /ailoop
  decision: seed, leave todo
  origin: "repair: P2 WEAK — no direct typography->letter-preview pixel-diff assertion"
  why: user asked to add the P2 fix to the backlog so they can /ailoop it later. Seeded T07 (phase P2, deps T23/T24
       done -> immediately ready, file test/e2e/applications.spec.ts). Red-teamed acceptance: anti-cheat requires the
       pixel-diff on the LETTER canvas ([data-testid=letter-preview]) not the resume .document-preview, a TYPOGRAPHY
       trigger not a text-edit/regenerate, and a painted before-capture (non-vacuous). Verified seam: ApplicationDetail
       hosts BOTH the DesignPanel and LetterPreview on the same resolvedFormat, so the flow is runnable. NOT dispatched
       — left for the human's next /ailoop invocation. Backlog complete flips to false with T07 todo.

---
## RUN 2026-07-10 (resume — build T07, the seeded P2 repair)
Resume reconcile: contract sha256 f6028f… MATCHES SPEC.md (unchanged; T07 is a coverage-audit repair, not a spec
change). Scheduler: 28/29 done, ready [T07], no problems/stale/breaches. Tree clean at 14dfaec, no leftover branches.

[0086] T07 — dispatch (attempt 1) — single builder, worktree, baseSha 14dfaec
  decision: continue
  why: the one ready ticket — P2 repair (typography->letter-preview pixel-diff). Deps T23/T24 done. Cold-start ready
       (verified seam: ApplicationDetail hosts DesignPanel + LetterPreview on same resolvedFormat; mirror design.spec
       Body-font-change + applications.spec letter-canvas toDataURL patterns). Red-teamed acceptance: diff on LETTER
       canvas not resume .document-preview; typography trigger not text-edit; painted before-capture (non-vacuous).
       chunk dispatches: 1/20.

[0087] T07 — JUDGE attempt 1: ACCEPT (independent re-verify green on merged main 41e5fe9)
  decision: continue
  why: baseSha ancestor, commit 41e5fe9, scope CLEAN (1 test file). Gaming read CLEAN — all anti-cheat clauses hold:
       pixel-diff on the LETTER canvas (not resume .document-preview); typography trigger (Body font -> arimo, format
       PUT 200 asserted) not a text-edit/regenerate; painted before-capture (expectLocatorCanvasPainted); poll-until-
       differ. INTEGRATION baseline on merged main: build 0/check 0/lint 0/vitest 81 files 1049. P2 PHASE ORACLE:
       playwright applications 9/9 incl. new title (applications.spec.ts:705). Merged --ff-only; worktree pruned.
       P2 WEAK finding CLOSED. Oracle P2 coverage row annotated with T07.

[0088] COVERAGE AUDIT residuals — FULLY CLOSED
  decision: DONE
  why: both coverage-audit findings now resolved by permanent keyless/e2e guards — P0 gap by T06 (keyless flip+
       contrast over committed fixtures + negative controls), P2 WEAK by T07 (direct letter-canvas typography
       pixel-diff). All spec "Done means" bullets across P0-P4 now backed by non-vacuous tests. 29/29 tickets done.
