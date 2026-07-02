import Fastify, { type FastifyInstance } from "fastify";
import secureSession from "@fastify/secure-session";
import { APICallError, NoObjectGeneratedError } from "ai";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Entry, Section } from "@shared/types";
import { loadConfig, type Config } from "./config";
import { initDb, type Db } from "./db";
import { entries, settings } from "./db/schema";
import { seedIfEmpty } from "./seed";
import { makeEngine, tailor, NoFixtureError, type TailorEngine } from "./tailor/engine";
import { FabricationError } from "./tailor/validate";
import { registerAuthGuard } from "./auth";
import { authRoutes } from "./routes/auth";
import { entriesRoutes } from "./routes/entries";
import { profileRoutes } from "./routes/profile";
import { settingsRoutes } from "./routes/settings";

const tailorBodyZ = z.object({
  jobDescription: z.string().min(1).max(20000),
});

// Row -> domain Entry: drops the storage-only createdAt/updatedAt and omits
// `framings` entirely when unset (rather than `null`). Key order matches the
// SEED_ENTRIES literals exactly (id, section, sortKey, meta, facts, tags,
// framings?) so JSON.stringify-based hashKey() matching (engine.ts,
// evalcore.ts) against recorded fixtures is unaffected by the db round-trip.
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

// Maps a tailor() failure to its distinct HTTP status (spec.md §9).
function mapTailorError(err: unknown): { status: number; body: { error: string } } {
  if (err instanceof NoFixtureError) return { status: 422, body: { error: "no_fixture" } };
  if (err instanceof FabricationError) return { status: 502, body: { error: "fabrication" } };

  if (APICallError.isInstance(err)) {
    if (err.statusCode === 401 || err.statusCode === 403) return { status: 401, body: { error: "key_invalid" } };
    if (err.statusCode === 429) return { status: 429, body: { error: "rate_limited" } };
    return { status: 502, body: { error: "provider_error" } };
  }

  if (NoObjectGeneratedError.isInstance(err)) return { status: 502, body: { error: "model_off_contract" } };

  return { status: 502, body: { error: "provider_error" } };
}

// Accepts an injected db (tests, or the entrypoint below); otherwise opens/
// migrates one from config.dataDir and seeds it on first boot (empty entries
// table) so buildApp() stays a one-call boot. An injected db is assumed
// already initialized/seeded by its caller (see seedIfEmpty in ./seed).
// configOverride merges onto loadConfig() (e.g. tests forcing authDisabled:
// false even though the global test env sets LEDE_AUTH_DISABLED=true).
export function buildApp(db?: Db, configOverride?: Partial<Config>): FastifyInstance {
  const app = Fastify({ logger: true });
  const config: Config = { ...loadConfig(), ...configOverride };
  const engine: TailorEngine = makeEngine();
  let resolvedDb: Db;
  if (db) {
    resolvedDb = db;
  } else {
    resolvedDb = initDb(config.dataDir).db;
    seedIfEmpty(resolvedDb);
  }

  // salt is the library's own published default (see @fastify/secure-session's
  // source) — passing it explicitly satisfies the plugin's type (which
  // requires salt alongside secret) while reproducing its no-salt behavior;
  // security comes from config.sessionSecret, not this constant.
  app.register(secureSession, {
    secret: config.sessionSecret,
    salt: Buffer.from("mq9hDxBVDbspDR6nLfFT1g==", "base64"),
  });

  app.get("/api/health", async () => ({ ok: true }));

  authRoutes(app, resolvedDb);
  registerAuthGuard(app, config.authDisabled);

  entriesRoutes(app, resolvedDb);
  profileRoutes(app, resolvedDb);
  settingsRoutes(app, resolvedDb);

  app.post("/api/tailor", async (request, reply) => {
    const parsed = tailorBodyZ.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    try {
      const jdEntries = resolvedDb.select().from(entries).all().map(rowToEntry);
      const layout = resolvedDb.select().from(settings).where(eq(settings.id, 1)).get()!.layout;
      const resume = await tailor(engine, parsed.data.jobDescription, jdEntries, layout);
      return reply.code(200).send(resume);
    } catch (err) {
      const { status, body } = mapTailorError(err);
      if (status >= 500) app.log.error(err);
      return reply.code(status).send(body);
    }
  });

  return app;
}

// TODO(later ticket): in production, serve the built SPA from dist/ as static files.

const isEntrypoint = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  const config = loadConfig();
  const { db } = initDb(config.dataDir);
  seedIfEmpty(db);
  const app = buildApp(db);
  app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
