// Boot gate (ticket T017): proves the REAL entrypoint boots under the REAL
// runner (tsx -> Node), not just that our source typechecks against Bun's
// ambient types. This is the test the escaped bug (ERR_DLOPEN_FAILED under
// `bun src/server/index.ts`) would have caught: better-sqlite3 is a Node-ABI
// native addon Bun's embedded V8 cannot dlopen.
import { describe, it, expect, afterEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import path from "node:path";

const TSX_BIN = path.join(process.cwd(), "node_modules/.bin/tsx");
const ENTRYPOINT = path.join(process.cwd(), "src/server/index.ts");

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
