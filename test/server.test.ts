import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";

import type { TailorDecision } from "@shared/types";
import { SEED_ENTRIES } from "../src/server/seed";
import { hashKey } from "../src/server/tailor/evalcore";
import { buildApp } from "../src/server/index";

// buildApp() calls makeEngine(), which picks FixtureEngine reading its
// DEFAULT_FIXTURES_DIR (test/fixtures/decisions) whenever NODE_ENV=test and
// LEDE_TAILOR_ENGINE is unset — true under `bun run test`. We drop recorded
// fixtures there for the life of this suite and clean them up after.
const FIXTURES_DIR = path.join(process.cwd(), "test/fixtures/decisions");

const RECORDED_JD =
  "We need a senior engineer to design a public-facing platform SDK so outside partners can build on our product.";
const UNRECORDED_JD = "Completely unrecorded job description about pastry arts and bread science.";
const FABRICATION_JD =
  "Job description whose fixture decision fabricates a number absent from every fact.";

function decisionFor(text: string): TailorDecision {
  return {
    signals: { roleLevel: "senior", weights: ["platform"], hardRequirements: [] },
    summary: "Principal engineer who has shipped platform SDKs adopted company-wide.",
    items: [
      {
        entryId: "cloudcase-platform-sdk",
        text,
        rank: 1,
        leadRationale: "Directly built the platform SDK described in this job.",
      },
    ],
    cut: [],
  };
}

function writeFixture(name: string, jd: string, decision: TailorDecision) {
  writeFileSync(
    path.join(FIXTURES_DIR, `${name}.json`),
    JSON.stringify({ key: hashKey(jd, SEED_ENTRIES), name, decision }),
  );
}

let app: FastifyInstance;
let createdDir = false;

beforeAll(() => {
  if (!existsSync(FIXTURES_DIR)) {
    mkdirSync(FIXTURES_DIR, { recursive: true });
    createdDir = true;
  }

  // grounded in cloudcase-platform-sdk's own facts — no fabricated numbers
  writeFixture(
    "route-test-recorded",
    RECORDED_JD,
    decisionFor("built a platform SDK exposing the platform programmatically for the first time"),
  );
  // "9999%" is not in any SEED_ENTRIES fact — must trip FabricationError -> 502
  writeFixture(
    "route-test-fabrication",
    FABRICATION_JD,
    decisionFor("grew external adoption by 9999%"),
  );

  process.env.NODE_ENV = "test";
  delete process.env.LEDE_TAILOR_ENGINE;
  app = buildApp();
});

afterAll(() => {
  rmSync(path.join(FIXTURES_DIR, "route-test-recorded.json"), { force: true });
  rmSync(path.join(FIXTURES_DIR, "route-test-fabrication.json"), { force: true });
  if (createdDir) rmSync(FIXTURES_DIR, { recursive: true, force: true });
});

describe("GET /api/health", () => {
  it("returns 200 { ok: true }", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe("POST /api/tailor", () => {
  it("200s with a valid TailoredResume whose items trace to SEED_ENTRIES", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tailor",
      payload: { jobDescription: RECORDED_JD },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.sections)).toBe(true);

    const validIds = new Set(SEED_ENTRIES.map((e) => e.id));
    const seenIds: string[] = [];
    for (const section of body.sections) {
      for (const group of section.groups) {
        for (const item of group.items) {
          seenIds.push(item.entryId);
          expect(validIds.has(item.entryId)).toBe(true);
        }
      }
    }
    expect(seenIds).toContain("cloudcase-platform-sdk");
  });

  it("400s on empty jobDescription", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tailor",
      payload: { jobDescription: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("400s on oversized jobDescription (>20000 chars)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tailor",
      payload: { jobDescription: "x".repeat(20001) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("422s with { error: 'no_fixture' } for an unrecorded jd", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tailor",
      payload: { jobDescription: UNRECORDED_JD },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("no_fixture");
  });

  it("502s when the recorded decision fabricates a number not in facts", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tailor",
      payload: { jobDescription: FABRICATION_JD },
    });
    expect(res.statusCode).toBe(502);
  });
});
