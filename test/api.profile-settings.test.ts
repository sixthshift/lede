import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/server/index";
import { initDb } from "../src/server/db";

const tmpDirs: string[] = [];

function freshDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-api-profile-settings-"));
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

describe("GET/PUT /api/profile", () => {
  it("round-trips a profile", async () => {
    const app = appOn(freshDataDir());

    const getRes = await app.inject({ method: "GET", url: "/api/profile" });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toMatchObject({ name: "", email: "", links: [] });

    const payload = {
      name: "Jane Doe",
      headline: "Principal Engineer",
      email: "jane@example.com",
      phone: "555-1234",
      location: "Remote",
      links: [{ type: "github", label: "GitHub", url: "https://github.com/jane" }],
      baseSummary: "Ships platform SDKs.",
    };
    const putRes = await app.inject({ method: "PUT", url: "/api/profile", payload });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json()).toEqual(payload);

    const getAfter = await app.inject({ method: "GET", url: "/api/profile" });
    expect(getAfter.json()).toEqual(payload);
  });

  it("PUT with a bad body -> 400", async () => {
    const app = appOn(freshDataDir());
    const res = await app.inject({ method: "PUT", url: "/api/profile", payload: { email: "jane@example.com" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET/PUT /api/settings", () => {
  it("round-trips settings including layout", async () => {
    const app = appOn(freshDataDir());

    const getRes = await app.inject({ method: "GET", url: "/api/settings" });
    expect(getRes.statusCode).toBe(200);
    const initial = getRes.json();
    expect(initial).toMatchObject({ keySet: false, provider: "anthropic", model: "claude-opus-4-8" });
    expect(Array.isArray(initial.layout)).toBe(true);

    const putRes = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { model: "claude-3-5-haiku", layout: [{ section: "summary", enabled: false }] },
    });
    expect(putRes.statusCode).toBe(200);
    const updated = putRes.json();
    expect(updated.model).toBe("claude-3-5-haiku");
    expect(updated.provider).toBe("anthropic"); // untouched field preserved
    expect(updated.layout).toEqual([{ section: "summary", enabled: false }]);
    expect(updated.keySet).toBe(false);
  });

  it("PUT with a bad body -> 400", async () => {
    const app = appOn(freshDataDir());
    const res = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { layout: [{ section: "not-a-section", enabled: true }] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("CONTRAST: /api/settings never leaks the key or auth hash", () => {
  it("body has boolean keySet and no ciphertext/auth material", async () => {
    const app = appOn(freshDataDir());
    const res = await app.inject({ method: "GET", url: "/api/settings" });
    const raw = res.payload;
    const body = res.json();

    expect(typeof body.keySet).toBe("boolean");
    expect(raw).not.toMatch(/apiKey/i);
    expect(raw).not.toMatch(/ciphertext/i);
    expect(raw).not.toMatch(/"iv"/);
    expect(raw).not.toMatch(/"tag"/);
    expect(raw).not.toMatch(/"hash"/);
    expect(raw).not.toMatch(/"salt"/);

    const allowed = new Set(["keySet", "provider", "model", "baseUrl", "layout"]);
    for (const key of Object.keys(body)) {
      expect(allowed.has(key)).toBe(true);
    }
  });
});
