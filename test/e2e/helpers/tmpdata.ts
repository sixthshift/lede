// Per-run DATA_DIR for the Playwright webServer (§19/[v2-017]): a fresh SQLite
// file per `playwright test` invocation, isolated from `data/` (dev) and the
// vitest suite's own throwaway dirs — so browser runs never collide with, or
// leak into, either.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function createTmpDataDir(): string {
  return mkdtempSync(path.join(tmpdir(), "lede-e2e-"));
}
