// Auth guard + /api/auth/* routes (ticket E2-B, spec.md §7). The global
// suite runs LEDE_AUTH_DISABLED=true (test/setup.ts) so this file forces
// auth ENABLED via buildApp's configOverride to exercise the real gate.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";

import { buildApp } from "../src/server/index";
import { initDb } from "../src/server/db";

const tmpDirs: string[] = [];

function freshDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-api-auth-"));
  tmpDirs.push(dir);
  return dir;
}

function appWithAuthEnabled(): FastifyInstance {
  return buildApp(initDb(freshDataDir()).db, { authDisabled: false });
}

function sessionCookieFrom(res: LightMyRequestResponse): string {
  const cookie = res.cookies.find((c) => c.name === "session");
  if (!cookie) throw new Error("expected a session cookie on the response");
  return cookie.value;
}

afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("guard: auth ENABLED, no session -> 401 on every protected route", () => {
  it("blocks GET /api/entries, GET /api/profile, GET/PUT /api/settings, and POST /api/tailor", async () => {
    const app = appWithAuthEnabled();

    const protectedRequests: Array<{ method: "GET" | "POST" | "PUT"; url: string }> = [
      { method: "GET", url: "/api/entries" },
      { method: "GET", url: "/api/profile" },
      { method: "GET", url: "/api/settings" },
      { method: "PUT", url: "/api/settings" },
      { method: "POST", url: "/api/tailor" },
    ];

    for (const { method, url } of protectedRequests) {
      const res = await app.inject({ method, url, payload: method === "POST" || method === "PUT" ? {} : undefined });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("does not guard /api/health or /api/auth/*", async () => {
    const app = appWithAuthEnabled();

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);

    const badLogin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: "nope" } });
    expect(badLogin.statusCode).toBe(401); // reachable, just wrong creds — not gated by the session guard
  });
});

describe("first-run setup", () => {
  it("sets the password on first call; a second call is rejected 409", async () => {
    const app = appWithAuthEnabled();

    const first = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "correct horse" } });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "anything" } });
    expect(second.statusCode).toBe(409);
  });

  it("400s on an empty password", async () => {
    const app = appWithAuthEnabled();
    const res = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("login / logout", () => {
  it("wrong password -> 401", async () => {
    const app = appWithAuthEnabled();
    await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "correct horse" } });

    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: "wrong" } });
    expect(res.statusCode).toBe(401);
  });

  it("right password issues a session that then passes the guard on a protected route", async () => {
    const app = appWithAuthEnabled();
    await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "correct horse" } });

    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: "correct horse" } });
    expect(login.statusCode).toBe(200);
    const session = sessionCookieFrom(login);

    const guarded = await app.inject({ method: "GET", url: "/api/entries", cookies: { session } });
    expect(guarded.statusCode).toBe(200);
  });

  it("logout clears the session so the guard blocks again", async () => {
    const app = appWithAuthEnabled();
    await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "correct horse" } });
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: "correct horse" } });
    const session = sessionCookieFrom(login);

    const logout = await app.inject({ method: "POST", url: "/api/auth/logout", cookies: { session } });
    expect(logout.statusCode).toBe(200);
    const loggedOutSession = sessionCookieFrom(logout);

    const blocked = await app.inject({ method: "GET", url: "/api/entries", cookies: { session: loggedOutSession } });
    expect(blocked.statusCode).toBe(401);
  });
});
