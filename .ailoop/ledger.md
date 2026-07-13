# Ledger — Lede v5 (Rail chrome polish)

Append-only journal. Newest at the bottom.

## Run header
- **spec:** SPEC.md · spec_version 1 · sha256 4b70505a8b611fca05d341ca3d0de343b72359e47a3050e4124f12af1283adb2
- **started:** 2026-07-12
- **caps:** max 3 attempts/ticket · thrash=2 · chunk=20 dispatches/invocation

## Journal

[0001] intake — seeded backlog (4 tickets: T001 P0, T002+T003 P1, T004 P2), oracle derived, per-phase acceptance written executable
  decision: proceed
  why: every phase oracle is executable as written; env preconditions met (bun 1.3.14, node 22, playwright 1.61.1, git repo, keyless/fixtures); typecheck baseline green at HEAD 252c26f

[0002] intake — environment adaptation (mechanical)
  decision: amend-oracle
  why: project CLAUDE.md contraindicates ailoop's worktree fan-out (stale branches, in-worktree build font ENOENTs) and forbids concurrent Playwright suites; v5 is serial anyway (all tickets share App.tsx). Builders dispatched single-agent serially on main; coordinator re-verifies on the same tree, scope via `git diff --name-only HEAD`, commits on accept. Recorded in oracle.md "Environment adaptation".

[0003] intake — Stage 1.5 acceptance red-team (fresh cold agent, spec+backlog only)
  decision: amend-oracle (sharpen acceptance, pre-build)
  why: 9 gaming holes found & folded into ticket acceptance — T001: "operable" now asserts theme/logout are functionally live (not dead buttons) + overflow-mask guard covers hidden/clip/scroll on both axes; T002: hover assertion now requires resting!=hovered (blocks always-ring-weak bg); T003: focus-ring must be non-zero/visible (blocks "uniform because all removed") + divider count covers any mechanism (border-t/-b/hr/shadow) + aria-pressed true/false gated + expanded toggle must be right-of the L box; T004: all THREE label groups must fade AND in-step with the width slide (mid-slide both mid-value). Coverage confirmed: all 6 resolved-layout decisions gated. No source read (wording stress only).

[0004] run — intake baseline committed at 3c9f488 (spec lock + v4 archive + .ailoop scaffold). baseSha for T001 = 3c9f488.
  decision: proceed

[0005] T001 — dispatched (dispatch 1/20 this chunk), single-agent on main, model sonnet, baseSha 3c9f488
  decision: continue
  why: only ready ticket; P0 collapsed-rail correctness builds first (de-risk order)
  attempt: 1/3

[0006] RESUME (fresh chunk) — reconcile interrupted T001
  state: contract hash matches (no spec drift); backlog T001=todo; uncommitted changes on main to exactly T001's 4 declared files; prior verify evidence present but UNRELIABLE — captured in a thrashing env (16m vite build, 75m vitest w/ "onTaskUpdate" worker timeouts, 48 unit fails spanning server tests a client-rail diff can't touch) and interrupted mid-e2e at test 24/188.
  decision: keep changes, independently re-verify from scratch (per oracle env-adaptation reconcile path); do NOT trust stale evidence either way.
  scope check: PASS — git diff --stat HEAD = exactly the 4 declared files; new-test helpers pre-exist in workspace.ts (unchanged at HEAD), no undeclared touch.
  gaming read: CLEAN — source diff implements intent (collapse-aware components, 16px icons, tooltips, centered nav); tests GREW +182 (not weakened); overflow measured not masked, "Lede" count 0 while "L" box must stay visible, Radix role=tooltip not native title, theme/logout asserted functionally live.
  re-verify progress: typecheck exit 0 (20s), lint exit 0 (14s); unit + build + e2e pending.

[0007] T001 re-verify — AUTHORITATIVE VERDICT BLOCKED by host overload (environment precondition)
  established (authoritative, load-independent):
    - scope: PASS (exactly 4 declared files; helpers pre-exist in workspace.ts).
    - gaming: CLEAN.
    - typecheck: exit 0. lint: exit 0.
  unit suite: 1076/1079 pass. The 3 failures are all heavyweight TIMEOUTS under load — boot.smoke ×2 (real server subprocess) + fit-ui ×1 (react-pdf render). CONTROL PROOF: boot.smoke run alone = 19/19 pass in 10.8s; T001 is a client-rail-only diff that cannot affect server-subprocess boot, so its under-load boot.smoke failures are load, not regression. Baseline (T001 stashed) ran green only because it caught a momentary idle window.
  host state: /proc/loadavg = 74.56/76.97/77.35 on nproc=10 (~7.5x oversubscribed, external, sustained, NOT recovering). Full-suite runs balloon (collect 2.6s→52s, unit 9.8s→200s+) and heavyweight tests time out spuriously. Playwright e2e (T001's actual Phase-0 acceptance) is the most timing-sensitive check and is unrunnable to a trustworthy verdict at this load.
  decision: DO NOT accept (acceptance unverified — e2e never ran clean), DO NOT fail T001 (failures unattributable to it; code review clean). Leave changes uncommitted on main; resume reconciles. Launched a background monitor to wait for load<15 sustained, then run authoritative build→unit→e2e and capture evidence.
  dispatch count this chunk: 0 new builder dispatches (resume/reconcile only).

[0008] T001 re-verify — load recovered, authoritative e2e launched
  state: /proc/loadavg 1-min back to ~2.6 on nproc=10 (external spike receded). Prior e2e (under load) reached 116/188 then died exit 144 with 2 failures — both 1.0m TIMEOUTS (cohesion scroll-restoration F203; applications rail-collapse v3-T013), consistent with load, not assertion failures — but unconfirmed until a clean run.
  decision: run full e2e regression (chromium+auth+applications) alone, uncontended → .ailoop/evidence/T001-e2e-clean.txt. This is T001's Phase-0 acceptance + the regression guard; the authoritative signal.
  dispatch count this chunk: still 0 new builder dispatches (verify only).

[0009] T001 re-verify — e2e failure ROOT-CAUSED as environment artifact, NOT a T001 regression
  finding: the one fast (non-timeout) e2e failure (library-crud "workspace shell /library degrade") captured DOM = the LOGIN GATE, with T001's own ThemeToggle + "Lede" wordmark rendering fine → T001 code is not crashing. The chromium test server MUST boot with LEDE_AUTH_DISABLED=true + a fresh tmp DATA_DIR (playwright.config.ts webServer A), but reuseExistingServer:true reused a STALE server on 8787 that serves an auth gate → /library never reaches workspace-shell. Earlier "baseline also fails" was INVALID attribution: server kept serving the T001-built dist (never rebuilt after stash), and the poisoned reused server was constant across both.
  root cause: poisoned e2e env — stale auth-enabled servers stuck on reuse ports 8787-8789 (resisted /proc kills) + external host-load volatility. Not code.
  decision: bypass entirely — fresh `bun run build` then full e2e on PORT=9200 (fresh servers, correct env, no reuse) → evidence T001-e2e-freshport.txt. This is the authoritative Phase-0 acceptance attempt.
  dispatch count this chunk: still 0 new builder dispatches.

[0010] oracle — mechanical amendment (Phase 0 collapsed-width check)
  decision: amend-oracle (mechanical, letter not meaning)
  why: "clientWidth === 48" is wrong in letter — border-box makes clientWidth~47 after settle, and a single read right after the state flip races the rail's 200ms CSS width transition. Changed to: poll boundingBox width until settled, assert in [40,64] (the established v4-T022 band); overflow/clip checks run AFTER settle. Intent (collapses to the icon band, no masked overflow) unchanged.

[0011] T001 attempt 1 — re-verify verdict on the CLEAN env (PORT=9200 fresh servers)
  decision: retry (attempt 1/3 failed; not a code defect)
  why: 183 passed / 2 flaky (load, recovered on retry) / 3 failed — the 3 are T001's OWN new tests, and production code is VERIFIED CORRECT: all 4 existing v4-T022 collapse tests pass, T001's wordmark + 16px-icon new tests pass, failure DOM snapshots show proper collapse (L-only, icon-only). Root cause = test bugs: width/center tests race the 200ms width transition (measured 223); tooltip test calls .focus() on an already-.click()ed (already-focused) control so Radix never opens. scope PASS, gaming CLEAN, typecheck/lint/build exit 0, unit 1076/1079 (3 proven load-timeouts).
  evidence: .ailoop/evidence/T001-e2e-freshport.txt (build exit 0; e2e 183 passed, 3 failed = the racy tests)
  attempt: 1/3

[0012] T001 — re-dispatched attempt 2 (dispatch 2/20 this chunk), single-agent on main, sonnet, baseSha 3c9f488
  decision: continue
  why: fix ONLY the 3 racy/mis-triggered new tests (poll for transition settle; hover not focus-after-click); keep verified-correct production code + all anti-gaming guarantees.
  attempt: 2/3

[0013] SOLE OWNERSHIP established — the other coordinator FORCE-KILLED (human-authorized)
  context: entries [0008]-[0012] + evidence T001-e2e-clean/freshport/a2-verify.txt were the SECOND coordinator (prior invocation, claude PID 2630096, shell-snapshot 1783638) that never terminated. Human's first stop halted its work but left the process idle-alive; it then wrote [0010]-[0012] and launched an attempt-2 verify script. Human authorized a force-kill: SIGKILL 2630096 confirmed DEAD (no revival over 2 checks); its orphaned verify script reaped (zombie); no snapshot-1783638 processes, ports free, .ailoop stable. I (this invocation, claude 2690037) am now the ONLY coordinator.
  reconciled truth: tree = baseSha 3c9f488 CLEAN (I reset all 4 T001 files earlier for clean provenance — this VOIDS [0012]'s "keep the existing production code" premise; the verified-correct source is no longer in the tree). Backlog: T001 status=todo, attempts=1 (the other session never committed an attempt-2 entry). Oracle: [0010] mechanical amendment stands (concur). Acceptance: backlog T001 acceptance sharpened by other session (poll transition + .hover; anti-gaming guards intact) — red-teamed & adopted.
  chunk accounting: dispatch count is PER-INVOCATION; [0012]'s "2/20" was the other invocation. THIS invocation's builder dispatches so far = 0.
  decision: re-dispatch T001 as attempt 2 (MY dispatch 1/20). Because the source was reset, attempt 2 rebuilds BOTH source (per ticket context) AND tests (authored correctly, avoiding attempt-1's transition-race + focus-after-click bugs). Single-agent on main, sonnet, baseSha 3c9f488. Independent re-verify by me on fresh servers (PORT=9200 CI=1).

[0014] T001 attempt 2 — ACCEPTED (independent re-verify GREEN) — P0 CLOSED
  builder: attempt 2 (MY dispatch 1/20) returned done, diff confined to the 4 declared files (RailWordmark/NavTabs/RailBottomCluster each own their chrome + read useRailCollapsed; 16px icons; collapsed icon-only + Radix tooltips; p-1.5 collapsed padding). Fixed 2 test-authoring gotchas within rail-collapse.spec.ts (SVG UA overflow:hidden false-positive → gate clip-check on real overflow; tooltip close via Escape not mouse-leave). Its 9/9 rail-collapse claim was only a claim.
  INDEPENDENT RE-VERIFY (sole owner, quiet host loadavg ~0.6-1.5, fresh servers PORT=9200 CI=1):
    - scope: PASS — git diff --name-only 3c9f488 = exactly the 4 declared files.
    - gaming: CLEAN — masking guard intact (scrollWidth>clientWidth catches real+masked overflow; scrollWidth is clip-independent); functionally-live theme(dark class+aria-label flip)/logout(→password gate); Lede-count-0 + L-box-visible; no native title; 16px; center≤2px. Two "fixes" are legitimate, no acceptance weakened.
    - typecheck 0, lint 0, build 0.
    - unit: VITEST_EXIT=0 (full suite, ALL pass — the earlier 3-4 fails were confirmed load-flakes, green on a quiet host).
    - e2e: E2E_EXIT=0, 188 passed (full chromium+auth+applications regression incl. T001's Phase-0 acceptance).
    evidence: .ailoop/evidence/T001a2-{build,unit-final,e2e-final}.txt
  decision: ACCEPT T001, status=done. P0 drained (scheduler) + its phase oracle (rail-collapse acceptance) green within the 188-pass regression → P0 CLOSED. No worker branches (env-adaptation = on-main commits), nothing to prune. Committing the ticket (commit = merge). Scheduler now: ready=[T002] (P1).
  chunk accounting: MY builder dispatches this invocation = 1/20.

[0015] RESUME (this invocation, sole coordinator) — reconciled clean, dispatching T002
  state: contract sha256 MATCHES (no drift); scheduler: complete=false, ready=[T002], no problems/cycles/staleInProgress/capBreaches/thrashBreaches; P0 done+committed at 2e21b68; tree CLEAN. Env-adaptation dispatch model (oracle) stands.
  decision: dispatch T002 (P1) attempt 1 — single-agent on main, model sonnet, baseSha 2e21b68. Independent re-verify by me on the same tree (full baseline + acceptance, scope via git diff --name-only 2e21b68, gaming read), commit on accept.
  chunk accounting: MY builder dispatches this invocation = 1.

[0016] T002 attempt 1 — ACCEPTED (independent re-verify GREEN) — P1 progress (1/2)
  builder: attempt 1 (MY dispatch 1) returned done. Its 18/18 + 9/9 scoped-e2e claim was only a claim.
  INDEPENDENT RE-VERIFY (coordinator, on main tree, baseSha 2e21b68, loadavg ~2.6/nproc10):
    - scope: PASS — git diff --name-only 2e21b68 = exactly the 3 declared files (App.tsx, ThemeToggle.tsx, rail-design.spec.ts). workspace.ts helpers (themeToggleButton/railLogoutButton/railWordmark) pre-existed at baseSha — NOT an undeclared touch.
    - gaming: CLEAN — expanded footer flex-col grouped pair (dropped justify-between); logout+theme w-full justify-start + rail-LOCAL hover:bg-[var(--ring-weak)] (NOT the shared ghost variant — comment documents twMerge/cn winning over hover:bg-accent); aria-label preserved (visible rowLabel is additive); collapsed path untouched; wordmark untouched (quiet logo). Tests GREW +4, anti-gaming teeth intact: resting!=hovered AND resting!=accent-bg; geometry rules out BOTH justify-between (opposite horizontal ends) AND flex-col-justify-between (opposite vertical ends); active nav link still --accent-bg.
    - typecheck 0, lint 0, build 0.
    - unit: VITEST_EXIT=0, 1079/1079 (83 files).
    - e2e: E2E_EXIT=0, 192 passed (full chromium+auth+applications, PORT=9200 CI=1 fresh servers) = T001's 188 + exactly the 4 new T002 tests → new behavior verified AND no regression. (The one "caught error:" line is a deliberate degrade-path test's internal catch, not a suite failure.)
    evidence: .ailoop/evidence/T002-fast.txt + T002-e2e.txt
  decision: ACCEPT T002, status=done. Committing (commit = merge, env-adaptation). No worker branches to prune (on-main model). P1 not yet drained: T003 remains.
  chunk accounting: MY builder dispatches this invocation = 1.
