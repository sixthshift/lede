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
