import Fastify, { type FastifyInstance } from "fastify";
import secureSession from "@fastify/secure-session";
import fastifyStatic from "@fastify/static";
import { APICallError, NoObjectGeneratedError } from "ai";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Entry, ProviderId, Section } from "@shared/types";
import { loadConfig, type Config } from "./config";
import { initDb, type Db } from "./db";
import { entries, secrets, settings } from "./db/schema";
import { seedIfEmpty } from "./seed";
import { FixtureEngine, ProviderEngine, tailor, NoFixtureError, type TailorEngine } from "./tailor/engine";
import { FabricationError } from "./tailor/validate";
import { decrypt } from "./crypto";
import { registerAuthGuard } from "./auth";
import { authRoutes } from "./routes/auth";
import { entriesRoutes } from "./routes/entries";
import { profileRoutes } from "./routes/profile";
import { settingsRoutes } from "./routes/settings";

const tailorBodyZ = z.object({
  jobDescription: z.string().min(1).max(20000),
});

// Vite's build output (§19) — resolved relative to this file so it's correct
// regardless of process.cwd(). No config field for this: it's a fixed build
// artifact location, not an operator-tunable setting.
const DEFAULT_DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");

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
// distDir overrides where the built SPA is served from (default: the real
// build output next to this file) — tests use it to point at a throwaway
// fixture directory instead of colliding on the repo's own dist/.
export function buildApp(db?: Db, configOverride?: Partial<Config>, distDir: string = DEFAULT_DIST_DIR): FastifyInstance {
  const app = Fastify({ logger: true });
  const config: Config = { ...loadConfig(), ...configOverride };
  // FIXTURE mode (tests/CI/demo) resolves once at boot, keyless. LIVE mode
  // has no fixed engine: each request builds a ProviderEngine from the
  // decrypted BYOK key (never a boot-time constant — see the route below).
  const fixtureEngine: TailorEngine | undefined = config.tailorEngine === "fixture" ? new FixtureEngine() : undefined;
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

    let requestEngine: TailorEngine;
    if (fixtureEngine) {
      requestEngine = fixtureEngine;
    } else {
      const secretsRow = resolvedDb.select().from(secrets).where(eq(secrets.id, 1)).get();
      if (!secretsRow?.apiKeyEnc) {
        return reply.code(400).send({ error: "no_api_key" });
      }
      const settingsRow = resolvedDb.select().from(settings).where(eq(settings.id, 1)).get()!;
      // Decrypted in memory for this request only — never persisted, logged, or returned.
      const apiKey = decrypt(secretsRow.apiKeyEnc, config.masterKey);
      requestEngine = new ProviderEngine({
        provider: settingsRow.provider as ProviderId,
        model: settingsRow.model,
        apiKey,
        baseURL: settingsRow.baseUrl ?? undefined,
      });
    }

    try {
      const jdEntries = resolvedDb.select().from(entries).all().map(rowToEntry);
      const layout = resolvedDb.select().from(settings).where(eq(settings.id, 1)).get()!.layout;
      const resume = await tailor(requestEngine, parsed.data.jobDescription, jdEntries, layout);
      return reply.code(200).send(resume);
    } catch (err) {
      const { status, body } = mapTailorError(err);
      if (status >= 500) app.log.error(err);
      return reply.code(status).send(body);
    }
  });

  // Serve the built SPA (§19) — skipped entirely when dist/ hasn't been built
  // (keyless test/CI/demo boot never runs `vite build`), so absence is a
  // no-op rather than a boot failure. /api/* is registered above as exact
  // routes, which find-my-way matches before this wildcard static handler,
  // so it's never shadowed; the notFoundHandler below re-splits the same way
  // for paths (like unknown /api/* routes) that fall through as 404s.
  if (existsSync(distDir)) {
    app.register(fastifyStatic, { root: distDir });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith("/api/")) {
        return reply.code(404).send({ error: "not_found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

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
