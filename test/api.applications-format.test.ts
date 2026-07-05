// E7-B1c — persist format: application.format, settings.defaultFormat,
// application.lockedFormat (frozen at lock time), profile.photoUrl. Mirrors
// test/api.applications.test.ts's / test/api.profile-settings.test.ts's idiom.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/server/index";
import { initDb } from "../src/server/db";
import { applications } from "../src/server/db/schema";
import { DEFAULT_FORMAT } from "../src/shared/format";
import type { DocumentFormat, TailoredResume } from "../src/shared/types";

const tmpDirs: string[] = [];

function freshDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-api-applications-format-"));
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

// A non-default DocumentFormat, distinct from DEFAULT_FORMAT in every field —
// proves the round-trip isn't accidentally reading back the seeded default.
const CUSTOM_FORMAT: DocumentFormat = {
  templateId: "editorial",
  typography: {
    body: { family: "ibm-plex-serif", size: 11, lineHeight: 1.5 },
    heading: { family: "tinos", weight: 700 },
  },
  colors: { primary: "#2a2a4e", text: "#222222" },
  page: { marginX: 48, marginY: 40, sectionGap: 12 },
  photo: { hidden: false, size: 96, shape: "rounded" },
  sections: { skill: { columns: 2 } },
};

const fakeResume: TailoredResume = {
  signals: { roleLevel: "staff", weights: [], hardRequirements: [] },
  summary: "A tailored summary.",
  sections: [],
  cut: [],
};

describe("application.format round-trips and persists across a restart", () => {
  it("PUT a non-default DocumentFormat -> GET returns it byte-equal, incl. after reopening the same .sqlite", async () => {
    const dataDir = freshDataDir();
    let app = appOn(dataDir);

    const created = (
      await app.inject({
        method: "POST",
        url: "/api/applications",
        payload: { jobDescription: "Build widgets at scale." },
      })
    ).json();
    expect(created.format).toBeNull();

    const putRes = await app.inject({
      method: "PUT",
      url: `/api/applications/${created.id}`,
      payload: { format: CUSTOM_FORMAT },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().format).toEqual(CUSTOM_FORMAT);

    const getRes = await app.inject({ method: "GET", url: `/api/applications/${created.id}` });
    expect(getRes.json().format).toEqual(CUSTOM_FORMAT);

    // a brand-new db connection + app instance against the same on-disk
    // dir (not :memory:) — simulates a server restart.
    app = appOn(dataDir);
    const afterRestart = await app.inject({
      method: "GET",
      url: `/api/applications/${created.id}`,
    });
    expect(afterRestart.statusCode).toBe(200);
    expect(afterRestart.json().format).toEqual(CUSTOM_FORMAT);
  });
});

describe("settings.defaultFormat round-trips", () => {
  it("GET returns the seeded DEFAULT_FORMAT; PUT updates it", async () => {
    const app = appOn(freshDataDir());

    const getRes = await app.inject({ method: "GET", url: "/api/settings" });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().defaultFormat).toEqual(DEFAULT_FORMAT);

    const putRes = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { defaultFormat: CUSTOM_FORMAT },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().defaultFormat).toEqual(CUSTOM_FORMAT);

    const getAfter = await app.inject({ method: "GET", url: "/api/settings" });
    expect(getAfter.json().defaultFormat).toEqual(CUSTOM_FORMAT);
  });

  it("PUT with an out-of-bounds format -> 400", async () => {
    const app = appOn(freshDataDir());
    const res = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { defaultFormat: { ...CUSTOM_FORMAT, typography: undefined } },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("lockedFormat FREEZE CONTRAST — lock snapshots settings.defaultFormat, later default changes don't leak back in", () => {
  it("lock freezes lockedFormat; changing settings.defaultFormat after the fact leaves the locked app's lockedFormat byte-identical; unlock clears both locked and lockedFormat", async () => {
    const dataDir = freshDataDir();
    const app = appOn(dataDir);
    const db = initDb(dataDir).db;

    // create an app with NO per-app format override
    const created = (
      await app.inject({
        method: "POST",
        url: "/api/applications",
        payload: { jobDescription: "Build widgets at scale." },
      })
    ).json();
    expect(created.format).toBeNull();

    // simulate a completed tailor (lock requires `current` to be non-null)
    db.update(applications)
      .set({ current: fakeResume })
      .where(eq(applications.id, created.id))
      .run();

    const lockRes = await app.inject({
      method: "POST",
      url: `/api/applications/${created.id}/lock`,
    });
    expect(lockRes.statusCode).toBe(200);
    const lockedFormat = lockRes.json().lockedFormat;
    expect(lockedFormat).toEqual({
      format: DEFAULT_FORMAT,
      resolvedDensity: "comfortable",
      paper: "letter",
    });

    // now change the LIVE default — the freeze must not track it
    const settingsPut = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { defaultFormat: CUSTOM_FORMAT },
    });
    expect(settingsPut.statusCode).toBe(200);
    expect(settingsPut.json().defaultFormat).toEqual(CUSTOM_FORMAT);

    const fetched = await app.inject({ method: "GET", url: `/api/applications/${created.id}` });
    expect(fetched.json().lockedFormat).toEqual(lockedFormat); // byte-identical — freeze holds
    expect(fetched.json().lockedFormat).not.toEqual({
      format: CUSTOM_FORMAT,
      resolvedDensity: "comfortable",
      paper: "letter",
    });

    const unlockRes = await app.inject({
      method: "DELETE",
      url: `/api/applications/${created.id}/lock`,
    });
    expect(unlockRes.statusCode).toBe(200);
    expect(unlockRes.json().locked).toBeNull();
    expect(unlockRes.json().lockedFormat).toBeNull();

    const afterUnlock = await app.inject({ method: "GET", url: `/api/applications/${created.id}` });
    expect(afterUnlock.json().locked).toBeNull();
    expect(afterUnlock.json().lockedFormat).toBeNull();
  });

  it("a per-app format override wins over settings.defaultFormat at lock time", async () => {
    const dataDir = freshDataDir();
    const app = appOn(dataDir);
    const db = initDb(dataDir).db;

    const created = (
      await app.inject({
        method: "POST",
        url: "/api/applications",
        payload: { jobDescription: "Build widgets at scale.", format: CUSTOM_FORMAT },
      })
    ).json();
    db.update(applications)
      .set({ current: fakeResume })
      .where(eq(applications.id, created.id))
      .run();

    const lockRes = await app.inject({
      method: "POST",
      url: `/api/applications/${created.id}/lock`,
    });
    expect(lockRes.json().lockedFormat.format).toEqual(CUSTOM_FORMAT);
  });
});

describe("GET/PUT /api/profile — photoUrl round-trips", () => {
  it("PUT with a photoUrl -> GET returns it byte-equal", async () => {
    const app = appOn(freshDataDir());

    const payload = {
      name: "Jane Doe",
      email: "jane@example.com",
      links: [],
      photoUrl: "https://cdn.example.com/jane.jpg",
    };
    const putRes = await app.inject({ method: "PUT", url: "/api/profile", payload });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().photoUrl).toBe(payload.photoUrl);

    const getRes = await app.inject({ method: "GET", url: "/api/profile" });
    expect(getRes.json().photoUrl).toBe(payload.photoUrl);
  });
});

describe("backup export/import round-trips format, lockedFormat, and photoUrl", () => {
  it("export -> import into a fresh instance reproduces format/lockedFormat/photoUrl", async () => {
    const sourceDir = freshDataDir();
    const sourceApp = appOn(sourceDir);
    const sourceDb = initDb(sourceDir).db;

    await sourceApp.inject({
      method: "PUT",
      url: "/api/profile",
      payload: {
        name: "Jane Doe",
        email: "jane@example.com",
        links: [],
        photoUrl: "https://cdn.example.com/jane.jpg",
      },
    });

    const created = (
      await sourceApp.inject({
        method: "POST",
        url: "/api/applications",
        payload: { jobDescription: "Build widgets at scale.", format: CUSTOM_FORMAT },
      })
    ).json();
    sourceDb
      .update(applications)
      .set({ current: fakeResume })
      .where(eq(applications.id, created.id))
      .run();
    const lockRes = await sourceApp.inject({
      method: "POST",
      url: `/api/applications/${created.id}/lock`,
    });
    const lockedFormat = lockRes.json().lockedFormat;

    const exportRes = await sourceApp.inject({ method: "GET", url: "/api/export" });
    expect(exportRes.statusCode).toBe(200);
    const backup = exportRes.json();
    expect(backup.profile.photoUrl).toBe("https://cdn.example.com/jane.jpg");
    expect(backup.applications[0].format).toEqual(CUSTOM_FORMAT);
    expect(backup.applications[0].lockedFormat).toEqual(lockedFormat);

    const destApp = appOn(freshDataDir());
    const importRes = await destApp.inject({
      method: "POST",
      url: "/api/import",
      payload: backup,
    });
    expect(importRes.statusCode).toBe(200);
    expect(importRes.json().imported).toEqual({ entries: 0, profile: 1, applications: 1 });

    const profileRes = await destApp.inject({ method: "GET", url: "/api/profile" });
    expect(profileRes.json().photoUrl).toBe("https://cdn.example.com/jane.jpg");

    const appRes = await destApp.inject({
      method: "GET",
      url: `/api/applications/${created.id}`,
    });
    expect(appRes.statusCode).toBe(200);
    expect(appRes.json().format).toEqual(CUSTOM_FORMAT);
    expect(appRes.json().lockedFormat).toEqual(lockedFormat);
  });
});
