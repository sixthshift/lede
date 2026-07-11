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
