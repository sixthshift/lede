// /api/auth — single-user password gate, spec.md §7/§8. First-run setup
// stores a scrypt {hash,salt} in the isolated secrets table; login verifies
// against it and marks the session; logout clears it. Never accounts.
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Db } from "../db";
import { secrets } from "../db/schema";
import { hashPassword, verifyPassword } from "../crypto";

declare module "@fastify/secure-session" {
  interface SessionData {
    authed: boolean;
  }
}

const authBodyZ = z.object({
  password: z.string().min(1),
});

export function authRoutes(app: FastifyInstance, db: Db): void {
  app.post("/api/auth/setup", async (request, reply) => {
    const parsed = authBodyZ.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    const row = db.select().from(secrets).where(eq(secrets.id, 1)).get();
    if (row?.auth) {
      return reply.code(409).send({ error: "already_configured" });
    }

    const auth = hashPassword(parsed.data.password);
    db.update(secrets).set({ auth, updatedAt: Date.now() }).where(eq(secrets.id, 1)).run();

    return reply.code(200).send({ ok: true });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = authBodyZ.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    const row = db.select().from(secrets).where(eq(secrets.id, 1)).get();
    if (!row?.auth || !verifyPassword(parsed.data.password, row.auth)) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    request.session.set("authed", true);
    return reply.code(200).send({ ok: true });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    request.session.delete();
    return reply.code(200).send({ ok: true });
  });
}
