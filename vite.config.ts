/// <reference types="vitest/config" />
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  // Exclude ailoop fan-out worktrees so their test copies never pollute the suite.
  test: {
    exclude: [...configDefaults.exclude, "**/.claude/**"],
    setupFiles: ["./test/setup.ts"],
    // Integration suites boot a full Fastify server (and boot.smoke spawns
    // real tsx subprocesses); on a contended multi-core box the default
    // 5000ms timeout starves workers and causes non-deterministic per-test
    // timeouts. Give headroom and cap worker parallelism so full-suite runs
    // are deterministically green.
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
