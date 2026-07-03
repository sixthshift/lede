// E2-D — /api/tailor in LIVE mode uses the decrypted BYOK key via ProviderEngine
// (in-memory only); with no stored key it short-circuits to 400 {error:'no_api_key'}
// before any provider call. FIXTURE-mode tailor tests stay keyless/unaffected —
// this suite only exercises the live-mode split (spec.md §6.1/§8/§9).
//
// Engine mode is always passed explicitly via configOverride ({tailorEngine:
// "live"|"fixture"}) rather than relying on process.env.NODE_ENV/LEDE_TAILOR_ENGINE
// — buildApp() must honor that explicit decision regardless of what NODE_ENV
// happens to be in the process (shared vitest workers can leak it between
// files), so this suite is deterministic run standalone or in the full suite.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { eq } from "drizzle-orm";

// Mock only generateObject; keep every other "ai" export (APICallError,
// NoObjectGeneratedError — used by index.ts's mapTailorError) real, so the
// route's error mapping stays exercisable even in this mocked file.
const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateObject: generateObjectMock };
});

import { buildApp } from "../src/server/index";
import { initDb } from "../src/server/db";
import { secrets } from "../src/server/db/schema";
import { encrypt } from "../src/server/crypto";
import { loadConfig } from "../src/server/config";
import type { Db } from "../src/server/db";
import type { TailorDecision } from "@shared/types";

const tmpDirs: string[] = [];

function freshDb(): Db {
  const dir = mkdtempSync(path.join(tmpdir(), "lede-tailor-byok-"));
  tmpDirs.push(dir);
  return initDb(dir).db;
}

function storeKey(db: Db, apiKey: string): void {
  const masterKey = loadConfig().masterKey;
  db.update(secrets)
    .set({ apiKeyEnc: encrypt(apiKey, masterKey), apiKeyValidatedAt: Date.now(), updatedAt: Date.now() })
    .where(eq(secrets.id, 1))
    .run();
}

// Captures everything written to stdout/stderr (Fastify's pino logger writes
// there) so tests can assert a decrypted key never appears in it.
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

const decision: TailorDecision = {
  signals: { roleLevel: "mid", weights: [], hardRequirements: [] },
  summary: "A tailored summary.",
  items: [],
  cut: [],
};

beforeEach(() => {
  generateObjectMock.mockReset();
});

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("CONTRAST: LIVE mode with NO stored key -> 400 no_api_key (short-circuits before any provider call)", () => {
  it("differs from fixture-mode's 422 no_fixture for the very same unrecorded jd", async () => {
    const db = freshDb();
    // Both apps get their engine mode from an explicit configOverride, never
    // from ambient env — this is the exact contrast the prior regression missed.
    const liveApp = buildApp(db, { tailorEngine: "live" });
    const fixtureApp = buildApp(db, { tailorEngine: "fixture" });
    const jd = "A jd never recorded in any fixture, about beekeeping logistics.";

    const liveRes = await liveApp.inject({ method: "POST", url: "/api/tailor", payload: { jobDescription: jd } });
    expect(liveRes.statusCode).toBe(400);
    expect(liveRes.json()).toEqual({ error: "no_api_key" });
    expect(generateObjectMock).not.toHaveBeenCalled();

    const fixtureRes = await fixtureApp.inject({ method: "POST", url: "/api/tailor", payload: { jobDescription: jd } });
    expect(fixtureRes.statusCode).toBe(422);
    expect(fixtureRes.json().error).toBe("no_fixture");
  });

  it("400 no_api_key even for a well-formed request, with zero provider calls", async () => {
    const db = freshDb();
    const app = buildApp(db, { tailorEngine: "live" });

    const res = await app.inject({
      method: "POST",
      url: "/api/tailor",
      payload: { jobDescription: "Hiring a backend engineer." },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "no_api_key" });
    expect(generateObjectMock).not.toHaveBeenCalled();
  });
});

describe("LIVE mode with a stored key decrypts in-memory and builds a ProviderEngine", () => {
  it("succeeds via the mocked provider call and never leaks the plaintext key", async () => {
    const db = freshDb();
    const sentinel = `sk-SENTINEL-${randomUUID()}`;
    storeKey(db, sentinel);
    generateObjectMock.mockResolvedValueOnce({ object: decision });

    const app = buildApp(db, { tailorEngine: "live" });

    const logs = await captureIO(async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/tailor",
        payload: { jobDescription: "Hiring a backend engineer." },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().summary).toBe(decision.summary);
      expect(res.payload).not.toContain(sentinel);
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(logs).not.toContain(sentinel);

    // still only ever persisted as ciphertext
    const row = db.select().from(secrets).where(eq(secrets.id, 1)).get()!;
    expect(JSON.stringify(row.apiKeyEnc)).not.toContain(sentinel);
  });

  it("retries once on transient provider failure, still never logging the key", async () => {
    const db = freshDb();
    const sentinel = `sk-SENTINEL-${randomUUID()}`;
    storeKey(db, sentinel);
    generateObjectMock.mockRejectedValueOnce(new Error("transient")).mockResolvedValueOnce({ object: decision });

    const app = buildApp(db, { tailorEngine: "live" });

    const logs = await captureIO(async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/tailor",
        payload: { jobDescription: "Hiring a backend engineer." },
      });
      expect(res.statusCode).toBe(200);
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(2);
    expect(logs).not.toContain(sentinel);
  });
});
