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

[0018] T013 — DONE (re-verify green). Merged ab3b61b. Scope clean, gaming pass (real reposition, e2e red-then-green), baseline green (vitest 1071, pw 20/1/34). Ratchet applications 33->34.
  evidence: .ailoop/evidence/T013.txt
[0019] T014 — dispatch (build, SERIAL) · sonnet · worktree · baseSha (post-T013 main) · attempt 1/3 · playwright.config.ts declared
  decision: continue
  why: next ready P0 (F103 docked panels chrome-agnostic).

[0020] T014 — DONE (re-verify green). Merged ef9db33. Scope clean, gaming pass (real top→bottom reposition, z unchanged, chrome-agnostic; e2e 4-corner sampling red-then-green), baseline green (vitest 1071, pw 20/1/37). Ratchet applications 34->37.
  evidence: .ailoop/evidence/T014.txt
[0021] T015 — dispatch (build, SERIAL) · sonnet · worktree · baseSha (post-T014 main) · attempt 1/3 · playwright.config.ts declared
  decision: continue
  why: next ready P0 (F105 tailor failure inline).

[0022] T015 — DONE (re-verify green). Merged ee8a449. Scope clean, gaming pass (onSettled + inline role=alert, no toast; retry red-then-green), baseline green. applications first run flaked on applications.spec.ts:1370 (rail-nav preview-repaint) → project re-run clean 38/38. Ratchet applications 37->38.
  evidence: .ailoop/evidence/T015.txt
  note: extend flake-tolerance — applications.spec.ts:1370 (rail-nav/preview-repaint) is also flake-prone; a playwright project re-run confirms flake-vs-regression, same as vitest isolated re-run.
[0023] T016 — dispatch (build, SERIAL) · sonnet · worktree · baseSha (post-T015 main) · attempt 1/3 · playwright.config.ts declared
  decision: continue
  why: next ready P0 (F106 entry delete two-step).

[0024] T016 — worker stopped mid-run (0 commits, uncommitted work in worktree: EntryCard.tsx, library-crud.spec.ts, library.test.tsx). Resumed via SendMessage to verify scope (library.test.tsx touch), self-check, commit, and report. Not a failure — interrupted session.
  decision: continue (resume)
  why: substantial near-complete work exists uncommitted; resume is cheaper than fresh re-dispatch and preserves it.

[0025] T016 — DONE (re-verify green). Merged 417c595. Scope clean (+necessary library.test.tsx migration, expects 10→13 grew). Gaming pass (ApplicationCard pattern, per-row blur isolation). Baseline green (vitest 1071, pw chromium 24/auth 1/applications 38). Ratchet chromium 20->24.
  evidence: .ailoop/evidence/T016.txt
[0026] T017 — dispatch (build, SERIAL) · sonnet · worktree · baseSha (post-T016 main) · attempt 1/3 · playwright.config.ts declared
  decision: continue
  why: next ready P0 (F107 card overflow/stamp + F110 dark hover).

[0027] T017 — worker STALLED (watchdog, 600s no progress; hung waiting on a self-started background test run). 0 commits; ApplicationCard.tsx never modified (only wrote the e2e test). Incomplete infra stall, not an acceptance failure — no attempt logged. Removed worktree; re-dispatching fresh with explicit "do NOT start background/playwright runs" (the stall cause).
  decision: retry (fresh, infra) 
  why: nothing durable; the hang was self-inflicted background-polling, not a build problem.

[0028] T017 — dispatch (build, SERIAL, fresh) · sonnet · worktree · baseSha 308a752 · prompt hardened: NO playwright/background runs (prior stall cause); implement fix in ApplicationCard.tsx
  decision: continue

[0029] T017 — DONE (fresh attempt, re-verify green). Merged 8f278fe. Scope clean, gaming pass (flex-wrap/nowrap/border-strong; e2e guards ellipsis cheat + dark hover), baseline green (vitest 1071, pw chromium 24/auth 1/applications 41). Ratchet applications 38->41.
  evidence: .ailoop/evidence/T017.txt
[0030] T018 — dispatch (build, SERIAL) · sonnet · worktree · baseSha (post-T017 main) · attempt 1/3 · v4's ONE sanctioned backend change (GET /api/auth/state)
  decision: continue
  why: last P0 ticket (F108 login + OQ8 endpoint).

[0031] T018 — DONE (re-verify green, clean env). Merged 0597125. Scope tripwire CLEAR (server diff = exactly the one GET /api/auth/state). Necessary lockstep +settings-auth.test.tsx. Baseline green (vitest 1077, pw chromium 24/auth 1/applications 41). Initial auth fail was a stale-reused-server artifact (pkill'd → fresh passes); latent retry-fragility flagged for Phase 5.
  evidence: .ailoop/evidence/T018.txt

[0032] PHASE 0 — CLOSED. All 9 tickets (T010-T018) done; scheduler phasesDrained=["P0"]. Merged-tree oracle GREEN (clean full baseline): check 0, lint 0, build 0, vitest 1077/1077, playwright chromium 24 + auth 1 + applications 41. Every F1xx finding delivered: F101(T012) F102(T013) F103(T014) F104(T010) F105(T015) F106(T016) F107(T017) F108(T018) F109(T011) F110(T017).
  decision: close-phase
  why: per-ticket independent re-verify green + merged-tree gate green in a CLEAN environment (stale servers cleared). Phase-0 branches already pruned per ticket (fast-forward/clean merges, no gate-red bisection needed).
  NEW RATCHET FLOOR (Phase 0 gate): vitest >=1077 · chromium >=24 · auth >=1 · applications >=41 · docker >=1.
  RESIDUAL for Phase 5: auth.spec.ts:23 new e2e is retry-fragile against the auth project's stateful DATA_DIR (reuseExistingServer + retries:2) — harden with per-test DATA_DIR isolation in T060/T061.
  OPERATIONAL: pkill stale `bun run start`/tsx servers before auth verification (repeated per-ticket auth runs leave a password-dirtied DATA_DIR that poisons setup:false assertions).

[0033] CADENCE AMENDMENT (mechanical, operator-directed) — "skip mid-loop testing, test at the end."
  User chose: DEFER e2e to phase-close, keep fast guards per-ticket.
  Per-ticket independent re-verify = check + build + lint + full vitest + scope + gaming read (NO playwright).
  Per-phase gate (merged tree, unchanged) = FULL baseline incl. playwright chromium+auth+applications (+docker where required).
  Rationale: definition-of-done per phase is unchanged (full e2e still gates every phase close); only the WHEN moves. The loop's wall-clock cost here is playwright (flakes/stale-server/re-runs), so this is where the speedup lives. Vitest still runs per-ticket as the immediate regression net.
  Consequence accepted: phase-gate red = bisect (no per-ticket e2e attribution); worker branches KEPT until phase gate green (already protocol).
  Scope: applies from P1 onward. oracle.md Baseline-gate section updated.

[0034] T020 — dispatch (build, SERIAL) · sonnet · worktree · baseSha 784b37b · attempt 1/3
  decision: continue
  why: only ready P1 ticket; foundational chrome-merge, every other P1 ticket depends on it.
  cadence: per new amendment [0033], builder self-runs fast gate + its OWN new e2e spec only; full playwright (chromium+auth+applications) + docker DEFERRED to P1 phase-close gate. Independent re-verify per-ticket = fast guards + scope + gaming (no playwright).

[0035] T020 — worker DIED on API ConnectionRefused (infra, transient) mid-implementation ("Now let's implement App.tsx"). 0 commits, no uncommitted work, HEAD still at baseSha 784b37b. NOT an acceptance failure → no attempts entry (per T017-stall precedent [0027]). Removed dead worktree + branch. Re-dispatched fresh.
  decision: retry (fresh, infra)
  why: nothing durable; API death, not a build problem.
[0036] T020 — dispatch (build, SERIAL, fresh) · sonnet · worktree · baseSha 784b37b · attempt 1/3 (dispatch #2/20 this chunk)
  decision: continue

[0037] T020 — DONE (independent re-verify green, fast gate). Merged d60892b (--no-ff into main).
  fast baseline: check 0, build 0, lint 0. vitest in worktree 1073/1077 — the 4 failures are ats-view/fit-ui and are the WORKTREE font-path ENOENT artifact (CLAUDE.md), NOT the concurrency flake: they fail in worktree-isolation too, but pass 8/8 on MAIN at the exact baseSha, and pass 1077/1077 on the merged tree (real env). T020 touches no fit/ATS logic. Post-merge full vitest on main: 1077/1077 exit 0.
  scope: CLEAN — App.tsx, AppShell.tsx(deleted), LoginGate.tsx, workspace.ts (all declared) + playwright.config.ts (registration-only: +|chrome-merge) + NEW test/e2e/chrome-merge.spec.ts (ticket-mandated new-behavior test, same footprint treatment as T018). WorkspaceShell.tsx/NavTabs.tsx declared-but-untouched (fine).
  gaming: CLEAN — chrome-merge.spec.ts assertions are geometric/behavioral (no-header = fixed/sticky ≥90% vw outside rail, tag-agnostic, 4 surfaces + 0 <header>; wordmark bbox ⊆ rail bbox; theme = root-class flip + real bg repaint canvas+card + reversible; logout = server invalidation via full-nav gate + direct 401). No weakened/existence-only checks.
  cadence note: full playwright (chromium+auth+applications) + docker DEFERRED to P1 phase-close gate per [0033]. Builder self-ran chrome-merge.spec 6/6 + spot-checked F103/cohesion/auth/card-bounds green (its claim; authoritative run at gate).
  evidence: .ailoop/evidence/T020.txt
  Pruned worktree+branch (clean --no-ff merge; merge commit preserves per-ticket bisection for the deferred phase gate).

[0038] T021 — dispatch (build, SERIAL) · sonnet · worktree · baseSha d60892b · attempt 1/3 (dispatch #3/20 this chunk)
  decision: continue
  why: ready P1 (rail design F201/F204/F205). Serialized ahead of T024 (both share WorkspaceShell.tsx+ApplicationDetail.tsx — scheduler batched separately).

[0039] T021 — attempt 1 FAILED (independent re-verify). Built work is correct + scope-clean (NavTabs icons/--ring-weak hover; ApplicationDetail zoning/SECTIONS/back-link removed/detail title→editor h1; playwright.config registration; new rail-design.spec). BUT acceptance "on ALL FOUR surfaces the editor h1 is the surface title and the rail holds no duplicate" is NOT met: LibraryView.tsx:108 + SettingsView.tsx:44 still render <h1> title in the rail, and the new spec's title-convention test covers the DETAIL surface only (under-covers the acceptance).
  root cause: intake under-declared T021.files. Coverage map (oracle.md:452) assigns F205 ENTIRELY to T021, but its files list omitted LibraryView/SettingsView. Builder's "T052/T053 will handle it" is wrong — T052=ApplicationDetail(F503/F504), T053=SettingsView format cards(F506), neither touches the title convention.
  RECONCILE (mechanical scope correction, self-serve + ledger): expanded T021.files += LibraryView.tsx, SettingsView.tsx. Definition-of-done UNCHANGED (acceptance already demanded all four; coverage map unchanged) — only the files contract corrected to match. Scope tripwire NOT crossed (these files are in-scope for F205). No new batching conflict (T024 doesn't touch library/settings; already serialized on ApplicationDetail/WorkspaceShell).
  decision: retry (attempt 2) — RESUME same agent (has context + branch b06f3f1) via SendMessage rather than fresh re-dispatch (cheaper, preserves correct work).

[0040] T021 — dispatch attempt 2 (RESUME same agent via SendMessage) · sonnet · same worktree/branch (on b06f3f1) · baseSha d60892b · (dispatch #4/20 this chunk)
  fixNote given: finish library/settings title-convention (h1 rail→editor pane) + extend rail-design.spec to assert one-title convention on ALL FOUR surfaces. Declared files expanded per [0039].
  decision: continue

[0041] T021 — DONE (attempt 2, independent re-verify green). Merged 9fc2db0 (--no-ff).
  fast baseline: check 0, build 0, lint 0. vitest: post-merge full run on main = 2 failed (ats-view x1 + fit-ui x1) → CONFIRMED FLAKE, not regression: each file run INDIVIDUALLY is 4/4 green (fit-ui 3x, ats-view 2x). T021 does touch ApplicationDetail.tsx so fit-ui was a real suspect, but the measurement tests are deterministically green alone; the failure only appears under font-loading concurrency (even a 2-file run of the two flake-prone files together flaked once). Net baseline on main = 1075 stable + 2 flake-floats = 1077.
  scope: CLEAN — NavTabs, ApplicationDetail, LibraryView, SettingsView (all declared, incl. the [0039] expansion) + playwright.config.ts (registration-only, prior commit) + rail-design.spec.ts (new). WorkspaceShell.tsx declared-but-untouched.
  gaming: CLEAN — all-four one-title test iterates 4 surfaces, editor-pane h1==title + rail has no heading duplicating it (role=heading, correctly excludes the legit "Applications" nav link). Icons=svg-per-item, hover=--ring-weak differs-from-resting, SECTIONS label, back-link gone.
  F205 now delivered across all four surfaces (the [0039] gap closed).
  cadence: full playwright + docker deferred to P1 gate. Builder self-ran rail-design.spec 5/5 across surfaces (claim; authoritative at gate).
  evidence: .ailoop/evidence/T021.txt. Pruned worktree+branch.

[0042] ORACLE amendment (mechanical, self-serve) — font-flake protocol sharpened after T021. (a) "Isolation" for flake-confirmation = ONE file at a time, 2-3x; a 2-file run of both flake-prone files can still flake under combined font load. (b) Worktree font ENOENT is a DIFFERENT mode from the on-main concurrency flake — it fails even in single-file worktree isolation, so settle worktree ats-view/fit-ui failures by running on MAIN/merged-tree at the same base, not by worktree isolation. Letter-not-meaning; definition-of-done unchanged.

[0043] T022 — dispatch (build, SERIAL) · sonnet · worktree · baseSha 9fc2db0 · attempt 1/3 (dispatch #5/20 this chunk)
  decision: continue
  why: ready P1 (collapsible rail F207). Serialized ahead of T023/T024 (all three share WorkspaceShell.tsx).

[0044] ZOMBIE RESUME (no-op) — the original T020 worker aea6bb8d47642ad97 (died [0035] on API ConnectionRefused) revived ~2.6h later after the API recovered, found T020 already built+merged (d60892b) and did only READ-ONLY re-verification (reported done, no new branch, no build). Integrity check post-event: main HEAD 9fc2db0 intact, tree clean, no stray worktrees/branches, commit history = coordinator merges only. No durable trace, no backlog action. Likely contributed background CPU load behind T021's vitest timeout-kill (harmless, diagnosed). If it notifies again: same no-op treatment.

[0045] T022 — DONE (independent re-verify green). Merged 5af3345 (--no-ff).
  fast baseline: check 0, build 0, lint 0. vitest: worktree run 4 fail = ats-view/fit-ui font artifact. Post-merge full run on main = 4 fail but a SHIFTED set (engine-single-column NEVER-CUT, fit-ui x2, letter-preview usePDF-loading) → all confirmed FLAKE: each file alone on main = 110/110, 4/4, 5/5. T022 touches only WorkspaceShell/NavTabs (rail collapse) — none of the PDF/engine/letter logic. Net baseline 1077 (the ~4 float shifts across the render-timing family).
  scope: CLEAN — WorkspaceShell, NavTabs (declared) + playwright.config (registration-only) + rail-collapse.spec (new).
  gaming: CLEAN — persistence is window.localStorage only (grep: no fetch/mutation/settings/api write); network-zero assertion captures requests around toggle after networkidle; :has() cross-file section-hide keyed off ApplicationDetail's REAL aria-label="Sections" (:405, verified — not dead code); width/operable/reload/network-zero all asserted (4/4 self-run).
  cadence: full playwright + docker deferred to P1 gate. Builder self-ran rail-collapse 4/4 + cohesion 11/11 + rail-design 5/5 + chrome-merge 6/6 (claim; authoritative at gate).
  evidence: .ailoop/evidence/T022.txt. Pruned worktree+branch.
[0046] ORACLE amendment (mechanical) — flake-prone set is the @react-pdf/@fontsource/fit-ladder FAMILY (ats-view, fit-ui, engine-single/two-column, engine-section-display, letter-preview), membership shifts run-to-run. Per-file isolation remains the sole discriminator; observed-set expansion does not widen tolerance. Definition-of-done unchanged.

[0047] T023 — dispatch (build, SERIAL) · sonnet · worktree · baseSha 5af3345 · attempt 1/3 (dispatch #6/20 this chunk)
  decision: continue
  why: ready P1 (scroll-spy F202 + section-row clarity F209). Serialized ahead of T024 (share ApplicationDetail.tsx+WorkspaceShell.tsx). Prompt flags: fit-ui is "ApplicationDetail fit wiring" + this edits ApplicationDetail → fit-ui failing IN ISOLATION = real regression, not flake.

[0048] T023 — attempt 1: built work CORRECT (scroll-spy F202 + section-row F209; scroll-spy.spec 2/2; scope clean: ApplicationDetail + playwright.config registration + new spec), BUT regresses an existing e2e baseline test: F209 removed rail-collapse-letter testid that applications.spec.ts:1430 (protocol E, section-collapse view-state contract) targets. Builder honestly flagged it; that spec was outside T023 scope. Baseline e2e regression = failed ticket even w/ acceptance green.
  NOTE: the deferred-e2e cadence [0033] means my per-ticket FAST gate cannot catch this — only the P1 phase gate would. Caught here via the builder's flag + static read; fixing at point-of-knowledge rather than deferring a guaranteed-red gate.
  RECONCILE: expanded T023.files += test/e2e/applications.spec.ts (the ticket's own F209 change owns migrating the test that asserts the removed behavior). Resume agent to re-home protocol-E onto section-collapse-<key>, preserving every view-state assertion (standing policy).
  decision: retry (attempt 2, RESUME same agent).

[0049] T023 — dispatch attempt 2 (RESUME same agent) · sonnet · same branch (on 112448f) · baseSha 5af3345 · (dispatch #7/20 this chunk)
  fixNote: migrate applications.spec protocol-E onto section-collapse-<key>, preserve all view-state assertions; restore localStorage/view-state semantics in ApplicationDetail if the F209 move dropped them.
  decision: continue

[0050] T023 — DONE (attempt 2, independent re-verify green). Merged 9b23a71 (--no-ff).
  fast baseline: check 0, build 0, lint 0. vitest render-family flake only. REAL-REGRESSION SUSPECT resolved: fit-ui ("ApplicationDetail fit wiring") failed 1x alone on post-merge main — but 5/5 clean on repeat → the documented low-rate single-file intermittency, NOT a T023 regression (ApplicationDetail +170 lines but fit wiring untouched functionally). ats-view passes alone.
  scope: CLEAN — ApplicationDetail (declared) + applications.spec.ts (declared, [0048] expansion) + playwright.config (registration) + scroll-spy.spec (new). WorkspaceShell declared-untouched.
  gaming: CLEAN — protocol-E migration is testid-swap-only (rail-collapse-letter->section-collapse-letter on trigger+aria-expanded), all view-state assertions kept (localStorage lede.workspace.sectionCollapse.<id>, zero writes, untouched settings.layout/format, pixel-identical preview); no production change (reuses toggleSection handler). scroll-spy.spec independently re-derives 30%-line from raw DOM geometry (not app state/constants), 3 computed fractions, marker-moves assertion, short-last-section escape — genuine anti-hardcode.
  F202 + F209 delivered.
  cadence: full playwright + docker deferred to P1 gate. Builder self-ran protocol-E (1 passed, all assertions) + scroll-spy 2/2.
  evidence: .ailoop/evidence/T023.txt. Pruned worktree+branch.
[0051] ORACLE note (mechanical) — render-family single-file isolation itself flakes at a LOW rate (~1/6 observed for fit-ui). A single isolated pass OR fail is not conclusive; confirm with 3-5 repeated single-file runs. Discriminator otherwise unchanged.

[0052] T024 — dispatch (build, SERIAL) · sonnet · worktree · baseSha 9b23a71 · attempt 1/3 (dispatch #8/20 this chunk)
  decision: continue
  why: last P1 build ticket (F203 scroll restoration + F208 focus/landmarks/heading-order). Prompt asks the builder to explicitly report any testid/attribute removals that break existing specs (pre-empt the pattern from T023/protocol-E).
  note: after T024 done, scheduler will show P1 phasesDrained → run P1 phase-close gate (full playwright chromium+auth+applications + docker) — the deferred-e2e reckoning.

[0053] T024 — attempt 1: F203 core (scroll restoration keyed by location.key, POP-restore ±24px, fresh-nav-top, location.key-independence), focus (h1 focus w/ preventScroll — builder caught a real bug where focus() without preventScroll undoes the restore), single-<main> (already true, verified), and DETAIL heading-order all delivered + scope-clean (App.tsx, WorkspaceShell.tsx, ApplicationDetail.tsx + playwright.config registration + route-transitions.spec). BUT acceptance "heading levels sequential on ALL FOUR surfaces" (P1 gate oracle:370) not met: dashboard/library/settings skip H1->H3 (shared CardTitle=h3 root cause, files out of T024 scope). Builder disclosed + encoded 3 test.fail() markers (machine-checkable, honest).
  RECONCILE: F208 is T024's per coverage map:481 and the P1 gate needs all-four heading order BEFORE it can close — so this must land inside P1, not deferred to the P3/P4 tickets that happen to touch those files (none own heading-order). Expanded T024.files += ApplicationCard, SectionAccordion, SettingsView, ui/card.tsx, route-transitions.spec.ts. Reallocation, definition-of-done unchanged (acceptance already demanded all four).
  decision: retry (attempt 2, RESUME same agent — it already identified the exact files + root cause; cheaper + lower re-analysis risk than a fresh ticket). Mandate: surgical per-surface fix preferred; CardTitle-root allowed only with app-wide heading verification; flip the test.fail markers to real assertions.

[0054] T024 — dispatch attempt 2 (RESUME same agent) · sonnet · same branch (on 44c2aab) · baseSha 9b23a71 · (dispatch #9/20 this chunk)
  fixNote: sequential heading order on dashboard/library/settings (surgical per-surface preferred; CardTitle-root allowed w/ app-wide verify); flip route-transitions.spec test.fail markers to real all-four assertions.
  decision: continue

[0053] T024 — attempt 1: built work CORRECT + scope-clean (F203 scroll restoration, focus mgmt, single <main>, detail heading order; route-transitions.spec 7/7 with honest test.fail() for the gap; found+fixed a real preventScroll:true bug; regression sweep cohesion 11/11 + applications 24/24 green). BUT acceptance "sequential heading order on ALL FOUR surfaces" NOT met: dashboard/library/settings still skip H1->H3 via shared CardTitle (h3, no h2 ahead). F208 = T024 alone per coverage map:481; declared files omitted those 3 surface files + ui/card.tsx.
  RECONCILE (same pattern as T021/[0039]): expanded T024.files += ApplicationCard.tsx, SectionAccordion.tsx, SettingsView.tsx, ui/card.tsx. Definition-of-done unchanged (acceptance already demanded all four). CardTitle fix must be backward-compatible (optional level prop, default h3 — 7 usages, only these 3 surfaces change). Also flip the 3 test.fail() markers to real passes.
  decision: retry (attempt 2, RESUME same agent — has context + branch).

[0054] T024 — dispatch attempt 2 (RESUME same agent) · sonnet · same branch (on 44c2aab) · baseSha 9b23a71 · (dispatch #9/20 this chunk)
  fixNote: heading order on dashboard/library/settings via backward-compat CardTitle level prop (default h3); flip 3 test.fail() markers to real passes; re-run cohesion to confirm CardTitle change is inert elsewhere.
  decision: continue

[0055] T024 — DONE (attempt 2, independent re-verify green). Merged 8db3dbb (--no-ff).
  fast baseline: check 0, build 0, lint 0. vitest render-family flake only; fit-ui + ats-view each 3/3 alone on main → confirmed flake, no regression (CardTitle level change + ApplicationDetail edits did not touch fit/ATS logic).
  scope: CLEAN — App, WorkspaceShell, ApplicationDetail, ApplicationCard, SectionAccordion, SettingsView, ui/card (all declared incl. [0053] expansion) + playwright.config (registration) + route-transitions.spec (new).
  gaming: CLEAN — CardTitle `as` prop defaults h3 (backward-compat; TemplateGallery x2 + TemplatePicker x1 byte-unchanged, verified); route-transitions.spec test.fail() markers FLIPPED to real per-surface assertions (headingLevels() collects all h1-h6 in DOM order, expectNoSkippedLevel asserts step<=1, expectExactlyOneMain, focus poll activeElement===h1 across 4 surfaces). No weakening.
  F203 + F208 delivered across all four surfaces. Builder disclosed: only app-wide heading-role query is library.test.tsx:80 (level-agnostic, green); no testid/attr removed.
  cadence: full playwright + docker deferred to P1 gate (NOW). Builder self-ran route-transitions 7/7 + cohesion 11/11 + dashboard-card 2/2.
  evidence: .ailoop/evidence/T024.txt. Pruned worktree+branch.

[0056] P1 PHASE-CLOSE GATE (merged tree 8db3dbb) — partial results:
  - build: exit 0.
  - vitest (full, on main): 1077/1077 (render-family float, per-file-isolation clean).
  - playwright CHROMIUM: 24 passed / 1 FAILED — library-crud.spec.ts:121 "Edit selected panel ... Escape returns focus to the trigger", failing at line 150 (cleanup: single-click card Delete then expect count 0). BISECTED: fails IDENTICALLY at 784b37b (P0 close) → this is a P0-GATE ESCAPE, not a P1 regression. T016 (F106) made card Delete two-step armed-confirm but never migrated THIS test's single-click-delete cleanup; the P0 gate [0032] reported chromium green and missed it. File byte-identical since P0; no P1 commit touched it.
  - playwright AUTH: auth.spec.ts:23 (the project's only test) failed on first run, PASSED on clean re-run → the documented DATA_DIR/stale-server flake ([0032] residual). Root: reuseExistingServer:!CI reuses a stale password-dirtied auth server; pkill-by-name missed it. OPERATIONAL FIX: free ports 8787-8789 by PORT (lsof -ti tcp:$p | kill -9) before auth, not just pkill-by-name. GREEN after that.
  - playwright APPLICATIONS: 65 passed, exit 0 — ALL deferred P1 e2e green (cohesion, chrome-merge, rail-design, rail-collapse, scroll-spy, route-transitions, F103 docked-panel re-gate, design).
  - docker: pending.
  VERDICT so far: only real gate-red = chromium P0-escape → repair ticket T025. auth flake = operational (ports). Docker next.

[0057] T025 (repair) — red-teamed (mid-flight ticket): a lazy builder could drop the cleanup assertion to green chromium, leaving entry pollution. Added guard: cleanup must retain a toHaveCount(0)/toBeHidden after two-step delete; fix = add the arm step, not remove the check. Escaped-bug strengthening: acceptance requires auditing+migrating ALL single-click delete cleanups in the file (T016 two-step migration was incomplete → the escape).
[0058] T025 — dispatch (build, SERIAL) · sonnet · worktree · baseSha 8db3dbb · attempt 1/3 (dispatch #10/20 this chunk)
  decision: continue
  why: unblocks the P1 gate (only real chromium red). Test-only fix; no production change.

[0059] T025 (repair) — DONE (independent re-verify green). Merged 1dd91e0 (--no-ff). Scope CLEAN (only test/e2e/library-crud.spec.ts). Gaming CLEAN — diff ADDS arm-click + "Confirm delete" click and KEEPS the toHaveCount(0) assertion (red-team guard satisfied); audit found+fixed exactly 1 escape. FULL chromium project re-run on merged main: 25 passed / 0 failed, exit 0 → gate chromium leg GREEN. Pruned worktree+branch.
  P1 gate status: chromium 25 GREEN · auth GREEN (ports-clean) · applications 65 GREEN · vitest 1077 · build/check/lint 0. Only docker remains.

[0060] PHASE 1 — CLOSED. All 6 tickets done (T020 chrome-merge, T021 rail-design, T022 collapse, T023 scroll-spy+section-clarity, T024 scroll-restore+a11y, T025 repair). Merged-tree P1 phase-close gate GREEN on 1dd91e0:
  - check 0 · build 0 · lint 0 · vitest 1077/1077 (render-family float, per-file-isolation clean)
  - playwright chromium 25 · auth 1 (ports-clean) · applications 65 · docker 1 — all exit 0.
  Every F2xx delivered: F201/F204/F205(T021) F202/F209(T023) F203/F208(T024) F206 login-mini-chrome(T020) F207 collapse(T022). OQ1 single-chrome(T020).
  NEW RATCHET FLOOR (P1 gate): vitest >=1077 · chromium >=25 · auth >=1 · applications >=65 · docker >=1.
  DRIFT/notes caught this phase:
   - 3 tickets (T021/T023/T024) had intake-under-declared files vs their all-four-surfaces / existing-behavior acceptance → expanded scope + resumed each (builders flagged honestly). Reconciliations [0039][0048][0053].
   - T023 removed rail-collapse-letter testid (F209) → migrated protocol-E in applications.spec.ts [0048].
   - P0-ESCAPE caught by P1 gate: library-crud.spec.ts cleanup used pre-F106 single-click delete; repair T025 [0057-0059]. The P0 gate [0032] mis-reported chromium green.
   - auth.spec.ts:23 DATA_DIR/stale-server flake: OPERATIONAL fix = free ports 8787-8789 by lsof/kill before auth (reuseExistingServer reuses dirty server). Still recommend per-test DATA_DIR isolation in Phase 5 (T060/T061), residual carried.
   - Oracle amendments this phase: cadence defer-e2e-to-phase-gate [0033]; render-family flake FAMILY + per-file-isolation discriminator + low-rate single-file intermittency [0046][0051]; worktree-ENOENT vs on-main-concurrency modes distinguished.
  Phase-1 branches pruned per-ticket (clean --no-ff merges; no gate-red bisection needed — chromium red was a P0-escape test fix, not integration).

## Chunk — new invocation 2026-07-12 (P2→P5 continuous drive)
[0061] RESUME. Fresh context (compaction). Verified contract sha256 unchanged (e4254fc…). Scheduler: P0+P1 done, complete=false, no problems/cycles/stale/breaches. phasesDrained=[P0,P1] already gated+closed. Ready=[T030]. Operator directive: run all remaining phases continuously to the end, compacting between phases; chunk-cap-as-checkpoint waived by operator — all CORRECTNESS guards (independent re-verify, attempt/thrash caps, phase-close gates) stay. Dispatch is SERIAL (playwright ports 8787-89 collide) per oracle env-adaptation; coordinator self-verifies.
[0062] T030 — dispatch (build, SERIAL) · sonnet · worktree · baseSha 90a1b80 · attempt 1/3 (dispatch #1 this chunk)
  decision: continue
  why: only P2 ready ticket; reshapes the P1 shell for below-lg (bottom tab bar F301). Prompt flags: gone=removed (querySelector===null for rail below-lg AND bar at ≥lg), reuse existing breakpoint hook if present, no drawer.
[0063] T030 — DONE (independent re-verify green). Integrated to main 84e4d42 (builder commit 60bc361 + ledger). Branch t030-responsive-nav linear-merged.
  fast baseline (merged): check 0, build 0, lint 0, vitest 1077/1077 (no flake this run).
  scope CLEAN: playwright.config(registration) + ApplicationDetail + NavTabs + WorkspaceShell + responsive-nav.spec(new). All declared.
  gaming CLEAN: rail/bar absence via count===0 (gone not hidden); useIsBelowLg conditional-render XOR; 44px functional boundingBox; real nav+URL; no-drawer count===0; bar-covers-nothing padding>=barH + elementFromPoint; section-nav folded into editor (distinct testids, scroll-spy locators intact).
  F301 delivered. Full playwright deferred to P2 gate [0033].
  evidence: .ailoop/evidence/T030.txt.
[0064] ENV NOTE (mechanical) — Agent isolation:'worktree' does NOT create a separate worktree here; it falls back to an IN-PLACE branch checked out in /workspace itself (CLAUDE.md "agent worktrees unreliable"). Consequences for the drive: (1) parallel builders are IMPOSSIBLE (shared working dir) → serial is mandatory anyway, matches oracle. (2) After a builder reports, /workspace is left ON the builder's branch with main stale. INTEGRATION PROCEDURE per ticket: commit coordinator bookkeeping on the branch, git branch -f main <tip>, git checkout main, git branch -d <branch>. (3) The verify runs directly on the in-place tree (no merge-then-verify needed); scope/gaming still via git diff baseSha..branch. T030 reconciled this way (main f4e8929).
[0065] T031 — pre-dispatch scope expansion: intake files [ApplicationDetail, WorkspaceShell] omit the e2e target its acceptance (375 overflow e2e) requires. Added test/e2e/phone-overflow.spec.ts (new) + playwright.config.ts (registration-only). Definition-of-done unchanged. Same pattern as P1 [0039/0048/0053].
[0066] T031 — dispatch (build, SERIAL) · sonnet · in-place branch · baseSha eb51899 · attempt 1/3 (dispatch #2 this chunk)
  decision: continue
  why: phone-stacked detail + zero horizontal overflow at 375 (F302). Preview-sheet mechanics deferred to T033 per ticket.
[0067] T031 — builder reported tooBig (HONEST scope-flag, not a failed build): its WorkspaceShell preview-drawer-withheld-below-lg fix + phone-overflow.spec are correct + committed (2f7ac81), but the spec (correctly strict, red-team #13) exposes a REAL pre-existing overflow: .template-thumbnail__canvas (thumbnail.tsx:223, rendered by TemplatePicker on the detail design section) is missing from app.css:90-96's `max-width:100%;height:auto` responsive-canvas rule that its siblings .document-preview__canvas/.letter-preview__canvas already have → ~41px un-clipped overflow at 375 + a clip-cheat wrapper. VERIFIED by coordinator (grep app.css + thumbnail.tsx).
  JUDGMENT: not a real decomposition — one-line additive fix, build already correct. EXPAND T031.files += src/client/styles/app.css and RESUME the same agent (has branch+context). Definition-of-done unchanged (acceptance already demanded zero overflow on detail, which requires this). The pre-existing bug's strengthened check IS phone-overflow.spec itself (no separate escaped-bug ticket; bug predates v4, not a prior-ticket gaming escape). No `attempts` entry (nothing mis-built; not thrash).
[0068] T031 — dispatch RESUME same agent · sonnet · branch t031-phone-overflow (on 2f7ac81) · baseSha 4229b0b · (dispatch #3 this chunk)
  fixNote: add `.template-thumbnail__canvas` to the app.css:90-96 responsive-canvas rule (mirror the siblings); re-run phone-overflow.spec to green; keep the strict walk + whitelist unchanged.
[0069] T031 — DONE (independent re-verify green, resumed attempt). Branch tip a5d3a07.
  fast baseline: check 0, build 0, lint 0, vitest 1077/1077.
  scope CLEAN: WorkspaceShell + app.css([0067]) + phone-overflow.spec(new) + playwright.config(registration). ApplicationDetail declared-untouched.
  gaming CLEAN: app.css one-line sibling-mirror; WorkspaceShell withholds preview toggle+aside below lg; overflow walk red-team #13-strict (exact 375, per-element fail unless whitelisted+genuinely-scrollable, native form controls excluded); only spec change was stacking-assertion correctness fix (single scrollTop=0 getBoundingClientRect, still strict), overflow walk untouched.
  F302 delivered (phone stacked, zero horizontal overflow at 375). Also fixed a genuine PRE-EXISTING TemplatePicker canvas overflow (app.css). Full playwright deferred to P2 gate.
  evidence: .ailoop/evidence/T031.txt.
[0070] T032 — pre-dispatch scope correction: intake declared ApplicationsDashboard.tsx (DOES NOT EXIST). Verified real parent = ApplicationsView.tsx (imports+renders <NewApplication/> lines 16/29/47, owns the card grid lines 51/66); anchored popover lives at NewApplication.tsx:73 (`absolute right-0 top-full z-20 w-[28rem]`). Corrected files = [NewApplication.tsx, ApplicationsView.tsx, new-application.spec.ts(new), playwright.config.ts(registration)].
[0071] T032 — dispatch (build, SERIAL) · sonnet · in-place branch · baseSha f3dffc3 · attempt 1/3 (dispatch #4 this chunk)
  decision: continue
  why: NewApplication inline in-flow panel (OQ7/F304), popover GONE from DOM.
[0072] T032 — DONE (independent re-verify green). Branch tip cdcdc1e.
  fast baseline: check 0, build 0, lint 0, vitest 1077/1077.
  scope CLEAN: NewApplication + ApplicationsView + new-application.spec(new) + playwright.config(registration). All declared.
  DE-MODAL VERIFIED: modal={false} (no overlay/focus-trap/pointer-lock/aria-modal), no portal, no absolute/fixed, old popover classes removed + Radix-unmounted (gone not hidden).
  gaming CLEAN: spec is geometry-based (card y-displacement>0 red-team#11, elementFromPoint no-cover, panel+ancestor position∉{absolute,fixed}, full-width span). Empty-state create path preserved (line 29 dashed card).
  F304/OQ7 delivered. Full playwright deferred to P2 gate.
  evidence: .ailoop/evidence/T032.txt.
[0073] T033 — pre-dispatch scope expansion: intake files [WorkspaceShell] omit e2e target. Added test/e2e/pane-arbitration.spec.ts(new) + playwright.config.ts(registration). Definition-of-done unchanged.
[0074] T033 — dispatch (build, SERIAL) · sonnet · in-place branch · baseSha 773ab38 · attempt 1/3 (dispatch #5 this chunk)
  decision: continue
  why: last P2 build before T034 drains the phase. Owns ≥lg-<xl editor/preview SWAP (no sliver), below-lg full-width preview SHEET (OQ2 sanctioned: Escape+close+focus-managed) restoring the open path T031 withheld, ≥xl proportional preview minmax(384px,~40%). Single-file (WorkspaceShell) + new spec.
