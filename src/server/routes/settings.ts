// /api/settings — non-secret prefs, spec.md §9/§4.2. `keySet` is derived from
// the isolated `secrets` table; the key itself is never read here or returned.
// PUT/DELETE /api/settings/key handle the BYOK provider key itself (§8):
// validate-before-store, ciphertext-only, never logged/returned. POST
// /api/settings/test-connection is the keyless counterpart for provider
// claude-cli — one real round trip through the local binary, no key involved.
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { settingsInput, documentFormatZ } from "@shared/schema";
import { resolveStoredFormat } from "@shared/format-v2";
import type { Db } from "../db";
import { settings, secrets } from "../db/schema";
import { encrypt } from "../crypto";
import { loadConfig } from "../config";
import { validateProviderKey, type ProviderKeyValidator } from "../keyvalidation";
import {
  CLAUDE_CLI_ERRORS,
  ClaudeCliError,
  probeClaudeCli,
  type ClaudeCliProbe,
} from "../tailor/claude-cli";
import type { ProviderId } from "@shared/types";

const keyInput = z.object({ apiKey: z.string().min(1).max(2000) });

// settingsInput (@shared/schema) doesn't own DocumentFormat — extended here
// with the bounded documentFormatZ validator, same as application.format (§28.3).
const settingsInputWithFormat = settingsInput.extend({ defaultFormat: documentFormatZ.optional() });

function currentSettings(db: Db) {
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  const secretsRow = db.select().from(secrets).where(eq(secrets.id, 1)).get();
  return {
    keySet: (secretsRow?.apiKeyEnc ?? null) !== null,
    provider: row.provider,
    model: row.model,
    baseUrl: row.baseUrl,
    layout: row.layout,
    paper: row.paper,
    defaultFormat: resolveStoredFormat(row.defaultFormat),
    presets: row.presets ?? [],
  };
}

export function settingsRoutes(
  app: FastifyInstance,
  db: Db,
  validate: ProviderKeyValidator = validateProviderKey,
  probe: ClaudeCliProbe = probeClaudeCli,
): void {
  app.get("/api/settings", async () => currentSettings(db));

  app.put("/api/settings", async (request, reply) => {
    const parsed = settingsInputWithFormat.safeParse(request.body);
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

    const { provider, model, baseUrl } = db
      .select()
      .from(settings)
      .where(eq(settings.id, 1))
      .get()!;
    try {
      await validate({
        provider: provider as ProviderId,
        model,
        apiKey: parsed.data.apiKey,
        baseUrl,
      });
    } catch {
      return reply.code(400).send({ error: "key_invalid" });
    }

    const masterKey = loadConfig().masterKey;
    db.update(secrets)
      .set({
        apiKeyEnc: encrypt(parsed.data.apiKey, masterKey),
        apiKeyValidatedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .where(eq(secrets.id, 1))
      .run();

    return reply.code(200).send({ keySet: true });
  });

  // POST /api/settings/test-connection — readiness for the one provider whose
  // readiness is not a stored key: claude-cli. It spends a real round trip
  // through the local binary (ClaudeCliEngine.probe) because that is the only
  // observation that separates "installed" from "logged in" — the failure an
  // existence check cannot see.
  //
  // Keyless like the tailor path it reports on: the secrets table is not read
  // here. `detail` carries the child's own bounded, already-redacted words, the
  // one part of a CLI failure an operator can act on; the error strings are the
  // tailor route's verbatim, so a code means the same thing on both.
  app.post("/api/settings/test-connection", async (_request, reply) => {
    const { provider, model } = db.select().from(settings).where(eq(settings.id, 1)).get()!;
    // Rejected before anything is spawned: a BYOK provider's readiness IS its
    // key's validity, which PUT /api/settings/key already answers.
    if (provider !== "claude-cli") {
      return reply.code(400).send({ error: "provider_not_testable" });
    }

    try {
      await probe(model);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      if (!(err instanceof ClaudeCliError)) throw err;
      return reply.code(502).send({ error: CLAUDE_CLI_ERRORS[err.code], detail: err.detail });
    }
  });

  app.delete("/api/settings/key", async (_request, reply) => {
    db.update(secrets)
      .set({ apiKeyEnc: null, apiKeyValidatedAt: null, updatedAt: Date.now() })
      .where(eq(secrets.id, 1))
      .run();

    return reply.code(200).send({ keySet: false });
  });
}
