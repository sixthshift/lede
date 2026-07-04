// GET /api/export + POST /api/import — full-instance backup round-trip
// (library + profile + applications), spec.md §27.
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
  const dir = mkdtempSync(path.join(tmpdir(), "lede-api-backup-"));
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

const currentResume: TailoredResume = {
  signals: { roleLevel: "staff", weights: ["backend"], hardRequirements: ["5+ years"] },
  summary: "A staff engineer with deep backend experience.",
  sections: [
    {
      section: "experience",
      groups: [
        { heading: "Acme Corp", items: [{ entryId: "exp-acme", text: "Built widgets at scale." }] },
      ],
    },
  ],
  cut: [{ entryId: "exp-old", reason: "not relevant" }],
};

// Deliberately distinct from `current` so a round-trip that accidentally
// aliased the two fields (or dropped one) would be caught by the deep-equal.
const lockedResume: TailoredResume = {
  ...currentResume,
  summary: "A locked snapshot of the resume.",
};

function seededApplication() {
  const now = Date.now();
  return {
    id: "app-round-trip",
    company: "Acme Corp",
    role: "Staff Engineer",
    jobDescription: "Build widgets at scale.",
    context: "Emphasize backend depth.",
    current: currentResume,
    locked: lockedResume,
    genState: "tailored" as const,
    currentMeta: { at: now, provider: "anthropic" as const, model: "claude-opus-4-8" },
    createdAt: now,
    updatedAt: now,
  };
}

const skillEntryPayload = {
  section: "skill",
  meta: { section: "skill", category: "languages" },
  facts: ["TypeScript"],
  tags: ["languages"],
  sortKey: 1,
};

describe("GET /api/export", () => {
  it("returns entries + profile + applications, including full current/locked snapshots", async () => {
    const dataDir = freshDataDir();
    const { db } = initDb(dataDir);
    db.insert(applications).values(seededApplication()).run();
    const app = buildApp(db);

    await app.inject({ method: "POST", url: "/api/entries", payload: skillEntryPayload });
    await app.inject({
      method: "PUT",
      url: "/api/profile",
      payload: { name: "Ada Lovelace", email: "ada@example.com", links: [] },
    });

    const res = await app.inject({ method: "GET", url: "/api/export" });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.entries).toHaveLength(1);
    expect(body.profile.name).toBe("Ada Lovelace");
    expect(body.applications).toHaveLength(1);
    expect(body.applications[0].current).toEqual(currentResume);
    expect(body.applications[0].locked).toEqual(lockedResume);
  });
});

describe("RED-TEAM #3: round-trip is non-vacuous — export, wipe, import, re-export deep-equals", () => {
  it("restores entries/profile/applications into a fresh DATA_DIR that was genuinely empty", async () => {
    const sourceDir = freshDataDir();
    const { db: sourceDb } = initDb(sourceDir);
    sourceDb.insert(applications).values(seededApplication()).run();
    const sourceApp = buildApp(sourceDb);

    await sourceApp.inject({ method: "POST", url: "/api/entries", payload: skillEntryPayload });
    await sourceApp.inject({
      method: "PUT",
      url: "/api/profile",
      payload: { name: "Ada Lovelace", email: "ada@example.com", links: [] },
    });

    const backup = (await sourceApp.inject({ method: "GET", url: "/api/export" })).json();
    expect(backup.applications[0].current).toEqual(currentResume);
    expect(backup.applications[0].locked).toEqual(lockedResume);

    // A brand-new, never-touched data dir — the pre-import export below
    // proves this is a genuine wipe, not just an assertion about sourceDb.
    const targetApp = appOn(freshDataDir());

    const beforeImport = (await targetApp.inject({ method: "GET", url: "/api/export" })).json();
    expect(beforeImport.entries).toEqual([]);
    expect(beforeImport.applications).toEqual([]);
    expect(beforeImport.profile.name).toBe("");

    const importRes = await targetApp.inject({
      method: "POST",
      url: "/api/import",
      payload: backup,
    });
    expect(importRes.statusCode).toBe(200);
    expect(importRes.json()).toEqual({ imported: { entries: 1, profile: 1, applications: 1 } });

    const afterImport = (await targetApp.inject({ method: "GET", url: "/api/export" })).json();
    expect(afterImport.entries).toHaveLength(1);
    expect(afterImport.profile.name).toBe("Ada Lovelace");
    expect(afterImport.applications).toHaveLength(1);
    expect(afterImport.applications[0].current).toEqual(currentResume);
    expect(afterImport.applications[0].locked).toEqual(lockedResume);
  });

  it("a malformed application (missing jobDescription) -> 4xx, not 500", async () => {
    const app = appOn(freshDataDir());
    const res = await app.inject({
      method: "POST",
      url: "/api/import",
      payload: {
        applications: [
          {
            id: "bad-app",
            current: null,
            locked: null,
            genState: "untailored",
            currentMeta: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            // jobDescription intentionally omitted
          },
        ],
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });
});

describe("auth guard", () => {
  it("unauthenticated GET /api/export -> 401", async () => {
    const app = buildApp(initDb(freshDataDir()).db, { authDisabled: false });
    const res = await app.inject({ method: "GET", url: "/api/export" });
    expect(res.statusCode).toBe(401);
  });
});
