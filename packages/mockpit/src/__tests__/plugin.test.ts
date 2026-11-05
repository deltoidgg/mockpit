import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { HttpResponse } from "msw"
import { graphql } from "msw/graphql"
import { setupServer } from "msw/node"
import { Engine } from "../engine/engine.js"
import { memoryLedgerStore } from "../engine/store.js"
import { attach } from "../msw/index.js"
import { readAlchemyState } from "../vite/index.js"

describe("alchemy state", () => {
  it("reads the preferred stage and its workers from .alchemy/state", () => {
    const root = mkdtempSync(join(tmpdir(), "mockpit-alchemy-"))
    const stage = join(root, ".alchemy/state/FoldAndGrind/dev_sam")
    mkdirSync(stage, { recursive: true })
    mkdirSync(join(root, ".alchemy/state/FoldAndGrind/prod"), { recursive: true })
    writeFileSync(join(stage, "CafeApi.json"), JSON.stringify({ type: "Cloudflare.Worker", fqn: "CafeApi", output: { url: "https://cafe-api.dev.workers.dev" } }))
    writeFileSync(join(stage, "Bucket.json"), JSON.stringify({ type: "Cloudflare.R2.Bucket", fqn: "Bucket" }))
    const previous = process.env["ALCHEMY_STAGE"]
    process.env["ALCHEMY_STAGE"] = "dev_sam"
    try {
      expect(readAlchemyState(root)).toEqual({ stack: "FoldAndGrind", stage: "dev_sam", workers: [{ fqn: "CafeApi", url: "https://cafe-api.dev.workers.dev" }] })
    } finally {
      if (previous === undefined) delete process.env["ALCHEMY_STAGE"]
      else process.env["ALCHEMY_STAGE"] = previous
    }
    expect(readAlchemyState(mkdtempSync(join(tmpdir(), "mockpit-none-")))).toBeUndefined()
  })
})

describe("graphql", () => {
  it("keys GraphQL operations by name", async () => {
    const engine = new Engine({ project: "t", store: memoryLedgerStore(), persistPrefs: false, writeDelay: 0 })
    await engine.ready
    const api = graphql.link("http://localhost/graphql")
    const server = setupServer(api.query("GetCustomer", () => HttpResponse.json({ data: { customer: { name: "Ada" } } })))
    const detach = attach(server, { engine })
    server.listen({ onUnhandledFrame: "bypass" } as never)
    try {
      expect(engine.getState().inventory).toEqual(["GRAPHQL GetCustomer"])
      const response = await fetch("http://localhost/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "query GetCustomer { customer { name } }", operationName: "GetCustomer" }),
      })
      expect(await response.json()).toEqual({ data: { customer: { name: "Ada" } } })
      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(engine.getState().session["GRAPHQL GetCustomer"]).toMatchObject({ lastServedBy: "mock" })
    } finally {
      detach()
      server.close()
    }
  })
})
