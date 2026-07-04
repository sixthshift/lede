// E6-A3 — POST /api/applications/:id/tailor (purely additive alongside the
// stateless /api/tailor). Persists the result on the application record
// instead of returning it bare; context (§27) guides emphasis only.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import type { Entry, TailorDecision } from "@shared/types";
import { buildApp } from "../src/server/index";
import { initDb, type Db } from "../src/server/db";
import { seedIfEmpty } from "../src/server/seed";
import { CONTRAST_JDS } from "../src/server/tailor/evalcore";
import { buildUserPrompt, type TailorEngine } from "../src/server/tailor/engine";
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
  calls: { jd: string; entries: Entry[]; context?: string | null; composedPrompt: string }[] = [];
  constructor(private response: TailorDecision) {}
  async decide(jd: string, entries: Entry[], context?: string | null): Promise<TailorDecision> {
    this.calls.push({ jd, entries, context, composedPrompt: buildUserPrompt(jd, context) });
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

  it("an empty (absent) stored context yields the byte-identical baseline message", async () => {
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
    expect(spy.calls[0]!.composedPrompt).toBe(buildUserPrompt(jd));
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
