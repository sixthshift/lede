// claude-cli in the settings API: accepted as a provider like any other, but
// keyless — PUT /api/settings/key must refuse it outright rather than validate
// and store a key the tailor path never reads.
//
// Keyless suite by construction: the validator is injected (settingsRoutes' 3rd
// param), so no live provider call is ever made, and the claude-cli assertions
// prove the injected validator isn't reached at all.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";

import { buildApp } from "../src/server/index";
import { initDb } from "../src/server/db";
import { secrets } from "../src/server/db/schema";
import { settingsRoutes } from "../src/server/routes/settings";
import type { ProviderKeyValidator } from "../src/server/keyvalidation";
import type { Db } from "../src/server/db";

const tmpDirs: string[] = [];

function freshDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-api-claude-cli-settings-"));
  tmpDirs.push(dir);
  return dir;
}

// An accepting validator that records whether it ran — the claude-cli path's
// contract is that it never does.
function countingAcceptValidator(): { validate: ProviderKeyValidator; calls: () => number } {
  let calls = 0;
  return {
    validate: async () => {
      calls += 1;
    },
    calls: () => calls,
  };
}

function keyAppOn(db: Db, validate: ProviderKeyValidator): FastifyInstance {
  const app = Fastify({ logger: false });
  settingsRoutes(app, db, validate);
  return app;
}

function secretsRow(db: Db) {
  return db.select().from(secrets).where(eq(secrets.id, 1)).get()!;
}

afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("PUT /api/settings accepts claude-cli with a free-string model", () => {
  it("provider claude-cli + model sonnet round-trips through GET /api/settings", async () => {
    const db = initDb(freshDataDir()).db;
    const app = buildApp(db);

    const put = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { provider: "claude-cli", model: "sonnet" },
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({ method: "GET", url: "/api/settings" });
    expect(get.statusCode).toBe(200);
    expect(get.json().provider).toBe("claude-cli");
    expect(get.json().model).toBe("sonnet");
  });

  it("a model string outside the registry list is still accepted and echoed", async () => {
    const db = initDb(freshDataDir()).db;
    const app = buildApp(db);

    // Not one of the registry's claude-cli aliases (opus/sonnet/haiku): model is
    // a free string for every provider, and this ticket does not narrow it.
    const put = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { provider: "claude-cli", model: "some-unlisted-alias" },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().model).toBe("some-unlisted-alias");

    const get = await app.inject({ method: "GET", url: "/api/settings" });
    expect(get.json()).toMatchObject({ provider: "claude-cli", model: "some-unlisted-alias" });
  });
});

describe("CONTRAST: PUT /api/settings/key under claude-cli vs anthropic", () => {
  it("claude-cli -> 400 provider_keyless, validator untouched, no ciphertext stored", async () => {
    const db = initDb(freshDataDir()).db;
    const mainApp = buildApp(db);
    const { validate, calls } = countingAcceptValidator();
    const keyApp = keyAppOn(db, validate);

    await mainApp.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { provider: "claude-cli", model: "sonnet" },
    });

    const res = await keyApp.inject({
      method: "PUT",
      url: "/api/settings/key",
      payload: { apiKey: "sk-irrelevant-under-claude-cli" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "provider_keyless" });

    expect(calls()).toBe(0);
    expect(secretsRow(db).apiKeyEnc).toBeNull();
    expect(secretsRow(db).apiKeyValidatedAt).toBeNull();
    expect((await mainApp.inject({ method: "GET", url: "/api/settings" })).json().keySet).toBe(
      false,
    );
  });

  it("switching back to anthropic restores validate-then-store on the same key PUT", async () => {
    const db = initDb(freshDataDir()).db;
    const mainApp = buildApp(db);
    const { validate, calls } = countingAcceptValidator();
    const keyApp = keyAppOn(db, validate);
    const payload = { apiKey: "sk-same-key-both-times" };

    await mainApp.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { provider: "claude-cli", model: "sonnet" },
    });
    const refused = await keyApp.inject({ method: "PUT", url: "/api/settings/key", payload });
    expect(refused.statusCode).toBe(400);
    expect(calls()).toBe(0);
    expect(secretsRow(db).apiKeyEnc).toBeNull();

    await mainApp.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { provider: "anthropic", model: "claude-sonnet-4-5" },
    });
    const accepted = await keyApp.inject({ method: "PUT", url: "/api/settings/key", payload });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ keySet: true });

    expect(calls()).toBe(1);
    const row = secretsRow(db);
    expect(row.apiKeyEnc).not.toBeNull();
    expect(Object.keys(row.apiKeyEnc!).sort()).toEqual(["ciphertext", "iv", "tag"]);
    expect(row.apiKeyEnc!.ciphertext).not.toContain(payload.apiKey);
    expect((await mainApp.inject({ method: "GET", url: "/api/settings" })).json().keySet).toBe(
      true,
    );
  });

  it("DELETE /api/settings/key still purges regardless of provider", async () => {
    const db = initDb(freshDataDir()).db;
    const mainApp = buildApp(db);
    const { validate } = countingAcceptValidator();
    const keyApp = keyAppOn(db, validate);

    await keyApp.inject({
      method: "PUT",
      url: "/api/settings/key",
      payload: { apiKey: "sk-stored-under-anthropic" },
    });
    expect(secretsRow(db).apiKeyEnc).not.toBeNull();

    await mainApp.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { provider: "claude-cli", model: "sonnet" },
    });
    const del = await keyApp.inject({ method: "DELETE", url: "/api/settings/key" });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ keySet: false });
    expect(secretsRow(db).apiKeyEnc).toBeNull();
  });
});
