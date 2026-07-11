# Ledger — lede-v4

Append-only journal. How the loop got where it is: every dispatch, every judge
decision and why, attempt counts, decompositions, drift flags, escalations. The
audit trail — distinct from `backlog.json` (forward state) and `oracle.md`
(definition of done). Newest entry at the bottom. Never rewrite history; append
corrections.

## Run header
- **spec:** /workspace/SPEC.md · spec_version 1 · sha256 `e4254fc54d7999972b20ed8210ff28cbd21bbca8a64e5f06e65242d1aaf5881b`
- **started:** 2026-07-11
- **caps:** max 3 attempts/ticket · thrash=2 · chunk=20 dispatches/invocation
- **baseline floor (ratchet):** vitest 1056 · playwright chromium 20 · auth 1 · applications 32 · docker 1
- **toolchain:** bun run check / bun run build / bun run lint / bunx vitest run / bunx playwright test (chromium,auth,applications non-concurrent; docker at P1 chrome gate + P5) — verified runnable at intake (check/lint/build exit 0)

## Journal

<!-- One entry per event. Format:
[<seq>] <ticket|phase|run> — <event>
  decision: continue | retry | decompose | escalate | close-phase | amend-oracle | end-chunk
  why: <one line grounded in the oracle or spec>
  attempt: <n/max>
  evidence: <link or inline check output for done/gate/amend events>
-->

[0001] intake — located SPEC.md (status: locked, spec_version 1); detected toolchain from package.json; verified check/lint/build exit 0 and recorded ratchet floor counts
  decision: proceed
  why: environment preconditions met (git repo, node/bun, keyless fixtures, no API key); all forks resolved (OQ1–OQ8 in Locked decisions), Open Questions empty

[0002] intake — derived oracle.md (locked decisions, scope tripwire, baseline gate, per-phase executable oracles, coverage map) and seeded backlog.json: 33 tickets across P0(9)/P1(5)/P2(5)/P3(6)/P4(8)/P5(2); cross-phase deps encode the de-risk order; late phases seeded coarser per skill guidance
  decision: proceed
  why: every finding F101–F509 mapped to a ticket in the coverage map; every phase oracle is executable as written

[0003] intake red-team (Stage 1.5) — fanned out 3 sonnet adversaries over P0 / P1-P2 / P3-P5 acceptance ("how would a lazy builder pass without delivering intent?"). ~40 concrete cheats found. Cross-cutting cheats → new "Anti-gaming protocols" section in oracle.md (per-theme resolution; geometry-not-tag-name; gone=removed-not-hidden; swap/collapse=real-layout; no-clip/no-scale overflow; network-zero=all-bodies; 44px=functional; toast=counted-transition-per-item; ratchet=per-file-expect(); test-only=pure-assertions; slow-suites-re-run). Ticket-specific cheats → sharpened acceptance on T012 (wrap-not-clip, pre-wrap-not-pre-line), T013 (non-degenerate), T014 (z-index-only trick fails the gaming read), T015 (retry transition proves onSettled), T016 (per-row isolation), T017 (date verbatim), T018 (keys===['setup'], pure mapper over all codes, restart-safe DB read, GET-fires/no-probe-POST, hidden username display!=none), T020 (geometric no-bar, logout invalidates session, F103 same-assertion re-run), T023 (3 programmatic spy positions, pill on same element), T024 (location.key not pathname, all-four-surfaces), T050 (canvas min-scale, migrated-contract expect() diff), T052 (heading removed not renamed, DOM-order primary-first, F509 typography test added), T054 (SPA-navigate reset, no-storage-write, querySelector===null below xl), T055 (X-not-chevron identity, label positive-equals, multi-line grows), T044 (arrow glyph present + same line-box)
  decision: proceed
  why: scheduler re-validates clean (no problems/cycles); every cheat found is either a self-serve sharpen (letter, not meaning — no semantic escalation needed) or already covered by the shared protocol; acceptance now prefers input→output contrast over existence checks

[0004] env probe — tested the CLAUDE.md worktree warning empirically: fresh worktree lacks node_modules (build ENOENTs); with `ln -s /workspace/node_modules node_modules` the worktree's `bun run check` + `bun run build` exit 0. Playwright binds fixed ports 8787–8789, no concurrency allowed.
  decision: amend-oracle (mechanical) — dispatch model is SERIAL single-ticket in a worktree + coordinator self-verify, NOT the parallel build-phase fan-out (concurrent playwright would collide on ports). Each worker symlinks node_modules step 0. Recorded in oracle.md Environment adaptation.
  why: mechanical (HOW checks run in this env), not semantic (WHAT counts as done is unchanged) → self-serve per amendment tiers. Honors CLAUDE.md "prefer single-agent-on-main for build tasks" while keeping worktree isolation for the scope-check diff base.

[0005] T010 — dispatch (build) · sonnet worker · worktree · baseSha 9f7db25 · attempt 1/3
  decision: continue
  why: first ready P0 ticket (F104 focus-ring); serial dispatch per env adaptation

[0006] baseline re-verify — established TRUE vitest baseline (intake only counted, never ran): full run flakes 1-4 tests (fit-ui/ats-view @fontsource timing); confirmed via isolated re-run (pass 4/4 each). Codified font-flake tolerance + worktree-staleness protocols in oracle.md.
  decision: amend-oracle (mechanical)
  why: HOW the vitest gate is read under this env's documented flake — not WHAT counts as done. Ground-truth baseline 1055-1056 passing.

[0007] T010 — DONE (independent re-verify green). Merged ff to main d3fcec5.
  decision: continue
  why: scope clean (5 declared + test), gaming read pass (real per-theme --ring-weak), full baseline green (vitest 1060+1flake, pw 20/1/32), acceptance 5/5. Ratchet 1056->1061.
  evidence: .ailoop/evidence/T010.txt

[0008] Phase 0 disjoint batch — dispatched T011,T013,T014,T015,T016,T017,T018 as CONCURRENT builders (sonnet, worktrees, baseSha 9f7db25/d3fcec5 main tip). Builders run lightweight self-check (check+lint+their test) only; coordinator runs FULL baseline+playwright serially in verify (no concurrent playwright → no port collision). Dispatches this chunk: 8/20 (T010 + these 7). T012 held (app.css overlap with T011).
  decision: continue
  why: file-disjoint (scheduler batch0); concurrent builds w/o playwright are collision-free; serial verify preserves the port constraint + per-ticket full-suite regression guard

[0009] Phase 0 batch — ALL 7 concurrent builders died on a session usage limit (terminal API error, "resets 3:50pm UTC"). 0 durable commits on any branch. NOT ticket failures (infra, not build) → no attempts logged. Reset T011,T013,T014,T015,T016,T017,T018 → todo; removed dead worktrees. Concurrency (7 simultaneous agents) is the likely trigger.
  decision: amend dispatch model — abandon concurrent fan-out, go STRICTLY SERIAL (one builder at a time). Serial is both the port-collision fix AND the capacity fix. Probing capacity now with a single T011 dispatch.
  why: no durable state lost (resume-safe); serial single-agent load is far below the concurrency that tripped the limit

[0011] T011 — attempt 1 FAILED (baseline regression). Independent full-vitest verify caught ui-foundation.test.tsx:32 ("§12 palette verbatim") failing on the authorized --success change. Builder's self-check (no full vitest) missed it; premature ff-merge rolled back (main → 2f7fb4e). Root cause: intake under-declared T011's footprint (a token-value change must also update the test that pins it). Added test/ui-foundation.test.tsx to T011.files; logged attempt with fixNote. Process fix: run FULL vitest BEFORE merging, not after.
  decision: retry (attempt 2)
  why: the fix itself is correct (spec authorizes --success ≥4.5:1); the failure is an incomplete footprint, not a wrong approach — re-dispatch with expanded scope + fixNote. Not thrash (distinct, understood cause).

[0012] T011 — dispatch (build, attempt 2/3) · sonnet · worktree · baseSha 14e2c0f · expanded scope (+test/ui-foundation.test.tsx) · fixNote applied · builder now runs FULL vitest
  decision: continue
  why: re-dispatch after understood regression; process fix — builders run full vitest so regressions surface at the builder, not only at coordinator re-verify

[0013] T011 — DONE (attempt 2, independent re-verify green). Merged (no-ff, 96c87be).
  decision: continue
  why: scope clean (declared+expanded), gaming pass (assertion moved with authorized change, contrast suite added), full baseline green (vitest 1071/1071, pw 20/1/32 incl cohesion). Ratchet 1061->1071.
  evidence: .ailoop/evidence/T011.txt
  note: T011 worker mistakenly ran `git reset --hard` against shared /workspace early on — verified NO damage (uncommitted .ailoop edits intact). HAZARD: future worker prompts must forbid git ops outside the worktree.

[0014] T012 — dispatch (build, SERIAL) · sonnet · worktree · baseSha c5b7fe9 · attempt 1/3 · git-safety hardening added to prompt
  decision: continue
  why: next ready P0 ticket (F101 ATS wrap); app.css free after T011 merged. Builder runs full vitest.

[0015] T012 — verify: playwright.config.ts touched (undeclared). Judged ACCEPTABLE — the applications project uses explicit-regex testMatch; the new ats-view.spec.ts requires registration; diff is registration-only (adds `ats-view` to the alternation, nothing else). Mechanical amendment: test-registration-only config edits are in-scope (oracle.md). Added playwright.config.ts to T012.files. app.css fix genuine (pre-wrap + overflow-wrap + word-break + mono; gaming pass).
  decision: amend-oracle (mechanical) + accept scope
  why: HOW new e2e specs get discovered in this repo — not WHAT counts as done. Recurs for T013-T017.

[0016] T012 — DONE (independent re-verify green). Merged eb16ea7.
  decision: continue
  why: scope clean (app.css + new e2e + registration-only config), gaming pass (real pre-wrap fix, e2e red-then-green), full baseline green (vitest 1071+flake, pw 20/1/33). Ratchet applications 32->33.
  evidence: .ailoop/evidence/T012.txt

[0017] T013 — dispatch (build, SERIAL) · sonnet · worktree · baseSha f85e477 · attempt 1/3 · playwright.config.ts declared (registration)
  decision: continue
  why: next ready P0 (F102 gallery reposition, temporary). Serial handles the shared playwright.config.ts registration without conflict.
