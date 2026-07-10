// T15 — motivation isolation guard. Motivation is a dedicated per-application
// field that reaches ONLY the letter pipeline (engine.decideLetter) — never
// the resume pipeline (engine.decide). This is a route-level guard, not a
// signature-only unit check on buildUserPrompt: a spy TailorEngine wraps a
// real FixtureEngine (so /tailor and /generate-letter both actually succeed)
// and records the exact args each method receives. Two applications,
// identical except one has `motivation` set, must produce BYTE-IDENTICAL
// decide() args — proving motivation never leaks into the resume path — while
// their decideLetter() args differ exactly in motivation (the anti-cheat
// contrast: proves motivation IS wired somewhere, so the byte-identical
// resume assertion isn't vacuous).
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import type { Entry, LetterDecision, TailorDecision } from "@shared/types";
import { initDb, type Db } from "../src/server/db";
import { seedIfEmpty } from "../src/server/seed";
import { CONTRAST_JDS } from "../src/server/tailor/evalcore";
import { FixtureEngine, type TailorEngine } from "../src/server/tailor/engine";
import { applicationsRoutes } from "../src/server/routes/applications";

const tmpDirs: string[] = [];

function freshDb(): Db {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-motivation-isolation-"));
  tmpDirs.push(dir);
  return initDb(dir).db;
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

async function post(app: FastifyInstance, url: string, payload: unknown = {}) {
  return app.inject({ method: "POST", url, payload });
}

type DecideCall = {
  jd: string;
  entries: Entry[];
  context?: string | null;
  budget?: string | null;
};

type DecideLetterCall = {
  jd: string;
  entries: Entry[];
  motivation?: string | null;
  context?: string | null;
  voice?: string | null;
};

// Captures the exact args each TailorEngine method receives, then delegates
// to a real FixtureEngine so both /tailor and /generate-letter actually
// succeed (a spy that merely captures without delegating couldn't prove
// isolation against a real, non-degenerate request).
class SpyEngine implements TailorEngine {
  decideCalls: DecideCall[] = [];
  decideLetterCalls: DecideLetterCall[] = [];
  private inner = new FixtureEngine();

  async decide(
    jd: string,
    entries: Entry[],
    context?: string | null,
    budget?: string | null,
  ): Promise<TailorDecision> {
    this.decideCalls.push({ jd, entries, context, budget });
    return this.inner.decide(jd, entries, context, budget);
  }

  async decideLetter(
    jd: string,
    entries: Entry[],
    motivation?: string | null,
    context?: string | null,
    voice?: string | null,
  ): Promise<LetterDecision> {
    this.decideLetterCalls.push({ jd, entries, motivation, context, voice });
    return this.inner.decideLetter(jd, entries, motivation, context, voice);
  }
}

function appWithSpy(db: Db, engine: SpyEngine): FastifyInstance {
  const app = Fastify();
  applicationsRoutes(app, db, { engine });
  return app;
}

describe("T15: motivation reaches ONLY the letter pipeline, never the resume pipeline", () => {
  it("resume decide() args are byte-identical across two identical apps differing only in motivation; decideLetter() args differ exactly in motivation", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const spy = new SpyEngine();
    const app = appWithSpy(db, spy);

    const jd = CONTRAST_JDS[0]!.jd;
    const context = "Emphasize public API design experience.";
    const motivation = "I've followed this team's public engineering blog for years.";

    // Two applications, identical in every field except motivation.
    const createdWith = await post(app, "/api/applications", {
      jobDescription: jd,
      context,
      targetPages: 1,
    });
    expect(createdWith.statusCode).toBe(200);
    const idWith = createdWith.json().id as string;

    const createdWithout = await post(app, "/api/applications", {
      jobDescription: jd,
      context,
      targetPages: 1,
    });
    expect(createdWithout.statusCode).toBe(200);
    const idWithout = createdWithout.json().id as string;

    const putWith = await app.inject({
      method: "PUT",
      url: `/api/applications/${idWith}`,
      payload: { motivation },
    });
    expect(putWith.statusCode).toBe(200);
    expect(putWith.json().motivation).toBe(motivation);

    // app-without gets no motivation PUT at all — stays null.
    expect(createdWithout.json().motivation ?? null).toBeNull();

    // ── drive /tailor (resume) for both, through the spy ──
    const tailoredWith = await post(app, `/api/applications/${idWith}/tailor`);
    expect(tailoredWith.statusCode).toBe(200);
    const tailoredWithout = await post(app, `/api/applications/${idWithout}/tailor`);
    expect(tailoredWithout.statusCode).toBe(200);

    expect(spy.decideCalls).toHaveLength(2);
    const [decideWith, decideWithout] = spy.decideCalls;
    const decideWithJson = JSON.stringify(decideWith);
    const decideWithoutJson = JSON.stringify(decideWithout);
    expect(decideWithJson).toBe(decideWithoutJson);
    // Motivation text must never appear anywhere in the resume decide() input.
    expect(decideWithJson).not.toContain(motivation);
    expect(decideWithoutJson).not.toContain(motivation);

    // ── CONTRAST: drive /generate-letter (letter) for both, through the spy ──
    const letteredWith = await post(app, `/api/applications/${idWith}/generate-letter`);
    expect(letteredWith.statusCode).toBe(200);
    const letteredWithout = await post(app, `/api/applications/${idWithout}/generate-letter`);
    expect(letteredWithout.statusCode).toBe(200);

    expect(spy.decideLetterCalls).toHaveLength(2);
    const [letterWith, letterWithout] = spy.decideLetterCalls;
    expect(letterWith.motivation).toBe(motivation);
    expect(letterWithout.motivation ?? null).toBeNull();

    // The only difference between the two decideLetter() calls is motivation.
    expect({ ...letterWith, motivation: null }).toEqual({ ...letterWithout, motivation: null });
  });
});
