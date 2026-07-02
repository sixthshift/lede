import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/server/index";
import { initDb } from "../src/server/db";

const tmpDirs: string[] = [];

function freshDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-api-entries-"));
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

const validProject = {
  section: "project" as const,
  meta: { section: "project" as const, name: "Widget Factory" },
  facts: ["Built a widget factory serving 10k users."],
  tags: ["backend"],
  sortKey: 202401,
};

describe("GET/POST /api/entries", () => {
  it("POST with no id -> server-generated slug (§17); GET returns it", async () => {
    const dataDir = freshDataDir();
    const app = appOn(dataDir);

    const postRes = await app.inject({ method: "POST", url: "/api/entries", payload: validProject });
    expect(postRes.statusCode).toBe(200);
    const created = postRes.json();
    expect(created.id).toBeTruthy();
    expect(created.id.length).toBeLessThanOrEqual(80);
    expect(created.id.startsWith("project-widget-factory")).toBe(true);

    const getRes = await app.inject({ method: "GET", url: "/api/entries" });
    expect(getRes.statusCode).toBe(200);
    const rows = getRes.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(created.id);
  });

  it("POST with a bad body -> 400", async () => {
    const dataDir = freshDataDir();
    const app = appOn(dataDir);

    const res = await app.inject({
      method: "POST",
      url: "/api/entries",
      payload: { section: "project", meta: { section: "project", name: "X" }, facts: [], tags: [], sortKey: "nope" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PUT with a bad body -> 400", async () => {
    const dataDir = freshDataDir();
    const app = appOn(dataDir);
    const created = (await app.inject({ method: "POST", url: "/api/entries", payload: validProject })).json();

    const res = await app.inject({
      method: "PUT",
      url: `/api/entries/${created.id}`,
      payload: { ...validProject, facts: [] }, // project sections require >=1 fact
    });
    expect(res.statusCode).toBe(400);
  });

  it("?section= filters GET /api/entries", async () => {
    const dataDir = freshDataDir();
    const app = appOn(dataDir);
    await app.inject({ method: "POST", url: "/api/entries", payload: validProject });
    await app.inject({
      method: "POST",
      url: "/api/entries",
      payload: {
        section: "skill",
        meta: { section: "skill" },
        facts: ["TypeScript"],
        tags: [],
        sortKey: 1,
      },
    });

    const res = await app.inject({ method: "GET", url: "/api/entries?section=skill" });
    const rows = res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].section).toBe("skill");
  });

  it("PUT updates an existing entry and DELETE removes it", async () => {
    const dataDir = freshDataDir();
    const app = appOn(dataDir);
    const created = (await app.inject({ method: "POST", url: "/api/entries", payload: validProject })).json();

    const putRes = await app.inject({
      method: "PUT",
      url: `/api/entries/${created.id}`,
      payload: { ...validProject, facts: ["Updated fact."] },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().facts).toEqual(["Updated fact."]);
    expect(putRes.json().id).toBe(created.id);

    const delRes = await app.inject({ method: "DELETE", url: `/api/entries/${created.id}` });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json()).toEqual({ ok: true });

    const getRes = await app.inject({ method: "GET", url: "/api/entries" });
    expect(getRes.json()).toHaveLength(0);
  });
});

describe("POST /api/entries/import", () => {
  it("imports 2 entries -> {imported:2}; GET returns them", async () => {
    const dataDir = freshDataDir();
    const app = appOn(dataDir);

    const res = await app.inject({
      method: "POST",
      url: "/api/entries/import",
      payload: [
        validProject,
        { section: "skill", meta: { section: "skill" }, facts: ["Rust"], tags: [], sortKey: 1 },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ imported: 2 });

    const getRes = await app.inject({ method: "GET", url: "/api/entries" });
    expect(getRes.json()).toHaveLength(2);
  });
});

describe("entries persist across restart", () => {
  it("writing via one buildApp() instance and rebuilding on the same DATA_DIR reads them back", async () => {
    const dataDir = freshDataDir();
    const firstApp = appOn(dataDir);
    await firstApp.inject({ method: "POST", url: "/api/entries", payload: validProject });

    const secondApp = buildApp(initDb(dataDir).db);
    const res = await secondApp.inject({ method: "GET", url: "/api/entries" });
    expect(res.statusCode).toBe(200);
    const rows = res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].meta).toEqual(validProject.meta);
  });
});

describe("CONTRAST: export payload contains only Entry fields", () => {
  it("GET /api/entries never leaks secrets/settings content", async () => {
    const dataDir = freshDataDir();
    const app = appOn(dataDir);
    await app.inject({ method: "POST", url: "/api/entries", payload: validProject });

    const res = await app.inject({ method: "GET", url: "/api/entries" });
    const raw = res.payload;
    expect(raw).not.toMatch(/ciphertext/i);
    expect(raw).not.toMatch(/apiKeyEnc/i);
    expect(raw).not.toMatch(/"hash"/i);
    expect(raw).not.toMatch(/"salt"/i);
    expect(raw).not.toMatch(/keySet/i);

    const rows = res.json();
    const allowed = new Set(["id", "section", "meta", "facts", "tags", "framings", "sortKey", "createdAt", "updatedAt"]);
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });
});
