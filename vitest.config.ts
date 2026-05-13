import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@mockkit/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@mockkit/browser": new URL("./packages/browser/src/index.ts", import.meta.url).pathname,
      "@mockkit/devtools": new URL("./packages/devtools/src/index.ts", import.meta.url).pathname,
      "@mockkit/msw": new URL("./packages/msw/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts"],
  },
})
