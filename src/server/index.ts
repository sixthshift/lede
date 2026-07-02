import Fastify from "fastify";

const port = Number(process.env.PORT ?? 8787);

const app = Fastify({ logger: true });

app.get("/api/health", async () => ({ ok: true }));

// TODO(later ticket): in production, serve the built SPA from dist/ as static files.

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
