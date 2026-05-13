import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@mockpit/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@mockpit/browser": new URL("./packages/browser/src/index.ts", import.meta.url).pathname,
      "@mockpit/devtools": new URL("./packages/devtools/src/index.ts", import.meta.url).pathname,
      "@mockpit/msw": new URL("./packages/msw/src/index.ts", import.meta.url).pathname,
      "@mockpit/msw/browser": new URL("./packages/msw/src/browser.ts", import.meta.url).pathname,
      "@mockpit/msw/node": new URL("./packages/msw/src/node.ts", import.meta.url).pathname,
      "@mockpit/react": new URL("./packages/react/src/index.ts", import.meta.url).pathname,
      "@mockpit/cli": new URL("./packages/cli/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "packages/*/src/**/*.test.tsx"],
  },
})
