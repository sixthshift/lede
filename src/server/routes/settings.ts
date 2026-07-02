// /api/settings — non-secret prefs, spec.md §9/§4.2. `keySet` is derived from
// the isolated `secrets` table; the key itself is never read here or returned.
// PUT/DELETE /api/settings/key handle the BYOK provider key itself (§8):
// validate-before-store, ciphertext-only, never logged/returned.
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { settingsInput } from "@shared/schema";
import type { Db } from "../db";
import { settings, secrets } from "../db/schema";
import { encrypt } from "../crypto";
import { loadConfig } from "../config";
import { validateProviderKey, type ProviderKeyValidator } from "../keyvalidation";
import type { ProviderId } from "@shared/types";

const keyInput = z.object({ apiKey: z.string().min(1).max(2000) });

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

export function settingsRoutes(app: FastifyInstance, db: Db, validate: ProviderKeyValidator = validateProviderKey): void {
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

  app.put("/api/settings/key", async (request, reply) => {
    const parsed = keyInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }

    const { provider, model, baseUrl } = db.select().from(settings).where(eq(settings.id, 1)).get()!;
    try {
      await validate({ provider: provider as ProviderId, model, apiKey: parsed.data.apiKey, baseUrl });
    } catch {
      return reply.code(400).send({ error: "key_invalid" });
    }

    const masterKey = loadConfig().masterKey;
    db.update(secrets)
      .set({ apiKeyEnc: encrypt(parsed.data.apiKey, masterKey), apiKeyValidatedAt: Date.now(), updatedAt: Date.now() })
      .where(eq(secrets.id, 1))
      .run();

    return reply.code(200).send({ keySet: true });
  });

  app.delete("/api/settings/key", async (_request, reply) => {
    db.update(secrets)
      .set({ apiKeyEnc: null, apiKeyValidatedAt: null, updatedAt: Date.now() })
      .where(eq(secrets.id, 1))
      .run();

    return reply.code(200).send({ keySet: false });
  });
}
