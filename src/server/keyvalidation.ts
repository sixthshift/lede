// BYOK key validation — spec.md §8. One cheap live call proves the key works
// BEFORE it is ever persisted; resolves on success, throws on any failure
// (bad key, network error, etc). Injectable behind settingsRoutes so the
// PUT /api/settings/key route stays keyless-testable (see routes/settings.ts).
import { generateText } from "ai";

import type { ProviderId } from "@shared/types";
import { resolveModel } from "@shared/providers";

export type ValidateProviderKeyInput = {
  provider: ProviderId;
  model: string;
  apiKey: string;
  baseUrl?: string | null;
};

export type ProviderKeyValidator = (input: ValidateProviderKeyInput) => Promise<void>;

export const validateProviderKey: ProviderKeyValidator = async ({ provider, model, apiKey, baseUrl }) => {
  const resolved = resolveModel({ provider, model, apiKey, baseURL: baseUrl ?? undefined });
  await generateText({ model: resolved, prompt: "ping", maxOutputTokens: 1 });
};
