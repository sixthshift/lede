// /api/applications CRUD — spec.md §27. A tailoring record for one job, NOT
// a hiring tracker. Mirrors test/api.entries.test.ts's idiom.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/server/index";
import { initDb } from "../src/server/db";
import { applications } from "../src/server/db/schema";
import type { TailoredResume } from "../src/shared/types";

const tmpDirs: string[] = [];

function freshDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-api-applications-"));
  tmpDirs.push(dir);
  return dir;
}

function appOn(dataDir: string): FastifyInstance {
  return buildApp(initDb(dataDir).db);
}

afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

const validApplication = {
  company: "Acme Corp",
  role: "Staff Engineer",
  jobDescription: "Build widgets at scale.",
  context: "Emphasize backend depth.",
};

const fakeResume: TailoredResume = {
  signals: { roleLevel: "staff", weights: [], hardRequirements: [] },
  summary: "A tailored summary.",
  sections: [],
  cut: [],
};

describe("CRUD round-trip: create -> list -> get -> update -> delete", () => {
  it("succeeds with correct shapes at every step", async () => {
    const dataDir = freshDataDir();
    const app = appOn(dataDir);

    const created = (
      await app.inject({ method: "POST", url: "/api/applications", payload: validApplication })
    ).json();
    expect(created.id).toBeTruthy();
    expect(created.company).toBe("Acme Corp");
    expect(created.genState).toBe("untailored");
    expect(created.current).toBeNull();
    expect(created.locked).toBeNull();

    const listRes = await app.inject({ method: "GET", url: "/api/applications" });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(created.id);
    expect(list[0].genState).toBe("untailored");

    const getRes = await app.inject({ method: "GET", url: `/api/applications/${created.id}` });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toMatchObject({ id: created.id, company: "Acme Corp" });

    const putRes = await app.inject({
      method: "PUT",
      url: `/api/applications/${created.id}`,
      payload: { role: "Principal Engineer" },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().role).toBe("Principal Engineer");
    expect(putRes.json().company).toBe("Acme Corp"); // untouched fields survive a partial update

    const delRes = await app.inject({ method: "DELETE", url: `/api/applications/${created.id}` });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json()).toEqual({ ok: true });

    const afterDelete = await app.inject({ method: "GET", url: `/api/applications/${created.id}` });
    expect(afterDelete.statusCode).toBe(404);
  });

  it("POST with a bad body -> 400", async () => {
    const app = appOn(freshDataDir());
    const res = await app.inject({
      method: "POST",
      url: "/api/applications",
      payload: { jobDescription: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET/PUT unknown id -> 404", async () => {
    const app = appOn(freshDataDir());
    const getRes = await app.inject({ method: "GET", url: "/api/applications/nope" });
    expect(getRes.statusCode).toBe(404);

    const putRes = await app.inject({
      method: "PUT",
      url: "/api/applications/nope",
      payload: { role: "X" },
    });
    expect(putRes.statusCode).toBe(404);
  });
});

describe("persistence: survives a fresh db connection against the same on-disk data dir", () => {
  it("re-opening the db and app returns the row created earlier", async () => {
    const dataDir = freshDataDir();
    const firstApp = appOn(dataDir);

    const created = (
      await firstApp.inject({
        method: "POST",
        url: "/api/applications",
        payload: validApplication,
      })
    ).json();

    // A brand-new db connection + app instance against the same on-disk dir
    // (not :memory:, not a shared singleton) — simulates a server restart.
    const secondApp = appOn(dataDir);
    const getRes = await secondApp.inject({
      method: "GET",
      url: `/api/applications/${created.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().id).toBe(created.id);
    expect(getRes.json().company).toBe("Acme Corp");
  });
});

describe("auth guard", () => {
  it("unauthenticated request -> 401", async () => {
    const dataDir = freshDataDir();
    const app = buildApp(initDb(dataDir).db, { authDisabled: false });

    const res = await app.inject({ method: "GET", url: "/api/applications" });
    expect(res.statusCode).toBe(401);
  });
});

describe("RED-TEAM #4: list payload omits heavy snapshots even when current is non-null", () => {
  it("LIST omits current/locked for a row with a real TailoredResume; GET :id returns it in full", async () => {
    const dataDir = freshDataDir();
    const { db } = initDb(dataDir);

    const now = Date.now();
    const row = {
      id: "tailored-app",
      company: "Acme Corp",
      role: "Staff Engineer",
      jobDescription: "Build widgets at scale.",
      context: null,
      current: fakeResume,
      locked: null,
      genState: "tailored" as const,
      currentMeta: { at: now, provider: "anthropic" as const, model: "claude-opus-4-8" },
      createdAt: now,
      updatedAt: now,
    };
    db.insert(applications).values(row).run();

    const app = appOn(dataDir);

    const listRes = await app.inject({ method: "GET", url: "/api/applications" });
    expect(listRes.statusCode).toBe(200);
    const listRow = listRes.json().find((a: { id: string }) => a.id === "tailored-app");
    expect(listRow).toBeDefined();
    expect(listRow).not.toHaveProperty("current");
    expect(listRow).not.toHaveProperty("locked");
    expect(listRow.genState).toBe("tailored");

    const getRes = await app.inject({ method: "GET", url: "/api/applications/tailored-app" });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().current).toEqual(fakeResume);
  });
});
