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
