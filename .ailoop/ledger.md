# Ledger — Lede

Append-only journal. Newest at bottom.

## Run header
- **spec:** /workspace/spec.md
- **started:** 2026-07-01 (intake only — drive not yet authorized)
- **caps:** max 3 attempts/ticket · thrash=2 · budget=TBD

## Journal

[0001] intake — read spec.md; derived oracle.md (locked decisions, scope tripwire,
       per-phase acceptance); seeded backlog (9 Phase-0 tickets + 3 coarse epics)
  decision: proceed to gate check
  why: spec is unusually well-specified; Phase 0 acceptance is the §10 behavioral test

[0002] GATE FAILURE — refuse-to-start (Prime directive #1: oracle before build)
  decision: ESCALATE — do not begin the drive
  why: Phase 0's core behavioral oracle (§10 lede-flip) requires live Claude API
       calls, but ANTHROPIC_API_KEY is not present. type-check + health-check parts
       of the oracle ARE runnable; the behavioral part is not. Starting now would
       build blind against the one check that matters. T009 marked blocked.

[0003] environment finding — worktree fan-out unavailable
  decision: note; not fatal for Phase 0
  why: /workspace is not a git repo, so isolation:'worktree' cannot be used. Phase 0
       is coupled and dispatches single-agent anyway, so this only blocks the fan-out
       path in Phases 1–3. `git init` needed before those phases.

[0004] environment finding — runtime discrepancy
  decision: follow spec (locked decision wins)
  why: spec §2.1 locks Node/Fastify; existing scaffold is Bun/Bun.serve. Node 22 is
       present in the container, so T001 replaces the Bun scaffold to match the spec.

[0005] re-invoked (/ailoop) 2026-07-01 — re-probed preconditions
  finding: ANTHROPIC_API_KEY still ABSENT; /workspace still not a git repo; Node 22
           present; api.anthropic.com reachable (GET→405, expected).
  offered user: (a) provide key → full drive; (b) build-blind partial run of
           key-independent tickets T001–T008; (c) stay stopped.
  decision: user chose STAY STOPPED. No code written. Gate [0002] remains in force.
  why: Phase 0 IS the risk (§12) and its oracle is the §10 lede-flip, unrunnable
       without live claude-opus-4-8 calls. Building blind against the one check that
       matters is the dangerous config the skill forbids. Awaiting the key.

## Run header — v2 (re-intake)
- **spec:** /workspace/spec.md (REWRITTEN 2026-07-01 23:59 — provider-agnostic/BYOK/auth/Drizzle)
- **started:** 2026-07-02 (re-intake; drive not yet authorized)
- **caps:** max 3 attempts/ticket · thrash=2 · chunk=6/invocation

[v2-001] SPEC PIVOT detected — full re-intake, not a resume
  decision: re-intake against the new spec; archive v1 state
  why: spec.md was wholesale rewritten AFTER the v1 oracle (12:31) — at 23:59. v1 was
       Anthropic-only, no-auth, no-Drizzle, 'bullet' unit. v2 is provider-agnostic
       (Vercel AI SDK), BYOK, single-password auth, Drizzle, 'Entry' unit. Old
       oracle/backlog describe a DEAD product. Matches saved memory 'Lede product
       direction' (BYOK+auth now required). Archived oracle.md→oracle.superseded-v1.md,
       backlog.md→backlog.superseded-v1.md (not deleted — audit trail). No code was
       ever written under v1, so nothing lost.

[v2-002] toolchain decision (asked user)
  decision: Bun as package-manager + runner (bun install / bun run / bunx)
  why: user selected it (container is Bun-centric: bun.lock, devcontainer, README).
       MECHANICAL deviation from spec §20's tsx-in-dev-deps; every ARCHITECTURAL lock
       (Fastify not Bun.serve, provider-agnostic AI SDK, Drizzle, better-sqlite3)
       unchanged. Prod Docker will use a Bun runtime image (deviation from §19 node-slim,
       noted in oracle). Second question (drive now vs stop) unanswered — user went idle.

[v2-003] refuse-to-start gate RESOLVED (contrast to v1 [0002])
  decision: preconditions MET — intake proceeds; drive held pending user go
  why: v2 §6.1 introduces a swappable TailorEngine — FixtureEngine makes build/boot/
       test/demo KEYLESS; only the live model-quality eval (T014) needs a key, and a
       Google bootstrap key is now present in .env (§24, GOOGLE_GENERATIVE_AI_API_KEY;
       endpoint reachable). git init done (worktree fan-out now available for E1-E4).
       Node 22, bun 1.3.14, tsc 5.9.3 present. The v1 blocker (no Anthropic key) no
       longer gates: the one key-gated check has its key.

[v2-004] intake seeded + red-teamed
  decision: proceed to pre-flight; HOLD drive for user authorization
  why: oracle.md v2 (locked decisions, scope tripwire, baseline gate + cross-cutting
       invariants, per-phase acceptance) + backlog.json (16 Phase-0 tickets T001-T016
       incl. shared eval-core T016, + 4 coarse epics E1-E4) + schedule.mjs written.
       schedule.mjs: 20 tickets, 0 problems, 0 cycles, T001 sole ready.
       Red-team (3 parallel agents, one per area) hardened acceptance across all
       Phase-0 tickets + epics. Two STRUCTURAL holes closed:
         Finding A (fixture provenance): T013/T014/T015 now share the T016 eval-core
           (one hash/predicate/JD set) + a live-reproduces-fixtures Phase-0 gate — so
           hand-authored fixtures can't make T015 green over a model that never flipped.
         Finding B (secondary-tag alignment): seed's sdk/frontend/delivery tags map 1:1
           to targets, so a tag-scorer would pass the flip — added a TAG-SHUFFLE
           invariance control to T014/eval + T015 as the real facts-not-tags proof.
       Meta-gap: promoted no-tag-scoring, key-leak sentinel scan, and process-level
       boot-refusal into the oracle BASELINE gate (every ticket, all phases) so a
       later phase can't silently regress the kill criteria. Per-ticket hardening:
       contrast checks over existence checks throughout (unique-lowest-rank + mutually-
       distinct leads + oldest-entry-leads anti-recency; sentinel leak checks;
       validate-wired-in-tailor; whole-number-token fabrication; export-excludes-secrets;
       DOM-absence not display:none).

[v2-005] environment finding — Gemini key TESTED (live calls, not just reachability)
  decision: Phase-0 eval model = gemini-2.5-flash; pro deferred (needs billing)
  why: GOOGLE_GENERATIVE_AI_API_KEY validated live: models.list → 200 (39 models);
       structured generateContent (responseSchema JSON) on gemini-2.5-flash → 200,
       returned schema-valid JSON AND correctly repositioned a toy 3-way choice
       (chose the external-SDK entry) — de-risks the generateObject path Phase 0 needs.
       BUT gemini-2.5-pro → 429 RESOURCE_EXHAUSTED ("check your plan and billing") =
       free-tier/no-billing cap. The quality tier is unavailable on this key today.
       Flash is the working Phase-0 eval model; if the §22 flip isn't sharp on flash,
       that's a model-quality result → escalate (enable pro billing / swap provider),
       per spec §22/§25 ("the eval is how you vet a model").

[v2-006] T001 (scaffold) — DONE (drive chunk 1, ticket 1/6)
  decision: accept after independent re-verify + one targeted re-dispatch
  why: builder (sonnet) replaced the Bun.serve scaffold with Fastify+Vite/React on the
       bun toolchain. First submission: check/build/health/scope all green BUT `bun run
       test` exited 1 on 'No test files found' — would break the baseline test gate for
       every later no-test ticket (T002/T003/T006). Resumed the builder (SendMessage) for
       a one-line fix (test script → `vitest run --passWithNoTests`, no dummy test).
       Re-verify green: check 0, build→dist/index.html, test exit 0 on empty, health
       {ok:true}. Scope clean (14 paths ⊆ declared∪manifest). Gaming read clean.
  attempt: 1/3 (with one in-session fix, not a failed attempt)
  evidence: see backlog T001.evidence

[v2-007] chunk-cap override (user instruction)
  decision: drive ALL of Phase 0 to done/escalation this run, not stopping at chunk=6
  why: user explicitly said "continue with the rest of phase 0". The chunk cap is a
       human-checkpoint convenience, not a safety guard — the real guards (attempts,
       thrash, scope/gaming re-verify, oracle gate) stay in force. Batch {T003,T004,
       T006,T009} dispatched via the fan-out workflow (first attempt crashed on an args
       string-vs-object bug in the template; fixed via a local guarded copy at
       .ailoop/build-phase.workflow.js, re-launched).

[v2-008] batch {T003,T004,T006,T009} — DONE (fan-out workflow ww3xmvhzb)
  decision: accept all 4 after independent Verify + merged-tree Gate + coordinator re-check
  why: 10 agents (4 build in worktrees + 4 verify + integrate + gate); all done, 0
       verifyFailed, 0 suspectedGaming, merged clean (no conflicts), gate passed.
       Coordinator re-verify on merged master: check 0, build 0, 25 tests pass (14
       providers + 11 validate), tag-scoring grep clean. T003 sections=§4.3 verbatim;
       T004 resolveModel dispatch correct all 4 providers + apiKey forwarding + google
       env; T006 SEED_ENTRIES=§22 literal; T009 whole-token fabrication + per-entry
       scoping + deep-scan.
  infra fix (coordinator): the workflow left 4 git worktrees under .claude/worktrees/;
       vitest was discovering their test copies (50 count = 25 real ×2). Removed the
       worktrees + merged branches, and hardened vite.config.ts test.exclude with
       '**/.claude/**' so future fan-out worktrees can never pollute the suite. Real
       count now 25. NOTE for future batches: prune worktrees after each fan-out.
  evidence: see backlog T003/T004/T006/T009.evidence

[v2-009] RESUME NOTES (read this on any fresh-session resume)
  - Fan-out: use the LOCAL guarded copy .ailoop/build-phase.workflow.js, NOT the raw
    templates/build-phase.workflow.js — the template crashes on args delivered as a
    STRING (destructures `args` directly); the local copy JSON.parses a string first.
  - Ticket authoring: any ticket whose acceptance needs tests MUST list its test file
    in `files` (else the scope check fails the added test as an undeclared touch).
    Fixed per-wave so far (T004/T005/T007). Config/data tickets are test-exempt.
  - After every fan-out: `git worktree remove --force` the .claude/worktrees/* and
    delete the merged worktree-* branches. vite.config.ts already excludes
    '**/.claude/**' from vitest so a stray worktree can't double the test count.
  - Toolchain = BUN (bun run check/build/test); Phase-0 eval model = gemini-2.5-flash
    (pro is 429/quota). Chunk cap default 6 — user authorized driving ALL of Phase 0
    this session ([v2-007]); a fresh session reverts to the 6-cap unless told otherwise.

[v2-010] batch {T005,T007,T008} — DONE (fan-out workflow wb4vkx7wt)
  decision: accept all 3 after independent Verify + merged-tree Gate + coordinator re-check
  why: 8 agents; all done, 0 verifyFailed, 0 suspectedGaming, merged clean, gate passed.
       Coordinator re-verify on merged master (after pruning 3 worktrees): check 0,
       build 0, 54 tests pass (schema 13 + prompt 9 + assemble 7 + providers 14 +
       validate 11), scope = exactly the 6 declared files, tag-scoring grep clean.
       T005 TailorDecisionZ hand-written + strict meta + facts arity; T007 SYSTEM_PROMPT
       frozen + rephrase policy DERIVED from SECTIONS (flip test) + deterministic
       renderLibrary; T008 assemble server-owns-structure (max-member order, coercion
       override, layout order). Real flip proof still pending the live eval (T014).
  evidence: see backlog T005/T007/T008.evidence

[v2-011] T016 (eval-core) — DONE (single dispatch)
  decision: accept after coordinator re-verify
  why: check/build green, 68 tests (14 new). Closes red-team Findings A+B spine: one
       shared hashKey (order-insensitive), CONTRAST_JDS proven leak-free vs SEED_ENTRIES
       facts (realistic employer JDs, not keyword lists), flipPredicate (leads=group
       items[0] & not cut; rationaleNamesSignal), tagShuffle. No new deps. Scope clean.
  evidence: see backlog T016.evidence

[v2-012] T010, T011 — DONE (single dispatches)
  decision: accept both after coordinator re-verify
  why: T010 engine — check/build green, 78 tests; tailor()=decide→assemble→validate
       (validate wired, contrast test), retry-exactly-once, FixtureEngine miss throws
       NoFixtureError (no fallback), makeEngine factory, generateObject wiring asserted.
       T011 server — 84 tests; real HTTP boot health {ok:true}; POST /api/tailor goes
       through tailor() with distinct 400/422/502 mapping; buildApp() testable. Scope
       clean both.
  evidence: see backlog T010/T011.evidence

[v2-013] *** THE RISK RETIRED — live lede-flip PROVEN on gemini-2.5-flash ***
  decision: proceed to T013/T014/T015; flash is sufficient, NO Pro-billing needed
  why: coordinator ran the ORACLE directly (temp probe over the REAL pipeline —
       ProviderEngine google/gemini-2.5-flash → tailor() → assemble → flipPredicate,
       deleted after) rather than trust a builder's fixtures (guards red-team Finding A
       provenance-gaming). Result over SEED_ENTRIES:
         platform-sdk JD → leads cloudcase-platform-sdk (PASS, rationale names signal)
         rules-engine JD → leads cloudcase-rules-engine (PASS)
         frontend-rewrite JD → leads cloudcase-frontend-rewrite (PASS)
         three leads mutually distinct.
       TAG-SHUFFLE CONTROL (Finding B): leads UNCHANGED under tagShuffle(SEED_ENTRIES) —
       the flip judges FACTS not tags (the anti-Teal proof). This is spec §25 Tier-0 met.
       I now hold ground truth: T013's recorded fixtures + T014's eval must reproduce
       exactly {platform-sdk, rules-engine, frontend-rewrite} or they are gamed/broken.

[v2-014] T013, T014, T012, T015 — DONE (single dispatches)
  decision: accept all after coordinator re-verify
  why: T013 recorder wrote 3 real fixtures + manifest (live), keys=hashKey, replay
       keyless PASS×3 (provenance gate met). T014 eval.ts — coordinator RAN IT LIVE:
       exit 0, base+tag-shuffle all flip, no-key→exit1 (no fallback). T012 client —
       §10 leak invariant (ResumePage renders no leadRationale/cut; sentinel test),
       data-driven order, ATS print.css. T015 keyless e2e — 93 tests pass with key
       UNSET, anti-recency + 422 no_fixture + structure-ignores-tags.
  evidence: see backlog T012/T013/T014/T015.evidence

[v2-015] ===== PHASE 0 CLOSED (16/16 tickets) =====
  decision: Phase 0 COMPLETE — behavioral oracle satisfied; proceed to Phase 1 (E1)
  merged-tree gate:
    - baseline: bun run check PASS, bun run build PASS.
    - keyless regression net: bun run test → 93 tests PASS with GOOGLE key UNSET
      (the §25 keyless guarantee — CI proves the machinery without a key).
    - behavioral oracle (§22/§25 Tier-0 lede-flip + tag-shuffle): PASSED LIVE today on
      THIS exact tailoring pipeline. Evidence: ground-truth probe [v2-013] + T013
      recorder + T014 eval run (coordinator-run, exit 0). git-confirmed: the only files
      changed after the last live pass (commit a1770d3) are src/client/* + tests — the
      tailoring pipeline (src/server/tailor/*, seed.ts, src/shared/*, scripts/eval.ts)
      is BYTE-IDENTICAL, so the live pass holds for the current tree.
    - fixture provenance: fixtures are real live-model output, keyed by hashKey, replay
      keylessly (T013/T015).
  HONEST CAVEAT: a fresh `bun run scripts/eval.ts` at close returned 429
    RESOURCE_EXHAUSTED — Google FREE-TIER DAILY QUOTA is now spent (many live calls
    today). This is a TRANSIENT environment limit, NOT a code/flip regression: the same
    unchanged pipeline passed live earlier today and the keyless net is green. Re-running
    eval.ts after the quota resets (or with Pyro/Pro billing) will re-confirm. Do NOT
    treat the 429 as a Phase-0 failure.
  NOTE (drift): 6 tickets needed a test-file added to their `files` contract mid-flight
    (T004/T005/T007/T010/T011/T012) — the intake under-declared test files. Coordinator
    infra: pruned fan-out worktrees each batch + vite.config excludes .claude/** so stray
    worktrees can't pollute the suite. Workflow template had an args string/object bug →
    fixed in the local guarded copy.

[v2-016] ===== PHASE 1 OPENED — E1 epic decomposed (8 child tickets) =====
  decision: E1 → E1-A..E1-F3; E1 status=decomposed; E2.depends_on rewired to leaves
            [E1-E, E1-F2, E1-F3] (scheduler counts only status==='done' as satisfying
            a dep, so a 'decomposed' parent would never unblock E2).
  children (dependency spine):
    E1-A UI foundation (Tailwind + 15 shadcn primitives + §12 tokens + self-hosted Plex)  deps []
    E1-B Drizzle schema + db + migrations-on-boot + singleton seeding                     deps []
    E1-C drizzle-zod validators (replace hand-rolled entryInput) + profile/settings zod   deps [B]
    E1-D routes /api/entries CRUD+import, /api/profile, /api/settings                      deps [B,C]
    E1-E /api/tailor reads entries+layout from DB; first-boot seeds SEED_ENTRIES          deps [B,D]
    E1-F1 client infra (Query+router+AppShell/NavTabs) + LibraryView browse/delete        deps [A,D]
    E1-F2 section-aware EntryEditor + create/edit (SectionMetaFields/RepeatableList/TagInput) deps [F1]
    E1-F3 ProfileEditor + LayoutEditor                                                    deps [F1]
  red-team baked into acceptance (gameable-resistant contrasts, not existence checks):
    A=no-CDN-font grep on dist; B=fresh-migrate tables+CHECK + real-file restart persist;
    C=client build must NOT bundle better-sqlite3 (shared→db boundary stays driver-free);
    D=secrets-never-leak (settings/entries payload scan) + restart persistence;
    E=tailor reads DB-not-const + non-default layout reorder/disable contrast;
    F1=delete-e2e; F2=one-registry-editor section-switch contrast; F3=profile+layout persist round-trip.
  scheduler after: ready=[E1-A,E1-B]; batches=[[E1-A,E1-B]] (file-disjoint: client-config vs server-db).
  NOTE: partial-batch gate = baseline on merged tree; the FULL Phase-1 behavioral oracle
        (oracle.md §Phase 1) runs at phase close after all 8 children integrate.

[v2-017] E1-A, E1-B — ACCEPTED (batch fan-out, coordinator-gated); + oracle amendment + T016
  decision: accept both after COORDINATOR merged-tree re-verify (the workflow's Gate agent
    errored on a session-limit reset, not a code failure — oracle:null — so I ran the gate).
  gate (merged tree, master @ c927c70): bun run check exit 0; bun run build exit 0
    (dist ships self-hosted IBM Plex woff/woff2, grep dist fonts.googleapis/gstatic -> none);
    bun run test with ALL provider keys unset -> 12 files / 101 tests PASS (93 -> 101: +4
    db.test, +4 ui-foundation.test). Workflow Verify passed both independently (scope clean,
    no gaming); merge clean, no conflicts. Worktrees + branches pruned.
  MECHANICAL AMENDMENT (server runner Bun -> Node/tsx): E1-B's builder flagged, and I
    VERIFIED directly, that `bun src/server/index.ts` fails ERR_DLOPEN_FAILED — better-sqlite3
    is a Node-ABI native addon Bun 1.3.14 can't dlopen (bun#4290), not rebuild-away. Under
    Node v22 (tsx): boots, migrates, /api/health {ok:true}. This is a collision between my
    v2-002 Bun-as-runner deviation and the locked better-sqlite3 dep; the SPEC's own §3.1 says
    "Node >= 20", so reverting the runner to Node is a mechanical correction, NOT a semantic
    change (behavior/stack/architecture unchanged; only the server process runner). Bun stays
    the package-manager + check/build/test runner. oracle.md toolchain note amended + boot
    invariant added.
  ESCAPED-BUG RULE -> repair ticket T017 (depends E1-B): change package.json start/dev:api to
    run under tsx, add tsx devDep, and add test/boot.smoke.test.ts (spawn the REAL entrypoint,
    poll /api/health, assert DATA_DIR .sqlite created) — the real-boot gate the pure-vitest
    baseline lacked. Strengthens the check so a non-bootable runner can't pass again.
  chunk: 2/6 tickets closed this run.

[v2-018] T017, E1-C — ACCEPTED (batch fan-out, workflow Gate + coordinator both green)
  gate (merged tree, master @ dfa0484): bun run check exit 0; bun run build exit 0; bun run
    test keyless -> 13 files / 113 tests PASS. Workflow's own Gate agent passed (oracle.passed
    true) AND coordinator re-confirmed. Verify passed both independently; merge clean; worktrees pruned.
  T017: server runner now Node/tsx (package.json start=`tsx src/server/index.ts`, dev:api=`tsx
    watch ...`, tsx@^4.19.2 devDep); test/boot.smoke.test.ts spawns the REAL entrypoint under
    tsx, polls /api/health -> {ok:true}, asserts DATA_DIR/lede.sqlite created. The boot gap is
    now closed with an executable gate (escaped-bug rule satisfied). check/build/test scripts
    still run under Bun (vitest/node) — unchanged.
  E1-C: entryInput derived via drizzle-zod createInsertSchema(entries); ALL §17 bounds +
    superRefine + entryMetaZ discriminated union + entryImport(max200) preserved; TailorDecisionZ
    stays hand-written; +profileInput/settingsInput (§4.2/§9/§16). schema.test 24 tests green,
    zero regression. CONTRAST held: client vite bundle contains 0 refs to better-sqlite3 — the
    src/shared -> src/server/db/schema.ts import stays driver-free (that file imports only
    drizzle-orm/sqlite-core).
  chunk: 4/6 tickets closed this run. Next ready: E1-D (routes; deps B,C done).

[v2-019] E1-D — ACCEPTED (single-ticket workflow batch; workflow Gate + coordinator green)
  gate (merged tree): bun run check exit 0; build exit 0; test keyless -> 15 files / 126 tests
    PASS (+8 test/api.entries.test.ts, +5 test/api.profile-settings.test.ts). Verify passed
    (scope clean, no gaming); merge clean; worktree pruned.
  routes: /api/entries GET(+?section)/POST(slug §17 if no id)/PUT/DELETE + /import (cap 200);
    /api/profile GET/PUT; /api/settings GET(keySet,provider,model,baseUrl,layout)/PUT — all over
    the E1-B drizzle db, bodies validated with E1-C zod. buildApp() refactored to obtain a db
    (injected for tests) WITHOUT breaking existing server.test.ts.
  LEAK CONTRAST (security-critical, coordinator re-read routes/settings.ts): keySet =
    secrets.apiKeyEnc!=null; the key is never read in this route nor returned. GET /api/entries
    exposes Entry fields only (secrets are a separate table). Both invariant tests green.
  restart persistence: entry written via one app over a tmp DATA_DIR reads back from a fresh
    app on the same real .sqlite. §17 slug generator unit-tested in slug.ts.
  chunk: 5/6 tickets closed this run. Dispatching E1-F1 as the 6th (maximises next-chunk
    unblock: frees E1-F2 + E1-F3).

[v2-020] E1-F1 — ACCEPTED after coordinator mechanical-integration recovery; +workflow-template fix
  workflow Gate came back RED, but NOT a code defect — two mechanical infra gaps:
    (1) the Build worker wrote all files in its worktree but never `git commit`ed them, so its
        branch == master (nothing to merge); the Integrate agent's "merged" claim was empty.
    (2) after merging E1-F1's package.json (adds @tanstack/react-query, react-router-dom,
        @testing-library/react, jsdom), the main tree's node_modules lacked them -> check/test red.
  Trust-the-oracle held: the Gate (real merged tree) caught it though Build+Verify were green on
    the worktree's working dir. Recovery (coordinator, mechanical — not a code patch): staged ONLY
    the scope-clean declared files+manifest on the branch and committed (c108633), merged --no-ff
    into master (46ffdce), ran `bun install`, re-gated GREEN: check 0 / build 0 / test 16 files
    129 keyless. Gaming read: delete-e2e test is rigorous (stateful fetch mock, asserts DELETE URL
    + post-invalidation refetch + only target card removed) — not gamed. No client tag-scoring.
  PREVENTION (build-phase.workflow.js patched, local guarded copy): Build prompt now requires the
    worker to `git commit` its branch (clean status) before reporting done; Integrate prompt now
    runs `bun install` after merging manifest changes and verifies merged files are really on the
    branch. Also .gitignore now ignores data/ (the runtime DATA_DIR artifact).
  ===== CHUNK CAP REACHED — 6/6 tickets closed this run =====
    closed: E1-A, E1-B, T017, E1-C, E1-D, E1-F1. Phase 1 progress: 6 of 8 children done
    (remaining E1-E, E1-F2, E1-F3). Full Phase-1 behavioral oracle NOT yet run (phase not closed).

[v2-021] E1-E, E1-F2 — ACCEPTED (batch fan-out; workflow Gate + coordinator both green)
  gate (master @ d079e3f, keyless): check 0 / build 0 / test 18 files / 138 PASS. Integrator
    correctly merged onto master AND installed deps this time (the v2-020 template patch worked);
    coordinator re-confirmed after bun install. Verify passed both (scope clean, no gaming);
    worktrees pruned (incl. a stray verify worktree in scratchpad).
  E1-E: /api/tailor reads entries + settings.layout from the db (was hardcoded SEED_ENTRIES +
    defaultLayout consts). rowToEntry() preserves the SEED literal key order so hashKey-based
    fixture matching is unaffected (builder self-caught an earlier key-reorder that would have
    silently broken every fixture). CONTRAST reads-db-not-const (200 w/ custom id vs 422) +
    layout reorder/disable both pass. seedIfEmpty(db) = idempotent first-boot seed; injected
    test dbs untouched so existing route tests' row counts hold.
  E1-F2: ONE section-aware EntryEditor for ALL sections (registry-driven CONTRAST passes:
    section switch changes the meta fields). create/edit e2e pass. DRIFT (minor, noted for later
    polish): EntryCard/LibraryToolbar weren't in F2's declared files, so F2 added its own Add
    trigger + edit-picker in LibraryView instead of wiring F1's disabled stub buttons — correct
    + scope-honest, but the UX has two entry points; unify in a Phase-3/4 polish ticket. Client
    §17 validation is a local validate() (not @shared zod import) to keep the Vite bundle
    driver-free; server-side E1-D zod remains authoritative.
  chunk: 2/6 closed this run. Phase 1: 7 of 8 children done — only E1-F3 (ProfileEditor +
    LayoutEditor) remains before the full Phase-1 behavioral oracle can run at phase close.

[v2-022] E1-F3 — ACCEPTED; ===== PHASE 1 CLOSED (8/8 children) =====
  E1-F3: ProfileEditor + LayoutEditor. gate (master @ 6a2a79c, keyless): check 0/build 0/test
    19 files/140 PASS. Verify clean; merged (fast-forward); worktree pruned. Profile round-trip +
    layout-persist contrasts pass; queries.ts extended without clobbering F1/F2.
  ===== FULL PHASE-1 BEHAVIORAL ORACLE (oracle.md §Phase 1) — run on merged tree @ 6a2a79c =====
    [x] bun run check + bun run test pass -> check exit 0; 140 tests PASS keyless (provider key unset)
    [x] migrations run on boot; /api/entries CRUD round-trips AND persists across a server RESTART
        -> test/boot.smoke.test.ts (real Node/tsx boot, migrations ran, /api/health ok) +
           test/db.test.ts (fresh-migrate table set + CHECK) + test/api.entries.test.ts (CRUD +
           rebuild-app-on-same-DATA_DIR restart persistence, real .sqlite)
    [x] POST /api/entries/import + export round-trip Entry[] -> test/api.entries.test.ts (import
        {imported:2} + GET returns them; export = GET /api/entries, entries-only leak contrast)
    [x] LibraryView create/edit/delete e2e via the section-aware EntryEditor -> test/library.test.tsx
        (delete e2e w/ post-invalidation refetch) + test/entry-editor.test.tsx (ONE registry-driven
        editor: section-switch changes meta fields; create POST + edit PUT e2e)
    [x] /api/profile GET/PUT round-trip; settings.layout ordering RESPECTED BY RENDER ->
        test/api.profile-settings.test.ts (profile + settings round-trip) + test/profile-layout.test.tsx
        (editor persists layout) + test/api.tailor-db.test.ts (NON-default layout reorder+disable ->
        assembled TailoredResume.sections order reflects reorder AND omits disabled section)
  All Phase-1 oracle checks GREEN on the merged tree. Test suite grew 93 (Phase-0 close) -> 140,
    all keyless. Cross-cutting invariants intact: no tag-scoring (evalcore/providers green), no
    LLM-checks-LLM, boot invariant (T017) green, secret-leak contrasts (E1-D) green.
  chunk: 3/6 closed this run (E1-E, E1-F2, E1-F3) + Phase 1 closed. STOPPING at the phase boundary
    (natural human checkpoint before Phase 2 = auth/BYOK/crypto, the security-critical phase).
  next: E2 (Phase 2 epic) is now ready — needs decomposition at next intake (like E1 was).

[v2-023] ===== PHASE 2 OPENED — E2 epic decomposed (5 child tickets) =====
  E2 -> E2-A..E2-E; E2 status=decomposed; E3.depends_on rewired to leaves [E2-D, E2-E].
  children (dependency spine):
    E2-A crypto.ts (AES-256-GCM+scrypt) + config fail-fast + test-env setup + boot refusal  deps []
    E2-B auth: scrypt gate + secure-session + guard + /api/auth/{setup,login,logout}         deps [A]
    E2-C BYOK: PUT/DELETE /api/settings/key, validate-before-store, sentinel scan            deps [A]
    E2-D /api/tailor uses decrypted BYOK key (ProviderEngine); no key -> 400 no_api_key       deps [B,C]
    E2-E client: LoginGate + SettingsView + ApiKeyForm(write-only) + Provider/ModelPicker     deps [B,C]
  KEY DESIGN DECISIONS (coordinator, to make Phase 2 keyless-testable without breaking the 140
    existing tests):
    - test/setup.ts (new vitest setupFiles) provides operator secrets (LEDE_MASTER_KEY 32-byte
      base64 + LEDE_SESSION_SECRET) AND LEDE_AUTH_DISABLED=true, so the whole existing suite still
      boots + isn't 401'd. E2-B proves the guard by building an app with auth EXPLICITLY enabled.
    - buildApp(db?, configOverride?) so auth-enabled is testable in isolation.
    - validateProviderKey is an INJECTABLE seam (E2-C) -> validate-before-store is keyless-testable.
    - no_api_key 400 (E2-D) is keyless-testable: LIVE mode + no stored key short-circuits before
      any provider call.
  RED-TEAM baked into acceptance (all from E2 context, gameable-resistant): A=distinct-IV +
    wrong-key-throws + process boot refusal; B=guard-total-with-auth-ENABLED; C=SENTINEL scan
    (key absent from every response/log/DATA_DIR byte, only ciphertext in secrets.apiKeyEnc) +
    validate-before-store + master-key-not-in-DATA_DIR; D=no_api_key short-circuit + no plaintext
    key in logs; E=write-only key form + 401->LoginGate.
  fan-out plan: [E2-A] -> [E2-B, E2-C] (disjoint) -> [E2-D, E2-E] (disjoint). 5 tickets.

[v2-024] E2-A — ACCEPTED (code verified + 4/4 green); flaky-suite defect found -> repair T018
  E2-A gate (master @ 121655a, keyless): check 0 / build 0 / test 21 files / 157 PASS on 4/4
    repeated coordinator runs. crypto (AES-256-GCM distinct-IV + wrong-key-throws + tamper-throws;
    scrypt), config fail-fast (throws on unset/malformed master + missing/short session; no
    auto-gen), boot.smoke extended (real boot w/ secrets + 2 process-level boot-refusal cases).
    Verify passed; merged onto master; worktree pruned. crypto adds NO deps (node:crypto).
  FLAKY DEFECT (workflow Gate caught it; trust-the-oracle): server.test.ts (Phase0) and
    api.tailor-db.test.ts (E1-E) both write temp fixtures into the SHARED test/fixtures/decisions/
    dir from parallel vitest workers; FixtureEngine.loadFixtures parses ALL .json with no per-file
    guard -> a mid-write/mid-delete file throws -> /api/tailor 502 (builder saw 1 fail/157 in run 1,
    green in run 2; coordinator saw 4/4 green — intermittent, ~1 in 2-5). NOT E2-A's code; E2-A only
    shifted timing. Accepted E2-A (its contrasts deterministic + suite green for me) rather than
    hold it hostage to a pre-existing latent race.
  ESCAPED-BUG RULE -> T018 (deps none; touches engine.ts + engine.test.ts only, disjoint from all
    other Phase-2 tickets): harden loadFixtures with a per-file try/catch (skip+warn on partial/
    ENOENT), + a test proving a valid key still resolves alongside a malformed fixture file. Will
    land T018 BEFORE the security-critical [E2-B, E2-C] so their gates are deterministic (a flaky
    502 could otherwise spuriously fail a Verify and mis-attribute a security ticket).
  chunk: 1/6 closed this run (E2-A). Next: dispatch T018, then [E2-B, E2-C], then [E2-D, E2-E].

[v2-025] T018 — ACCEPTED (flaky race fixed); baseline now DETERMINISTIC
  gate (master @ 2e1777d, keyless): check 0/build 0/test 21 files/158 PASS, GREEN across 5 runs
    (workflow 3 + coordinator 2). loadFixtures now per-file try/catch (skip+warn), no whole-scan
    abort. New engine.test case proves a valid fixture resolves next to truncated+empty files.
    No decide()/hashKey change. The security-critical [E2-B, E2-C] will gate on this clean baseline.
  chunk: 2/6 closed this run (E2-A, T018). Dispatching [E2-B auth, E2-C BYOK] next.

[v2-026] T019 (harness), E2-B (auth), E2-C (BYOK) — ACCEPTED; baseline deterministic
  gate (master @ 1f281b1, keyless): check 0 / build 0 / test 23 files / 172 PASS DETERMINISTIC
    across 5 runs (~30s each, zero timeouts). All three merged; worktrees pruned; secure-session
    dep installed in main tree.
  T019 (repair, escaped-bug rule): 2nd harness-determinism defect this chunk (distinct from T018's
    fixture-dir race) — default parallel workers + ~10 full-Fastify-boot suites + boot.smoke tsx
    spawns starved the 5000ms deadline on the contended box; coordinator reproduced (run1=3 fail,
    run2=5 fail, disjoint, all bare timeouts). Fix: vite.config.ts testTimeout/hookTimeout=30000 +
    pool:forks singleFork:true (serial file exec). No product/test-logic touched. Now the loop
    gates on a stable suite.
  E2-B (auth): secure-session + scrypt gate; guard total with auth ENABLED (401 on every
    protected route incl. /api/tailor; /api/health + /api/auth/* public; no-op when
    LEDE_AUTH_DISABLED). setup->409-on-repeat; login->session; logout clears. Coordinator read the
    guard + confirmed exemptions.
  E2-C (BYOK): validate-before-store (reject->400 + ciphertext UNCHANGED; accept->encrypt+store),
    SENTINEL leak scan clean (key only as ciphertext in secrets.apiKeyEnc; absent from every
    response/log/DATA_DIR byte), master-key-not-in-DATA_DIR, DELETE purges. GET never returns key.
  ===== CHUNK CAP — 5 tickets closed this run (E2-A, T018, T019, E2-B, E2-C) =====
    Phase 2: 3 of 5 children done (auth + BYOK storage + crypto/config). Remaining: E2-D (tailor
    uses decrypted BYOK key; no-key->400) + E2-E (client LoginGate/SettingsView/ApiKeyForm). The
    FULL Phase-2 oracle runs at phase close after those. STOPPING at this security checkpoint.

[v2-027] RESUME (2026-07-03) — batch [E2-D, E2-E] interrupted by SESSION LIMIT, re-launched
  First launch (wf_2f13f99c-2f0): build:E2-D completed on branch worktree-wf_2f13f99c-2f0-1
    (2 declared files only: src/server/index.ts + test/api.tailor-byok.test.ts, in scope). Then
    build:E2-E, verify:E2-D, and gate ALL died "session limit · resets 4am UTC" — infra, not ticket
    failure. Nothing merged (master still @ 6dbbfc0). Backlog untouched (workflow never writes it);
    E2-D/E2-E remain todo. No reconciliation needed.
  Limit cleared (04:04 UTC 07-03). Resumed same runId w/ identical args -> build:E2-D cache-hits;
    build:E2-E + verify:E2-D + integrate + gate re-run. E2-D self-report FLAGGED boot.smoke.test.ts
    flaky under box contention (claims pre-existing, reproduced via git stash to base) — NOT accepted
    on self-report; the independent verify (this resume) is what decides.

[v2-028] E2-E — ACCEPTED (independent verify green; scope judgment); merged d992aff
  Verify (branch f71462a): check 0 / build 0 / test 24 files 181 PASS; acceptance
  settings-auth.test.tsx 9/9 (write-only key — ApiKeyForm has no key prop, shows keySet status,
  Save->PUT /api/settings/key, Delete->DELETE, typed key never re-rendered; 401->LoginGate; Provider/
  ModelPicker->PUT /api/settings). Gaming read: clean.
  SCOPE JUDGMENT: verify failed E2-E mechanically for touching test/library.test.tsx (undeclared).
  Coordinator judged it a FORCED, CORRECT cascading fix, not scope creep: App now wraps LoginGate,
  which useQuery-pings /api/settings for 401 detection (the ticket's required design); the existing
  NavTabs test rendered <App/> with no QueryClientProvider and crashed "No QueryClient set". Fix adds
  QueryClientProvider + fetch stub matching the file's two sibling tests; existing assertions
  preserved. The ticket's OWN acceptance ("existing client suites incl. library stay green") cannot
  hold without it -> the declared `files` under-specified. Amended E2-E.files += test/library.test.tsx;
  accepted. (Not an oracle weakening — the acceptance is unchanged and green.)

[v2-029] E2-D — FAILED independent verify (real bug, not gaming); attempt 1 logged; re-dispatched
  Verify caught what the builder's self-report missed (trust-the-oracle). CONTRAST fixture-mode
  assertion (expect 422 no_fixture) gets 502 provider_error DETERMINISTICALLY in isolation. Root
  cause: buildApp decides fixture mode via config.tailorEngine but constructs via makeEngine(), which
  re-derives mode from process.env (NODE_ENV) and ignores the decision; under vitest NODE_ENV=
  development -> makeEngine returns a LIVE ProviderEngine even in fixture mode. Full-suite green was
  SPURIOUS (NODE_ENV=test leaked from other files in the shared singleFork process). Scope clean
  (only the 2 declared files); gaming read: intent genuinely implemented, but the CONTRAST check was
  accidentally order-dependent.
  Re-dispatch fixNote: in index.ts use `new FixtureEngine()` directly for fixture mode (do NOT touch
  engine.ts/makeEngine — other callers rely on its env behavior); harden the test to be order-
  independent (must get 422 with NODE_ENV unset). Single-ticket Sonnet builder in a worktree; I
  re-verify before merge. Verified E2-D isolation must pass: `env -u NODE_ENV bunx vitest run
  test/api.tailor-byok.test.ts`.
  Baseline flakiness note: verify saw `bun run test` flaky 3/5 on the branch (api.auth/boot.smoke/
  api.entries timeouts), but merge-base master ALSO flaked 1/4 (api.tailor-db) -> PRE-EXISTING /
  environmental (heavy concurrent-worktree load during the workflow), NOT an E2-D regression. T019's
  singleFork+30s helps but a contended box under N parallel worktrees still starves real-subprocess
  boot suites. Deterministic checks (check/build + the byok isolation run) are the gate.

[v2-030] E2-D — ACCEPTED (independent re-verify green); merged 9686714
  Attempt 2 fixed the real bug. Scope=2 declared files; gaming clean. check 0 / build 0;
  ISOLATION `env -u NODE_ENV bunx vitest run test/api.tailor-byok.test.ts` = 4/4 (fixture-mode now
  422 no_fixture, was 502 — the exact prior failure, now deterministically green). full suite 185/185.

===== PHASE 2 CLOSED — oracle GREEN on merged tree (master @ 9686714) =====
  All 5 children done: E2-A (crypto/config) + E2-B (auth gate) + E2-C (BYOK storage) + E2-D
  (tailor uses decrypted BYOK key; no key->400) + E2-E (client LoginGate/SettingsView/ApiKeyForm/
  Provider+ModelPicker). Repairs earlier this phase: T017 (Node/tsx runner), T018 (fixture-dir race),
  T019 (harness determinism).
  Phase-2 oracle evidence (bun run test on master, 25 files):
   - 401 gate on /api/* without session -> api.auth.test.ts PASS
   - boot refuses w/o or w/ malformed LEDE_MASTER_KEY + encrypt/decrypt round-trip -> boot.smoke.test.ts
     3/3 (isolation, 2 runs) + config.test.ts PASS
   - PUT /api/settings/key stores ciphertext (validate-first); GET never returns key; no log leak ->
     api.byok.test.ts + api.profile-settings.test.ts sentinel scan PASS
   - /api/tailor no stored key -> 400 no_api_key -> api.tailor-byok.test.ts 4/4 (isolation) PASS
   - full suite 183/185; the only 2 non-green are boot.smoke real-subprocess TIMEOUTS under full-suite
     contention, PASS 3/3 in isolation (documented env flake, [v2-026]/T019) — not a regression.
  check 0 / build 0 on master.

===== CHUNK END — 2 tickets closed this run (E2-D, E2-E) =====
  Healthy checkpoint at the close of the SECURITY-CRITICAL phase (auth + BYOK fully landed & merged).
  This run also absorbed a mid-run SESSION LIMIT (resumed same workflow runId post-reset) and a
  failed-verify repair cycle on E2-D (trust-the-oracle caught a real order-dependent bug the builder
  self-reported as flaky). Backlog: 32/36 done; 2 todo (E3, E4). Scheduler-ready next: E3.
  NEXT RUN: E3 ("Phase 3 — reasoning UI + remaining sections", spec §10/§11) is a COARSE phase-sized
  placeholder, NOT cold-start dispatchable as one ticket. First action next invocation: decompose E3
  into focused tickets (ReasoningPanel renders signals/leadRationale/cut; leadRationale+cut EXCLUDED
  from printed resume DOM; award/certification/publication/interest/language/reference render from
  data) with deps, red-team their acceptance, then fan out. E4 (render polish + Docker) depends on E3.

[v2-031] RESUME — E3 DECOMPOSED (spec §10/§11); red-teamed; batch [E3-A, E3-B] dispatched
  Investigated the tree before splitting: Phase-1 already built the FULL section registry (all 10
  sections), the entryMetaZ discriminated union, SectionMetaFields for all remaining sections, and a
  fully registry-GENERIC assemble()+ResumePage. So "remaining sections" is NOT net-new rendering.
  Two real, file-disjoint units:
   - E3-A (reasoning UI, client-only): ResultView split (ResumePage | ReasoningPanel) + WeightBar/
     Callout/CutList + wire into TailorView + print handling. Net-new; the reasoning data
     (leadRationale/cut/signals) already rides on TailoredResume but nothing renders it.
   - E3-B (remaining sections, server/registry): the ACTUAL gap is assemble.coerceText — for
     rephrase:'none' label sections it returns facts.join(' '), so empty-facts entries (cert/
     publication/reference/interest/language) render BLANK, and TailoredItem carries no meta for the
     client to recover (the code comment promises "from meta downstream" but nothing does it). Fix =
     registry-single-source meta->text formatter consumed by assemble.
  RED-TEAM (sharpened into acceptance): E3-A CONTRAST = DOM-ABSENCE not display:none — non-empty
    distinctive leadRationale/cut strings must be ABSENT from the .resume-page subtree textContent
    (panel must be a SIBLING, not nested); TIMEBOX grep-forbid EventSource/SSE/framer-motion/history
    table/new deps. E3-B CONTRAST = empty-facts cert+reference must render meta-derived text (asserts
    specific meta values), so the current blank behavior FAILS; assemble.test.ts must stay green
    (no weakening). Prefer input->output contrasts over existence checks throughout.
  E4 (Phase 4) depends_on updated -> [E3-A, E3-B]. Scheduler: ready [E3-A,E3-B], one disjoint batch,
    no problems/cycles. No oracle amendment (Phase-3 checks from intake already match).

[v2-032] E3-A + E3-B — ACCEPTED (verified + merged-tree gate green); PHASE 3 CLOSED
  Workflow wf_4a99ea91-5d1: both built, independently verified, merged clean (master 41249cc), phase
  gate 196/196 on merged tree; coordinator re-confirmed merged-tree `bun run check` exit 0.
  E3-A (reasoning UI): 9 declared files only; DOM-ABSENCE contrast real (sentinel strings absent from
    .resume-page subtree, present in reasoning sibling; print.css hides .reasoning-panel); WeightBar/
    Callout/CutList render signals/leadRationale/cut; TIMEBOX grep clean; no new deps.
  E3-B (remaining sections): coerceText facts-else-metaText fallback; registry-owned metaText in
    sections.ts; empty-facts cert/reference now render meta-derived text; model text still ignored for
    rephrase:'none'. SCOPE: touched undeclared test/assemble.test.ts — VERIFY STAGE MISSED IT (a
    workflow-verifier gap worth noting), coordinator caught it independently. Judged a forced cascade:
    the one changed assertion had encoded the very bug being fixed (text===''); now asserts meta text
    — STRENGTHENS, not weakens. Amended E3-B.files; accepted.
  PHASE 3 oracle GREEN (merged tree): ReasoningPanel signals+leadRationale+cut (reasoning-ui 6/6);
    reasoning DOM-absent from print target (reasoning-ui ResultView contrast + resumepage.test.tsx
    renderToStaticMarkup absence); remaining sections incl. empty-facts meta (remaining-sections 5/5).
    Full suite 196/196; check 0. No boot.smoke flake this run.
  CONTINUING (budget 2/12, Docker verifiable): decomposing E4 (final phase) to drive toward drain.

[v2-033] E4 DECOMPOSED (final phase, §10/§12/§19) + Phase-4 oracle RED-TEAM SHARPENED
  Investigated the tree: §12 tokens (tokens.css full palette+shadcn map), Plex @fontsource (imported
  in app.css), ATS-safe print.css, tailwind config — ALL already present. So render polish (E4-A) is
  ~done → a proving test + gap-fill. Two real gaps found:
   - index.ts:139 has a deferred TODO: the server does NOT serve the built SPA (@fastify/static not
     installed). Without it `docker compose up` yields an API with no UI.
   - Dockerfile is a WRONG stale stub: FROM oven/bun + CMD bun run src/main.ts (nonexistent) +
     single-stage + no vite build + EXPOSE 3000. Contradicts locked [v2-017] (server must run under
     Node/tsx, not Bun — better-sqlite3 ABI) and §19 (multi-stage, serves SPA).
  ORACLE SHARPENING (red-team, self-serve — TIGHTENS toward §19 intent, does not weaken): the
    Phase-4 check "GET /api/health ok" was gameable (a UI-less API passes). Added: server serves the
    SPA (GET / -> index.html; /api/* not shadowed) as a keyless check, AND the docker check now
    requires GET / to return the SPA + the image to run under Node/tsx not Bun. oracle.md Phase 4
    updated inline (marked [SHARPENED v2-033]).
  SPLIT (dependency-ordered): E4-A (render polish + proving test, client styles) and E4-B (serve
    built SPA — the index.ts:139 TODO, server + @fastify/static) are file-disjoint → batch together.
    E4-C (Docker/compose/README) depends_on E4-B (the image must serve the SPA E4-B enables). E4-C's
    acceptance runs the LIVE heavy check `docker compose up --build` (Docker confirmed available).
  Dispatching batch [E4-A, E4-B]; E4-C follows after E4-B is judged.

[v2-034] E4-A + E4-B — ACCEPTED (verified + merged-tree gate green); Phase-4 keyless subset done
  Workflow wf_731cca90-c59: both built, verified, merged (master 74a0420); coordinator re-confirmed
  scope (E4-A: only render-polish.test.ts; E4-B: index.ts+package.json+spa-serving.test.ts+bun.lock)
  and merged `bun run check` 0.
  E4-A: styles already matched §12/§10 verbatim; delivered the proving test (render-polish 11/11) —
    §12 token values + shadcn map, @fontsource self-hosted (no CDN), print.css ATS-safe.
  E4-B: implemented the index.ts:139 TODO — @fastify/static serves dist/ with an API-safe SPA history
    fallback; tolerant when dist absent (keyless suite green both ways). spa-serving 8/8 incl. the
    CONTRAST that /api/* is not shadowed. Gate also did a LIVE boot vs real dist: GET / -> SPA,
    /api/health -> {ok:true}. boot.smoke clean (no flake). Full suite 215/215.
  Remaining: E4-C (Docker/compose/README) now ready (depends_on E4-B). Dispatching as a single-ticket
    builder; I re-verify incl. the LIVE `docker compose up --build` boot (Docker available).

[v2-035] E4-C — ACCEPTED (independent LIVE docker re-verify); ===== BACKLOG DRAINED — BUILD COMPLETE =====
  E4-C scope clean (4 declared files); Dockerfile = Node multi-stage runtime (node:22-bookworm-slim,
  npx tsx, NOT Bun per [v2-017]). Coordinator ran `docker compose up --build` itself (host 8899,
  project lede-verify): container booted; GET /api/health 200 {ok:true}; GET / 200 <title>Lede</title>
  + real /assets bundle (SPA served); GET /api/nope 401 JSON (API not shadowed). Teardown clean.
  Merged d4ca2a9.
  FINAL STATE: 37 done / 0 todo / 0 in-progress / 4 decomposed (E2,E3,E4 + early epic). All phase
  oracles green on merged trees. Final master @ d4ca2a9: check 0, build 0, full suite 215/215 real
  signal (one run showed 1 boot.smoke timeout under docker+suite contention; PASSED 3/3 in isolation
  — the documented env flake, not a regression).
  Phase 0 honesty note (unchanged): the key-gated lede-flip eval (T014, scripts/eval.ts, live model)
  is the one non-keyless Tier-0 criterion; the keyless suite proves the machinery over frozen recorded
  fixtures. See earlier ledger for the eval-run record.

[v2-036] BROWSER ACCEPTANCE — semantic amendment (escalation → user approved 2026-07-03); backlog reopened
  Escalation: post-drain [v2-035], user identified that per-phase acceptance was passing on servers
  that were never actually reached by a browser. Phase 4 [v2-033] sharpened toward "GET / returns SPA"
  but a static 200 with no JS bundle would still game it — a UI-less container serving raw index.html
  passes the letter and fails the intent. Per skill "semantic amendments never self-serve" → escalated.
  USER APPROVED (2026-07-03) folding a browser gate into the baseline.
  Scope (user decisions logged):
   - Fold Playwright into baseline `bun run test` (composite: `vitest run` — excluding test/e2e/** —
     then `playwright test`), NOT a separate gate: every worker pays browser-boot cost for strongest
     guarantee. User's call.
   - Phase 0 unchanged: T014's live lede-flip eval already carries the Phase 0 risk; a browser hit
     on /api/health duplicates the existing curl.
  Oracle amendment (see oracle.md "## Browser acceptance"):
   - Phase 1 gains a browser-driven LibraryView CRUD + reload spec across experience/project/
     education/skill.
   - Phase 2 gains a browser first-run → login → protected-route spec with HttpOnly cookie assertion.
   - Phase 4 gains a post-`docker compose up` browser spec: React root actually mounts (non-empty +
     app-shell text), no uncaught console errors, one live /api/* round-trip through the SPA —
     SHARPENS [v2-033]'s "GET / returns SPA" (a static 200 could game it; this can't be gamed by a
     UI-less container).
  Tooling:
   - Playwright MCP installed at user scope (`claude mcp add playwright -s user -- npx -y
     @playwright/mcp@latest`) for coordinator/worker live browser driving during the loop.
   - `@playwright/test` added in-repo (E5-A) as the durable acceptance record; MCP handles inline
     coordinator judgment, specs are the artifact + human-runnable gate.
  Backlog reopens (drain [v2-035] reverted): seeded E5-A (scaffold + Phase 1 CRUD), E5-B (Phase 2
    auth, depends_on E5-A for the scaffold; extracts a session helper for E5-C reuse), E5-C (Phase 4
    docker+browser spec, depends_on both). E5-B and E5-C are file-disjoint after E5-A lands →
    dispatchable as a batch. Escaped-bug rule applies: each spec strengthens the phase-oracle line
    that let a browser-blind ticket previously pass.
  IMPORTANT — this session cannot run the MCP browser tools: MCP servers register at CLI startup, so
  the browser capability appears only after the human restarts Claude Code. All coordinator-only work
  (oracle amendment + ledger + backlog seeding) is done in this session; the E5 build itself runs in
  a fresh session after restart.

[v2-037] E5-A — ACCEPTED (independent re-verify + merged @07848f0). Chunk resumed after restart; MCP
  playwright browser tools now live. Env precondition probed & met: coordinator installed chromium
  (`npx playwright install --with-deps chromium`, cached global ~/.cache/ms-playwright) and confirmed a
  headless launch works — the [v2-036] browser gate is runnable here.
  Dispatched single sonnet builder (worktree). INDEPENDENT re-verify (coordinator ran it, not the
  builder's transcript): check 0, build 0, composite `bun run test` = vitest 215/215 THEN playwright 8/8,
  exit 0. Ran on PORT=18899 because 8787 is occupied by an unrelated /workspace dev server on this shared
  container; playwright.config default (PORT env or 8787) is UNCHANGED and correct for normal CI/dev —
  the collision is a coordinator-env quirk, not a ticket defect. Scope clean (7 declared files; src/ diff
  empty). Gaming read clean: spec drives real chromium vs real Node/tsx server boot, role selectors from
  actual LibraryView/EntryEditor, CONTRAST assertions (edit old text toHaveCount 0; delete toHaveCount 0;
  reload persistence via page.reload). Builder deliberate-break corroborated (8 failed at Create when POST
  /api/entries no-op'd; 8 passed after revert). vitest excludes test/e2e via mergeConfig array-concat
  (configDefaults.exclude preserved) — `bunx vitest run test/e2e/...` → 'No test files found'.
  Escaped-bug rule (Phase 1): the browser-blind gap that let a UI-unreached server pass Phase 1 is now
  closed by library-crud.spec.ts in the baseline composite. Notes: skill/education sections deferred (per
  ticket scope) — experience+project fully covered; auth-disable env var is LEDE_AUTH_DISABLED="true"
  (strict "true", not "1" — config.ts). Builder copied repo's gitignored .env into worktree (tsx
  --env-file needs the file to exist; webServer.env values still take precedence).
  Scheduler: E5-B now ready (E5-C still gated on E5-B). Dispatching E5-B.

[v2-038] E5-B — BROWSER GATE CAUGHT A REAL PRE-EXISTING BUG (Phase 2 auth broken in a real browser).
  The worker built all 3 declared files correctly (playwright.config.ts two-server/two-project array;
  auth.spec.ts; helpers/session.ts) and correctly returned BLOCKED rather than touching src out of scope.
  Its diagnosis, INDEPENDENTLY REPRODUCED by the coordinator on the worktree:
   - src/server/index.ts ~L109 registers @fastify/secure-session with NO `cookie` option. Per RFC 6265
     §5.1.4 the Set-Cookie from POST /api/auth/login gets default-path '/api/auth', so the session cookie
     is NEVER sent to GET /api/settings (LoginGate's post-login ping) or any other /api/* — the app is
     unreachable after login in a REAL browser. All existing tests use Fastify .inject(), which ignores
     cookie Path scoping, so this escaped every prior Phase-2 acceptance. THIS is exactly the browser-blind
     gap [v2-036] was commissioned to expose.
  Coordinator reproduction (PORT=18899, 8787 occupied on this box): unfixed src -> `bunx playwright test`
     = 1 failed (auth) / 8 passed (library); the auth failure is at helpers/session.ts:19 (login form never
     unmounts post-submit — the ping stays 401). Applied the one-line fix `cookie: { path: "/" }` ->
     `bun run test` = vitest 215/215 THEN playwright 9/9 (8 library + 1 auth), composite exit 0. Reverted
     the fix in the worktree (not the coordinator's to land).
  DECISION — fold the repair into E5-B (NOT a separate repair ticket): the fix and its ONLY possible proof
     (a real-browser spec) are one inseparable unit; a standalone repair ticket's behavioral proof could not
     live in its own files (inject can't catch Path). Per skill "blocked -> missing dependency you can order":
     expanded E5-B's declared `files` to include src/server/index.ts for exactly this one-line fix; appended
     an attempts[] entry with the diagnosis + fixNote. Escaped-bug rule satisfied: E5-B's auth.spec.ts is the
     strengthening check that locks the bug out (the sharper, correct-level check the inject suite couldn't be).
  EXECUTION: resuming the SAME worker (has full context + authored the diagnosis) via SendMessage to apply
     its own diagnosed fix and re-verify the composite; coordinator then independently re-verifies + merges.

[v2-039] E5-B — ACCEPTED (independent re-verify + merged @a10a0ec). Fix applied & spec finished.
  NOTE ON EXECUTION: the resume was dispatched as a `fork`, which returned 0 tool_uses (echoed context,
  did no work) — a wasted dispatch. Rather than burn a 3rd builder dispatch on a one-line fix already
  reproduced fail->fix->pass against an INDEPENDENTLY-AUTHORED spec (the objective gate is the spec, not
  who types the line), the coordinator applied the cookie fix directly and ran the FULL acceptance itself
  as the independent verification: check 0, build 0, composite 215 vitest + 9 playwright exit 0, and BOTH
  deliberate-breaks (httpOnly:false -> fail line 45; guard public -> fail step 1) with exact reverts.
  Final src diff = only `cookie: { path: "/" }`.
  FLAKE FOUND + HARDENED during re-verify: under back-to-back composite contention the auth logout step
  (bare 5s toBeVisible after a POST + cache-invalidate + re-render) flaked ~1/3. Coordinator hardened it
  (test-timing ONLY, not a semantic change): waitForResponse on POST /api/auth/logout + 15s headroom on
  the post-transition assertions in auth.spec.ts and the shared session.ts helper (E5-C reuses it under
  Docker, more contended). Post-hardening: full playwright suite 5/5 green under contention incl. a 30.6s
  contended run. (The separate boot.smoke vitest flake seen once under my hammering is the PRE-EXISTING
  documented env flake [v2-035], not E5-B's.)
  Escaped-bug rule DISCHARGED: the check that let the cookie bug through was the inject-based Phase-2 tests
  (.inject ignores cookie Path — structurally blind); the strengthening is E5-B's real-browser auth.spec.ts,
  now in the baseline composite — the correct-level check the inject suite could never be.
  NO oracle amendment: the app now actually satisfies the pre-existing Phase-2 acceptance; behavior
  definition unchanged. Scheduler next: E5-C ready (depends E5-A+E5-B, both done). 2/12 chunk closed.

[v2-040] E5-C — ACCEPTED (independent re-verify + FINAL merged-tree run on master @9d552be). ===== BACKLOG DRAINED (again) — BROWSER-ACCEPTANCE EPIC E5 COMPLETE =====
  Single sonnet builder (worktree). Scope clean (4 declared: package.json, playwright.config.ts +
  new docker-spa.spec.ts, helpers/docker.ts; src/ empty; other e2e untouched). Coordinator ran the
  full composite on master itself: vitest 215/215, playwright default 9/9, docker project 1/1 (real
  docker compose up --build of the shipped Node/tsx image, health-poll, teardown -v), exit 0, no
  orphan containers/networks. Note: had to `bun install` on master first (merges only changed
  package.json/bun.lock; the playwright CLI wasn't in node_modules/.bin -> a 127 on the first attempt,
  not a code failure).
  Gaming read clean (mount = real app-shell not static; console allowlist narrow to the one expected
  pre-login /api/settings 401, pageerror unguarded; step-4 round-trip is the in-container authed proof
  that the E5-B cookie fix enables). Both deliberate-breaks confirmed load-bearing by the builder.
  Env adaptation (builder, sound): docker-outside-of-docker (/.dockerenv) -> join compose network +
  address the sibling by service DNS (http://lede:8787); real-host fallback http://localhost:8899.
  Same production container either way — not a CI-only fixture. docker project gated on LEDE_E2E_DOCKER=1
  so a bare `playwright test` never touches Docker.
  Escaped-bug rule DISCHARGED (Phase 4): the [v2-033] "GET / returns SPA" check a static 200 could game
  is now backed by a real-browser mount + no-console-error + authed round-trip inside the shipped image.

  ===== FINAL STATE: 40 done / 0 todo / 0 in-progress / 4 decomposed (44 total). Chunk closed 3/12
  (E5-A, E5-B, E5-C) — backlog fully drained; all phase oracles green on the merged tree (master
  @9d552be). The [v2-036] browser-acceptance semantic amendment is fully delivered: Phase 1 CRUD,
  Phase 2 auth, Phase 4 docker+SPA browser gates all folded into the baseline composite. NOTABLE:
  the Phase-2 browser gate paid for itself immediately by catching a real production auth bug
  (session-cookie path) that every prior inject-based test was structurally blind to. =====

[v3-000] SPEC REVISION (major, user-authorized 2026-07-03) — post-E5 product direction, written into spec.md.
  Not an oracle amendment yet: the SPEC changed; oracle.md + backlog re-intake is the NEXT step (see below).
  Added/changed in spec.md (no section renumbering — oracle.md/backlog.json reference § numbers by value):
   - §2 Scope: tailoring reframed stateless→PERSISTENT (Applications); Library reframed as over-complete
     information bank. New tripwire: "Applications are tailoring records, NOT a job tracker" (only genState,
     never a hiring status) — guards against ATS/CRM drift.
   - §6.2: hard boundary — per-application `context` guides selection/emphasis ONLY, never a source of
     quotable facts; validateNoFabrication still checks entries alone (context absent from keptBlob). Guards
     the locked no-fabrication principle (§6.3/§23).
   - §9 API: /api/tailor (stateless) → /api/applications CRUD + :id/tailor (persists `current`) + :id/lock
     (immutable `final`); /api/export|import span library+profile+applications (full backup).
   - §13: component tree updated — Applications replaces Tailor destination (ApplicationsView/ApplicationDetail),
     Library gains progressive LibraryFilter, Profile/Layout stay with Library. Two COORDINATOR-DEFAULT decisions
     flagged pending user's final word (both current-build-aligned): (a) top-bar tabs not sidebar; (b) Profile/
     Layout live with Library not Settings.
   - NEW §26 Information Architecture: nav model (top-bar, 3 flat destinations, reachability/no-orphan invariants),
     placement rule, Library-as-bank vision + progressive findability, Applications↔Library loop, first-run path,
     rejected alternatives. NEW §27 Applications: domain (self-contained snapshots, no entry-ID refs), lifecycle,
     current+locked (NO version history — decided w/ rationale: lock the unreconstructable "final" artifact, not
     a hiring status), provenance/staleness, context-not-facts contract, backup, not-a-tracker tripwire, and an
     acceptance shape for the future oracle.
  OPENS NEW BUILD WORK (backlog currently drained @9d552be): a new Applications epic (schema+migration, API,
  tailor-persistence, Applications UI, keyless+browser tests, snapshot-integrity + context-not-fabrication gates),
  Library findability (progressive filter), and an IA structural oracle gate. NEXT STEP: a fresh /ailoop intake
  pass to derive the new per-phase oracles from §26/§27 and seed tickets — NOT auto-started; awaiting user.
  Oracle a11y/contrast/IA gate (discussed): structural-IA gate is safe to add now; a11y/contrast/token gate needs
  a compliance run on the current UI first (else the first UI ticket fails on inherited debt) — deferred to intake.

[v3-001] RE-INTAKE for the v3 spec revision (Applications + IA). Coordinator, 2026-07-03. Backlog was drained
  @9d552be; this pass seeds the new epic E6 from spec §26/§27 (+ changed §2/§6.2/§9/§13). Codebase inventoried
  vs v3 first (fresh Explore agent) — canonical tree src/, test/, drizzle/ (worktrees ignored).
  ORACLE amended: added Phase 5 (Applications lifecycle + snapshot integrity + context-not-facts machinery +
  tailor error mapping + full-instance backup + IA structural gate + Library findability + browser lifecycle gate;
  one DEFERRED key-gated line). Added 3 cross-cutting invariants "From E6 on": not-a-tracker grep guard,
  context-excluded-from-grounding, no-orphan-routes. Scope tripwire gained not-a-tracker + context-not-facts.
  TWO INTAKE DECISIONS (spec §26/§13 flagged them for the human; asked via AskUserQuestion, user away/no response
  within 60s → proceeded on the spec's own coordinator recommendations, both current-build-aligned, flippable):
   (a) top-bar tabs (not sidebar); (b) Profile/Layout stay in Library (they already do — zero churn).
  KEY-PRECONDITION resolved WITHOUT escalation: v3 threads per-app `context` into tailoring. Verified at intake:
  GOOGLE_GENERATIVE_AI_API_KEY is MISSING here. But SYSTEM_PROMPT is a frozen constant and the JD enters via the
  model USER MESSAGE (engine.ts:48); context attaches there ONLY, and FixtureEngine keys on hashKey(jd,entries)
  (context excluded). So: empty-context user message is byte-identical to today ⇒ T014 flip-path unchanged ⇒ the
  honesty-note "prompt.ts edited ⇒ re-run T014" trigger does NOT fire (prompt.ts is never touched); existing 3
  fixtures still replay ⇒ keyless suite green. The "context measurably shifts emphasis" claim is model-quality =
  key-gated + DEFERRED (recorded honestly like T014), NOT run this epic. The machinery (context reaches model
  input; excluded from validateNoFabrication) is keyless-verified.
  SEEDED 9 tickets (E6-A1..A5 backend, E6-B1..B3 UI/IA, E6-C1 findability). Dependency spine:
   A1(schema+migration)→A2(CRUD)→A3(app-scoped tailor, REPLACES stateless /api/tailor, +context)→A4(lock+integrity);
   A5(full backup) dep A2; B1(Applications UI) dep A4; B2(nav/routes/IA, removes TailorView) dep B1;
   B3(browser lifecycle e2e) dep B2; C1(LibraryFilter) dep [] — file-disjoint, fans out early.
  Scheduler clean: no problems/cycles; first batch [E6-A1, E6-C1] (file-disjoint). Caps unchanged (maxAttempts 3,
  thrash 2, chunk 30 — inherited from prior push).

[v3-002] RED-TEAM (Stage 1.5) — adversarial pass over all 9 E6 acceptances (general-purpose agent). 12 cheats
  found, all folded into ticket acceptance (marked "RED-TEAM SHARPENED [v3-001]"). Highest-value:
   #1 (HIGH) E6-A3: anti-vacuity guard only pinned the pure buildUserPrompt helper — a builder could ship it and
      never wire application.context through route→engine (dead feature, all lines still green). Now requires a
      spy engine proving decide() RECEIVES context and the real user message contains it, end-to-end.
   #2 (HIGH) E6-B2: "app-shell renders" gameable by a bespoke non-empty fallback div. Now requires unknown path
      to REDIRECT to /applications and render the SAME content as /applications (known-destination sentinel).
   #3/#4 (HIGH) E6-A5/A2: snapshot round-trip/omission tests vacuous while current==null. Now require NON-NULL
      current/locked in the fixtures + deep-equal + on-disk DATA_DIR with a fresh DB connection.
   #5 E6-A4 integrity: target entry must be IN current, edit a RENDERED field, re-read from DB (deep-copy proof).
   #6 E6-A3: number-only-in-context must throw FabricationError (the §6.2 laundering boundary, previously untested).
   #7/#8/#9/#10/#11/#12: json deep-equal + genState default; fixture-token DOM assert + real reload + exact-match
      console allowlist (no pageerror); LibraryFilter threshold + bidirectional; data-driven card contrast;
      failed-tailor with a PRIOR current; LibraryToolbar button-wiring jsdom test (added test/library-toolbar.test.tsx).
  Graph re-verified clean after sharpening. INTAKE COMPLETE — beginning the drive at batch [E6-A1, E6-C1].

[v3-003] DRIVE batch [E6-A1, E6-C1]. The build-phase Workflow threw at launch (`tickets.map` on undefined —
  `args` arrived undefined in the script under scriptPath; harness arg-plumbing quirk, 0 agents spawned, no work
  lost). FALLBACK (sound for a 2-ticket file-disjoint batch): dispatched the two builders directly as parallel
  worktree Agent subagents (model sonnet) instead of the fan-out harness — identical guarantees (isolated
  worktrees for parallel writes; I re-verify each independently: baseline + acceptance + scope diff + gaming
  read; then merge verified + baseline gate on the merged tree). Will revisit Workflow arg-passing for larger
  batches. Both tickets in-progress; awaiting builder reports.

[v3-004] ORACLE AMENDMENT (mechanical, self-serve) — baseline gate corrected to match the current toolchain,
  surfaced while verifying E6-A1. Two drifts since the oracle was written:
   (1) LINT: Biome is now the lint/format layer (`bun run lint`=`biome check`; added commit bab52e3) and is
       ENFORCED by the .githooks pre-commit hook — a non-Biome-clean diff cannot commit. Oracle said "lint: none";
       corrected to require `bun run lint` (fix via `bun run lint:fix`/`format`). Evidence: E6-A1's commit was
       blocked by the hook on a biome format error in test/schema.test.ts.
   (2) TEST SCOPE: `bun run test` now unconditionally appends `LEDE_E2E_DOCKER=1 playwright --project=docker`
       (builds a Docker image). That is a PHASE-CLOSE/FINAL gate, not a per-ticket check — and it hung the E6-A1
       builder, which backgrounded the full script inside its worktree and stalled waiting on the docker build
       (its non-STATUS "wait for the monitor" ending). Per-ticket baseline is now explicitly check + lint +
       vitest + playwright chromium; docker e2e runs at final/Phase-4 close on the merged tree.
  Both are mechanical (toolchain evolved; no change to what behavior counts as done). No semantic escalation.
  E6-A1 build: scope CLEAN (8 files ⊆ declared; migration emitted 0001_marvelous_steel_serpent.sql). Work was
  left UNCOMMITTED + not Biome-clean because the builder stalled on the docker run — resuming the same builder
  (retains context) to format, run the corrected narrow baseline to green, commit, and report real STATUS.

[v3-005] BATCH [E6-A1, E6-C1] ACCEPTED — both independently re-verified by the COORDINATOR on the merged master
  tree (not the builders' self-reports). Merged @1f51f5e (two --no-ff merges). MERGED-TREE GATE GREEN:
  `bun run check` 0; `bun run lint` (biome) clean; vitest 227/227; boot.smoke 3/3 (migration 0001 boots +
  /api/health + boot-refusal invariants — confirms A1's migration-on-boot, and that the earlier boot.smoke red
  was the worktree-env [v2-035] flake, NOT a defect); playwright chromium 8/8 (library-crud regression intact).
  Per-ticket scope CLEAN + gaming reads CLEAN (evidence on each ticket in backlog.json). C1's tag filter is the
  sanctioned exact-match filtering (no scoring); A1's json columns deep-equal round-trip + genState default are
  genuinely tested. 2/30 chunk closed.
  INCIDENTS + LESSONS (encode for next dispatch):
   1. WORKTREE RACE: the E6-A1 builder was still alive (stalled) while I operated in its worktree; it `git stash`
      + repeatedly `reset` the tree, blanking my in-progress commit. Recovered via `git stash pop` (work intact),
      then TaskStop'd the builder, formatted, committed (915e028). FIX: TaskStop a stalled builder BEFORE touching
      its worktree.
   2. BUILDER-STALL PATTERN: both builders backgrounded a long test run and "waited on the monitor," and the A1
      builder never committed (2 resumes, still stalled). Root causes: (a) they ran the FULL `bun run test` (incl
      the docker e2e that hangs in a worktree — now oracle-amended [v3-004]); (b) no instruction to commit before
      reporting. NEXT-DISPATCH PROTOCOL (bake into every builder prompt): run ONLY check + lint + vitest +
      `bun run test:e2e` (chromium) — NEVER full `bun run test`, NEVER background a test and wait on a monitor;
      COMMIT on your branch BEFORE reporting; never `git stash`/`git reset`. C1 followed a clean path and needed
      zero coordinator intervention — proof the protocol works when stated.
   3. TOOLING/INFRA (mechanical): biome check from repo root errored on nested biome.json in the transient
      .claude/worktrees/*; removed 9 stale worktrees and added `.claude/worktrees/` to .gitignore (biome
      useIgnoreFile:true now skips them). Uncommitted infra change, left for human review with the .ailoop state.
  NEXT: scheduler ready = [E6-A2] (single serial backend ticket; A3→A4 chain follows). CHUNK CLOSED — glance +
  re-invoke /ailoop to continue.

[v3-006] DRIVE continued (user: "keep going, drive the rest unless you require input"). Chunk cap 30, so the
  whole E6 backend+UI chain runs in this invocation; serial (A2→A3/A5→A4→B1→B2→B3 all share applications.ts/
  index.ts/api.ts — scheduler puts them in separate batches, no fan-out).
  E6-A2 ACCEPTED (merged @2a44417): applications CRUD. Indep re-verified (evidence on ticket). Clean, protocol
  followed by the builder (committed before report, narrow gate only — the fix worked). NOTE: query hook landed
  at src/client/queries/useApplications.ts while repo convention is src/client/hooks/queries.ts — my ticket
  path-guess (spec §21); functional, not worth a re-dispatch; consolidation optional later.
  E6-A3 RE-SCOPED [v3-006] before dispatch: discovered there is NO useTailor hook (spec §21 aspirational) — the
  stateless tailor is api.ts tailor() called inline by TailorView. Removing the stateless route+helper in A3
  would red TailorView'"'"'s build, but TailorView removal is B2. So A3 is now PURELY ADDITIVE + backward-compatible
  (add :id/tailor, optional-context engine plumbing, tailorApplication helper/hook, new tests — leave the
  stateless path intact); the ATOMIC stateless teardown (route + tailor() helper + TailorView + 3 old tests)
  moves entirely into B2, the UI cutover. Keeps every intermediate build green. Graph re-checked clean.

[v3-007] E6-A3 + E6-A5 ACCEPTED (merged @2cf5f16; A3=1140a88, A5=fd28e1c). Both indep re-verified on the merged
  tree (evidence on tickets): check/lint/vitest 253/253/build/playwright chromium 8/8. A3 context-not-facts is
  clean and genuinely tested (buildUserPrompt byte-identical baseline; context→user-msg only; validate entries-only;
  red-team #1 spy + #6 signature + #11 prior-current all real). A5 backup zod is real (not z.any()); red-team #3
  non-vacuous round-trip + #12 button wiring. Both builders STALLED again on the e2e-monitor pattern (backgrounded
  playwright, didn't commit) — I stopped them, gaming-read the diffs, committed, and ran the merged-tree gate
  myself. ROOT FIX applied to remaining dispatches: backend/component tickets are told to run NO e2e in-worktree
  (format+lint+check+vitest only); I run playwright once on the merged tree. api.ts auto-merged (A3 & A5 helpers
  disjoint). One vitest flake (1/253) under concurrent-process contention did NOT reproduce isolated — env, not a
  defect. NOTE minor DRY: A5 duplicates entry-upsert + hand-writes tailoredResumeZ (out-of-scope files); A3
  duplicates resolveEngine/rowToEntry/mapTailorError from index.ts (transient — dies with the stateless route in
  B2). NEXT: E6-A4 (lock+integrity, backend, dispatched no-e2e) → then B1→B2→B3 (UI, serial).

[v3-008] ===== EPIC E6 COMPLETE — BACKLOG DRAINED (49 done / 0 todo / 4 decomposed of 53) — master @a956245 =====
  E6-A4 lock+integrity (merged), E6-B1 Applications UI (merged), E6-B2 nav/IA + atomic stateless teardown (merged),
  E6-B3 full-lifecycle browser e2e (merged) — all indep re-verified (evidence per ticket). The no-e2e builder
  protocol eliminated the stall pattern (A4/B1/B2 committed cleanly; only B3, an inherently-e2e ticket, needed the
  commit-before-playwright rule). Builders' justified out-of-scope touches accepted: B2 deleted test/server.test.ts
  (stale POST /api/tailor block; health still covered) + trimmed a /tailor block from library.test.tsx; B3 added an
  "applications" playwright project (same additive pattern as E5).
  FINAL GATE — authoritative full `bun run test` GREEN end-to-end on merged master: vitest 253/253; playwright
  non-docker 10/10 (chromium 8 + auth 1 + applications 1); docker 1/1. All phase-5 oracle lines satisfied on the
  merged tree.
  ESCAPED-BUG (discharged): B2's IA cutover (/ -> /applications) left THREE stale things in e2e files B2 didn't
  declare and I didn't run at the B2 gate (I ran only --project=chromium): (1) auth.spec toHaveURL(/tailor);
  (2) docker-spa.spec toHaveURL(/tailor); (3) docker-spa lacked an allowlist for the pre-login 401 the new
  eager-fetching landing route emits. Root cause of the missed catch: my B2 gate ran ONE playwright project, not
  all. STRENGTHENED CHECK: the gate now runs ALL playwright projects (auth + applications + docker), and
  playwright.config gained workers:1 + retries:2 for this container. Repair committed a956245. The pre-login 401
  itself is benign (LoginGate optimistically renders the route during its in-flight auth ping) and already
  accepted in B3's applications.spec — see CUT/FOLLOW-UP below.
  HARNESS BUG FOUND + FIXED: the composite `bun run test` was red not from product defects but a ZOMBIE tsx server
  left on default port 8787 by an earlier run; reuseExistingServer:true made the chromium project silently reuse
  it (wrong state) → all chromium specs timed out. Killed via /proc scan; composite then green. Latent risk:
  reuseExistingServer + orphaned default-port servers — future runs should pkill server/index before the gate.
  DECOMPOSITIONS/AMENDMENTS this epic: [v3-004] baseline (biome lint real; docker e2e = phase-close only);
  [v3-006] A3 made additive + stateless teardown moved to B2; [v3-008] workers:1+retries:2.
  CUT / FOLLOW-UP (not built — flagged, not hidden): (a) LoginGate fires an authed data fetch for the current
  route BEFORE its auth ping resolves, so any fetching landing route logs a benign pre-login 401 (cosmetic; two
  e2e allowlists now excuse it). A clean fix = gate children until the ping resolves; deferred (pre-existing
  LoginGate behavior, out of E6 scope). (b) DRY: A5 duplicates entry-upsert + hand-writes tailoredResumeZ;
  minor. (c) The two §26 UI decisions (top-bar tabs; Profile/Layout in Library) were coordinator defaults while
  the user was away — still flippable. (d) DEFERRED key-gated: live "context shifts emphasis" eval (no key).
  =====

[v3-009] RESUME (fresh context) — verify-only, no dispatch. Scheduler: 49 done / 4 decomposed / 0 todo /
  0 in-progress / 0 blocked; ready=[] → backlog DRAINED, no reconciliation needed. HEAD @a956245 (== the
  [v3-008] final-gate commit). Working tree carries only NON-product uncommitted edits (env/docs/devcontainer:
  vite.config.ts dev-proxy host+port, .env.example, README.md, spec.md, .devcontainer/*, ?? .vscode/,
  building-an-autonomous-build-loop.md) — NO src/ or test/ change, so the tested product is byte-identical to
  the recorded-green commit. Re-ran the authoritative gate on the CURRENT tree rather than trusting the prior
  claim (prime directive 2): `bun run check` 0; `bun run lint` (biome, 132 files) clean; vitest 251/253 on the
  full concurrent run with TWO timeouts — test/boot.smoke.test.ts and test/api.applications-tailor.test.ts.
  Both are TIMEOUTS (30s/20s), not assertion failures, and both PASS in isolation (boot.smoke 3/3 in 6.85s;
  applications-tailor 6/6 in 2.77s; the tests that timed out ran in ~1.2s / ~1s isolated). CONFIRMED env
  concurrency-contention flake, matching [v3-005]/[v3-007] history — both tests spawn real server processes and
  starve under the 33-file concurrent vitest run. NOT a defect; product correct. Playwright (10/10 non-docker +
  1/1 docker) rests on the [v3-008] recorded final gate at this identical unchanged commit — not re-run this
  session (docker image build = phase-close/final only per [v3-004]; source unchanged).
  FOLLOW-UP (flagged, not fixed — test-infra, needs a human decision, out of a drained backlog): `bun run test`
  is not reliably single-run green in THIS container — vitest gives no workers:1/retries mitigation the way
  playwright.config got [v3-008]. A human re-running the composite will see 1-2 red timeouts. Candidate fixes:
  bump testTimeout for the server-spawning specs, or pin vitest poolOptions concurrency. Left for the human.
  INCIDENT: during a zombie-server sweep (a [v3-008] lesson) my /proc cmdline glob false-matched the VS Code
  server (pids 210/221 — matched on `oven.bun-vscode` + `--start-server`) and I sent it kill -9. No Lede zombie
  existed; 8787 was free. VS Code server auto-reconnects. Noted honestly; the sweep glob was too loose.
  VERDICT: loop COMPLETE — backlog drained, all phase oracles green (Phase 5 + final composite at [v3-008];
  check/lint/vitest re-confirmed on the current tree this run). Emitting the final report.

[v3-010] FIX — vitest full-suite flakiness (the [v3-009] follow-up), user-requested. ROOT CAUSE: vite.config.ts
  `test.poolOptions.forks.singleFork:true` funnelled all 33 files / 253 tests through ONE long-lived fork.
  Per-file resources (open better-sqlite3 handles + WAL, Fastify instances — integration tests like
  api.applications-tailor open DBs/apps and never close them in afterEach) accumulated across the whole run;
  the heavy real-server tests (boot.smoke spawns a real tsx server subprocess; the applications tailor/lock
  suites boot Fastify + FixtureEngine) starved late in the run and hit their per-test timeout, and a hung test
  then WEDGED the single fork — leaving the run to bail partway (observed: a run that completed only 17/33 files
  with a nondeterministic 2-3 timeout set that moved between boot.smoke / applications-tailor / applications-lock).
  All these tests pass in ~1s ISOLATED — confirming accumulation-in-shared-fork, not a logic defect.
  FIX: replaced singleFork with bounded ISOLATED forks — `poolOptions.forks {isolate:true, maxForks:3, minForks:1}`.
  isolate gives each file fresh process state so leaked handles die with the file's fork turnover instead of
  accumulating across 253 tests; maxForks:3 (box has 10 cores) caps contention well below the saturation the
  original singleFork was avoiding. Chose the pool-level fix over sweeping app.close()/db.close() into ~30 test
  files' teardowns: minimal, targeted at the actual root (shared-fork accumulation), no product/test-source churn.
  VALIDATION: full `bunx vitest run` x3 → 33/33 files, 253/253 green EVERY run (previously wedged at ~17 files).
  check + lint (biome, 132 files) clean after the edit. Playwright unaffected (separate config). Only file
  touched: vite.config.ts (the vitest `test` block). Leaving staged for the human to commit per action discipline.
