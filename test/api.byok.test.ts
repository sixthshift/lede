// E2-C — BYOK key storage: PUT/DELETE /api/settings/key, spec.md §8/§17/§19/§23.
// The validator is injected (settingsRoutes' optional 3rd param) so this suite
// stays keyless — no real live provider call is ever made here.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";

import { buildApp } from "../src/server/index";
import { initDb } from "../src/server/db";
import { secrets } from "../src/server/db/schema";
import { settingsRoutes } from "../src/server/routes/settings";
import type { ProviderKeyValidator } from "../src/server/keyvalidation";
import { loadConfig } from "../src/server/config";
import type { Db } from "../src/server/db";

const tmpDirs: string[] = [];

function freshDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-api-byok-"));
  tmpDirs.push(dir);
  return dir;
}

const acceptValidator: ProviderKeyValidator = async () => {};
const rejectValidator: ProviderKeyValidator = async () => {
  throw new Error("invalid key");
};

// Mirrors buildApp's GET/PUT /api/settings wiring but lets us inject a fake
// validator — the seam settingsRoutes exists for (buildApp itself always
// uses the real, network-calling validateProviderKey).
function keyAppOn(db: Db, validate: ProviderKeyValidator): FastifyInstance {
  const app = Fastify({ logger: false });
  settingsRoutes(app, db, validate);
  return app;
}

function secretsRow(db: Db) {
  return db.select().from(secrets).where(eq(secrets.id, 1)).get()!;
}

// Captures everything written to stdout/stderr while `fn` runs (Fastify's
// pino logger writes there) so tests can assert a secret never appears in it.
async function captureIO(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  (process.stdout.write as unknown) = (chunk: unknown, ...rest: unknown[]) => {
    chunks.push(String(chunk));
    return (origOut as (...a: unknown[]) => boolean)(chunk, ...rest);
  };
  (process.stderr.write as unknown) = (chunk: unknown, ...rest: unknown[]) => {
    chunks.push(String(chunk));
    return (origErr as (...a: unknown[]) => boolean)(chunk, ...rest);
  };
  try {
    await fn();
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return chunks.join("");
}

function dataDirBytes(dataDir: string): Buffer {
  const buffers = readdirSync(dataDir)
    .filter((name) => name.startsWith("lede.sqlite"))
    .map((name) => readFileSync(path.join(dataDir, name)));
  return Buffer.concat(buffers);
}

afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("CONTRAST: validate-before-store", () => {
  it("rejecting validator -> 4xx, secrets.apiKeyEnc unchanged", async () => {
    const db = initDb(freshDataDir()).db;
    const app = keyAppOn(db, rejectValidator);

    expect(secretsRow(db).apiKeyEnc).toBeNull();

    const res = await app.inject({
      method: "PUT",
      url: "/api/settings/key",
      payload: { apiKey: "sk-bad" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(secretsRow(db).apiKeyEnc).toBeNull();
  });

  it("rejecting validator leaves a PRIOR key untouched", async () => {
    const db = initDb(freshDataDir()).db;
    const acceptApp = keyAppOn(db, acceptValidator);
    await acceptApp.inject({
      method: "PUT",
      url: "/api/settings/key",
      payload: { apiKey: "sk-original" },
    });
    const before = secretsRow(db).apiKeyEnc;
    expect(before).not.toBeNull();

    const rejectApp = keyAppOn(db, rejectValidator);
    const res = await rejectApp.inject({
      method: "PUT",
      url: "/api/settings/key",
      payload: { apiKey: "sk-new" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(secretsRow(db).apiKeyEnc).toEqual(before);
  });

  it("accepting validator -> key stored as {iv,tag,ciphertext}, never plaintext; keySet true", async () => {
    const db = initDb(freshDataDir()).db;
    const app = keyAppOn(db, acceptValidator);

    const res = await app.inject({
      method: "PUT",
      url: "/api/settings/key",
      payload: { apiKey: "sk-good-key" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ keySet: true });

    const row = secretsRow(db);
    expect(row.apiKeyEnc).not.toBeNull();
    expect(Object.keys(row.apiKeyEnc!).sort()).toEqual(["ciphertext", "iv", "tag"]);
    expect(row.apiKeyEnc!.ciphertext).not.toContain("sk-good-key");
    expect(row.apiKeyValidatedAt).not.toBeNull();
  });

  it("PUT with a bad body -> 400", async () => {
    const db = initDb(freshDataDir()).db;
    const app = keyAppOn(db, acceptValidator);
    const res = await app.inject({ method: "PUT", url: "/api/settings/key", payload: {} });
    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /api/settings/key purges the stored key", () => {
  it("GET /api/settings keySet -> false after delete", async () => {
    const dataDir = freshDataDir();
    const db = initDb(dataDir).db;
    const mainApp = buildApp(db);
    const keyApp = keyAppOn(db, acceptValidator);

    await keyApp.inject({
      method: "PUT",
      url: "/api/settings/key",
      payload: { apiKey: "sk-to-be-deleted" },
    });
    expect((await mainApp.inject({ method: "GET", url: "/api/settings" })).json().keySet).toBe(
      true,
    );

    const delRes = await keyApp.inject({ method: "DELETE", url: "/api/settings/key" });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json()).toEqual({ keySet: false });

    expect((await mainApp.inject({ method: "GET", url: "/api/settings" })).json().keySet).toBe(
      false,
    );
    expect(secretsRow(db).apiKeyEnc).toBeNull();
  });
});

describe("CONTRAST: SENTINEL leak scan (gameable-resistant)", () => {
  it("the raw key never appears in any response body, server logs, or DATA_DIR bytes", async () => {
    const dataDir = freshDataDir();
    const db = initDb(dataDir).db;
    const mainApp = buildApp(db);
    const keyApp = keyAppOn(db, acceptValidator);
    const sentinel = `sk-SENTINEL-${randomUUID()}`;
    const responseBodies: string[] = [];

    const logs = await captureIO(async () => {
      const putRes = await keyApp.inject({
        method: "PUT",
        url: "/api/settings/key",
        payload: { apiKey: sentinel },
      });
      responseBodies.push(putRes.payload);
      expect(putRes.statusCode).toBe(200);

      const getSettings = await mainApp.inject({ method: "GET", url: "/api/settings" });
      responseBodies.push(getSettings.payload);

      // a tailor-route error path — proves the sentinel doesn't leak through
      // unrelated error handling either.
      const tailorErr = await mainApp.inject({
        method: "POST",
        url: "/api/tailor",
        payload: {
          jobDescription: "A completely unrecorded jd about beekeeping, never in any fixture.",
        },
      });
      responseBodies.push(tailorErr.payload);

      // a bad PUT to re-exercise the validation error path
      const badPut = await keyApp.inject({ method: "PUT", url: "/api/settings/key", payload: {} });
      responseBodies.push(badPut.payload);

      const rejectApp = keyAppOn(db, rejectValidator);
      const rejectedPut = await rejectApp.inject({
        method: "PUT",
        url: "/api/settings/key",
        payload: { apiKey: "sk-other" },
      });
      responseBodies.push(rejectedPut.payload);
    });

    for (const body of responseBodies) {
      expect(body).not.toContain(sentinel);
    }
    expect(logs).not.toContain(sentinel);

    const dbBytes = dataDirBytes(dataDir);
    expect(dbBytes.includes(sentinel)).toBe(false);

    // it DOES exist, only as ciphertext, inside secrets.apiKeyEnc
    const row = secretsRow(db);
    expect(row.apiKeyEnc).not.toBeNull();
  });

  it("LEDE_MASTER_KEY itself never appears in any file under DATA_DIR", async () => {
    const dataDir = freshDataDir();
    const db = initDb(dataDir).db;
    const keyApp = keyAppOn(db, acceptValidator);
    await keyApp.inject({
      method: "PUT",
      url: "/api/settings/key",
      payload: { apiKey: `sk-${randomUUID()}` },
    });

    const masterKeyB64 = loadConfig().masterKey.toString("base64");
    const dbBytes = dataDirBytes(dataDir);
    expect(dbBytes.includes(masterKeyB64)).toBe(false);
  });
});
