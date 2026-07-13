// T14 — cross-document 409 in-flight guard. ONE generation in flight per
// application across BOTH documents: a second generate (resume /tailor OR
// letter /generate-letter) while one is already running must 409 with
// {error:'generation_in_flight'}, and the flag must release on BOTH success
// and failure so a following generation on the OTHER document is allowed.
// Driven by a REAL held-open generation (a blocking engine), never by
// pre-writing 'tailoring' to the DB directly — proves the guard reads
// persisted state set by the route itself, not a test fixture.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import type { LetterDecision, TailorDecision } from "@shared/types";
import { initDb, type Db } from "../src/server/db";
import { seedIfEmpty } from "../src/server/seed";
import { CONTRAST_JDS } from "../src/server/tailor/evalcore";
import type { TailorEngine } from "../src/server/tailor/engine";
import { applicationsRoutes } from "../src/server/routes/applications";

const tmpDirs: string[] = [];

function freshDb(): Db {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-applications-inflight-"));
  tmpDirs.push(dir);
  return initDb(dir).db;
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

async function post(app: FastifyInstance, url: string, payload: unknown = {}) {
  return app.inject({ method: "POST", url, payload });
}

async function get(app: FastifyInstance, url: string) {
  return app.inject({ method: "GET", url });
}

// All three SEED_ENTRIES sit in `cut` so the partition is exact
// (validateDecisionContract now runs in tailor()); empty items means no group
// ledes, so validateLedeRationale is a no-op — this decision stays a valid,
// content-free success, which is all these in-flight-guard tests need.
const OK_DECISION: TailorDecision = {
  signals: { roleLevel: "", weights: [], hardRequirements: [] },
  summary: "",
  items: [],
  cut: [
    { entryId: "cloudcase-rules-engine", reason: "in-flight-guard test: content irrelevant" },
    { entryId: "cloudcase-frontend-rewrite", reason: "in-flight-guard test: content irrelevant" },
    { entryId: "cloudcase-platform-sdk", reason: "in-flight-guard test: content irrelevant" },
  ],
};

const OK_LETTER: LetterDecision = {
  greeting: "Dear Hiring Manager,",
  body: [{ text: "I bring relevant experience.", groundedOn: [] }],
  closing: "Sincerely,",
};

// A deferred TailorEngine: `decide`/`decideLetter` block on a manually
// resolved promise, but signal `entered` synchronously right before that
// await — so a test can wait for "the route has entered the engine call and
// (per the route's own ordering) already written 'tailoring' to the DB"
// without any TOCTOU sleep/race.
class BlockingEngine implements TailorEngine {
  release!: () => void;
  releaseWithFailure!: (err: Error) => void;
  entered = false;
  private enteredResolve!: () => void;

  private deferred = new Promise<void>((resolve) => {
    this.release = resolve;
  });
  private failDeferred = new Promise<void>((_, reject) => {
    this.releaseWithFailure = reject;
  });
  private shouldFail = false;
  entered$ = new Promise<void>((resolve) => {
    this.enteredResolve = resolve;
  });

  failNext(): void {
    this.shouldFail = true;
  }

  private async wait(): Promise<void> {
    this.entered = true;
    this.enteredResolve();
    if (this.shouldFail) {
      await this.failDeferred;
      return;
    }
    await this.deferred;
  }

  async decide(): Promise<TailorDecision> {
    await this.wait();
    return OK_DECISION;
  }

  async decideLetter(): Promise<LetterDecision> {
    await this.wait();
    return OK_LETTER;
  }
}

function appWith(db: Db, engine: TailorEngine): FastifyInstance {
  const app = Fastify();
  applicationsRoutes(app, db, { engine });
  return app;
}

describe("T14: cross-document in-flight guard — real held-open generation, never a pre-written DB flag", () => {
  it("resume (A) in flight blocks letter (B) with 409; releasing A completes it 200 'tailored'; a following letter generation then succeeds 200", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const engine = new BlockingEngine();
    const app = appWith(db, engine);

    const jd = CONTRAST_JDS[0]!.jd;
    const created = await post(app, "/api/applications", { jobDescription: jd });
    const id = created.json().id as string;

    // Fire A (/tailor) without awaiting — it will block inside decide().
    const aPromise = post(app, `/api/applications/${id}/tailor`);
    await engine.entered$;

    // The route wrote genState 'tailoring' BEFORE the await — assert the
    // persisted state directly (a fresh request, not aPromise's own read).
    const midFlight = await get(app, `/api/applications/${id}`);
    expect(midFlight.json().genState).toBe("tailoring");

    // Concurrent B (/generate-letter) must 409 off the real persisted flag.
    const b = await post(app, `/api/applications/${id}/generate-letter`);
    expect(b.statusCode).toBe(409);
    expect(b.json()).toEqual({ error: "generation_in_flight" });

    // Release A -> it completes.
    engine.release();
    const a = await aPromise;
    expect(a.statusCode).toBe(200);
    expect(a.json().genState).toBe("tailored");

    const afterA = await get(app, `/api/applications/${id}`);
    expect(afterA.json().genState).toBe("tailored");
    expect(afterA.json().letterGenState).toBe("untailored");

    // A fresh /generate-letter afterward is no longer blocked.
    const following = await post(app, `/api/applications/${id}/generate-letter`);
    expect(following.statusCode).toBe(200);
    expect(following.json().letterGenState).toBe("tailored");
  });

  it("SYMMETRIC: letter (A) in flight blocks concurrent resume (B) with 409", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const engine = new BlockingEngine();
    const app = appWith(db, engine);

    const jd = CONTRAST_JDS[0]!.jd;
    const created = await post(app, "/api/applications", { jobDescription: jd });
    const id = created.json().id as string;

    const aPromise = post(app, `/api/applications/${id}/generate-letter`);
    await engine.entered$;

    const midFlight = await get(app, `/api/applications/${id}`);
    expect(midFlight.json().letterGenState).toBe("tailoring");

    const b = await post(app, `/api/applications/${id}/tailor`);
    expect(b.statusCode).toBe(409);
    expect(b.json()).toEqual({ error: "generation_in_flight" });

    engine.release();
    const a = await aPromise;
    expect(a.statusCode).toBe(200);
    expect(a.json().letterGenState).toBe("tailored");

    const following = await post(app, `/api/applications/${id}/tailor`);
    expect(following.statusCode).toBe(200);
  });

  it("CROSS-DOCUMENT FAILURE RELEASE: a failing resume (A) settles to 'failed' (not stuck 'tailoring'); an immediately-following letter generation succeeds 200", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const engine = new BlockingEngine();
    engine.failNext();
    const app = appWith(db, engine);

    const jd = CONTRAST_JDS[0]!.jd;
    const created = await post(app, "/api/applications", { jobDescription: jd });
    const id = created.json().id as string;

    const aPromise = post(app, `/api/applications/${id}/tailor`);
    await engine.entered$;

    const midFlight = await get(app, `/api/applications/${id}`);
    expect(midFlight.json().genState).toBe("tailoring");

    // Concurrent letter generation must still 409 while A is in flight.
    const concurrentLetter = await post(app, `/api/applications/${id}/generate-letter`);
    expect(concurrentLetter.statusCode).toBe(409);
    expect(concurrentLetter.json()).toEqual({ error: "generation_in_flight" });

    // Fail A.
    engine.releaseWithFailure(new Error("provider exploded"));
    const a = await aPromise;
    expect(a.statusCode).toBe(502);

    const afterFailure = await get(app, `/api/applications/${id}`);
    expect(afterFailure.json().genState).toBe("failed");
    expect(afterFailure.json().letterGenState).toBe("untailored");

    // The guard released on the failure path — an immediately-following
    // letter generation must succeed, using a fresh (non-blocking) engine
    // path so it actually completes rather than hanging on the same deferred.
    const freshEngine = new BlockingEngine();
    const appFresh = appWith(db, freshEngine);
    const followingPromise = post(appFresh, `/api/applications/${id}/generate-letter`);
    await freshEngine.entered$;
    freshEngine.release();
    const following = await followingPromise;
    expect(following.statusCode).toBe(200);
    expect(following.json().letterGenState).toBe("tailored");
  });
});
