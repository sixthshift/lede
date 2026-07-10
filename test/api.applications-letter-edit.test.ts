// T32 — PATCH /api/applications/:id/letter-part + paragraph insert/remove +
// POST /api/applications/:id/letter-blank. The letter's editing surface is
// richer than the resume's (LOCKED decision: prose structure IS the user's,
// so the letter additionally allows paragraph insert/remove); a hand-added
// paragraph carries groundedOn:[] — authored, not validated — and a blank
// letter can be created without any model call (the retroactive-import
// entry point). A locked application 409s on every letter-edit route.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import type { CoverLetter, LetterDecision, TailorDecision } from "@shared/types";
import { letterPartPatchZ } from "@shared/schema";
import { buildApp } from "../src/server/index";
import { initDb, type Db } from "../src/server/db";
import { seedIfEmpty } from "../src/server/seed";
import { CONTRAST_JDS } from "../src/server/tailor/evalcore";
import type { TailorEngine } from "../src/server/tailor/engine";
import { applicationsRoutes } from "../src/server/routes/applications";

const tmpDirs: string[] = [];

function freshDb(): Db {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-applications-letter-edit-"));
  tmpDirs.push(dir);
  return initDb(dir).db;
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

async function post(app: FastifyInstance, url: string, payload: unknown = {}) {
  return app.inject({ method: "POST", url, payload });
}

async function patch(app: FastifyInstance, url: string, payload: unknown) {
  return app.inject({ method: "PATCH", url, payload });
}

async function del(app: FastifyInstance, url: string) {
  return app.inject({ method: "DELETE", url });
}

async function get(app: FastifyInstance, url: string) {
  return app.inject({ method: "GET", url });
}

function appWithSpy(db: Db, engine: TailorEngine): FastifyInstance {
  const app = Fastify();
  applicationsRoutes(app, db, { engine });
  return app;
}

// A spy engine whose decide/decideLetter THROW if called — proves a route
// under test never resolves/calls the tailor engine at all (not merely
// "works without a key", which a fixture engine would also satisfy).
class ThrowingEngine implements TailorEngine {
  async decide(): Promise<TailorDecision> {
    throw new Error("decide() should never be called by this route");
  }
  async decideLetter(): Promise<LetterDecision> {
    throw new Error("decideLetter() should never be called by this route");
  }
}

// FixtureEngine (buildApp's default, keyless) only replays a letter for a
// (jd, entries) pair it has a recorded fixture for — CONTRAST_JDS is the
// recorded set (mirrors T13's api.applications-letter.test.ts convention).
// Callers must have seeded entries via seedIfEmpty first.
async function createWithLetter(
  app: FastifyInstance,
): Promise<{ id: string; letter: CoverLetter }> {
  const created = await post(app, "/api/applications", { jobDescription: CONTRAST_JDS[0]!.jd });
  const id = created.json().id as string;
  const lettered = await post(app, `/api/applications/${id}/generate-letter`);
  expect(lettered.statusCode).toBe(200);
  return { id, letter: lettered.json().letterCurrent as CoverLetter };
}

describe("letterPartPatchZ — strict by construction", () => {
  it("accepts a well-formed body/greeting/closing patch", () => {
    expect(
      letterPartPatchZ.safeParse({ path: { kind: "greeting" }, text: "Dear x," }).success,
    ).toBe(true);
    expect(
      letterPartPatchZ.safeParse({ path: { kind: "body", index: 0 }, text: "x" }).success,
    ).toBe(true);
    expect(
      letterPartPatchZ.safeParse({ path: { kind: "closing" }, text: "Sincerely," }).success,
    ).toBe(true);
  });

  it.each([
    "groundedOn",
    "entryId",
    "structure",
  ])("rejects a well-formed patch carrying a stray top-level %s key", (key) => {
    const body = { path: { kind: "body", index: 0 }, text: "x", [key]: "x" };
    expect(letterPartPatchZ.safeParse(body).success).toBe(false);
  });

  it("rejects groundedOn riding along on the path object itself", () => {
    const body = { path: { kind: "body", index: 0, groundedOn: ["x"] }, text: "x" };
    expect(letterPartPatchZ.safeParse(body).success).toBe(false);
  });

  it("rejects a non-string text value", () => {
    expect(letterPartPatchZ.safeParse({ path: { kind: "greeting" }, text: 123 }).success).toBe(
      false,
    );
  });

  it("rejects an unknown path kind", () => {
    expect(letterPartPatchZ.safeParse({ path: { kind: "bogus" }, text: "x" }).success).toBe(false);
  });
});

describe("PATCH /api/applications/:id/letter-part", () => {
  it("edits a body paragraph's text AND preserves its groundedOn unchanged", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const { id, letter } = await createWithLetter(app);
    expect(letter.body.length).toBeGreaterThan(0);
    const originalGroundedOn = letter.body[0]!.groundedOn;

    const res = await patch(app, `/api/applications/${id}/letter-part`, {
      path: { kind: "body", index: 0 },
      text: "x",
    });
    expect(res.statusCode).toBe(200);
    const after = res.json();

    expect(after.letterCurrent.body[0].text).toBe("x");
    expect(after.letterCurrent.body[0].groundedOn).toEqual(originalGroundedOn);

    // Nothing else on the row moved.
    expect(after.letterCurrent.greeting).toBe(letter.greeting);
    expect(after.letterCurrent.closing).toBe(letter.closing);
    expect(after.letterPrevious).toEqual(null);
    expect(after.letterGenState).toBe("tailored");
  });

  it("edits the greeting and the closing", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    const { id, letter } = await createWithLetter(app);

    const greetingRes = await patch(app, `/api/applications/${id}/letter-part`, {
      path: { kind: "greeting" },
      text: "Dear Hiring Team,",
    });
    expect(greetingRes.statusCode).toBe(200);
    expect(greetingRes.json().letterCurrent.greeting).toBe("Dear Hiring Team,");
    expect(greetingRes.json().letterCurrent.body).toEqual(letter.body);

    const closingRes = await patch(app, `/api/applications/${id}/letter-part`, {
      path: { kind: "closing" },
      text: "Warm regards,",
    });
    expect(closingRes.statusCode).toBe(200);
    expect(closingRes.json().letterCurrent.closing).toBe("Warm regards,");
  });

  it("does NOT touch `current` (the resume snapshot)", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const created = await post(app, "/api/applications", { jobDescription: CONTRAST_JDS[0]!.jd });
    const id = created.json().id as string;
    const tailored = await post(app, `/api/applications/${id}/tailor`);
    expect(tailored.statusCode).toBe(200);
    const preCurrent = tailored.json().current;

    const lettered = await post(app, `/api/applications/${id}/generate-letter`);
    expect(lettered.statusCode).toBe(200);

    const res = await patch(app, `/api/applications/${id}/letter-part`, {
      path: { kind: "greeting" },
      text: "Dear x,",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().current).toEqual(preCurrent);
  });

  it("body index past the end -> 400, no_letterCurrent -> 400, missing app -> 404", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    const { id, letter } = await createWithLetter(app);

    const oob = await patch(app, `/api/applications/${id}/letter-part`, {
      path: { kind: "body", index: letter.body.length },
      text: "x",
    });
    expect(oob.statusCode).toBe(400);

    const created = await post(app, "/api/applications", { jobDescription: "Hiring an engineer." });
    const noLetterId = created.json().id as string;
    const noLetter = await patch(app, `/api/applications/${noLetterId}/letter-part`, {
      path: { kind: "greeting" },
      text: "x",
    });
    expect(noLetter.statusCode).toBe(400);

    const missing = await patch(app, "/api/applications/does-not-exist/letter-part", {
      path: { kind: "greeting" },
      text: "x",
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe("POST /api/applications/:id/letter-part/paragraph — insert", () => {
  it("stores groundedOn:[] regardless of a groundedOn the client supplies", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    const { id } = await createWithLetter(app);

    const res = await post(app, `/api/applications/${id}/letter-part/paragraph`, {
      position: 0,
      text: "hand-authored paragraph",
      groundedOn: ["real-id"],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().letterCurrent.body[0]).toEqual({
      text: "hand-authored paragraph",
      groundedOn: [],
    });
  });

  it("position check: insert at index 1 leaves paragraphs before/after unchanged and lands exactly at index 1", async () => {
    const db = freshDb();
    const app = buildApp(db);

    // Build a letter with 2 DISTINCT paragraphs directly via letter-blank +
    // two inserts, so the starting shape is fully under this test's control.
    const created = await post(app, "/api/applications", { jobDescription: "Hiring an engineer." });
    const id = created.json().id as string;
    await post(app, `/api/applications/${id}/letter-blank`);
    await post(app, `/api/applications/${id}/letter-part/paragraph`, {
      position: 0,
      text: "first paragraph",
    });
    const seeded = await post(app, `/api/applications/${id}/letter-part/paragraph`, {
      position: 1,
      text: "second paragraph",
    });
    expect(seeded.json().letterCurrent.body.map((p: { text: string }) => p.text)).toEqual([
      "first paragraph",
      "second paragraph",
    ]);

    const inserted = await post(app, `/api/applications/${id}/letter-part/paragraph`, {
      position: 1,
      text: "inserted paragraph",
    });
    expect(inserted.statusCode).toBe(200);
    expect(inserted.json().letterCurrent.body.map((p: { text: string }) => p.text)).toEqual([
      "first paragraph",
      "inserted paragraph",
      "second paragraph",
    ]);

    const removed = await del(app, `/api/applications/${id}/letter-part/paragraph/0`);
    expect(removed.statusCode).toBe(200);
    expect(removed.json().letterCurrent.body.map((p: { text: string }) => p.text)).toEqual([
      "inserted paragraph",
      "second paragraph",
    ]);
  });

  it("position out of range -> 400", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    const { id, letter } = await createWithLetter(app);

    const res = await post(app, `/api/applications/${id}/letter-part/paragraph`, {
      position: letter.body.length + 1,
      text: "x",
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /api/applications/:id/letter-part/paragraph/:index — remove", () => {
  it("index out of range -> 400", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    const { id, letter } = await createWithLetter(app);

    const res = await del(
      app,
      `/api/applications/${id}/letter-part/paragraph/${letter.body.length}`,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/applications/:id/letter-blank", () => {
  it("200s with an empty skeleton, letterGenState 'untailored', and ZERO engine calls — proves no model call", async () => {
    const db = freshDb();
    const engine = new ThrowingEngine();
    const app = appWithSpy(db, engine);

    const created = await post(app, "/api/applications", { jobDescription: "Hiring an engineer." });
    const id = created.json().id as string;
    const initial = await get(app, `/api/applications/${id}`);
    expect(initial.json().letterCurrent).toBeNull();

    const res = await post(app, `/api/applications/${id}/letter-blank`);
    expect(res.statusCode).toBe(200);
    expect(res.json().letterCurrent).toEqual({ greeting: "", body: [], closing: "" });
    expect(res.json().letterGenState).toBe("untailored");

    // Then a PATCH edits it into content.
    const patched = await patch(app, `/api/applications/${id}/letter-part`, {
      path: { kind: "greeting" },
      text: "Dear Hiring Manager,",
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().letterCurrent.greeting).toBe("Dear Hiring Manager,");

    const fetched = await get(app, `/api/applications/${id}`);
    expect(fetched.json().letterCurrent.greeting).toBe("Dear Hiring Manager,");
  });

  it("404s for a nonexistent application id", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);
    const res = await post(app, "/api/applications/does-not-exist/letter-blank");
    expect(res.statusCode).toBe(404);
  });
});

describe("LOCKED application -> every letter-edit route 409s", () => {
  it("letter-part patch / insert / remove / blank all 409 once locked via the real POST /lock", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const created = await post(app, "/api/applications", { jobDescription: CONTRAST_JDS[0]!.jd });
    const id = created.json().id as string;
    const tailoredRes = await post(app, `/api/applications/${id}/tailor`);
    expect(tailoredRes.statusCode).toBe(200);
    const lettered = await post(app, `/api/applications/${id}/generate-letter`);
    expect(lettered.statusCode).toBe(200);
    const letter = lettered.json().letterCurrent as CoverLetter;

    const lockRes = await post(app, `/api/applications/${id}/lock`);
    expect(lockRes.statusCode).toBe(200);
    const before = await get(app, `/api/applications/${id}`);

    const patchRes = await patch(app, `/api/applications/${id}/letter-part`, {
      path: { kind: "greeting" },
      text: "should never land",
    });
    expect(patchRes.statusCode).toBe(409);

    const insertRes = await post(app, `/api/applications/${id}/letter-part/paragraph`, {
      position: 0,
      text: "should never land",
    });
    expect(insertRes.statusCode).toBe(409);

    const removeRes = await del(app, `/api/applications/${id}/letter-part/paragraph/0`);
    expect(removeRes.statusCode).toBe(409);

    const blankRes = await post(app, `/api/applications/${id}/letter-blank`);
    expect(blankRes.statusCode).toBe(409);

    expect(letter.body.length).toBeGreaterThan(0);
    const after = await get(app, `/api/applications/${id}`);
    expect(after.json()).toEqual(before.json());
  });
});
