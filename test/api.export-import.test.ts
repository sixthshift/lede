// GET /api/export + POST /api/import — full-instance backup round-trip
// (library + profile + applications), spec.md §27.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/server/index";
import { initDb } from "../src/server/db";
import { applications } from "../src/server/db/schema";
import type { TailoredResume } from "../src/shared/types";
import { migrateFormat, formatV2Schema } from "../src/shared/format-v2";
import type { DocumentFormat } from "../src/shared/types";

// E9-F0d3 fixtures (test/fixtures/pre-e9-formats/, read-only/zero-diff): real
// pre-cutover v1 `DocumentFormat` JSON, embedded VERBATIM below to prove
// POST /api/import accepts a backup file exported before the E9 cutover.
const FIXTURES_DIR = path.join(__dirname, "fixtures/pre-e9-formats");
function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, name), "utf8"));
}

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

describe("E9-F0d3: POST /api/import accepts a pre-cutover (v1-format) backup file", () => {
  const strictV1 = readFixture("strict.json") as DocumentFormat;
  const lockedFormatV1 = readFixture("locked-format.json") as {
    format: DocumentFormat;
    resolvedDensity: "comfortable" | "standard" | "compact";
    paper: "letter" | "a4";
  };
  const settingsDefaultFormatV1 = readFixture("settings-default-format.json") as DocumentFormat;

  const lockedResumeV1: TailoredResume = {
    signals: { roleLevel: "senior", weights: ["frontend"], hardRequirements: ["3+ years"] },
    summary: "A locked pre-cutover snapshot.",
    sections: [
      {
        section: "experience",
        groups: [
          {
            heading: "Old Corp",
            items: [{ entryId: "exp-old-corp", text: "Shipped v1 features." }],
          },
        ],
      },
    ],
    cut: [{ entryId: "exp-ancient", reason: "too old" }],
  };

  function preCutoverBackup() {
    const now = Date.now();
    return {
      applications: [
        {
          id: "v1-format-only",
          jobDescription: "Build the v1-era product.",
          format: strictV1,
          current: null,
          locked: null,
          lockedFormat: null,
          genState: "untailored" as const,
          currentMeta: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "v1-locked",
          jobDescription: "Build the v1-era locked product.",
          format: null,
          current: lockedResumeV1,
          locked: lockedResumeV1,
          lockedFormat: lockedFormatV1,
          genState: "tailored" as const,
          currentMeta: { at: now, provider: "anthropic" as const, model: "claude-opus-4-8" },
          createdAt: now,
          updatedAt: now,
        },
      ],
      settings: { defaultFormat: settingsDefaultFormatV1 },
    };
  }

  it("imports successfully (2xx) and migrates every embedded v1 format to schema-valid v2", async () => {
    const app = appOn(freshDataDir());

    const importRes = await app.inject({
      method: "POST",
      url: "/api/import",
      payload: preCutoverBackup(),
    });
    expect(importRes.statusCode).toBeGreaterThanOrEqual(200);
    expect(importRes.statusCode).toBeLessThan(300);
    expect(importRes.json()).toEqual({
      imported: { entries: 0, profile: 0, applications: 2, settings: 1 },
    });

    // format-only application: look preserved, migrated via the identical
    // migrateFormat the app already uses elsewhere — never re-derived.
    const formatOnlyRes = await app.inject({
      method: "GET",
      url: "/api/applications/v1-format-only",
    });
    expect(formatOnlyRes.statusCode).toBe(200);
    const formatOnly = formatOnlyRes.json();
    expect(() => formatV2Schema.parse(formatOnly.format)).not.toThrow();
    expect(formatOnly.format).toEqual(migrateFormat(strictV1));

    // locked application: still locked, content byte-for-byte intact, and
    // its lockedFormat.format migrated the same way.
    const lockedRes = await app.inject({ method: "GET", url: "/api/applications/v1-locked" });
    expect(lockedRes.statusCode).toBe(200);
    const locked = lockedRes.json();
    expect(locked.locked).not.toBeNull();
    expect(locked.locked).toEqual(lockedResumeV1);
    expect(() => formatV2Schema.parse(locked.lockedFormat.format)).not.toThrow();
    expect(locked.lockedFormat.format).toEqual(migrateFormat(lockedFormatV1.format));
    expect(locked.lockedFormat.resolvedDensity).toBe(lockedFormatV1.resolvedDensity);
    expect(locked.lockedFormat.paper).toBe(lockedFormatV1.paper);

    // settings.defaultFormat: migrated the same way.
    const settingsRes = await app.inject({ method: "GET", url: "/api/settings" });
    expect(settingsRes.statusCode).toBe(200);
    const settingsBody = settingsRes.json();
    expect(() => formatV2Schema.parse(settingsBody.defaultFormat)).not.toThrow();
    expect(settingsBody.defaultFormat).toEqual(migrateFormat(settingsDefaultFormatV1));
  });

  it("a malformed format (neither valid v1 shape nor v2) still 400s", async () => {
    const app = appOn(freshDataDir());
    const now = Date.now();
    const res = await app.inject({
      method: "POST",
      url: "/api/import",
      payload: {
        applications: [
          {
            id: "bad-format",
            jobDescription: "N/A",
            format: { nonsense: true, notATemplate: "??" },
            current: null,
            locked: null,
            lockedFormat: null,
            genState: "untailored",
            currentMeta: null,
            createdAt: now,
            updatedAt: now,
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
