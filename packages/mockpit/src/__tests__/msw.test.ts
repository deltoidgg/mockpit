import { createServer, type Server } from "node:http"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { Engine } from "../engine/engine.js"
import { memoryLedgerStore } from "../engine/store.js"
import { attach } from "../msw/index.js"

let real: Server
let base = ""
let realDown = false
beforeAll(async () => {
  real = createServer((req, res) => {
    if (realDown) {
      res.statusCode = 503
      res.end("down")
      return
    }
    res.setHeader("content-type", "application/json")
    if (req.url?.startsWith("/api/customers/")) res.end(JSON.stringify({ id: 7, name: "Real Ada", documents: [] }))
    else if (req.url === "/api/me") res.end(JSON.stringify({ user: "real" }))
    else res.end(JSON.stringify({ ok: true }))
  })
  await new Promise<void>((resolve) => real.listen(0, resolve))
  const address = real.address()
  base = `http://localhost:${typeof address === "object" && address ? address.port : 0}`
})
afterAll(() => real.close())

const makeEngine = () => new Engine({ project: "t", store: memoryLedgerStore(), persistPrefs: false, writeDelay: 0, pathname: () => "/customers/7" })
const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

describe("msw sensor", () => {
  let server: ReturnType<typeof setupServer>
  let detach: () => void
  afterEach(() => {
    detach?.()
    server?.close()
  })

  it("inventories handlers, observes mocks, flips to real and shadow compares", async () => {
    const engine = makeEngine()
    await engine.ready
    server = setupServer(
      http.get(`${base}/api/customers/:id`, () => HttpResponse.json({ id: 1, name: "Mock Ada", email: "a@b.c", documents: [{ id: "d1" }] })),
      http.post(`${base}/api/customers/:id/notes`, () => HttpResponse.json({ ok: true })),
    )
    detach = attach(server, { engine })
    server.listen({ onUnhandledFrame: "bypass" } as never)
    const key = "GET /api/customers/:id"
    expect(engine.getState().inventory).toEqual([key, "POST /api/customers/:id/notes"])
    expect(engine.getLedger().endpoints[key]?.stage).toBe("mocked")

    expect(await (await fetch(`${base}/api/customers/1`)).json()).toMatchObject({ name: "Mock Ada" })
    await settle()
    expect(engine.getState().session[key]).toMatchObject({ lastServedBy: "mock", requests: 1 })
    expect(engine.getLedger().endpoints[key]?.screens).toEqual(["/customers/:id"])
    expect(engine.values.lookup("s:mock ada")[0]).toMatchObject({ key, servedBy: "mock", path: "$.name" })

    expect(engine.canControl(key)).toBe(true)
    await engine.flip(key, "real")
    expect(await (await fetch(`${base}/api/customers/7`)).json()).toMatchObject({ name: "Real Ada" })
    await settle()
    const entry = engine.getLedger().endpoints[key]!
    expect(entry.stage).toBe("shadowed")
    expect(entry.parity?.score).toBeLessThan(1)
    expect(entry.parity?.diffs.map((diff) => `${diff.kind} ${diff.path}`)).toEqual(expect.arrayContaining(["missing $.email", "empty $.documents"]))
    expect(engine.getState().session[key]).toMatchObject({ lastServedBy: "real" })

    await engine.flip(key, "mock")
    expect(await (await fetch(`${base}/api/customers/7`)).json()).toMatchObject({ name: "Mock Ada" })
  })

  it("tracks unmocked JSON endpoints and ignores the rest", async () => {
    const engine = makeEngine()
    await engine.ready
    server = setupServer(http.get(`${base}/api/a`, () => HttpResponse.json({ a: 1 })))
    detach = attach(server, { engine })
    server.listen({ onUnhandledFrame: "bypass" } as never)
    await (await fetch(`${base}/api/me`)).json()
    await settle()
    expect(engine.getLedger().endpoints["GET /api/me"]?.stage).toBe("unmocked")
  })

  it("serves the mock when the real backend fails and the safety net is on", async () => {
    const engine = makeEngine()
    await engine.ready
    server = setupServer(http.get(`${base}/api/customers/:id`, () => HttpResponse.json({ id: 1, name: "Mock Ada" })))
    detach = attach(server, { engine })
    server.listen({ onUnhandledFrame: "bypass" } as never)
    const key = "GET /api/customers/:id"
    await engine.setSafetyNet(key, true)
    await engine.flip(key, "real")
    realDown = true
    try {
      expect(await (await fetch(`${base}/api/customers/1`)).json()).toMatchObject({ name: "Mock Ada" })
      await settle()
      expect(engine.getState().session[key]).toMatchObject({ lastServedBy: "mock", failing: true })
    } finally {
      realDown = false
    }
  })

  it("re-reads inventory when the app adds handlers and keeps app overrides across flips", async () => {
    const engine = makeEngine()
    await engine.ready
    server = setupServer(http.get(`${base}/api/a`, () => HttpResponse.json({ a: 1 })))
    detach = attach(server, { engine })
    server.listen({ onUnhandledFrame: "bypass" } as never)
    server.use(http.get(`${base}/api/b`, () => HttpResponse.json({ b: 1 })))
    expect(engine.getState().inventory).toEqual(["GET /api/a", "GET /api/b"])
    await engine.flip("GET /api/a", "real")
    expect(await (await fetch(`${base}/api/b`)).json()).toEqual({ b: 1 })
    expect(await (await fetch(`${base}/api/a`)).json()).toEqual({ ok: true })
  })

  it("records regressions when a removed handler comes back", async () => {
    const engine = makeEngine()
    await engine.ready
    const handler = http.get(`${base}/api/a`, () => HttpResponse.json({ a: 1 }))
    server = setupServer(handler)
    detach = attach(server, { engine })
    server.listen({ onUnhandledFrame: "bypass" } as never)
    expect(engine.getLedger().endpoints["GET /api/a"]?.stage).toBe("mocked")
    server.resetHandlers(http.get(`${base}/api/other`, () => HttpResponse.json({})))
    await settle()
    expect(engine.getLedger().endpoints["GET /api/a"]?.stage).toBe("real")
    server.resetHandlers(handler)
    await settle()
    expect(engine.getLedger().endpoints["GET /api/a"]?.history.at(-1)?.regression).toBe(true)
    expect(engine.getState().regressions).toContain("GET /api/a")
  })
})
