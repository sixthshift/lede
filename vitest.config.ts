// Standalone vitest config (E5-A) — vite.config.ts already carries vitest's
// `test` block (plugins/alias/pool tuning it needs stay there, unowned by
// this ticket); this file only layers the one exclusion vitest itself needs:
// Playwright's browser specs must never be picked up by `vitest run` (they
// have no DOM/jsdom environment and boot a real server via webServer, not a
// per-test mock). mergeConfig keeps everything vite.config.ts already sets.
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: ["test/e2e/**"],
    },
  }),
);
