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
