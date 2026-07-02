import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { loadConfig } from "../src/server/config";

const VALID_MASTER_KEY = randomBytes(32).toString("base64");
const VALID_SESSION_SECRET = "a-valid-session-secret-at-least-32-chars";

function baseEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    LEDE_MASTER_KEY: VALID_MASTER_KEY,
    LEDE_SESSION_SECRET: VALID_SESSION_SECRET,
    ...overrides,
  };
}

describe("loadConfig — operator secrets fail-fast", () => {
  it("loads successfully with a valid master key + session secret", () => {
    const config = loadConfig(baseEnv());
    expect(config.masterKey).toBeInstanceOf(Buffer);
    expect(config.masterKey.length).toBe(32);
    expect(config.sessionSecret).toBe(VALID_SESSION_SECRET);
    expect(config.authDisabled).toBe(false);
  });

  it("throws when LEDE_MASTER_KEY is unset", () => {
    const env = baseEnv();
    delete env.LEDE_MASTER_KEY;
    expect(() => loadConfig(env)).toThrow(/LEDE_MASTER_KEY/);
  });

  it("throws when LEDE_MASTER_KEY is malformed (base64 not decoding to 32 bytes)", () => {
    const env = baseEnv({ LEDE_MASTER_KEY: Buffer.from("too short").toString("base64") });
    expect(() => loadConfig(env)).toThrow(/LEDE_MASTER_KEY/);
  });

  it("throws when LEDE_SESSION_SECRET is unset", () => {
    const env = baseEnv();
    delete env.LEDE_SESSION_SECRET;
    expect(() => loadConfig(env)).toThrow(/LEDE_SESSION_SECRET/);
  });

  it("throws when LEDE_SESSION_SECRET is too short", () => {
    const env = baseEnv({ LEDE_SESSION_SECRET: "too-short" });
    expect(() => loadConfig(env)).toThrow(/LEDE_SESSION_SECRET/);
  });

  it("does NOT auto-generate a master key — it never mutates the input env", () => {
    const env = baseEnv();
    delete env.LEDE_MASTER_KEY;
    const snapshot = { ...env };
    expect(() => loadConfig(env)).toThrow();
    expect(env).toEqual(snapshot);
  });

  it("defaults authDisabled to false, and reads 'true' explicitly", () => {
    expect(loadConfig(baseEnv()).authDisabled).toBe(false);
    expect(loadConfig(baseEnv({ LEDE_AUTH_DISABLED: "true" })).authDisabled).toBe(true);
    expect(loadConfig(baseEnv({ LEDE_AUTH_DISABLED: "false" })).authDisabled).toBe(false);
  });
});
