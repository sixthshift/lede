import Fastify, { type FastifyInstance } from "fastify";
import { APICallError, NoObjectGeneratedError } from "ai";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import type { Layout } from "@shared/types";
import { SECTION_VALUES } from "@shared/sections";
import { loadConfig } from "./config";
import { initDb } from "./db";
import { SEED_ENTRIES } from "./seed";
import { makeEngine, tailor, NoFixtureError, type TailorEngine } from "./tailor/engine";
import { FabricationError } from "./tailor/validate";

// Phase 0: every §4.2 section enabled, standard order — no layout persistence yet.
const defaultLayout: Layout = [
  { section: "summary", enabled: true },
  ...SECTION_VALUES.map((section) => ({ section, enabled: true })),
];

const tailorBodyZ = z.object({
  jobDescription: z.string().min(1).max(20000),
});

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

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });
  const engine: TailorEngine = makeEngine();

  app.get("/api/health", async () => ({ ok: true }));

  app.post("/api/tailor", async (request, reply) => {
    const parsed = tailorBodyZ.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    try {
      const resume = await tailor(engine, parsed.data.jobDescription, SEED_ENTRIES, defaultLayout);
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
  initDb(config.dataDir);
  const app = buildApp();
  app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
