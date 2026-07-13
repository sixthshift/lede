// E6-A3 — POST /api/applications/:id/tailor (purely additive alongside the
// stateless /api/tailor). Persists the result on the application record
// instead of returning it bare; context (§27) guides emphasis only.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import type { Entry, Layout, TailorDecision } from "@shared/types";
import { buildApp } from "../src/server/index";
import { initDb, type Db } from "../src/server/db";
import { seedIfEmpty } from "../src/server/seed";
import { CONTRAST_JDS } from "../src/server/tailor/evalcore";
import { buildUserPrompt, tailor, type TailorEngine } from "../src/server/tailor/engine";
import { DecisionContractError } from "../src/server/tailor/validate";
import { deriveContentBudget } from "../src/server/tailor/budget";
import { DEFAULT_FORMAT_V2 } from "@shared/format-v2";
import { applicationsRoutes } from "../src/server/routes/applications";

const tmpDirs: string[] = [];

function freshDb(): Db {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-applications-tailor-"));
  tmpDirs.push(dir);
  return initDb(dir).db;
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

async function post(app: FastifyInstance, url: string, payload: unknown = {}) {
  return app.inject({ method: "POST", url, payload });
}

describe("POST /api/applications/:id/tailor — persists via FixtureEngine (keyless, recorded JD)", () => {
  it("persists current/currentMeta/genState 'tailored'; survives a fresh app instance; re-tailor overwrites current", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const jdA = CONTRAST_JDS[0]!.jd;
    const jdB = CONTRAST_JDS[1]!.jd;

    const created = await post(app, "/api/applications", { jobDescription: jdA });
    expect(created.statusCode).toBe(200);
    const id = created.json().id as string;

    const tailored = await post(app, `/api/applications/${id}/tailor`);
    expect(tailored.statusCode).toBe(200);
    const body = tailored.json();
    expect(body.genState).toBe("tailored");
    expect(body.current).not.toBeNull();
    expect(body.currentMeta).toMatchObject({
      provider: expect.any(String),
      model: expect.any(String),
    });
    expect(body.currentMeta.at).toEqual(expect.any(Number));

    const firstCurrent = body.current;

    // survives a fresh app instance (same underlying db) — proves persistence,
    // not an in-memory cache
    const restarted = buildApp(db);
    const fetched = await restarted.inject({ method: "GET", url: `/api/applications/${id}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().current).toEqual(firstCurrent);
    expect(fetched.json().genState).toBe("tailored");

    // re-tailor (a different recorded JD) overwrites current
    const updated = await restarted.inject({
      method: "PUT",
      url: `/api/applications/${id}`,
      payload: { jobDescription: jdB },
    });
    expect(updated.statusCode).toBe(200);

    const retailored = await post(restarted, `/api/applications/${id}/tailor`);
    expect(retailored.statusCode).toBe(200);
    const secondCurrent = retailored.json().current;
    expect(secondCurrent).not.toEqual(firstCurrent);

    const final = await restarted.inject({ method: "GET", url: `/api/applications/${id}` });
    expect(final.json().current).toEqual(secondCurrent);
  });

  it("404s for a nonexistent application id", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    const res = await post(app, "/api/applications/does-not-exist/tailor");
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });
});

// A spy TailorEngine that composes the exact user message ProviderEngine
// would (via the exported buildUserPrompt helper), so this suite proves the
// route wires context all the way to the engine call — not just that the
// pure helper works in isolation.
class SpyEngine implements TailorEngine {
  calls: {
    jd: string;
    entries: Entry[];
    context?: string | null;
    budget?: string | null;
    composedPrompt: string;
  }[] = [];
  constructor(private response: TailorDecision) {}
  async decide(
    jd: string,
    entries: Entry[],
    context?: string | null,
    budget?: string | null,
  ): Promise<TailorDecision> {
    this.calls.push({
      jd,
      entries,
      context,
      budget,
      composedPrompt: buildUserPrompt(jd, context, budget),
    });
    return this.response;
  }
}

const EMPTY_DECISION: TailorDecision = {
  signals: { roleLevel: "", weights: [], hardRequirements: [] },
  summary: "",
  items: [],
  cut: [],
};

function appWithSpy(db: Db, engine: TailorEngine): FastifyInstance {
  const app = Fastify();
  applicationsRoutes(app, db, { engine });
  return app;
}

describe("RED-TEAM #1: stored context reaches decide() and the composed user message, route -> engine", () => {
  it("a non-empty stored context is received by decide() and appears in the composed message", async () => {
    const db = freshDb();
    const spy = new SpyEngine(EMPTY_DECISION);
    const app = appWithSpy(db, spy);

    const jd = "Hiring an infra-focused platform engineer.";
    const context = "The team is deep in a Kubernetes migration; emphasize infra ownership.";
    const created = await post(app, "/api/applications", { jobDescription: jd, context });
    const id = created.json().id as string;

    const res = await post(app, `/api/applications/${id}/tailor`);
    expect(res.statusCode).toBe(200);

    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]!.context).toBe(context);
    expect(spy.calls[0]!.composedPrompt).toContain(context);
    expect(spy.calls[0]!.composedPrompt.startsWith(buildUserPrompt(jd))).toBe(true);
  });

  it("an empty (absent) stored context yields the byte-identical baseline prefix (budget still appends, §28.5)", async () => {
    const db = freshDb();
    const spy = new SpyEngine(EMPTY_DECISION);
    const app = appWithSpy(db, spy);

    const jd = "Hiring a generalist software engineer.";
    const created = await post(app, "/api/applications", { jobDescription: jd });
    const id = created.json().id as string;

    const res = await post(app, `/api/applications/${id}/tailor`);
    expect(res.statusCode).toBe(200);

    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]!.context ?? null).toBeNull();
    // No context ⇒ context-block-free, exactly like before E7-D1a. The route
    // now always derives a content budget (§28.5), so the composed message
    // gains a budget block after the (context-free) base — the byte-identity
    // guarantee is on buildUserPrompt's context/budget guards, not on the
    // route's end-to-end output once a budget is always supplied.
    expect(spy.calls[0]!.composedPrompt.startsWith(buildUserPrompt(jd))).toBe(true);
    expect(spy.calls[0]!.composedPrompt).toBe(buildUserPrompt(jd, null, spy.calls[0]!.budget));
  });
});

describe("E7-D1a: the route derives and threads a content budget to the engine (§28.5)", () => {
  it("an application with a 1-page target receives a budget matching deriveContentBudget for its paper/targetPages/format", async () => {
    const db = freshDb();
    const spy = new SpyEngine(EMPTY_DECISION);
    const app = appWithSpy(db, spy);

    const created = await post(app, "/api/applications", {
      jobDescription: "Hiring a backend engineer.",
      targetPages: 1,
    });
    const id = created.json().id as string;

    const res = await post(app, `/api/applications/${id}/tailor`);
    expect(res.statusCode).toBe(200);

    expect(spy.calls).toHaveLength(1);
    const expectedBudget = deriveContentBudget({
      paper: "letter", // settings.paper default
      targetPages: 1,
      format: DEFAULT_FORMAT_V2, // settings.defaultFormat default (migrated on read); app.format is null
    });
    expect(spy.calls[0]!.budget).toBe(expectedBudget);
    expect(spy.calls[0]!.composedPrompt).toContain(expectedBudget);
  });

  it("a 2-page target yields a distinctly larger budget than a 1-page target for the same app otherwise", async () => {
    const db = freshDb();
    const spy = new SpyEngine(EMPTY_DECISION);
    const app = appWithSpy(db, spy);

    const created = await post(app, "/api/applications", {
      jobDescription: "Hiring a staff engineer.",
      targetPages: 2,
    });
    const id = created.json().id as string;

    await post(app, `/api/applications/${id}/tailor`);

    const expectedOnePageBudget = deriveContentBudget({
      paper: "letter",
      targetPages: 1,
      format: DEFAULT_FORMAT_V2,
    });
    expect(spy.calls[0]!.budget).not.toBe(expectedOnePageBudget);
    expect(spy.calls[0]!.budget).toContain("2 pages");
  });
});

describe("RED-TEAM #11: a failing re-tailor leaves `current` untouched and sets genState 'failed'", () => {
  it("current still deep-equals the prior success (not null) after a thrown re-tailor", async () => {
    const db = freshDb();

    class FlakyEngine implements TailorEngine {
      calls = 0;
      async decide(): Promise<TailorDecision> {
        this.calls += 1;
        if (this.calls === 1) return EMPTY_DECISION;
        throw new Error("provider exploded");
      }
    }
    const engine = new FlakyEngine();
    const app = appWithSpy(db, engine);

    const created = await post(app, "/api/applications", { jobDescription: "Hiring an engineer." });
    const id = created.json().id as string;

    const first = await post(app, `/api/applications/${id}/tailor`);
    expect(first.statusCode).toBe(200);
    expect(first.json().genState).toBe("tailored");
    const successCurrent = first.json().current;
    expect(successCurrent).not.toBeNull();

    const second = await post(app, `/api/applications/${id}/tailor`);
    expect(second.statusCode).toBe(502);
    expect(second.json()).toEqual({ error: "provider_error" });

    const fetched = await app.inject({ method: "GET", url: `/api/applications/${id}` });
    expect(fetched.json().current).toEqual(successCurrent);
    expect(fetched.json().genState).toBe("failed");
  });
});

describe("LIVE mode with no stored key -> 400 {error: 'no_api_key'}, before any engine call", () => {
  it("short-circuits without ever invoking an engine", async () => {
    const db = freshDb();
    const app = Fastify();
    applicationsRoutes(app, db, { config: { tailorEngine: "live" } });

    const created = await post(app, "/api/applications", { jobDescription: "Hiring an engineer." });
    const id = created.json().id as string;

    const res = await post(app, `/api/applications/${id}/tailor`);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "no_api_key" });

    const fetched = await app.inject({ method: "GET", url: `/api/applications/${id}` });
    expect(fetched.json().genState).toBe("untailored");
  });
});

// T002 — validateDecisionContract wired into tailor(), BEFORE assemble(), and
// OUTSIDE any retry: a flat-contract violation (here, a duplicate rank within
// one section — assemble() itself never guards against this; it only throws
// on a foreign/unknown entryId) must surface as DecisionContractError, and
// decide() must be called exactly once (no self-repair, no extra retry —
// §6.1: decide() already retries once internally inside ProviderEngine;
// tailor() sits outside that envelope and must not add a second layer).
describe("tailor() wires validateDecisionContract before assemble(), outside any retry", () => {
  const e1: Entry = {
    id: "e1",
    section: "experience",
    sortKey: 202101,
    meta: { section: "experience", company: "Acme", role: "Eng", period: "2021-present" },
    facts: ["did a thing"],
    tags: [],
  };
  const e2: Entry = {
    id: "e2",
    section: "experience",
    sortKey: 202102,
    meta: { section: "experience", company: "Acme", role: "Eng", period: "2021-present" },
    facts: ["did another thing"],
    tags: [],
  };
  const layout: Layout = [{ section: "experience", enabled: true }];

  // Partition is exact (both e1/e2 in items, none cut) — this violation is
  // ONLY the duplicate rank, isolating the rank check from the partition check.
  const duplicateRankDecision: TailorDecision = {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary: "Summary.",
    items: [
      { entryId: "e1", text: "t", rank: 1 },
      { entryId: "e2", text: "t", rank: 1 },
    ],
    cut: [],
  };

  class CountingEngine implements TailorEngine {
    calls = 0;
    async decide(): Promise<TailorDecision> {
      this.calls += 1;
      return duplicateRankDecision;
    }
    async decideLetter(): ReturnType<TailorEngine["decideLetter"]> {
      throw new Error("not used");
    }
  }

  it("a duplicate rank within one section throws DecisionContractError, and decide() is called exactly once", async () => {
    const engine = new CountingEngine();

    let error: unknown;
    try {
      await tailor(engine, "Hiring an engineer.", [e1, e2], layout);
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(DecisionContractError);
    expect(engine.calls).toBe(1);
  });
});

// T002 — route/persistence: a contract-violating re-tailor is mapped to its
// OWN distinct HTTP code (not 502/fabrication, not 422/no_fixture), and
// leaves `current`/genState exactly like RED-TEAM #11's provider-failure
// case: 'tailored' (positive control) -> 'failed', with `current` still
// deep-equaling the prior success (never touched by the failed re-tailor).
describe("RED-TEAM #12: a decision-contract violation on re-tailor maps to a distinct HTTP code and leaves `current`/genState untouched-then-failed", () => {
  it("current still deep-equals the prior success after a contract-violating re-tailor; HTTP code and error string are both distinct from fabrication/no_fixture", async () => {
    const db = freshDb();
    seedIfEmpty(db);

    // The three seeded entries share company/role/period, so assemble()
    // groups them into one experience group — same shape as the recorded
    // fixtures (see test/decision-contract.test.ts's fixture-reconciliation
    // suite). The first (successful) decision partitions them exactly and
    // gives the lede (rank 1) a leadRationale, satisfying validateLedeRationale.
    const validDecision: TailorDecision = {
      signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
      summary: "Summary.",
      items: [
        {
          entryId: "cloudcase-rules-engine",
          text: "t",
          rank: 1,
          leadRationale: "Because it's the strongest match.",
        },
        { entryId: "cloudcase-frontend-rewrite", text: "t", rank: 2 },
        { entryId: "cloudcase-platform-sdk", text: "t", rank: 3 },
      ],
      cut: [],
    };
    // Same partition (still exact — assemble would happily accept this), but
    // rules-engine and frontend-rewrite now collide on rank 1 within the same
    // "experience" section — the flat rank check catches it before assemble.
    const violatingDecision: TailorDecision = {
      signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
      summary: "Summary.",
      items: [
        {
          entryId: "cloudcase-rules-engine",
          text: "t",
          rank: 1,
          leadRationale: "Because it's the strongest match.",
        },
        { entryId: "cloudcase-frontend-rewrite", text: "t", rank: 1 },
        { entryId: "cloudcase-platform-sdk", text: "t", rank: 2 },
      ],
      cut: [],
    };

    class ContractViolatingEngine implements TailorEngine {
      calls = 0;
      async decide(): Promise<TailorDecision> {
        this.calls += 1;
        return this.calls === 1 ? validDecision : violatingDecision;
      }
    }
    const engine = new ContractViolatingEngine();
    const app = appWithSpy(db, engine);

    const created = await post(app, "/api/applications", { jobDescription: "Hiring an engineer." });
    const id = created.json().id as string;

    // positive control — a real success, so the before/after/before shape
    // proves the failure below leaves a genuine prior snapshot untouched.
    const first = await post(app, `/api/applications/${id}/tailor`);
    expect(first.statusCode).toBe(200);
    expect(first.json().genState).toBe("tailored");
    const successCurrent = first.json().current;
    expect(successCurrent).not.toBeNull();

    const second = await post(app, `/api/applications/${id}/tailor`);
    expect(second.statusCode).toBe(424);
    expect(second.statusCode).not.toBe(502);
    expect(second.statusCode).not.toBe(422);
    expect(second.json()).toEqual({ error: "decision_contract" });
    expect(second.json().error).not.toBe("fabrication");

    const fetched = await app.inject({ method: "GET", url: `/api/applications/${id}` });
    expect(fetched.json().current).toEqual(successCurrent);
    expect(fetched.json().genState).toBe("failed");
  });
});
