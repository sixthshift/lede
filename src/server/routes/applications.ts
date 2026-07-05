// /api/applications CRUD — spec.md §27. A tailoring record for one job, NOT
// a hiring tracker (no status field). Mirrors routes/entries.ts's idiom.
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { APICallError, NoObjectGeneratedError } from "ai";

import { applicationCreate, applicationUpdate, documentFormatZ } from "@shared/schema";
import type { Entry, ProviderId, Section } from "@shared/types";
import type { Db } from "../db";
import { applications, entries, profile, settings, secrets } from "../db/schema";
import { loadConfig, type Config } from "../config";
import { decrypt } from "../crypto";
import {
  FixtureEngine,
  ProviderEngine,
  NoFixtureError,
  tailor,
  type TailorEngine,
} from "../tailor/engine";
import { FabricationError } from "../tailor/validate";
import { deriveContentBudget } from "../tailor/budget";

// Row -> domain Entry — same shape/key-order as index.ts's rowToEntry, kept
// in lockstep so hashKey() (FixtureEngine's replay key) matches identically
// regardless of which route read the entries from the db.
function rowToEntry(row: typeof entries.$inferSelect): Entry {
  const entry: Entry = {
    id: row.id,
    section: row.section as Section,
    sortKey: row.sortKey,
    meta: row.meta,
    facts: row.facts,
    tags: row.tags,
  };
  if (row.framings) entry.framings = row.framings;
  return entry;
}

// Maps a tailor() failure to its distinct HTTP status — identical to
// index.ts's mapTailorError for the stateless route (spec.md §9).
function mapTailorError(err: unknown): { status: number; body: { error: string } } {
  if (err instanceof NoFixtureError) return { status: 422, body: { error: "no_fixture" } };
  if (err instanceof FabricationError) return { status: 502, body: { error: "fabrication" } };

  if (APICallError.isInstance(err)) {
    if (err.statusCode === 401 || err.statusCode === 403)
      return { status: 401, body: { error: "key_invalid" } };
    if (err.statusCode === 429) return { status: 429, body: { error: "rate_limited" } };
    return { status: 502, body: { error: "provider_error" } };
  }

  if (NoObjectGeneratedError.isInstance(err))
    return { status: 502, body: { error: "model_off_contract" } };

  return { status: 502, body: { error: "provider_error" } };
}

// applicationCreate/Update (@shared/schema) don't own DocumentFormat —
// extended here with the bounded documentFormatZ validator (§28.3).
const applicationCreateWithFormat = applicationCreate.extend({ format: documentFormatZ.nullish() });
const applicationUpdateWithFormat = applicationUpdate.extend({ format: documentFormatZ.nullish() });

export type ApplicationsRoutesDeps = {
  // Test-only seam (mirrors settingsRoutes' injected validator): a fixed
  // engine bypasses mode selection/decryption entirely, e.g. a spy proving
  // context reaches decide(). Production callers never pass this.
  engine?: TailorEngine;
  config?: Partial<Config>;
};

// Selects the engine for one tailor request exactly like the stateless
// /api/tailor route does: fixture mode is keyless; live mode decrypts the
// stored BYOK key per request (never a boot-time constant) or short-circuits
// to 'no_api_key' before any provider call.
function resolveEngine(
  db: Db,
  config: Config,
  deps?: ApplicationsRoutesDeps,
): TailorEngine | { error: "no_api_key" } {
  if (deps?.engine) return deps.engine;
  if (config.tailorEngine === "fixture") return new FixtureEngine();

  const secretsRow = db.select().from(secrets).where(eq(secrets.id, 1)).get();
  if (!secretsRow?.apiKeyEnc) return { error: "no_api_key" };

  const settingsRow = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  // Decrypted in memory for this request only — never persisted, logged, or returned.
  const apiKey = decrypt(secretsRow.apiKeyEnc, config.masterKey);
  return new ProviderEngine({
    provider: settingsRow.provider as ProviderId,
    model: settingsRow.model,
    apiKey,
    baseURL: settingsRow.baseUrl ?? undefined,
  });
}

// The LIST payload omits the heavy current/locked TailoredResume snapshots
// (§9 "no heavy snapshots") — only metadata + genState + currentMeta.
const LIST_COLUMNS = {
  id: applications.id,
  company: applications.company,
  role: applications.role,
  jobDescription: applications.jobDescription,
  context: applications.context,
  targetPages: applications.targetPages,
  genState: applications.genState,
  currentMeta: applications.currentMeta,
  createdAt: applications.createdAt,
  updatedAt: applications.updatedAt,
} as const;

export function applicationsRoutes(
  app: FastifyInstance,
  db: Db,
  deps?: ApplicationsRoutesDeps,
): void {
  app.get("/api/applications", async () => {
    return db.select(LIST_COLUMNS).from(applications).all();
  });

  app.post("/api/applications", async (request, reply) => {
    const parsed = applicationCreateWithFormat.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    const input = parsed.data;
    const now = Date.now();
    const row = {
      id: randomUUID(),
      company: input.company ?? null,
      role: input.role ?? null,
      jobDescription: input.jobDescription,
      context: input.context ?? null,
      targetPages: input.targetPages ?? 1,
      format: input.format ?? null,
      current: null,
      locked: null,
      lockedFormat: null,
      genState: "untailored" as const,
      currentMeta: null,
      createdAt: now,
      updatedAt: now,
    };
    db.insert(applications).values(row).run();
    return reply.code(200).send(row);
  });

  app.get<{ Params: { id: string } }>("/api/applications/:id", async (request, reply) => {
    const row = db.select().from(applications).where(eq(applications.id, request.params.id)).get();
    if (!row) {
      return reply.code(404).send({ error: "not_found" });
    }
    return row;
  });

  app.put<{ Params: { id: string } }>("/api/applications/:id", async (request, reply) => {
    const parsed = applicationUpdateWithFormat.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    const existing = db
      .select()
      .from(applications)
      .where(eq(applications.id, request.params.id))
      .get();
    if (!existing) {
      return reply.code(404).send({ error: "not_found" });
    }

    const input = parsed.data;
    const row = {
      ...existing,
      ...(input.company !== undefined ? { company: input.company ?? null } : {}),
      ...(input.role !== undefined ? { role: input.role ?? null } : {}),
      ...(input.jobDescription !== undefined ? { jobDescription: input.jobDescription } : {}),
      ...(input.context !== undefined ? { context: input.context ?? null } : {}),
      ...(input.targetPages !== undefined ? { targetPages: input.targetPages } : {}),
      ...(input.format !== undefined ? { format: input.format ?? null } : {}),
      updatedAt: Date.now(),
    };
    db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
    return reply.code(200).send(row);
  });

  app.delete<{ Params: { id: string } }>("/api/applications/:id", async (request, reply) => {
    db.delete(applications).where(eq(applications.id, request.params.id)).run();
    return reply.code(200).send({ ok: true });
  });

  // ── application-scoped tailor (§27) — purely additive alongside the
  // stateless /api/tailor; persists the result on the application record
  // instead of returning it bare ──
  app.post<{ Params: { id: string } }>("/api/applications/:id/tailor", async (request, reply) => {
    const existing = db
      .select()
      .from(applications)
      .where(eq(applications.id, request.params.id))
      .get();
    if (!existing) {
      return reply.code(404).send({ error: "not_found" });
    }

    const config: Config = { ...loadConfig(), ...deps?.config };
    const engine = resolveEngine(db, config, deps);
    if ("error" in engine) {
      return reply.code(400).send({ error: engine.error });
    }

    try {
      const jdEntries = db.select().from(entries).all().map(rowToEntry);
      const settingsRow = db.select().from(settings).where(eq(settings.id, 1)).get()!;
      const profileRow = db.select().from(profile).where(eq(profile.id, 1)).get();

      // §28.5 — derive a content budget from paper/targetPages/effective
      // format and ride it on the user message, same transport as context.
      const effectiveFormat = existing.format ?? settingsRow.defaultFormat;
      const budget = deriveContentBudget({
        paper: settingsRow.paper,
        targetPages: existing.targetPages,
        format: effectiveFormat,
      });

      const resume = await tailor(
        engine,
        existing.jobDescription,
        jdEntries,
        settingsRow.layout,
        profileRow?.baseSummary,
        existing.context,
        budget,
      );

      const row = {
        ...existing,
        current: resume,
        genState: "tailored" as const,
        currentMeta: {
          at: Date.now(),
          provider: settingsRow.provider as ProviderId,
          model: settingsRow.model,
        },
        updatedAt: Date.now(),
      };
      db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
      return reply.code(200).send(row);
    } catch (err) {
      db.update(applications)
        .set({ genState: "failed", updatedAt: Date.now() })
        .where(eq(applications.id, existing.id))
        .run();

      const { status, body } = mapTailorError(err);
      if (status >= 500) app.log.error(err);
      return reply.code(status).send(body);
    }
  });

  // ── lock/unlock (§27 integrity invariant) — `locked` is a deep copy of
  // `current`'s content at lock time, never a reference to it or to the
  // Library entries it was built from, so editing/deleting an entry (or a
  // later re-tailor) can never retroactively change a locked snapshot.
  // `lockedFormat` freezes the same way: the fit ladder is a later epic, so
  // resolvedDensity is 'as-set' = 'comfortable' until then (§28.3) ──
  app.post<{ Params: { id: string } }>("/api/applications/:id/lock", async (request, reply) => {
    const existing = db
      .select()
      .from(applications)
      .where(eq(applications.id, request.params.id))
      .get();
    if (!existing) {
      return reply.code(404).send({ error: "not_found" });
    }
    if (existing.current === null) {
      return reply.code(400).send({ error: "no_current" });
    }

    const settingsRow = db.select().from(settings).where(eq(settings.id, 1)).get()!;
    const lockedFormat = structuredClone({
      format: existing.format ?? settingsRow.defaultFormat,
      resolvedDensity: "comfortable" as const,
      paper: settingsRow.paper,
    });

    const row = {
      ...existing,
      locked: structuredClone(existing.current),
      lockedFormat,
      updatedAt: Date.now(),
    };
    db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
    return reply.code(200).send(row);
  });

  app.delete<{ Params: { id: string } }>("/api/applications/:id/lock", async (request, reply) => {
    const existing = db
      .select()
      .from(applications)
      .where(eq(applications.id, request.params.id))
      .get();
    if (!existing) {
      return reply.code(404).send({ error: "not_found" });
    }

    const row = { ...existing, locked: null, lockedFormat: null, updatedAt: Date.now() };
    db.update(applications).set(row).where(eq(applications.id, existing.id)).run();
    return reply.code(200).send(row);
  });
}
