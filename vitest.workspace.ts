import { defineWorkspace } from "vitest/config"

export default defineWorkspace([
  {
    test: {
      name: "node",
      environment: "node",
      include: ["packages/core/src/**/*.test.ts", "packages/msw/src/**/*.test.ts"],
    },
    resolve: {
      alias: {
        "@mockpit/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
        "@mockpit/browser": new URL("./packages/browser/src/index.ts", import.meta.url).pathname,
        "@mockpit/devtools": new URL("./packages/devtools/src/index.ts", import.meta.url).pathname,
        "@mockpit/msw": new URL("./packages/msw/src/index.ts", import.meta.url).pathname,
      },
    },
  },
  {
    test: {
      name: "browser",
      environment: "jsdom",
      include: ["packages/browser/src/**/*.test.ts", "packages/devtools/src/**/*.test.ts"],
    },
    resolve: {
      alias: {
        "@mockpit/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
        "@mockpit/browser": new URL("./packages/browser/src/index.ts", import.meta.url).pathname,
        "@mockpit/devtools": new URL("./packages/devtools/src/index.ts", import.meta.url).pathname,
        "@mockpit/msw": new URL("./packages/msw/src/index.ts", import.meta.url).pathname,
      },
    },
  },
])
