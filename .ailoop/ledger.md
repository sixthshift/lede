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
