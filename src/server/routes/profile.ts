// /api/profile — singleton identity record, spec.md §9/§4.2.
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";

import { profileInput } from "@shared/schema";
import type { Db } from "../db";
import { profile } from "../db/schema";

export function profileRoutes(app: FastifyInstance, db: Db): void {
  app.get("/api/profile", async () => {
    const { id: _id, updatedAt: _updatedAt, ...rest } = db.select().from(profile).where(eq(profile.id, 1)).get()!;
    return rest;
  });

  app.put("/api/profile", async (request, reply) => {
    const parsed = profileInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    const input = parsed.data;
    db.update(profile)
      .set({ ...input, updatedAt: Date.now() })
      .where(eq(profile.id, 1))
      .run();

    const { id: _id, updatedAt: _updatedAt, ...rest } = db.select().from(profile).where(eq(profile.id, 1)).get()!;
    return reply.code(200).send(rest);
  });
}
