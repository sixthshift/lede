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
    host: true, // bind 0.0.0.0 so devcontainer/docker port publishing works
    port: 6173,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  // Exclude ailoop fan-out worktrees so their test copies never pollute the suite.
  test: {
    exclude: [...configDefaults.exclude, "**/.claude/**"],
    setupFiles: ["./test/setup.ts"],
    // Integration suites boot a full Fastify server (and boot.smoke spawns
    // real tsx subprocesses). Funnelling all files through one long-lived fork
    // (singleFork) let per-file resources — open better-sqlite3 handles, Fastify
    // instances — accumulate until the heavy real-server tests starved and hit
    // their per-test timeout; a hung test then wedged the shared fork and
    // starved the rest of the run. Isolated forks (fresh state per file) bound
    // that accumulation; a small pool caps contention well below the core count.
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    poolOptions: {
      forks: {
        isolate: true,
        maxForks: 3,
        minForks: 1,
      },
    },
  },
});
