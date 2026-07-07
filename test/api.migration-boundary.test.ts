// Integration test — the core of ticket E9-F0d2 (spec.md §31.1 migration).
// Raw v1 JSON (verbatim from test/fixtures/pre-e9-formats/) is inserted
// DIRECTLY into a real sqlite database for all three storage sites a
// pre-cutover instance could hold it in — applications.format,
// applications.lockedFormat (its .format field), settings.defaultFormat —
// then read back through the REAL API (buildApp + .inject, never calling
// migrateFormat/resolveStoredFormat directly) to prove the persistence-layer
// read boundary (migrateStoredApplicationFormats in routes/applications.ts,
// resolveStoredFormat in routes/settings.ts) actually gates production reads.
// Mirrors test/api.applications-format.test.ts's / test/db.test.ts's idiom.
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";

import { buildApp } from "../src/server/index";
import { initDb } from "../src/server/db";
import { applications, settings } from "../src/server/db/schema";
import { formatV2Schema, migrateFormat } from "../src/shared/format-v2";
import type { DocumentFormatV2 } from "../src/shared/format-v2";
import type { DocumentFormat, TailoredResume } from "../src/shared/types";

const FIXTURES_DIR = path.join(process.cwd(), "test/fixtures/pre-e9-formats");
function readFixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, name), "utf8")) as T;
}

const tmpDirs: string[] = [];
function freshDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-migration-boundary-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

const V1_STRICT = readFixture<DocumentFormat>("strict.json");
const V1_LOCKED_WRAPPER = readFixture<{
  format: DocumentFormat;
  resolvedDensity: "comfortable" | "standard" | "compact";
  paper: "letter" | "a4";
}>("locked-format.json");
const V1_SETTINGS_DEFAULT = readFixture<DocumentFormat>("settings-default-format.json");

const lockedResume: TailoredResume = {
  signals: { roleLevel: "staff", weights: ["backend"], hardRequirements: [] },
  summary: "A locked, tailored summary.",
  sections: [
    {
      section: "experience",
      groups: [{ heading: "Acme", items: [{ entryId: "e1", text: "Shipped the thing." }] }],
    },
  ],
  cut: [],
};

// Seeds a fresh DB with RAW v1 JSON in all three storage sites: an already-
// LOCKED application (format + lockedFormat both v1-shaped; current/locked
// both set, simulating a genuinely locked pre-cutover app) plus a v1-shaped
// settings.defaultFormat — exactly what a pre-cutover database looks like.
// The `as unknown as DocumentFormatV2` casts on format/lockedFormat are
// deliberate: those columns are typed DocumentFormatV2 post-cutover, but this
// test's whole point is a database that predates that type and genuinely
// holds raw v1 JSON there.
function seedPreCutoverDb(dataDir: string) {
  const { db } = initDb(dataDir);
  const now = Date.now();

  db.insert(applications)
    .values({
      id: "app-pre-cutover",
      jobDescription: "Build widgets at scale.",
      format: V1_STRICT as unknown as DocumentFormatV2,
      current: lockedResume,
      locked: lockedResume,
      lockedFormat: V1_LOCKED_WRAPPER as unknown as {
        format: DocumentFormatV2;
        resolvedDensity: "comfortable" | "standard" | "compact";
        paper: "letter" | "a4";
      },
      genState: "tailored",
      currentMeta: { at: now, provider: "anthropic", model: "claude-opus-4-8" },
      createdAt: now,
      updatedAt: now,
    })
    .run();

  db.update(settings)
    .set({ defaultFormat: V1_SETTINGS_DEFAULT as unknown as DocumentFormatV2 })
    .where(eq(settings.id, 1))
    .run();
}

describe("stored v1 formats migrate transparently at the read boundary (ticket E9-F0d2)", () => {
  it("GET /api/applications/:id returns a schema-valid v2 format for a v1-shaped stored value, look preserved", async () => {
    const dataDir = freshDataDir();
    seedPreCutoverDb(dataDir);
    const app = buildApp(initDb(dataDir).db);

    const res = await app.inject({ method: "GET", url: "/api/applications/app-pre-cutover" });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(formatV2Schema.safeParse(body.format).success).toBe(true);
    expect(body.format).toEqual(migrateFormat(V1_STRICT));
    // look preserved — the migrated config's distinguishing axes trace back
    // to the stored v1 config's fonts/colors/photo.
    expect(body.format.fonts.body).toBe("ibm-plex-sans");
    expect(body.format.colors.accent).toBe("#1a1a2e");
    expect(body.format.photo.hidden).toBe(true);
  });

  it("GET /api/settings returns a schema-valid v2 defaultFormat for a v1-shaped stored value", async () => {
    const dataDir = freshDataDir();
    seedPreCutoverDb(dataDir);
    const app = buildApp(initDb(dataDir).db);

    const res = await app.inject({ method: "GET", url: "/api/settings" });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(formatV2Schema.safeParse(body.defaultFormat).success).toBe(true);
    expect(body.defaultFormat).toEqual(migrateFormat(V1_SETTINGS_DEFAULT));
  });

  it("the locked application still reports locked, with a schema-valid v2 lockedFormat.format", async () => {
    const dataDir = freshDataDir();
    seedPreCutoverDb(dataDir);
    const app = buildApp(initDb(dataDir).db);

    const res = await app.inject({ method: "GET", url: "/api/applications/app-pre-cutover" });
    const body = res.json();

    expect(body.locked).not.toBeNull(); // still reports locked
    expect(body.locked).toEqual(lockedResume);
    expect(body.lockedFormat.resolvedDensity).toBe(V1_LOCKED_WRAPPER.resolvedDensity);
    expect(body.lockedFormat.paper).toBe(V1_LOCKED_WRAPPER.paper);
    expect(formatV2Schema.safeParse(body.lockedFormat.format).success).toBe(true);
    expect(body.lockedFormat.format).toEqual(migrateFormat(V1_LOCKED_WRAPPER.format));
  });

  it("the locked TailoredResume snapshot bytes are byte-identical before/after the migrating read, and after a subsequent v2 format PUT", async () => {
    const dataDir = freshDataDir();
    seedPreCutoverDb(dataDir);
    const app = buildApp(initDb(dataDir).db);

    const before = (
      await app.inject({ method: "GET", url: "/api/applications/app-pre-cutover" })
    ).json();
    expect(before.locked).toEqual(lockedResume); // the migrating GET read above didn't touch content

    const migratedFormat = before.format; // already-migrated v2, valid PUT body
    const putRes = await app.inject({
      method: "PUT",
      url: "/api/applications/app-pre-cutover",
      payload: { format: { ...migratedFormat, presetId: "custom" } },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().locked).toEqual(lockedResume); // still byte-identical after a format PUT

    const after = (
      await app.inject({ method: "GET", url: "/api/applications/app-pre-cutover" })
    ).json();
    expect(after.locked).toEqual(lockedResume);
    expect(after.format).toEqual({ ...migratedFormat, presetId: "custom" });
  });

  it("a format PUT after migration persists across a fresh app instance over the same DATA_DIR (server restart)", async () => {
    const dataDir = freshDataDir();
    seedPreCutoverDb(dataDir);
    let app = buildApp(initDb(dataDir).db);

    const before = (
      await app.inject({ method: "GET", url: "/api/applications/app-pre-cutover" })
    ).json();
    const newFormat = { ...before.format, presetId: "restart-check" };

    const putRes = await app.inject({
      method: "PUT",
      url: "/api/applications/app-pre-cutover",
      payload: { format: newFormat },
    });
    expect(putRes.statusCode).toBe(200);

    // fresh app instance, same on-disk DATA_DIR — simulates a server restart.
    app = buildApp(initDb(dataDir).db);
    const afterRestart = await app.inject({
      method: "GET",
      url: "/api/applications/app-pre-cutover",
    });
    expect(afterRestart.statusCode).toBe(200);
    const body = afterRestart.json();
    expect(body.format).toEqual(newFormat);
    expect(formatV2Schema.safeParse(body.format).success).toBe(true);
    expect(body.locked).toEqual(lockedResume); // untouched across the restart too
  });

  it("GET /api/export migrates applications.format/lockedFormat the same way (export is client-facing too)", async () => {
    const dataDir = freshDataDir();
    seedPreCutoverDb(dataDir);
    const app = buildApp(initDb(dataDir).db);

    const res = await app.inject({ method: "GET", url: "/api/export" });
    expect(res.statusCode).toBe(200);
    const backup = res.json();
    const exported = backup.applications.find((a: { id: string }) => a.id === "app-pre-cutover");
    expect(exported).toBeTruthy();
    expect(formatV2Schema.safeParse(exported.format).success).toBe(true);
    expect(formatV2Schema.safeParse(exported.lockedFormat.format).success).toBe(true);
  });

  it("a genuinely v2 stored value passes through untouched (isFormatV2 gate) — no double-migration", async () => {
    const dataDir = freshDataDir();
    const app = buildApp(initDb(dataDir).db);

    const created = (
      await app.inject({
        method: "POST",
        url: "/api/applications",
        payload: { jobDescription: "Already-v2 world." },
      })
    ).json();

    const v2Format = migrateFormat(V1_STRICT); // a normal, already-v2 config
    const putRes = await app.inject({
      method: "PUT",
      url: `/api/applications/${created.id}`,
      payload: { format: v2Format },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().format).toEqual(v2Format);

    const getRes = await app.inject({ method: "GET", url: `/api/applications/${created.id}` });
    expect(getRes.json().format).toEqual(v2Format); // byte-identical — not re-derived
  });
});
