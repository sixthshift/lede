// Page model — spec.md §28.1: settings.paper (global) + application.targetPages
// (per-application). Formatting NEVER mutates snapshots — the CONTRAST test
// below is this ticket's acceptance oracle for that invariant.
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
  const dir = mkdtempSync(path.join(tmpdir(), "lede-page-model-"));
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

const fakeResume: TailoredResume = {
  signals: { roleLevel: "staff", weights: [], hardRequirements: [] },
  summary: "A tailored summary.",
  sections: [
    { section: "experience", groups: [{ items: [{ entryId: "e1", text: "Did a thing." }] }] },
  ],
  cut: [],
};

describe("settings.paper (global, §28.1)", () => {
  it("defaults to 'letter'; PUT persists and round-trips via GET", async () => {
    const app = appOn(freshDataDir());

    const before = await app.inject({ method: "GET", url: "/api/settings" });
    expect(before.json().paper).toBe("letter");

    const put = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { paper: "a4" },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().paper).toBe("a4");

    const after = await app.inject({ method: "GET", url: "/api/settings" });
    expect(after.json().paper).toBe("a4");
  });
});

describe("application.targetPages (per-application, §28.1)", () => {
  it("defaults to 1 on create; PUT persists a change to 2", async () => {
    const app = appOn(freshDataDir());

    const created = (
      await app.inject({
        method: "POST",
        url: "/api/applications",
        payload: { jobDescription: "Build widgets at scale." },
      })
    ).json();
    expect(created.targetPages).toBe(1);

    const updated = (
      await app.inject({
        method: "PUT",
        url: `/api/applications/${created.id}`,
        payload: { targetPages: 2 },
      })
    ).json();
    expect(updated.targetPages).toBe(2);

    const fetched = (
      await app.inject({ method: "GET", url: `/api/applications/${created.id}` })
    ).json();
    expect(fetched.targetPages).toBe(2);
  });
});

describe("CONTRAST: formatting never mutates snapshots (§28.1 invariant)", () => {
  it("changing settings.paper and an application's targetPages leaves its locked `current` snapshot byte-identical", async () => {
    const dataDir = freshDataDir();
    const { db } = initDb(dataDir);

    const now = Date.now();
    db.insert(applications)
      .values({
        id: "snapshot-app",
        company: "Acme Corp",
        role: "Staff Engineer",
        jobDescription: "Build widgets at scale.",
        context: null,
        targetPages: 1,
        current: fakeResume,
        locked: fakeResume,
        genState: "tailored" as const,
        currentMeta: { at: now, provider: "anthropic" as const, model: "claude-opus-4-8" },
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const app = appOn(dataDir);

    const before = (
      await app.inject({ method: "GET", url: "/api/applications/snapshot-app" })
    ).json();
    const beforeCurrent = JSON.stringify(before.current);
    const beforeLocked = JSON.stringify(before.locked);

    const settingsPut = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { paper: "a4" },
    });
    expect(settingsPut.statusCode).toBe(200);

    const appPut = await app.inject({
      method: "PUT",
      url: "/api/applications/snapshot-app",
      payload: { targetPages: 2 },
    });
    expect(appPut.statusCode).toBe(200);
    expect(appPut.json().targetPages).toBe(2);

    const after = (
      await app.inject({ method: "GET", url: "/api/applications/snapshot-app" })
    ).json();

    expect(JSON.stringify(after.current)).toBe(beforeCurrent);
    expect(JSON.stringify(after.locked)).toBe(beforeLocked);
  });
});
