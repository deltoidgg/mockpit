import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: "es2022",
  external: ["react", "react-dom"],
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" }
  },
})
