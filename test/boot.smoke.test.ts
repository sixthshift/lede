// Boot gate (ticket T017): proves the REAL entrypoint boots under the REAL
// runner (tsx -> Node), not just that our source typechecks against Bun's
// ambient types. This is the test the escaped bug (ERR_DLOPEN_FAILED under
// `bun src/server/index.ts`) would have caught: better-sqlite3 is a Node-ABI
// native addon Bun's embedded V8 cannot dlopen.
import { describe, it, expect, afterEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import path from "node:path";

const TSX_BIN = path.join(process.cwd(), "node_modules/.bin/tsx");
const ENTRYPOINT = path.join(process.cwd(), "src/server/index.ts");
const VALID_MASTER_KEY = randomBytes(32).toString("base64");
const VALID_SESSION_SECRET = "boot-smoke-session-secret-at-least-32-chars";

let child: ChildProcess | undefined;
let dataDir: string | undefined;

afterEach(() => {
  if (child && !child.killed) child.kill();
  child = undefined;
  if (dataDir) {
    rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  }
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const address = srv.address();
      if (address === null || typeof address === "string") {
        reject(new Error("could not determine a free port"));
        return;
      }
      const { port } = address;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function pollHealth(port: number, deadline: number): Promise<{ ok: boolean }> {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return (await res.json()) as { ok: boolean };
    } catch {
      // server not up yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`GET /api/health did not respond ok within the deadline (port ${port})`);
}

describe("boot smoke: real entrypoint under the real runner (tsx/Node)", () => {
  it("boots, serves GET /api/health -> {ok:true}, and creates the sqlite file under DATA_DIR", async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), "lede-boot-smoke-"));
    const port = await freePort();

    child = spawn(TSX_BIN, [ENTRYPOINT], {
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        PORT: String(port),
        NODE_ENV: "test",
        LEDE_MASTER_KEY: VALID_MASTER_KEY,
        LEDE_SESSION_SECRET: VALID_SESSION_SECRET,
      },
      stdio: "pipe",
    });

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    let exited: number | null = null;
    child.on("exit", (code) => {
      exited = code;
    });

    const body = await pollHealth(port, Date.now() + 15_000).catch((err) => {
      throw new Error(`${err.message}\nexit code: ${exited}\nstderr:\n${stderr}`);
    });

    expect(body).toEqual({ ok: true });
    expect(existsSync(path.join(dataDir, "lede.sqlite"))).toBe(true);
  }, 20_000);
});

// Process-level boot refusal (spec.md §8/§19/§23): the operator secrets are
// REQUIRED to boot and are NEVER auto-generated. A missing or malformed
// LEDE_MASTER_KEY must fail the process before it ever listens.
function spawnWithEnv(env: Record<string, string | undefined>): {
  waitForExit: () => Promise<number | null>;
} {
  const merged: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  child = spawn(TSX_BIN, [ENTRYPOINT], {
    env: merged,
    stdio: "pipe",
  });
  const proc = child;
  return {
    waitForExit: () =>
      new Promise((resolve) => {
        proc.on("exit", (code) => resolve(code));
      }),
  };
}

describe("boot refusal: missing/malformed operator secrets never boot, never write a key", () => {
  it("exits non-zero and never listens when LEDE_MASTER_KEY is unset", async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), "lede-boot-refusal-"));
    const port = await freePort();
    const { waitForExit } = spawnWithEnv({
      DATA_DIR: dataDir,
      PORT: String(port),
      NODE_ENV: "test",
      LEDE_MASTER_KEY: undefined,
      LEDE_SESSION_SECRET: VALID_SESSION_SECRET,
    });

    const code = await waitForExit();
    expect(code).not.toBe(0);
    await expect(pollHealth(port, Date.now() + 1_500)).rejects.toThrow();
    expect(existsSync(dataDir)).toBe(true);
    expect(readdirSync(dataDir)).toEqual([]);
  }, 20_000);

  it("exits non-zero and never listens when LEDE_MASTER_KEY is malformed (not 32 bytes)", async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), "lede-boot-refusal-"));
    const port = await freePort();
    const { waitForExit } = spawnWithEnv({
      DATA_DIR: dataDir,
      PORT: String(port),
      NODE_ENV: "test",
      LEDE_MASTER_KEY: Buffer.from("too short").toString("base64"),
      LEDE_SESSION_SECRET: VALID_SESSION_SECRET,
    });

    const code = await waitForExit();
    expect(code).not.toBe(0);
    await expect(pollHealth(port, Date.now() + 1_500)).rejects.toThrow();
    expect(existsSync(dataDir)).toBe(true);
    expect(readdirSync(dataDir)).toEqual([]);
  }, 20_000);
});
