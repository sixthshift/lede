// /api/settings — non-secret prefs, spec.md §9/§4.2. `keySet` is derived from
// the isolated `secrets` table; the key itself is never read here or returned.
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";

import { settingsInput } from "@shared/schema";
import type { Db } from "../db";
import { settings, secrets } from "../db/schema";

function currentSettings(db: Db) {
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  const secretsRow = db.select().from(secrets).where(eq(secrets.id, 1)).get();
  return {
    keySet: (secretsRow?.apiKeyEnc ?? null) !== null,
    provider: row.provider,
    model: row.model,
    baseUrl: row.baseUrl,
    layout: row.layout,
  };
}

export function settingsRoutes(app: FastifyInstance, db: Db): void {
  app.get("/api/settings", async () => currentSettings(db));

  app.put("/api/settings", async (request, reply) => {
    const parsed = settingsInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    db.update(settings)
      .set({ ...parsed.data, updatedAt: Date.now() })
      .where(eq(settings.id, 1))
      .run();

    return reply.code(200).send(currentSettings(db));
  });
}
