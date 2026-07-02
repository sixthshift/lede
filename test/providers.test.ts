import { describe, expect, it, afterEach } from 'vitest';
import { PROVIDERS, resolveModel, providerOptionsFor } from '@shared/providers';
import type { ProviderId } from '@shared/types';

const ALL_PROVIDERS: ProviderId[] = ['anthropic', 'openai', 'google', 'openai-compatible'];

describe('PROVIDERS registry', () => {
  it('has an entry for every ProviderId with a curated model list and default', () => {
    for (const id of ALL_PROVIDERS) {
      const info = PROVIDERS[id];
      expect(info).toBeDefined();
      expect(typeof info.label).toBe('string');
      expect(Array.isArray(info.models)).toBe(true);
      expect(typeof info.default).toBe('string');
    }
  });

  it('defaults anthropic to claude-opus-4-8', () => {
    expect(PROVIDERS.anthropic.default).toBe('claude-opus-4-8');
  });

  it('includes the phase-0 bootstrap model gemini-2.5-flash for google', () => {
    expect(PROVIDERS.google.models).toContain('gemini-2.5-flash');
  });
});

describe('resolveModel — dispatch correctness', () => {
  const cases: { provider: ProviderId; model: string; extra?: Record<string, string> }[] = [
    { provider: 'anthropic', model: 'claude-opus-4-8' },
    { provider: 'openai', model: 'gpt-5' },
    { provider: 'google', model: 'gemini-2.5-flash' },
    { provider: 'openai-compatible', model: 'llama3', extra: { baseURL: 'http://localhost:11434/v1' } },
  ];

  it.each(cases)('builds a model for $provider matching the requested provider+model', ({ provider, model, extra }) => {
    const result = resolveModel({ provider, model, apiKey: 'dummy-key', ...extra });
    expect(result).toBeDefined();
    expect(typeof result).not.toBe('string'); // a resolved LanguageModel object, not a bare model-id string
    const m = result as { provider: string; modelId: string };
    expect(m.modelId).toBe(model);
    // provider string must reflect the requested provider (e.g. "anthropic.messages", "openai.chat", "google.generative-ai")
    const expectedFragment = provider === 'openai-compatible' ? 'openai-compatible' : provider;
    expect(m.provider).toContain(expectedFragment);
  });

  it('does not confuse openai-compatible with plain openai', () => {
    const openai = resolveModel({ provider: 'openai', model: 'gpt-5', apiKey: 'dummy-key' }) as { provider: string };
    const compat = resolveModel({
      provider: 'openai-compatible',
      model: 'llama3',
      apiKey: 'dummy-key',
      baseURL: 'http://localhost:11434/v1',
    }) as { provider: string };
    expect(openai.provider).not.toBe(compat.provider);
  });
});

// The AI SDK builds the auth header lazily (a closure invoked only at request time — never during
// model construction), which is exactly what keeps resolveModel keyless-testable. Calling that closure
// here reads back the credential the factory was actually given, without making a network call.
type ConfiguredModel = { config: { headers: () => Record<string, string | undefined> } };

describe('resolveModel — apiKey forwarding', () => {
  afterEach(() => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });

  it('forwards the passed apiKey into the anthropic auth header (not dropped)', () => {
    const model = resolveModel({ provider: 'anthropic', model: 'claude-opus-4-8', apiKey: 'sk-ant-dummy' }) as unknown as ConfiguredModel;
    expect(model.config.headers()['x-api-key']).toBe('sk-ant-dummy');
  });

  it('forwards the passed apiKey into the openai auth header (not dropped)', () => {
    const model = resolveModel({ provider: 'openai', model: 'gpt-5', apiKey: 'sk-oa-dummy' }) as unknown as ConfiguredModel;
    expect(model.config.headers().authorization).toBe('Bearer sk-oa-dummy');
  });

  it('forwards the passed apiKey into the google auth header (not dropped)', () => {
    const model = resolveModel({ provider: 'google', model: 'gemini-2.5-flash', apiKey: 'sk-goog-dummy' }) as unknown as ConfiguredModel;
    expect(model.config.headers()['x-goog-api-key']).toBe('sk-goog-dummy');
  });

  it('resolves google when only GOOGLE_GENERATIVE_AI_API_KEY env is set (no apiKey passed)', () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'env-only-dummy-key';
    const model = resolveModel({ provider: 'google', model: 'gemini-2.5-flash' }) as unknown as ConfiguredModel & {
      provider: string;
      modelId: string;
    };
    expect(model.modelId).toBe('gemini-2.5-flash');
    expect(model.provider).toContain('google');
    expect(model.config.headers()['x-goog-api-key']).toBe('env-only-dummy-key');
  });
});

describe('providerOptionsFor', () => {
  it('anthropic includes cache-control and thinking/effort keys', () => {
    const opts = providerOptionsFor('anthropic');
    expect(opts.anthropic).toBeDefined();
    const anthropicOpts = opts.anthropic as Record<string, unknown>;
    expect(anthropicOpts.cacheControl).toBeDefined();
    expect(anthropicOpts.thinking).toBeDefined();
  });

  it('returns a defined sane-default object for the other providers', () => {
    for (const id of ['openai', 'google', 'openai-compatible'] as ProviderId[]) {
      const opts = providerOptionsFor(id);
      expect(opts).toBeDefined();
      expect(typeof opts).toBe('object');
    }
  });
});
