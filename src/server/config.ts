// Fail-fast env config — spec.md §17. Phase 0 only: PORT + LEDE_TAILOR_ENGINE.
// LEDE_MASTER_KEY / LEDE_SESSION_SECRET arrive in Phase 2 (auth/BYOK) — not here.

export type TailorEngineMode = "live" | "fixture";

export type Config = {
  port: number;
  tailorEngine: TailorEngineMode;
};

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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: parsePort(env.PORT),
    tailorEngine: parseTailorEngine(env.LEDE_TAILOR_ENGINE, env.NODE_ENV),
  };
}
