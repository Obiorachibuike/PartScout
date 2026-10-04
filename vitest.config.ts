import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    testTimeout: 30_000,
    env: {
      PARTSCOUT_ALLOW_FIXTURES: "true",
      SEARCH_PROVIDER: "fixture",
      AI_PROVIDER: "none",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
