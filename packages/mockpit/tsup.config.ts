import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "msw/index": "src/msw/index.ts",
    "react/index": "src/react/index.ts",
    "effect/index": "src/effect/index.ts",
    "foldkit/index": "src/foldkit/index.ts",
    "vite/index": "src/vite/index.ts",
    "cli/index": "src/cli/index.ts",
    "cli/bin": "src/cli/bin.ts",
    "schema/index": "src/schema/index.ts",
  },
  format: ["esm"],
  dts: { entry: { index: "src/index.ts", "msw/index": "src/msw/index.ts", "react/index": "src/react/index.ts", "effect/index": "src/effect/index.ts", "foldkit/index": "src/foldkit/index.ts", "vite/index": "src/vite/index.ts", "cli/index": "src/cli/index.ts", "schema/index": "src/schema/index.ts" } },
  sourcemap: true,
  clean: true,
  splitting: true,
  target: "es2022",
  external: ["msw", "msw/browser", "msw/node", "react", "react-dom", "vite", "@playwright/test", "playwright"],
})
