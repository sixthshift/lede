// The claude-cli registry entry and the resolveModel guard that keeps it off the AI SDK path.
// Kept in its own file so test/providers.test.ts (whose ALL_PROVIDERS list predates this member)
// stays untouched.

import { describe, expect, it } from "vitest";
import { PROVIDERS, providerOptionsFor, resolveModel } from "@shared/providers";
import type { ProviderId } from "@shared/types";

describe("PROVIDERS claude-cli entry", () => {
  it("is registered with the CLI label", () => {
    expect(PROVIDERS["claude-cli"]).toBeDefined();
    expect(PROVIDERS["claude-cli"].label).toBe("Claude Code (CLI)");
  });

  it("offers exactly the three CLI aliases, not API model ids", () => {
    expect(PROVIDERS["claude-cli"].models).toEqual(["opus", "sonnet", "haiku"]);
  });

  it("defaults to sonnet", () => {
    expect(PROVIDERS["claude-cli"].default).toBe("sonnet");
  });
});

describe("resolveModel — claude-cli is guarded, other providers unaffected", () => {
  it("throws for claude-cli because the CLI path never goes through the AI SDK", () => {
    expect(() => resolveModel({ provider: "claude-cli", model: "sonnet", apiKey: "x" })).toThrow(
      /claude-cli/,
    );
  });

  it("still builds a LanguageModel for anthropic with a matching modelId", () => {
    const model = resolveModel({
      provider: "anthropic",
      model: "claude-opus-4-8",
      apiKey: "x",
    }) as { provider: string; modelId: string };
    expect(model.modelId).toBe("claude-opus-4-8");
    expect(model.provider).toContain("anthropic");
  });
});

describe("claude-cli as a ProviderId", () => {
  it("typechecks and flows through provider-keyed helpers", () => {
    const id: ProviderId = "claude-cli";
    expect(Object.keys(PROVIDERS)).toContain(id);
    // non-anthropic providers get the empty option bag; the CLI member is no exception
    expect(providerOptionsFor(id)).toEqual({});
  });
});
