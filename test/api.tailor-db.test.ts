// E1-E — /api/tailor reads entries + settings.layout from the db (not the
// hardcoded SEED_ENTRIES/defaultLayout consts), and first-boot seeding.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";

import type { Entry, TailorDecision } from "@shared/types";
import { buildApp } from "../src/server/index";
import { initDb, DEFAULT_LAYOUT } from "../src/server/db";
import { SEED_ENTRIES, seedIfEmpty } from "../src/server/seed";
import { hashKey } from "../src/server/tailor/evalcore";

const FIXTURES_DIR = path.join(process.cwd(), "test/fixtures/decisions");
const TMP_FIXTURES: string[] = [];

function writeFixture(name: string, jd: string, entriesForHash: Entry[], decision: TailorDecision): void {
  const file = path.join(FIXTURES_DIR, `${name}.json`);
  writeFileSync(file, JSON.stringify({ key: hashKey(jd, entriesForHash), name, decision }));
  TMP_FIXTURES.push(file);
}

let createdFixturesDir = false;

beforeAll(() => {
  process.env.NODE_ENV = "test";
  delete process.env.LEDE_TAILOR_ENGINE;
  if (!existsSync(FIXTURES_DIR)) {
    mkdirSync(FIXTURES_DIR, { recursive: true });
    createdFixturesDir = true;
  }
});

afterAll(() => {
  while (TMP_FIXTURES.length) rmSync(TMP_FIXTURES.pop()!, { force: true });
  if (createdFixturesDir) rmSync(FIXTURES_DIR, { recursive: true, force: true });
});

const tmpDirs: string[] = [];

function freshDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-tailor-db-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

async function post(app: FastifyInstance, url: string, payload: unknown) {
  return app.inject({ method: "POST", url, payload });
}

describe("CONTRAST: POST /api/tailor reads entries from the db, not SEED_ENTRIES", () => {
  it("assembled resume reflects a single DB-seeded entry, never a SEED_ENTRIES id", async () => {
    const dataDir = freshDataDir();
    const db = initDb(dataDir).db;
    const app = buildApp(db);

    const customEntry = {
      id: "custom-only-entry",
      section: "skill" as const,
      meta: { section: "skill" as const },
      facts: ["Rust"],
      tags: [],
      sortKey: 1,
    };
    const created = await post(app, "/api/entries", customEntry);
    expect(created.statusCode).toBe(200);

    // Mirrors rowToEntry's key order/shape exactly (id, section, sortKey,
    // meta, facts, tags — no `framings` since it was never set) so hashKey()
    // matches what the route computes internally off the db round-trip.
    const expectedEntry: Entry = {
      id: customEntry.id,
      section: customEntry.section,
      sortKey: customEntry.sortKey,
      meta: customEntry.meta,
      facts: customEntry.facts,
      tags: customEntry.tags,
    };

    const jd = "Looking for a systems engineer fluent in Rust for a small infra team.";
    const decision: TailorDecision = {
      signals: { roleLevel: "mid", weights: ["rust"], hardRequirements: [] },
      summary: "Rust systems engineer.",
      items: [{ entryId: customEntry.id, text: "Rust", rank: 1 }],
      cut: [],
    };
    writeFixture("tailor-db-contrast-single-entry", jd, [expectedEntry], decision);

    const res = await post(app, "/api/tailor", { jobDescription: jd });
    expect(res.statusCode).toBe(200); // 422 here would mean the hash didn't match -> route isn't reading the db
    const body = res.json();

    const seedIds = new Set(SEED_ENTRIES.map((e) => e.id));
    const seenIds: string[] = [];
    for (const section of body.sections) {
      for (const group of section.groups) {
        for (const item of group.items) seenIds.push(item.entryId);
      }
    }
    expect(seenIds).toContain(customEntry.id);
    for (const id of seenIds) expect(seedIds.has(id)).toBe(false);
  });
});

describe("CONTRAST: TailoredResume.sections order/visibility follows settings.layout", () => {
  const jd = "Hiring a well-rounded engineer with strong fundamentals and a few notable accolades.";

  const layoutEntries = [
    { id: "layout-skill", section: "skill" as const, meta: { section: "skill" as const }, facts: ["TypeScript"], tags: [], sortKey: 1 },
    {
      id: "layout-award",
      section: "award" as const,
      meta: { section: "award" as const, title: "Employee of the Year" },
      facts: ["Recognized company-wide for engineering excellence"],
      tags: [],
      sortKey: 2,
    },
    {
      id: "layout-cert",
      section: "certification" as const,
      meta: { section: "certification" as const, name: "AWS Certified Solutions Architect" },
      facts: [] as string[],
      tags: [],
      sortKey: 3,
    },
  ];

  const expectedForHash: Entry[] = layoutEntries.map((e) => ({
    id: e.id,
    section: e.section,
    sortKey: e.sortKey,
    meta: e.meta,
    facts: e.facts,
    tags: e.tags,
  }));

  const decision: TailorDecision = {
    signals: { roleLevel: "mid", weights: [], hardRequirements: [] },
    summary: "Well-rounded engineer.",
    items: [
      { entryId: "layout-skill", text: "TypeScript", rank: 1 },
      { entryId: "layout-award", text: "Recognized company-wide for engineering excellence", rank: 1 },
      { entryId: "layout-cert", text: "", rank: 1 },
    ],
    cut: [],
  };

  beforeAll(() => {
    writeFixture("tailor-db-contrast-layout", jd, expectedForHash, decision);
  });

  async function seedLayoutEntries(app: FastifyInstance): Promise<void> {
    for (const entry of layoutEntries) {
      const res = await post(app, "/api/entries", entry);
      expect(res.statusCode).toBe(200);
    }
  }

  it("default layout renders the standard §4.2 order", async () => {
    const db = initDb(freshDataDir()).db;
    const app = buildApp(db);
    await seedLayoutEntries(app);

    const res = await post(app, "/api/tailor", { jobDescription: jd });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const expectedOrder = DEFAULT_LAYOUT.map((l) => l.section).filter((s) =>
      ["skill", "award", "certification"].includes(s),
    );
    expect(body.sections.map((s: { section: string }) => s.section)).toEqual(expectedOrder);
  });

  it("a non-default layout (two sections reordered + one disabled) reorders/omits sections", async () => {
    const db = initDb(freshDataDir()).db;
    const app = buildApp(db);
    await seedLayoutEntries(app);

    const putRes = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: {
        layout: [
          { section: "certification", enabled: true },
          { section: "award", enabled: false },
          { section: "skill", enabled: true },
        ],
      },
    });
    expect(putRes.statusCode).toBe(200);

    const res = await post(app, "/api/tailor", { jobDescription: jd });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.sections.map((s: { section: string }) => s.section)).toEqual(["certification", "skill"]);
  });
});

describe("first-boot seeding (§22): empty entries table -> seedIfEmpty loads SEED_ENTRIES", () => {
  it("GET /api/entries is empty for an injected db until seedIfEmpty runs, then returns SEED_ENTRIES", async () => {
    const dataDir = freshDataDir();
    const db = initDb(dataDir).db;
    const app = buildApp(db); // injected db -> buildApp itself does not auto-seed

    const before = await app.inject({ method: "GET", url: "/api/entries" });
    expect(before.json()).toHaveLength(0);

    seedIfEmpty(db);

    const after = await app.inject({ method: "GET", url: "/api/entries" });
    expect(after.statusCode).toBe(200);
    const rows = after.json();
    expect(rows).toHaveLength(SEED_ENTRIES.length);
    expect(new Set(rows.map((r: { id: string }) => r.id))).toEqual(new Set(SEED_ENTRIES.map((e) => e.id)));

    // idempotent: a non-empty table is left untouched
    seedIfEmpty(db);
    const again = await app.inject({ method: "GET", url: "/api/entries" });
    expect(again.json()).toHaveLength(SEED_ENTRIES.length);
  });
});
