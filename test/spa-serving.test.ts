// GET / and SPA history-fallback serving of the built dist/ (§19,
// index.ts:139 TODO) — see src/server/index.ts's buildApp(distDir) override.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/server/index";
import { initDb } from "../src/server/db";

const tmpDirs: string[] = [];
const MARKER_HTML = "<!doctype html><html><body>lede-spa-marker</body></html>";

function freshDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-spa-data-"));
  tmpDirs.push(dir);
  return dir;
}

function fixtureDist(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-spa-dist-"));
  tmpDirs.push(dir);
  writeFileSync(path.join(dir, "index.html"), MARKER_HTML);
  mkdirSync(path.join(dir, "assets"));
  writeFileSync(path.join(dir, "assets", "app.js"), "console.log('marker-asset');");
  return dir;
}

function appWithDist(distDir?: string): FastifyInstance {
  return buildApp(initDb(freshDataDir()).db, undefined, distDir);
}

afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("SPA static serving (dist/ present)", () => {
  it("GET / returns the built index.html", async () => {
    const app = appWithDist(fixtureDist());
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(MARKER_HTML);
  });

  it("GET on a non-/api client route (e.g. /library) falls back to index.html", async () => {
    const app = appWithDist(fixtureDist());
    const res = await app.inject({ method: "GET", url: "/library" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(MARKER_HTML);
  });

  it("GET on a nested client route (e.g. /settings/foo) also falls back to index.html", async () => {
    const app = appWithDist(fixtureDist());
    const res = await app.inject({ method: "GET", url: "/settings/foo" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(MARKER_HTML);
  });

  it("serves a real static asset (assets/app.js) rather than the SPA fallback", async () => {
    const app = appWithDist(fixtureDist());
    const res = await app.inject({ method: "GET", url: "/assets/app.js" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("console.log('marker-asset');");
  });

  it("CONTRAST: /api/health still returns JSON {ok:true}, not the SPA html", async () => {
    const app = appWithDist(fixtureDist());
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("CONTRAST: an unknown /api/* route 404s as JSON, not index.html", async () => {
    const app = appWithDist(fixtureDist());
    const res = await app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).not.toContain("lede-spa-marker");
  });
});

describe("SPA static serving (dist/ absent — keyless build/test/demo)", () => {
  it("boots fine and GET / is a plain 404, not a crash", async () => {
    const missingDist = path.join(tmpdir(), `lede-spa-dist-does-not-exist-${Date.now()}`);
    const app = appWithDist(missingDist);
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(404);
  });

  it("/api/health is unaffected", async () => {
    const missingDist = path.join(tmpdir(), `lede-spa-dist-does-not-exist-${Date.now()}`);
    const app = appWithDist(missingDist);
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
