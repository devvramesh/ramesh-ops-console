import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  test: {
    globalSetup: ["tests/setup.ts"],
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    env: {
      DATABASE_FILE: "data/test.sqlite",
      AUTH_MODE: "dev",
      SESSION_SECRET: "test-secret",
    },
  },
});
