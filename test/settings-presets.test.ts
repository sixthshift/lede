// E9-F5b — settings.presets[]: saved {id,name,format} triples, no scoring/
// status fields. Mirrors test/api.applications-format.test.ts's / test/
// api.profile-settings.test.ts's idiom (freshDataDir/appOn, byte-equal
// round-trip, restart persistence).
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/server/index";
import { initDb } from "../src/server/db";
import { settings } from "../src/server/db/schema";
import { DEFAULT_FORMAT_V2 } from "../src/shared/format-v2";
import type { UserPreset } from "../src/shared/schema";

const tmpDirs: string[] = [];

function freshDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-settings-presets-"));
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

const PRESETS: UserPreset[] = [
  { id: "p1", name: "Compact", format: { ...DEFAULT_FORMAT_V2, presetId: "compact" } },
  {
    id: "p2",
    name: "Editorial",
    format: {
      ...DEFAULT_FORMAT_V2,
      presetId: "editorial",
      fonts: { body: "ibm-plex-serif", name: "same-as-body" },
    },
  },
];

describe("PUT/GET /api/settings presets", () => {
  it("persists a presets array and returns it byte-equal", async () => {
    const app = appOn(freshDataDir());

    const putRes = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { presets: PRESETS },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().presets).toEqual(PRESETS);

    const getRes = await app.inject({ method: "GET", url: "/api/settings" });
    expect(getRes.json().presets).toEqual(PRESETS);
  });

  it("PUT omitting presets is backward-compatible (existing presets untouched)", async () => {
    const dataDir = freshDataDir();
    const app = appOn(dataDir);

    await app.inject({ method: "PUT", url: "/api/settings", payload: { presets: PRESETS } });

    const putRes = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { model: "claude-3-5-haiku" },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().presets).toEqual(PRESETS);

    const getRes = await app.inject({ method: "GET", url: "/api/settings" });
    expect(getRes.json().presets).toEqual(PRESETS);
  });

  it("rejects a preset with an out-of-bounds format (400)", async () => {
    const app = appOn(freshDataDir());
    const badFormat = {
      ...DEFAULT_FORMAT_V2,
      typeScale: { ...DEFAULT_FORMAT_V2.typeScale, bodySize: 99 }, // max 12
    };
    const res = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { presets: [{ id: "p1", name: "Bad", format: badFormat }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a preset missing id or name (400)", async () => {
    const app = appOn(freshDataDir());

    const missingId = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { presets: [{ name: "No Id", format: DEFAULT_FORMAT_V2 }] },
    });
    expect(missingId.statusCode).toBe(400);

    const missingName = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { presets: [{ id: "p1", format: DEFAULT_FORMAT_V2 }] },
    });
    expect(missingName.statusCode).toBe(400);

    const emptyId = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { presets: [{ id: "", name: "Empty Id", format: DEFAULT_FORMAT_V2 }] },
    });
    expect(emptyId.statusCode).toBe(400);
  });

  it("presets survive a DB reopen / fresh app instance", async () => {
    const dataDir = freshDataDir();
    let app = appOn(dataDir);

    await app.inject({ method: "PUT", url: "/api/settings", payload: { presets: PRESETS } });
    await app.close();

    app = appOn(dataDir);
    const getRes = await app.inject({ method: "GET", url: "/api/settings" });
    expect(getRes.json().presets).toEqual(PRESETS);
  });

  it("a legacy row with a null presets column resolves to [] (no crash)", async () => {
    const dataDir = freshDataDir();
    const { db } = initDb(dataDir);
    // simulate a pre-migration row: presets column explicitly null
    db.update(settings).set({ presets: null }).where(eq(settings.id, 1)).run();

    const app = buildApp(db);
    const getRes = await app.inject({ method: "GET", url: "/api/settings" });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().presets).toEqual([]);
  });
});
