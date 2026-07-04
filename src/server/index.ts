import Fastify, { type FastifyInstance } from "fastify";
import secureSession from "@fastify/secure-session";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig, type Config } from "./config";
import { initDb, type Db } from "./db";
import { seedIfEmpty } from "./seed";
import { registerAuthGuard } from "./auth";
import { authRoutes } from "./routes/auth";
import { applicationsRoutes } from "./routes/applications";
import { backupRoutes } from "./routes/backup";
import { entriesRoutes } from "./routes/entries";
import { profileRoutes } from "./routes/profile";
import { settingsRoutes } from "./routes/settings";

// Vite's build output (§19) — resolved relative to this file so it's correct
// regardless of process.cwd(). No config field for this: it's a fixed build
// artifact location, not an operator-tunable setting.
const DEFAULT_DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");

// Accepts an injected db (tests, or the entrypoint below); otherwise opens/
// migrates one from config.dataDir and seeds it on first boot (empty entries
// table) so buildApp() stays a one-call boot. An injected db is assumed
// already initialized/seeded by its caller (see seedIfEmpty in ./seed).
// configOverride merges onto loadConfig() (e.g. tests forcing authDisabled:
// false even though the global test env sets LEDE_AUTH_DISABLED=true).
// distDir overrides where the built SPA is served from (default: the real
// build output next to this file) — tests use it to point at a throwaway
// fixture directory instead of colliding on the repo's own dist/.
export function buildApp(
  db?: Db,
  configOverride?: Partial<Config>,
  distDir: string = DEFAULT_DIST_DIR,
): FastifyInstance {
  const app = Fastify({ logger: true });
  const config: Config = { ...loadConfig(), ...configOverride };
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
    cookie: { path: "/" },
  });

  app.get("/api/health", async () => ({ ok: true }));

  authRoutes(app, resolvedDb);
  registerAuthGuard(app, config.authDisabled);

  entriesRoutes(app, resolvedDb);
  profileRoutes(app, resolvedDb);
  settingsRoutes(app, resolvedDb);
  applicationsRoutes(app, resolvedDb);
  backupRoutes(app, resolvedDb);

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

const isEntrypoint =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

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
