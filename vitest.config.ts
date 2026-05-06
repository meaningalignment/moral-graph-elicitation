import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "app"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/pipeline/**/*.test.ts"],
    setupFiles: ["tests/helpers/setup.ts"],
    testTimeout: 60_000,
  },
})
