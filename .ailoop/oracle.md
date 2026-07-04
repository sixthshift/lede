# Oracle — Lede (v3)

Definition of done, derived from `spec.md` (rewritten 2026-07-01 23:59 — the
provider-agnostic / BYOK / auth / Drizzle spec; **v3 revision 2026-07-03** adds
the persistent **Applications** entity §27, the **Information Architecture** §26,
and the full-instance backup — Phase 5 below). Supersedes v1
(`*.superseded-v1.md`, built against the earlier Anthropic-only, no-auth spec).
Workers cite this; the coordinator gates against it.

**v3 intake decisions (ledger [v3-001], 2026-07-03) — locked at re-intake:**
- **IA (§26) — top-bar tabs; Profile/Layout live with Library.** Both are the
  spec's coordinator recommendations and match the current build (nothing
  shipped churns). Flagged to the human at intake; proceeded on the defaults
  while away. Flippable in §26 later.
- **Context threading needs NO key and NO `prompt.ts` edit.** `SYSTEM_PROMPT` is
  frozen and the JD enters via the model *user message* (`engine.ts`); per-app
  `context` (§6.2/§27) attaches to that user message ONLY. Empty context ⇒
  user message byte-identical to today ⇒ the T014 flip-path prompt is unchanged
  ⇒ the honesty note's "prompt.ts edited ⇒ re-run T014" trigger does NOT fire.
  `FixtureEngine` keys on `hashKey(jd, entries)` (context excluded) ⇒ existing
  fixtures replay ⇒ keyless suite green. The claim "context measurably shifts
  emphasis" is a **model-quality** claim = **key-gated, DEFERRED** (no
  `GOOGLE_GENERATIVE_AI_API_KEY` in this env, verified at intake) — recorded
  honestly like T014, NOT run this epic. The *machinery* (context reaches the
  model input; context is excluded from `validateNoFabrication`) is keyless.

Frozen = never *silently* changed. Mechanical fixes (wrong command/port/path) →
coordinator edits + ledger entry. Any change to *what counts as done* → escalate.

## Locked decisions (never re-litigated)

Core principle (§1) — the reason the product exists:
- **Selection & ordering are judged from `facts`, never from `tags`.** Never
  score `entry.tags ∩ jd.signals` — a closed tag vocabulary *is* keyword-matching,
  the thing Lede rejects. Tags are grouping/filtering metadata only. Scoring on
  tags = you rebuilt Teal = failed ticket.

Pipeline shape (§5, §6):
- The model returns **judgment only** — a flat `TailorDecision` (signals, select/
  cut, `rank`, composed `text`, per-group `leadRationale`, summary). The **server
  assembles** all structure (grouping, group order, section order) deterministically
  in `assemble()`. The model never controls structure.
- Steps 1–4 (signals→select→lede→compose) are **one** structured LLM call
  (`generateObject`); step 5 (`validateNoFabrication`) is **separate and
  deterministic**. Never an LLM grading its own work (§6.3, §23).
- **The engine is swappable** (`TailorEngine`, §6.1): `FixtureEngine` (keyless,
  replays recorded decisions) is the default for test/CI/demo; `ProviderEngine`
  (live) is production. `tailor()` = engine → `assemble` → `validate`, all
  engine-agnostic. **A provider key is needed ONLY for the live model call**
  (Phase 0 eval, `scripts/eval.ts`, `scripts/record-fixtures.ts`). Everything
  else — build, boot, test, demo — is keyless.
- Ordering: recency/manual sections server-sorted by `sortKey` (never trusted from
  the model); the model orders only **`rank` within a group** (which bullet leads).
  Section registry (§4.3) is the single source of rephrase/order/group behavior.

Stack (§3.1, §20 — frozen):
- Node ≥ 20, TypeScript, ESM · Fastify 4 · SQLite `better-sqlite3` (single file, WAL)
  + **Drizzle** (`drizzle-orm` + `drizzle-kit`, migrations on boot) · **Vercel AI
  SDK** (`ai` + `@ai-sdk/anthropic|openai|google`) `generateObject` · React 18 +
  Vite · **shadcn/ui + Tailwind** (re-themed to §12 tokens) · TanStack Query ·
  `react-router-dom` · `zod` + `drizzle-zod` · Node `crypto` (AES-256-GCM + scrypt)
  + `@fastify/secure-session`.
- Default provider/model: **Anthropic `claude-opus-4-8`**; user picks provider+model
  in Settings (BYOK, their tokens).
- **Dropped:** `@anthropic-ai/sdk`, `zod-to-json-schema` (AI SDK covers both).
- Secrets isolated table: apiKey **encrypted** (AES-256-GCM, reversible); password
  **hashed** (scrypt, one-way). Singletons via `id=1` + `CHECK (id=1)`.
- Config fail-fast: `LEDE_MASTER_KEY` + `LEDE_SESSION_SECRET` **required to boot**
  (§8, §17, §19). Provider key is BYOK (encrypted in DB), not an env var — except
  the Phase 0 dev bootstrap (§24). `PORT` default **8787** (§17).

**Toolchain (coordinator decision 2026-07-02, ledger [v2-002], amended
[v2-017]):** **Bun as package-manager + script runner** (`bun install`,
`bun run check|build|test`, `bunx`) — matches the existing container (bun.lock).
This is a *mechanical* deviation from spec §20's `tsx`-in-dev-deps; every
**architectural** lock above (Fastify, provider-agnostic AI SDK, Drizzle,
better-sqlite3, etc.) is unchanged.

**AMENDMENT [v2-017] (mechanical) — the server PROCESS runs under Node, not Bun.**
`bun src/server/index.ts` dies `ERR_DLOPEN_FAILED`: better-sqlite3 ships a
Node-ABI prebuilt (NODE_MODULE_VERSION 127) that Bun 1.3.14's V8 (137) can't
load, and it uses direct V8/NAN bindings (not N-API), so it's not rebuild-away
(bun#4290). Verified: under Node v22 (tsx) the server boots, migrates, and
`/api/health` → `{ok:true}`. So the `start`/`dev:api` scripts run under **Node
via `tsx`** — which is just reverting the *runner* to spec §3.1's own
"Node ≥ 20". Bun remains the package-manager + runs check/build/test (vitest is
node already). Implemented by repair ticket **T017**, which also adds the
real-boot smoke gate below. Production Docker likewise uses a **Node** runtime
image (aligns with §19 "node slim"; earlier Bun-image plan dropped).

**Boot invariant (added [v2-017], checked via `test/boot.smoke.test.ts`):** the
server must boot under the real runner (Node/tsx) against a real DATA_DIR and
answer `GET /api/health` → `{ok:true}` — the gap the pure-vitest baseline missed.

## Scope tripwire (halt if crossed) — §2, §20

- No multi-user / accounts / hosted auth (single-user **password gate** only).
- No vector DB / RAG / embeddings (all entries fit in the prompt).
- No Postgres (single-file SQLite is the self-host fit).
- No auto-apply / job scraping / ATS integration.
- No PDF-generation library (browser `window.print()` only).
- No **LLM-checks-LLM** fabrication pass (§6.3, §23).
- No **tag-based scoring** (`entry.tags ∩ jd.signals`) — the core anti-pattern (§1).
- No global store (Zustand) / tRPC unless explicitly justified later.
- **Applications are tailoring records, NOT a job tracker (§2/§27, v3).** The only
  status an Application carries is `genState` (generation: untailored/tailoring/
  tailored/failed). NO hiring-status pipeline (applied/interviewing/rejected),
  kanban, or reminders — any such field, column, or UI is a scope breach.
- **Context is not a fact source (§6.2/§27, v3).** Per-application `context` guides
  selection/emphasis only; it must NEVER reach `validateNoFabrication`'s grounding
  set (`keptBlob`). A number that traces only to `context` (not to any entry) must
  still throw `FabricationError`.

## Baseline gate (every ticket, no exceptions) — bun toolchain

- [ ] type-check: `bun run check` (`tsc --noEmit`, both tsconfigs) → exit 0
- [ ] build (once buildable — from T001 on): `bun run build` → exit 0
- [ ] lint/format: `bun run lint` (`biome check`) → exit 0 **[AMENDED v3-004, mechanical]**.
      Biome was added as the lint/format enforcement layer (commit bab52e3) AFTER this
      oracle was written and is enforced by the `.githooks` pre-commit hook — so a ticket
      whose diff isn't Biome-clean cannot even commit. Fix with `bun run lint:fix` /
      `bun run format`. (The original "none configured" reflected spec §20 at intake; the
      toolchain has since evolved — this is a mechanical alignment, no change to what
      behavior counts as done.)
- [ ] full test suite (keyless, `FixtureEngine`) — **per-ticket / per-batch composite**:
      `vitest run --passWithNoTests` followed by `playwright test` (chromium; webServer
      boots `bun run start` under Node/tsx per [v2-017]) → both green. A regressing E2E
      spec fails the baseline exactly like a regressing unit test.
      **[AMENDED v3-004, mechanical] — do NOT run the full `bun run test` script for
      per-ticket/per-batch verification:** it also runs `LEDE_E2E_DOCKER=1 playwright
      test --project=docker`, which builds a Docker image and needs docker-out-of-docker
      wiring — inappropriate (and hang-prone inside a worker worktree) for per-ticket
      verify. The **docker e2e is a PHASE-CLOSE / FINAL gate only** (it already lives in
      Phase 4's per-phase oracle). Per-ticket baseline = check + lint + vitest + playwright
      chromium; the full `bun run test` (incl docker) runs at final/Phase-4 close on the
      merged tree.
- [ ] new behavior ships with new tests, green under the above (exempt: pure
      scaffold/config tickets — must say so)

### Cross-cutting invariants — checked EVERY ticket, ALL phases (red-team meta-gap)

These are the kill criteria (§25). They live in the baseline, not one phase, so a
later phase can't silently regress them:

- [ ] **No tag-scoring** (§1 — the core anti-pattern). Grep guard: no code
      intersects/overlaps/sorts/scores `entry.tags` against JD/signals anywhere in
      `tailor/`, `assemble.ts`, `engine.ts`, or client ordering. Plus the keyless
      **structure-ignores-tags** test (two libraries identical except `tags` →
      identical assembled order/selection given the same decision).
- [ ] **No LLM-checks-LLM** in fabrication validation (§6.3, §23): no second
      `generate*` call inside `validate.ts`.
- [ ] **From E2 on — key never leaks:** the sentinel scan (stored key value absent
      from every response body, all logs, and the whole `DATA_DIR` in plaintext).
- [ ] **From E2 on — boot refuses** (process-level) without `LEDE_MASTER_KEY` /
      `LEDE_SESSION_SECRET`; no auto-generated master key.
- [ ] **From E6 on — not-a-tracker** (§2/§27): grep guard — no hiring-status
      vocabulary (`applied|interviewing|rejected|offer|kanban|reminder`) as an
      Application field, migration column, or UI control; `genState` is the only
      status. A tracker field = failed ticket.
- [ ] **From E6 on — context excluded from grounding** (§6.2): `validateNoFabrication`
      is called with `entries` only; `context` is never threaded into it. Test: a
      resume item/summary number absent from all entries throws `FabricationError`.
- [ ] **From E6-B2 on — no orphan routes** (§26 IA): every client route is a nav
      destination or a child of one; `/` → `/applications`; an unknown non-`/api`
      path resolves via the SPA fallback to a KNOWN destination (renders the
      app-shell), never a blank/404 shell.

**Honesty note (do not paper over):** the lede-flip claim rests on the KEY-GATED
eval (T014) being *genuinely run*. The keyless suite (T015) replays FROZEN
recorded decisions — it proves the machinery, and **cannot detect a fabricated
fixture or a live model that stopped flipping**. Therefore: any ticket that edits
`prompt.ts` or `SEED_ENTRIES` MUST re-run T014 and re-record fixtures (T013), and
the ledger must state the eval was actually run — never assumed.

## Per-phase acceptance (executable — on the MERGED tree)

### Phase 0 — prove the tailoring (§6, §22, §24) — **THE risk**
- [ ] `bun run check` passes; `bun run build` succeeds
- [ ] server boots; `GET /api/health` → `{ ok: true }`
- [ ] **keyless pipeline** (`bun run test`): `assemble` (grouping/order/`rephrase:'none'`
      coercion), `validateNoFabrication` (throws on injected fake number; passes clean),
      and `tailor()` end-to-end via `FixtureEngine` over the 3 recorded §22 decisions
      all pass.
- [ ] **KEY-GATED behavioral oracle** (`scripts/eval.ts`, live model via the
      Google bootstrap key `GOOGLE_GENERATIVE_AI_API_KEY`): POST the 3 contrasting
      §22 JDs over `SEED_ENTRIES`; the lede **flips on facts** — each target entry
      is its group's **lowest-`rank`** item **and** its `leadRationale` names a JD
      signal:
      - platform/API productization + external SDK → leads **cloudcase-platform-sdk**
      - tame legacy codebase + dev velocity/onboarding → leads **cloudcase-rules-engine**
      - frontend platform lead + design systems + React/TS → leads **cloudcase-frontend-rewrite**
      Script exits 0 iff all three flip correctly, each target the **strict unique**
      lowest rank and the three leads **mutually distinct**. **If it doesn't flip
      sharply, the prompt (§6.2) is wrong — fix the prompt, not the code.**
- [ ] **Tag-shuffle control** (Finding B): the eval re-run over `tagShuffle(
      SEED_ENTRIES)` produces the SAME flip. Permuting tags changing the lede =
      tag-scoring → Phase 0 FAILS. This control (not T014 alone) earns the
      facts-not-tags claim, since the seed's secondary tags map 1:1 to targets.
- [ ] **Fixture provenance gate** (Finding A): `record-fixtures` (T013) and `eval`
      (T014) share ONE decide/flip-predicate/hash path (T016); a fresh live eval
      reproduces the committed fixtures' `(leading id, rank order, kept ids)` for
      all 3 JDs — hand-authored fixtures won't survive it. Record outputs as
      fixtures so the keyless suite (T015) replays these same 3 scenarios.

### Phase 1 — Drizzle + entry library + profile + layout (§4, §9, §24)
- [ ] `bun run check` + `bun run test` pass
- [ ] migrations run on boot; `/api/entries` CRUD round-trips and **persists across
      a server restart** (keyless integration test)
- [ ] `POST /api/entries/import` + export round-trip an `Entry[]`
- [ ] LibraryView (experience/project/education/skill) can create/edit/delete an
      entry end-to-end via the section-aware `EntryEditor`
- [ ] `/api/profile` GET/PUT round-trip; `settings.layout` ordering respected by render

### Phase 2 — auth gate + BYOK (§7, §8, §24)
- [ ] first-run set password → login issues session; guarded `/api/*` return 401
      without a valid session (keyless test)
- [ ] app **refuses to boot** without `LEDE_MASTER_KEY`; encrypt/decrypt round-trip test passes
- [ ] `PUT /api/settings/key` stores **ciphertext** (validates key first); `GET
      /api/settings` returns `{ keySet, provider, model, ... }` — **never the key**;
      key never logged (test asserts absence)
- [ ] `/api/tailor` with no stored key → 400 `{ error: 'no_api_key' }`

### Phase 3 — reasoning UI + remaining sections (§10, §11, §24)
- [ ] `ReasoningPanel` renders `signals`, per-group `leadRationale`, and the `cut[]` list
- [ ] `leadRationale` and `cut[]` do **not** appear in the printed resume DOM (§10)
- [ ] award/certification/publication/interest/language/reference render from data

### Phase 4 — render polish + Docker (§10, §12, §19, §24)
- [ ] `print.css` yields single-column, `#000` on `#fff`, no tables/images/multi-column (ATS-safe)
- [ ] §12 tokens + shadcn theming applied (Plex fonts self-hosted, no CDN)
- [ ] the server serves the built SPA (§19): `GET /` returns the SPA `index.html`; `/api/*`
      is NOT shadowed by the SPA fallback (keyless test) — [SHARPENED v2-033, red-team]
- [ ] `docker compose up --build` builds and boots with `LEDE_MASTER_KEY` + `LEDE_SESSION_SECRET`;
      `GET /api/health` → ok **AND `GET /` returns the SPA** (a UI-less API must not pass —
      [SHARPENED v2-033]); image runs under **Node/tsx, not Bun** (locked [v2-017]);
      README documents first-run (`docker compose up` → set secrets → password → key → tailor)

### Phase 5 — Applications (persistent tailoring) + Information Architecture (§26, §27) — v3
Run on the MERGED tree. All keyless via `FixtureEngine` except the one deferred key-gated line.
- [ ] `bun run check` + the full baseline composite pass.
- [ ] **Applications lifecycle (§27 acceptance shape), keyless integration:**
      create (JD required; optional company/role/context) → persists → `GET /api/applications`
      lists metadata + `genState` and **omits heavy snapshots** (`current`/`locked` absent from
      the list payload; present on `GET /api/applications/:id`) → `POST :id/tailor` runs the
      pipeline over the current Library + JD (+context) and persists `current` with
      `currentMeta {at,provider,model}`, `genState:'tailored'` → `current` **survives reload +
      server restart** (reopen DB / fresh app instance) → re-tailor **overwrites** `current` →
      `POST :id/lock` freezes `current` → immutable `locked`; `DELETE :id/lock` clears it.
- [ ] **Snapshot integrity (self-contained, §27):** after tailor+lock, **deleting or editing a
      Library entry that fed the snapshot leaves `current` and `locked` byte-identical** — snapshots
      hold full content, never entry-ID references. (This is the invariant that lets the Library be a
      living bank without corrupting saved applications.)
- [ ] **Context-not-facts (§6.2, keyless machinery):** `context` reaches the model *user message*
      when provided and is absent (user message byte-identical to baseline) when not — proving the
      T014 flip-path is unchanged; and `validateNoFabrication` receives `entries` only, so a number
      traceable only to `context` throws `FabricationError`. **Guard against the vacuous pass:** the
      context-fabrication check must NOT be satisfiable by simply never wiring context — the
      user-message unit test proves context *is* plumbed to the model input.
- [ ] **Tailor error mapping (§9):** live mode, no stored key → `400 { error:'no_api_key' }`; a
      failed tailor leaves `current` untouched and sets `genState:'failed'`.
- [ ] **Full-instance backup (§2/§27):** `GET /api/export` → `{ entries, profile, applications }`;
      `POST /api/import` restores all three; export→wipe→import round-trips entries + profile +
      applications with `current`/`locked` snapshots intact.
- [ ] **IA structural gate (§26):** top-bar `NavTabs` lists Applications | Library | Settings in order;
      every destination reachable from the nav on every page; active destination reflects the route;
      `/` redirects to `/applications`; an unknown non-`/api` path resolves to a known destination
      (app-shell renders), never blank/404; the stateless `TailorView`/`/tailor` route is removed.
- [ ] **Library findability (§26):** progressive `LibraryFilter` (section · tag · free-text) narrows
      the corpus; tags used for grouping/filtering ONLY (no tag-scoring — cross-cutting guard); the
      filter UI stays minimal on a small/empty library (progressive — earns space as the corpus grows).
- [ ] **Browser gate (Playwright, keyless webServer):** `test/e2e/applications.spec.ts` drives the
      full lifecycle through the real UI — login → create an Application whose JD is a **recorded
      fixture** (so `FixtureEngine` replays keyless) → tailor → `current` renders (ResumePage mounts +
      ReasoningPanel present) → **reload persists `current`** → re-tailor → lock → `locked` renders,
      with **no uncaught console errors**. Folds into the baseline composite.
- [ ] **DEFERRED (key-gated, NOT run this epic — no `GOOGLE_GENERATIVE_AI_API_KEY`):** "per-app
      `context` measurably shifts selection/emphasis over a fixed Library+JD." A model-quality claim,
      opt-in, recorded honestly like T014's flip. Add when a live key is available; the keyless
      machinery checks above are what gate the build.

## Browser acceptance ([v2-036] semantic amendment) — added 2026-07-03

Escalated to the human because per-phase acceptance was passing on servers that
were never actually reached by a browser. Phase 4 [v2-033] sharpened toward
"GET / returns SPA", but a static 200 with no JS bundle would still game it —
a UI-less container serving raw index.html passes the letter and fails the
intent. Human approved folding a Playwright browser gate into the baseline.
Recorded in ledger [v2-036].

Tooling:
- **Playwright MCP** (installed at user scope, `claude mcp add playwright ...`) —
  the coordinator's live browser-driving capability during the loop; used for
  judgment and for MCP-driven exploration when a spec is red.
- **`@playwright/test`** in-repo — the durable, human-re-runnable acceptance
  record. Specs live under `test/e2e/*.spec.ts`; config at `playwright.config.ts`
  with `webServer` booting `bun run start` under Node/tsx (locked [v2-017]).
  Chromium only (no cross-browser matrix — that's scope-creep for this oracle).

Per-phase browser checks (**additive** to existing Phase-1/2/4 lines above):

- **Phase 1** — Playwright spec drives LibraryView CRUD on experience + project
  + education + skill through the real UI: form open → save → list update →
  edit → save → delete. A page reload after each create asserts persistence
  from the browser side, matching the existing "persists across a server
  restart" line from the API side.
- **Phase 2** — Playwright spec exercises first-run set-password → login →
  reaches a protected route; a re-navigation after cookie clear is refused;
  session cookie asserted `HttpOnly`. Complements the existing keyless
  401-on-no-session test.
- **Phase 4** — after `docker compose up --build`, Playwright spec loads `/`,
  asserts the React root **actually mounts** (root node non-empty AND expected
  app-shell text present) with **no uncaught console errors**, and completes
  one live `/api/*` round-trip through the SPA (a settings fetch through the
  authed session). **Sharpens [v2-033]:** a container serving a static
  index.html with no JS bundle would now fail this line.

**Phase 0 is intentionally NOT amended.** Its risk is the tailor pipeline's
behavioral flip, carried by T014's live model eval; a browser check on
`/api/health` duplicates the existing curl. Recorded here so a future reader
doesn't add one thinking it was an oversight.

## Caps
Live in `backlog.json` (`caps`): maxAttempts 3 · thrash 2 · chunk 6/invocation.
Snapshotted in the ledger run header.
