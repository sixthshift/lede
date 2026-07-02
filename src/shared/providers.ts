// AI SDK provider registry — spec.md §6.1.
// PROVIDERS is UI-facing metadata; resolveModel builds a LanguageModel without a network call
// (the create* factories are pure constructors), so this is keyless-testable.

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type { ProviderId } from '@shared/types';

export type ProviderInfo = { label: string; models: string[]; default: string };

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    label: 'Anthropic',
    models: ['claude-opus-4-8', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
    default: 'claude-opus-4-8',
  },
  openai: {
    label: 'OpenAI',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4o'],
    default: 'gpt-5',
  },
  google: {
    label: 'Google',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    default: 'gemini-2.5-flash',
  },
  'openai-compatible': {
    label: 'OpenAI-compatible',
    models: [],
    default: '',
  },
};

// apiKey is optional so callers may rely on each provider SDK's own env-var fallback
// (e.g. GOOGLE_GENERATIVE_AI_API_KEY) — used by the Phase-0 dev bootstrap.
export type ResolveModelConfig = { provider: ProviderId; model: string; apiKey?: string; baseURL?: string };

export function resolveModel({ provider, model, apiKey, baseURL }: ResolveModelConfig): LanguageModel {
  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey })(model);
    case 'openai':
      return createOpenAI({ apiKey })(model);
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(model);
    case 'openai-compatible':
      return createOpenAI({ apiKey, baseURL, name: 'openai-compatible' })(model);
  }
}

export function providerOptionsFor(provider: ProviderId): Record<string, unknown> {
  if (provider === 'anthropic') {
    return {
      anthropic: {
        cacheControl: { type: 'ephemeral' },
        thinking: { type: 'enabled', budgetTokens: 2000 },
      },
    };
  }
  return {};
}
