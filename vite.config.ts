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
  },
});
