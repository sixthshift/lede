// Session guard (spec.md §7) — single-user password gate, NOT accounts.
// Every /api/* route requires a valid session EXCEPT /api/auth/* and
// /api/health. When config.authDisabled is true (LEDE_AUTH_DISABLED escape
// hatch) the guard is a no-op — used by the keyless test suite.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const PUBLIC_PREFIXES = ["/api/auth/", "/api/health"];

function isPublic(url: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => url === prefix || url.startsWith(prefix));
}

export function registerAuthGuard(app: FastifyInstance, authDisabled: boolean): void {
  if (authDisabled) return;

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.startsWith("/api/")) return;
    if (isPublic(request.url)) return;
    if (request.session.get("authed") !== true) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });
}
