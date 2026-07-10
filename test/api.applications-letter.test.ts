// T13 — POST /api/applications/:id/generate-letter + /undo-letter. Letter
// generation is an INDEPENDENT action from /tailor: it never touches
// `current` (the resume snapshot), overwrites-on-regenerate with one-level
// undo (letterCurrent<->letterPrevious), and carries its own genState/
// letterFailedReason taxonomy. Mirrors api.applications-tailor.test.ts's harness.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import type { CoverLetter, LetterDecision, TailorDecision } from "@shared/types";
import { buildApp } from "../src/server/index";
import { initDb, type Db } from "../src/server/db";
import { seedIfEmpty } from "../src/server/seed";
import { CONTRAST_JDS } from "../src/server/tailor/evalcore";
import { NoFixtureError, type TailorEngine } from "../src/server/tailor/engine";
import { FabricationError } from "../src/server/tailor/validate";
import { applicationsRoutes } from "../src/server/routes/applications";

const tmpDirs: string[] = [];

function freshDb(): Db {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-applications-letter-"));
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

function appWithSpy(db: Db, engine: TailorEngine): FastifyInstance {
  const app = Fastify();
  applicationsRoutes(app, db, { engine });
  return app;
}

describe("POST /api/applications/:id/generate-letter — persists via FixtureEngine (keyless, recorded JD)", () => {
  it("writes letterCurrent/letterGenState 'tailored' WITHOUT touching `current` (the resume snapshot)", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const jdA = CONTRAST_JDS[0]!.jd;

    const created = await post(app, "/api/applications", { jobDescription: jdA });
    expect(created.statusCode).toBe(200);
    const id = created.json().id as string;

    // Pre-populate `current` via a REAL /tailor call first — isolation must
    // be proven against a non-null baseline, not a vacuous null.
    const tailored = await post(app, `/api/applications/${id}/tailor`);
    expect(tailored.statusCode).toBe(200);
    const preCurrent = tailored.json().current;
    expect(preCurrent).not.toBeNull();

    const lettered = await post(app, `/api/applications/${id}/generate-letter`);
    expect(lettered.statusCode).toBe(200);
    const body = lettered.json();
    expect(body.letterGenState).toBe("tailored");
    expect(body.letterCurrent).not.toBeNull();
    expect(body.current).toEqual(preCurrent);

    const fetched = await get(app, `/api/applications/${id}`);
    expect(fetched.json().current).toEqual(preCurrent);
    expect(fetched.json().letterCurrent).toEqual(body.letterCurrent);
    expect(fetched.json().letterGenState).toBe("tailored");
  });

  it("regenerating with a DISTINCT recorded JD replaces letterCurrent and moves the prior into letterPrevious", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const jdA = CONTRAST_JDS[0]!.jd;
    const jdB = CONTRAST_JDS[1]!.jd;

    const created = await post(app, "/api/applications", { jobDescription: jdA });
    const id = created.json().id as string;

    const first = await post(app, `/api/applications/${id}/generate-letter`);
    expect(first.statusCode).toBe(200);
    const firstLetter = first.json().letterCurrent;
    expect(firstLetter).not.toBeNull();

    // FixtureEngine.decideLetter keys on (jd, entries) only — changing the
    // JD (not just motivation) is required to get a distinct replayed letter.
    const putRes = await app.inject({
      method: "PUT",
      url: `/api/applications/${id}`,
      payload: { jobDescription: jdB },
    });
    expect(putRes.statusCode).toBe(200);

    const second = await post(app, `/api/applications/${id}/generate-letter`);
    expect(second.statusCode).toBe(200);
    const secondLetter = second.json().letterCurrent;
    expect(secondLetter).not.toEqual(firstLetter);
    expect(second.json().letterPrevious).toEqual(firstLetter);

    const fetched = await get(app, `/api/applications/${id}`);
    expect(fetched.json().letterCurrent).toEqual(secondLetter);
    expect(fetched.json().letterPrevious).toEqual(firstLetter);
  });
});

describe("POST /api/applications/:id/undo-letter — one-level swap", () => {
  it("swaps letterCurrent <-> letterPrevious back to the pre-regenerate values", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const jdA = CONTRAST_JDS[0]!.jd;
    const jdB = CONTRAST_JDS[1]!.jd;

    const created = await post(app, "/api/applications", { jobDescription: jdA });
    const id = created.json().id as string;

    const first = await post(app, `/api/applications/${id}/generate-letter`);
    const firstLetter = first.json().letterCurrent;

    await app.inject({
      method: "PUT",
      url: `/api/applications/${id}`,
      payload: { jobDescription: jdB },
    });
    const second = await post(app, `/api/applications/${id}/generate-letter`);
    const secondLetter = second.json().letterCurrent;
    expect(secondLetter).not.toEqual(firstLetter);

    const undone = await post(app, `/api/applications/${id}/undo-letter`);
    expect(undone.statusCode).toBe(200);
    expect(undone.json().letterCurrent).toEqual(firstLetter);
    expect(undone.json().letterPrevious).toEqual(secondLetter);

    // undo is itself undoable once — applying it again restores the swap.
    const redone = await post(app, `/api/applications/${id}/undo-letter`);
    expect(redone.statusCode).toBe(200);
    expect(redone.json().letterCurrent).toEqual(secondLetter);
    expect(redone.json().letterPrevious).toEqual(firstLetter);
  });
});

describe("generate-letter failure paths leave letterCurrent/letterPrevious untouched and classify via mapTailorError", () => {
  it("a thrown NoFixtureError from a non-null start: both snapshots deep-equal the pre-failure values; genState 'failed'", async () => {
    const db = freshDb();
    seedIfEmpty(db);

    class OnceThenFailEngine implements TailorEngine {
      calls = 0;
      async decide(): Promise<TailorDecision> {
        throw new Error("unused in this suite");
      }
      async decideLetter(): Promise<LetterDecision> {
        this.calls += 1;
        if (this.calls === 1) {
          return {
            greeting: "Dear Hiring Manager,",
            body: [{ text: "I bring relevant experience.", groundedOn: [] }],
            closing: "Sincerely,",
          };
        }
        throw new NoFixtureError("some-key", ["scenario-a"]);
      }
    }
    const engine = new OnceThenFailEngine();
    const app = appWithSpy(db, engine);

    const created = await post(app, "/api/applications", { jobDescription: "Hiring an engineer." });
    const id = created.json().id as string;

    const seedSuccess = await post(app, `/api/applications/${id}/generate-letter`);
    expect(seedSuccess.statusCode).toBe(200);
    const preLetterCurrent: CoverLetter = seedSuccess.json().letterCurrent;
    const preLetterPrevious = seedSuccess.json().letterPrevious;
    expect(preLetterCurrent).not.toBeNull();

    const failed = await post(app, `/api/applications/${id}/generate-letter`);
    expect(failed.statusCode).toBe(422);
    expect(failed.json()).toEqual({ error: "no_fixture" });

    const fetched = await get(app, `/api/applications/${id}`);
    expect(fetched.json().letterCurrent).toEqual(preLetterCurrent);
    expect(fetched.json().letterPrevious).toEqual(preLetterPrevious);
    expect(fetched.json().letterGenState).toBe("failed");
    expect(fetched.json().letterFailedReason).toBe("no_fixture");
  });

  it("a thrown FabricationError yields a DIFFERENT letterFailedReason than a NoFixtureError (proves classification, not a hardcoded string)", async () => {
    const db = freshDb();
    seedIfEmpty(db);

    class OnceThenFabricateEngine implements TailorEngine {
      calls = 0;
      async decide(): Promise<TailorDecision> {
        throw new Error("unused in this suite");
      }
      async decideLetter(): Promise<LetterDecision> {
        this.calls += 1;
        if (this.calls === 1) {
          return {
            greeting: "Dear Hiring Manager,",
            body: [{ text: "I bring relevant experience.", groundedOn: [] }],
            closing: "Sincerely,",
          };
        }
        throw new FabricationError("number not grounded");
      }
    }
    const engine = new OnceThenFabricateEngine();
    const app = appWithSpy(db, engine);

    const created = await post(app, "/api/applications", { jobDescription: "Hiring an engineer." });
    const id = created.json().id as string;

    const seedSuccess = await post(app, `/api/applications/${id}/generate-letter`);
    expect(seedSuccess.statusCode).toBe(200);
    const preLetterCurrent = seedSuccess.json().letterCurrent;
    const preLetterPrevious = seedSuccess.json().letterPrevious;

    const failed = await post(app, `/api/applications/${id}/generate-letter`);
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toEqual({ error: "fabrication" });

    const fetched = await get(app, `/api/applications/${id}`);
    expect(fetched.json().letterCurrent).toEqual(preLetterCurrent);
    expect(fetched.json().letterPrevious).toEqual(preLetterPrevious);
    expect(fetched.json().letterGenState).toBe("failed");
    expect(fetched.json().letterFailedReason).toBe("fabrication");
    // distinct from the NoFixtureError case above
    expect(fetched.json().letterFailedReason).not.toBe("no_fixture");
  });

  it("404s for a nonexistent application id", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    const res = await post(app, "/api/applications/does-not-exist/generate-letter");
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });

  it("LIVE mode with no stored key -> 400 {error:'no_api_key'}, before any engine call", async () => {
    const db = freshDb();
    const app = Fastify();
    applicationsRoutes(app, db, { config: { tailorEngine: "live" } });

    const created = await post(app, "/api/applications", { jobDescription: "Hiring an engineer." });
    const id = created.json().id as string;

    const res = await post(app, `/api/applications/${id}/generate-letter`);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "no_api_key" });

    const fetched = await get(app, `/api/applications/${id}`);
    expect(fetched.json().letterGenState).toBe("untailored");
  });
});

describe("PUT motivation is persisted and readable via a SEPARATE GET (not the PUT's own echo)", () => {
  it("stores motivation distinctly from context", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const created = await post(app, "/api/applications", { jobDescription: "Hiring an engineer." });
    const id = created.json().id as string;

    const motivation = "I've followed this team's public engineering blog for years.";
    const putRes = await app.inject({
      method: "PUT",
      url: `/api/applications/${id}`,
      payload: { motivation },
    });
    expect(putRes.statusCode).toBe(200);

    const fetched = await get(app, `/api/applications/${id}`);
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().motivation).toBe(motivation);
  });
});
