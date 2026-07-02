// Fail-fast env config — spec.md §17. PORT + LEDE_TAILOR_ENGINE (Phase 0) plus
// the Phase 2 operator secrets: LEDE_MASTER_KEY + LEDE_SESSION_SECRET are
// REQUIRED to boot (never auto-generated — spec.md §8/§19/§23), distinct from
// the provider BYOK key (encrypted separately, in the secrets table).

export type TailorEngineMode = "live" | "fixture";

export type Config = {
  port: number;
  tailorEngine: TailorEngineMode;
  dataDir: string;
  masterKey: Buffer;
  sessionSecret: string;
  authDisabled: boolean;
};

const MASTER_KEY_BYTES = 32;
const SESSION_SECRET_MIN_LENGTH = 32;

function parsePort(raw: string | undefined): number {
  if (raw === undefined) return 8787;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: "${raw}" (expected an integer in 1..65535)`);
  }
  return port;
}

function parseTailorEngine(raw: string | undefined, nodeEnv: string | undefined): TailorEngineMode {
  if (raw === undefined) return nodeEnv === "test" ? "fixture" : "live";
  if (raw === "live" || raw === "fixture") return raw;
  throw new Error(`Invalid LEDE_TAILOR_ENGINE: "${raw}" (expected "live" or "fixture")`);
}

function parseMasterKey(raw: string | undefined): Buffer {
  if (raw === undefined) {
    throw new Error("Missing LEDE_MASTER_KEY (required to boot — a 32-byte key, base64-encoded)");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== MASTER_KEY_BYTES) {
    throw new Error(
      `Invalid LEDE_MASTER_KEY: decoded to ${key.length} bytes (expected exactly ${MASTER_KEY_BYTES})`,
    );
  }
  return key;
}

function parseSessionSecret(raw: string | undefined): string {
  if (raw === undefined) {
    throw new Error("Missing LEDE_SESSION_SECRET (required to boot)");
  }
  if (raw.length < SESSION_SECRET_MIN_LENGTH) {
    throw new Error(
      `Invalid LEDE_SESSION_SECRET: must be at least ${SESSION_SECRET_MIN_LENGTH} characters (got ${raw.length})`,
    );
  }
  return raw;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: parsePort(env.PORT),
    tailorEngine: parseTailorEngine(env.LEDE_TAILOR_ENGINE, env.NODE_ENV),
    dataDir: env.DATA_DIR ?? "./data",
    masterKey: parseMasterKey(env.LEDE_MASTER_KEY),
    sessionSecret: parseSessionSecret(env.LEDE_SESSION_SECRET),
    authDisabled: env.LEDE_AUTH_DISABLED === "true",
  };
}
