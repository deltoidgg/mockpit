import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseSync } from "vite"
import { run, parseArgs, promoteSource } from "../cli/index.js"
import { foldAll, serialiseLedger } from "../engine/ledger.js"
import { extractShape } from "../engine/shape.js"
import { type Observation, emptyLedger } from "../schema/index.js"

const key = "GET /api/customers/:id"
const ctx = (inventory: string[]) => ({ inventory: new Set(inventory), inventoryKnown: true })
const served = (servedBy: "mock" | "real", at: number, body: unknown): Observation => ({
  _tag: "Served", key, requestId: String(at), screen: "/c/:id", servedBy, byChoice: false, status: 200, shape: extractShape(body), via: "msw", at,
})

const repo = () => {
  const dir = mkdtempSync(join(tmpdir(), "mockpit-cli-"))
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir })
  execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir })
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir })
  mkdirSync(join(dir, ".mockpit"))
  return dir
}

const write = (dir: string, ledger: unknown) => writeFileSync(join(dir, ".mockpit/ledger.json"), serialiseLedger(ledger as never))
const commit = (dir: string) => execFileSync("git", ["commit", "-qam", "x"], { cwd: dir })

describe("cli", () => {
  it("parses flags", () => {
    expect(parseArgs(["a", "--base", "main", "--only-changed", "--x=1"])).toEqual({ positional: ["a"], flags: { base: "main", "only-changed": true, x: "1" } })
  })

  it("reports changes against a base ref and fails check on regressions", async () => {
    const dir = repo()
    const base = foldAll(emptyLedger("demo"), [{ _tag: "InventoryChanged", keys: [key, "GET /api/me"], labels: {}, at: 1 }, served("mock", 2, { a: 1, b: 2 })], ctx([key, "GET /api/me"]))
    write(dir, base)
    execFileSync("git", ["add", "."], { cwd: dir })
    commit(dir)
    const promoted = foldAll(base, [served("real", 3, { a: 1 }), { _tag: "InventoryChanged", keys: ["GET /api/me"], labels: {}, at: 4 }], ctx(["GET /api/me"]))
    write(dir, promoted)
    const report = await run(["report", "--base", "main", "--only-changed"], dir)
    expect(report.code).toBe(0)
    expect(report.output).toContain("1 promoted to real, 0 regressed")
    expect(report.output).toContain("| `GET /api/customers/:id` | real | 50% | mocked → real |")
    expect((await run(["check", "--base", "main"], dir)).code).toBe(0)
    expect((await run(["check", "--max-mocked", "0"], dir)).code).toBe(1)

    commit(dir)
    const regressed = foldAll(promoted, [{ _tag: "InventoryChanged", keys: ["GET /api/me", key], labels: {}, at: 5 }], ctx(["GET /api/me", key]))
    write(dir, regressed)
    const check = await run(["check", "--base", "main"], dir)
    expect(check.code).toBe(1)
    expect(check.output).toContain("GET /api/customers/:id regressed: real → shadowed")
  })

  it("merges two ledgers as a git merge driver", async () => {
    const dir = repo()
    const ours = foldAll(emptyLedger("demo"), [{ _tag: "InventoryChanged", keys: ["GET /a"], labels: {}, at: 1 }], ctx(["GET /a"]))
    const theirs = foldAll(emptyLedger("demo"), [{ _tag: "InventoryChanged", keys: ["GET /b"], labels: {}, at: 2 }], ctx(["GET /b"]))
    writeFileSync(join(dir, "ours.json"), serialiseLedger(ours))
    writeFileSync(join(dir, "theirs.json"), serialiseLedger(theirs))
    expect((await run(["merge", "base.json", "ours.json", "theirs.json"], dir)).code).toBe(0)
    expect(Object.keys(JSON.parse(readFileSync(join(dir, "ours.json"), "utf8")).endpoints)).toEqual(["GET /a", "GET /b"])
  })

  it("init writes .gitattributes and the merge driver", async () => {
    const dir = repo()
    const result = await run(["init"], dir)
    expect(result.output).toContain("merge driver")
    expect(readFileSync(join(dir, ".gitattributes"), "utf8")).toContain(".mockpit/ledger.json merge=mockpit")
    expect(execFileSync("git", ["config", "merge.mockpit.driver"], { cwd: dir }).toString()).toContain("mockpit merge")
  })

  it("promotes an MSW handler to an edge route and removes it", async () => {
    const dir = repo()
    const handlers = `import { http, HttpResponse } from "msw"

export const handlers = [
  http.get("/api/customers", () => HttpResponse.json({ customers: [] })),
  http.get("/api/customers/:id", ({ params }) => HttpResponse.json({ id: params.id, name: "Ada" })),
]
`
    mkdirSync(join(dir, "src"))
    writeFileSync(join(dir, "src/handlers.ts"), handlers)
    const found = promoteSource(handlers, parseSync("h.ts", handlers, { lang: "ts" }).program as never, key)
    expect(found?.resolver).toContain('name: "Ada"')
    const result = await run(["promote", key, "--handlers", "src/handlers.ts", "--out", "worker/promoted", "--remove"], dir)
    expect(result.code).toBe(0)
    const route = readFileSync(join(dir, "worker/promoted/get-api-customers-id.ts"), "utf8")
    expect(route).toContain('export const path = "/api/customers/:id"')
    expect(readFileSync(join(dir, "worker/promoted/index.ts"), "utf8")).toContain('from "./get-api-customers-id.js"')
    const remaining = readFileSync(join(dir, "src/handlers.ts"), "utf8")
    expect(remaining).not.toContain("/api/customers/:id")
    expect(remaining).toContain('http.get("/api/customers"')
  })
})
