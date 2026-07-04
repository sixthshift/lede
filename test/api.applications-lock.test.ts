// E6-A4 — POST/DELETE /api/applications/:id/lock. `locked` is a full deep
// copy of `current`'s content at lock time (§27 integrity invariant): once
// locked, no later edit/deletion of a Library entry, and no later re-tailor,
// can retroactively change it.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import type { TailorDecision } from "@shared/types";
import { buildApp } from "../src/server/index";
import { initDb, type Db } from "../src/server/db";
import { seedIfEmpty } from "../src/server/seed";
import { CONTRAST_JDS } from "../src/server/tailor/evalcore";
import { entriesRoutes } from "../src/server/routes/entries";
import { applicationsRoutes } from "../src/server/routes/applications";
import type { TailorEngine } from "../src/server/tailor/engine";

const tmpDirs: string[] = [];

function freshDb(): Db {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-applications-lock-"));
  tmpDirs.push(dir);
  return initDb(dir).db;
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

async function post(app: FastifyInstance, url: string, payload: unknown = {}) {
  return app.inject({ method: "POST", url, payload });
}

function del(app: FastifyInstance, url: string) {
  return app.inject({ method: "DELETE", url });
}

function get(app: FastifyInstance, url: string) {
  return app.inject({ method: "GET", url });
}

describe("POST/DELETE /api/applications/:id/lock — via FixtureEngine (keyless, recorded JD)", () => {
  it("lock freezes current -> locked; a later re-tailor overwrites current but leaves locked unchanged", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const jdA = CONTRAST_JDS[0]!.jd;
    const jdB = CONTRAST_JDS[1]!.jd;

    const created = await post(app, "/api/applications", { jobDescription: jdA });
    const id = created.json().id as string;

    const tailored = await post(app, `/api/applications/${id}/tailor`);
    expect(tailored.statusCode).toBe(200);
    const originalCurrent = tailored.json().current;

    const locked = await post(app, `/api/applications/${id}/lock`);
    expect(locked.statusCode).toBe(200);
    expect(locked.json().locked).toEqual(originalCurrent);
    expect(locked.json().current).toEqual(originalCurrent);

    // re-tailor against a different recorded JD -> current changes
    await app.inject({
      method: "PUT",
      url: `/api/applications/${id}`,
      payload: { jobDescription: jdB },
    });
    const retailored = await post(app, `/api/applications/${id}/tailor`);
    expect(retailored.statusCode).toBe(200);
    expect(retailored.json().current).not.toEqual(originalCurrent);
    // locked is untouched by the re-tailor
    expect(retailored.json().locked).toEqual(originalCurrent);

    const fetched = await get(app, `/api/applications/${id}`);
    expect(fetched.json().current).not.toEqual(originalCurrent);
    expect(fetched.json().locked).toEqual(originalCurrent);
  });

  it("DELETE :id/lock clears locked", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const created = await post(app, "/api/applications", { jobDescription: CONTRAST_JDS[0]!.jd });
    const id = created.json().id as string;
    await post(app, `/api/applications/${id}/tailor`);

    const locked = await post(app, `/api/applications/${id}/lock`);
    expect(locked.json().locked).not.toBeNull();

    const unlocked = await del(app, `/api/applications/${id}/lock`);
    expect(unlocked.statusCode).toBe(200);
    expect(unlocked.json().locked).toBeNull();

    const fetched = await get(app, `/api/applications/${id}`);
    expect(fetched.json().locked).toBeNull();
  });

  it("lock with no current -> 400", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const created = await post(app, "/api/applications", { jobDescription: CONTRAST_JDS[0]!.jd });
    const id = created.json().id as string;

    const res = await post(app, `/api/applications/${id}/lock`);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "no_current" });
  });

  it("404s lock/unlock for a nonexistent application id", async () => {
    const db = freshDb();
    seedIfEmpty(db);
    const app = buildApp(db);

    const lockRes = await post(app, "/api/applications/does-not-exist/lock");
    expect(lockRes.statusCode).toBe(404);

    const unlockRes = await del(app, "/api/applications/does-not-exist/lock");
    expect(unlockRes.statusCode).toBe(404);
  });
});

function appWithEngine(db: Db, engine: TailorEngine): FastifyInstance {
  const app = Fastify();
  entriesRoutes(app, db);
  applicationsRoutes(app, db, { engine });
  return app;
}

describe("RED-TEAM #5: locked/current are self-contained snapshots — Library mutation/deletion never corrupts them", () => {
  it("editing then deleting the referenced Library entry never changes current/locked; re-tailor still leaves locked deep-equal to the original", async () => {
    const db = freshDb();

    const decision: TailorDecision = {
      signals: { roleLevel: "", weights: [], hardRequirements: [] },
      summary: "Experienced engineer.",
      items: [{ entryId: "kubernetes-skill", text: "placeholder", rank: 1 }],
      cut: [],
    };
    class FixedEngine implements TailorEngine {
      async decide(): Promise<TailorDecision> {
        return decision;
      }
    }
    const app = appWithEngine(db, new FixedEngine());

    // the Library entry that will appear as an item in `current` — section
    // "skill" is rephrase:'none' (spec.md §4.3), so its rendered item text is
    // literally the entry's own facts, baked in at assemble time.
    const entry = {
      id: "kubernetes-skill",
      section: "skill" as const,
      meta: { section: "skill" as const },
      facts: ["Kubernetes"],
      tags: [],
      sortKey: 1,
    };
    const entryRes = await post(app, "/api/entries", entry);
    expect(entryRes.statusCode).toBe(200);

    const created = await post(app, "/api/applications", {
      jobDescription: "Hiring a platform engineer.",
    });
    const id = created.json().id as string;

    // (a) tailor so `current` has items, including our target entry
    const tailored = await post(app, `/api/applications/${id}/tailor`);
    expect(tailored.statusCode).toBe(200);
    const currentBeforeLock = tailored.json().current;
    expect(JSON.stringify(currentBeforeLock)).toContain("kubernetes-skill");
    expect(JSON.stringify(currentBeforeLock)).toContain("Kubernetes");

    // (b) lock
    const lockRes = await post(app, `/api/applications/${id}/lock`);
    expect(lockRes.statusCode).toBe(200);
    const lockedSnapshot = lockRes.json().locked;
    expect(lockedSnapshot).toEqual(currentBeforeLock);

    // (c) edit the Library entry, changing a rendered fact/text field — a
    // ref-resolving impl would visibly diverge here.
    const editRes = await app.inject({
      method: "PUT",
      url: "/api/entries/kubernetes-skill",
      payload: { ...entry, facts: ["Rust"] },
    });
    expect(editRes.statusCode).toBe(200);

    let fresh = await get(app, `/api/applications/${id}`);
    expect(fresh.json().current).toEqual(currentBeforeLock);
    expect(fresh.json().locked).toEqual(lockedSnapshot);

    // (d) delete the Library entry entirely
    const deleteRes = await del(app, "/api/entries/kubernetes-skill");
    expect(deleteRes.statusCode).toBe(200);

    fresh = await get(app, `/api/applications/${id}`);
    expect(fresh.json().current).toEqual(currentBeforeLock);
    expect(fresh.json().locked).toEqual(lockedSnapshot);

    // (e) re-tailor (recreating the entry so tailor can succeed again) —
    // `current` changes but `locked` still deep-equals the original locked
    // snapshot, proving `locked` is a deep copy, not a shared reference.
    await post(app, "/api/entries", { ...entry, facts: ["Go"] });
    const retailored = await post(app, `/api/applications/${id}/tailor`);
    expect(retailored.statusCode).toBe(200);
    expect(retailored.json().current).not.toEqual(currentBeforeLock);
    expect(JSON.stringify(retailored.json().current)).toContain("Go");
    expect(retailored.json().locked).toEqual(lockedSnapshot);

    fresh = await get(app, `/api/applications/${id}`);
    expect(fresh.json().locked).toEqual(lockedSnapshot);
  });
});
