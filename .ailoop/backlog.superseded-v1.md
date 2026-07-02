# Backlog — Lede

Loop driver. Seeded from spec.md at intake. Phase 0 detailed (it is the whole
risk, §12); Phases 1–3 coarse epics to be decomposed as Phase 0 teaches the shape.

status: todo → ready → in-progress → done | blocked | decomposed
Ready = every `depends_on` is `done`.

---

## Phase 0 — prove the tailoring (spec §6, §10, §12)

### T001 — Scaffold the Node/Fastify + Vite project skeleton
- **status:** ready
- **depends_on:** []
- **files:** [package.json, tsconfig.json, tsconfig.server.json, vite.config.ts, index.html, .env.example]
- **origin:** spec §2.1, §9
- **context:** |
    Establish the layout in spec §9 on the LOCKED stack (§2.1): Node≥20 + TS + ESM,
    Fastify 4, Vite/React 18, tsx for dev. Scripts per §9: dev (concurrently api+web),
    dev:api (tsx watch src/server/index.ts), dev:web (vite), build, start.
    NOTE: existing workspace scaffold is Bun/Bun.serve — it is being replaced to
    match the spec's locked stack (Node 22 is present). Do not keep Bun.serve.
- **acceptance:** |
    - `npm install` succeeds; `npm run check` (tsc --noEmit) passes on empty stubs
    - vite dev proxy for `/api` → :8787 is configured (§9)
- **evidence:**

### T002 — Shared domain types
- **status:** todo
- **depends_on:** []
- **files:** [src/shared/types.ts]
- **origin:** spec §3.1, §4
- **context:** |
    Author Block, BlockKind, BlockSource, JDSignals, TailoredBullet, TailoredJob,
    TailoredResume EXACTLY as in spec §3.1 and §4. facts = FACT-LOCK. Imported by
    both server and client.
- **acceptance:** |
    - `npm run check` passes; types match §3.1/§4 field-for-field
- **evidence:**

### T003 — Zod schemas + TAILORED_RESUME_JSON_SCHEMA
- **status:** todo
- **depends_on:** [T002]
- **files:** [src/shared/schema.ts]
- **origin:** spec §6.2
- **context:** |
    zod schemas for request bodies and the LLM output (TailoredResumeZ), plus the
    JSON-Schema form of TailoredResume for structured outputs. Keep the two in sync.
- **acceptance:** |
    - `npm run check` passes; TailoredResumeZ.parse round-trips a valid sample
- **evidence:**

### T004 — Phase 0 seed blocks
- **status:** todo
- **depends_on:** [T002]
- **files:** [src/server/seed.ts]
- **origin:** spec §10
- **context:** |
    Hardcode the three SEED_BLOCKS from spec §10 verbatim (rules-engine,
    frontend-rewrite, platform-sdk). All three tagged platform-arch on purpose —
    selection must discriminate on facts, not tags.
- **acceptance:** |
    - exports SEED_BLOCKS: Block[]; `npm run check` passes
- **evidence:**

### T005 — System prompt + block-library renderer
- **status:** todo
- **depends_on:** [T002]
- **files:** [src/server/prompt.ts]
- **origin:** spec §6.3
- **context:** |
    SYSTEM_PROMPT frozen (never interpolate JD/timestamp). renderBlockLibrary(blocks)
    serializes deterministically (sort startSort desc then id; stable key order) so
    the cache prefix is byte-stable. This prompt is the product's IP — it encodes
    "judge from facts, don't keyword-match" (§0).
- **acceptance:** |
    - renderBlockLibrary output is byte-identical across repeated calls with same input
- **evidence:**

### T006 — tailor() call + no-fabrication validation
- **status:** todo
- **depends_on:** [T002, T003, T005]
- **files:** [src/server/tailor.ts]
- **origin:** spec §6.2, §6.4
- **context:** |
    The one structured LLM call (model claude-opus-4-8, thinking adaptive, effort high,
    output_config json_schema, block library cached). Then deterministic: zod re-validate,
    enforceJobOrder (server owns startSort desc), validateNoFabrication (every number in a
    bullet must appear in that block's facts; throws otherwise). Step 5 is NOT another LLM.
- **acceptance:** |
    - `npm run check` passes
    - validateNoFabrication throws on an injected fake metric; passes on clean output
- **evidence:**

### T007 — Fastify server + /api/tailor + /api/health
- **status:** todo
- **depends_on:** [T003, T004, T006]
- **files:** [src/server/index.ts]
- **origin:** spec §5, §6.6
- **context:** |
    Routes per §5. /api/tailor accepts { jobDescription, blocks? } — blocks override
    lets Phase 0 run against SEED_BLOCKS with no DB (§6.6). Validate jd non-empty <20k.
    Error mapping: RateLimitError→429, APIError→502, zod-fail on LLM output→502.
- **acceptance:** |
    - server boots; `GET /api/health` → { ok:true }
    - `POST /api/tailor` with { blocks: SEED_BLOCKS, jobDescription } returns a
      zod-valid TailoredResume (needs ANTHROPIC_API_KEY)
- **evidence:**

### T008 — Client: JD paste → tailor → deterministic resume render
- **status:** todo
- **depends_on:** [T002]
- **files:** [src/client/main.tsx, src/client/App.tsx, src/client/api.ts, src/client/components/TailorView.tsx, src/client/components/ResumePage.tsx, src/client/app.css, src/client/print.css]
- **origin:** spec §7, §8 (minimal)
- **context:** |
    TailorView: JD textarea + tailor button. ResumePage: single-column deterministic
    render of TailoredResume (§7). print.css: US-Letter, black-on-white, no tables/images.
    leadRationale/cut[] must NOT render on the resume page. Reasoning UI is Phase 2.
- **acceptance:** |
    - `npm run check` passes; app renders a TailoredResume fixture to a print-clean page
- **evidence:**

### T009 — Phase 0 acceptance harness (the behavioral oracle)
- **status:** blocked
- **depends_on:** [T007]
- **files:** [scripts/phase0-acceptance.ts]
- **origin:** spec §10
- **context:** |
    Script that POSTs the 3 contrasting JDs (§10) to /api/tailor over SEED_BLOCKS and
    asserts the lede flips: platform-sdk / rules-engine / frontend-rewrite respectively.
    Exit non-zero on any miss. THIS IS THE PHASE 0 ORACLE.
- **acceptance:** |
    - all 3 JDs flip the lede correctly; script exits 0
- **blocked-reason:** requires ANTHROPIC_API_KEY (not present at intake) — see ledger [0002]
- **evidence:**

---

## Later phases (coarse — decompose when Phase 0 closes)

### E1 — Phase 1: block library editor + SQLite persistence (spec §3, §5)
- **status:** todo
- **depends_on:** [T007]
- **origin:** spec §12 Phase 1
- **context:** decompose into: schema.sql + db.ts (rowToBlock/blockToRow), /api/blocks CRUD, BlockEditor.tsx.

### E2 — Phase 2: reasoning UI (spec §8)
- **status:** todo
- **depends_on:** [E1]
- **origin:** spec §12 Phase 2
- **context:** ReasoningPanel (signals + leadRationale + cut). Timebox — scope-creep risk (§8, §11).

### E3 — Phase 3: render polish + hosted demo / Turso swap (spec §7, §3.3)
- **status:** todo
- **depends_on:** [E2]
- **origin:** spec §12 Phase 3
- **context:** print.css polish; DB swap to Turso behind db.ts (one-file); single-process deploy.

---

## Queue (ready now)
T001, T002, T004, T005  — file-disjoint once T002 lands; would fan out, but see ledger [0003] (no git → serialize).
