import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { doctorCommand, initCommand } from "../program"

describe("@mockpit/cli", () => {
  it("initialises config and client files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mockpit-cli-"))
    try {
      const result = await initCommand(cwd)
      expect(result.exitCode).toBe(0)
      expect(await readFile(join(cwd, "mockpit.config.mjs"), "utf8")).toContain("defineMockPitConfig")
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it("doctor reports valid config without issues", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mockpit-cli-"))
    try {
      await writeFile(
        join(cwd, "mockpit.config.mjs"),
        `import { defineMockPitConfig } from "${new URL("../../../../packages/core/src/index.ts", import.meta.url).href}"\nexport default defineMockPitConfig({ project: "cli-test", resources: [{ key: "x", label: "X" }] })\n`,
      )
      const result = await doctorCommand({}, cwd)
      expect(result.exitCode).toBe(0)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
