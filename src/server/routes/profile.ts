// /api/profile — singleton identity record, spec.md §9/§4.2.
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { profileInput } from "@shared/schema";
import type { Db } from "../db";
import { profile } from "../db/schema";

// profileInput (@shared/schema) doesn't own photoUrl — extended here; the
// asset itself is identity, display (shown/size/shape) lives on DocumentFormat.photo (§28.3).
const profileInputWithPhoto = profileInput.extend({
  photoUrl: z.string().min(1).max(2000).nullish(),
});

export function profileRoutes(app: FastifyInstance, db: Db): void {
  app.get("/api/profile", async () => {
    const {
      id: _id,
      updatedAt: _updatedAt,
      ...rest
    } = db.select().from(profile).where(eq(profile.id, 1)).get()!;
    return rest;
  });

  app.put("/api/profile", async (request, reply) => {
    const parsed = profileInputWithPhoto.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    const input = parsed.data;
    db.update(profile)
      .set({ ...input, updatedAt: Date.now() })
      .where(eq(profile.id, 1))
      .run();

    const {
      id: _id,
      updatedAt: _updatedAt,
      ...rest
    } = db.select().from(profile).where(eq(profile.id, 1)).get()!;
    return reply.code(200).send(rest);
  });

  // ── delete a voice source (§ voice-source epic) — the flag route (T42,
  // routes/applications.ts) is the ONLY door IN; this is the door OUT. A
  // missing id is a 404 (mirrors applications.ts's not_found idiom) rather
  // than a silent no-op 200, so a client can distinguish "already gone" from
  // "deleted just now". ──
  app.delete<{ Params: { vid: string } }>(
    "/api/profile/voice-sources/:vid",
    async (request, reply) => {
      const row = db.select().from(profile).where(eq(profile.id, 1)).get()!;
      const index = row.voiceSources.findIndex((source) => source.id === request.params.vid);
      if (index === -1) {
        return reply.code(404).send({ error: "not_found" });
      }

      const voiceSources = row.voiceSources.filter((_, i) => i !== index);
      db.update(profile)
        .set({ voiceSources, updatedAt: Date.now() })
        .where(eq(profile.id, 1))
        .run();

      const {
        id: _id,
        updatedAt: _updatedAt,
        ...rest
      } = db.select().from(profile).where(eq(profile.id, 1)).get()!;
      return reply.code(200).send(rest);
    },
  );
}
