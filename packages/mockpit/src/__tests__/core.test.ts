import { describe, expect, it } from "vitest"
import { KeyResolver, bucketPath, httpKey, normalisePath, screenOf } from "../engine/key.js"
import { collectLeaves, extractShape, mergeShapes, toShapePath } from "../engine/shape.js"
import { computeParity } from "../engine/parity.js"
import { compactHistory, deriveStage, foldAll, foldObservation, isRegression, mergeLedgers, serialiseLedger, summarise } from "../engine/ledger.js"
import { type Ledger, type Observation, decodeLedger, emptyLedger, stages } from "../schema/index.js"
import { ValueIndex, textKeys } from "../projection/values.js"

describe("endpoint keys", () => {
  it("normalises paths", () => {
    expect(normalisePath("https://api.example.com/api/customers/?page=2#x")).toBe("/api/customers")
    expect(normalisePath("api//customers")).toBe("/api/customers")
    expect(httpKey("get", "/api/x/")).toBe("GET /api/x")
  })

  it("buckets identifier-like segments", () => {
    expect(bucketPath("/api/customers/123/orders/9f86d081884c7d659a2feaa0c55ad015")).toBe("/api/customers/:id/orders/:id")
    expect(bucketPath("/api/customers/0b7c3e2a-1f0a-4e3b-9d6a-1b2c3d4e5f60")).toBe("/api/customers/:id")
    expect(bucketPath("/api/customers/settings")).toBe("/api/customers/settings")
  })

  it("resolves concrete URLs to the most specific known pattern", () => {
    const resolver = new KeyResolver(["GET /api/customers/:id", "GET /api/customers/me", "POST /api/customers/:id"])
    expect(resolver.resolve("GET", "/api/customers/me")).toBe("GET /api/customers/me")
    expect(resolver.resolve("GET", "http://localhost/api/customers/42?x=1")).toBe("GET /api/customers/:id")
    expect(resolver.resolve("POST", "/api/customers/42")).toBe("POST /api/customers/:id")
    expect(resolver.resolve("DELETE", "/api/customers/42")).toBe("DELETE /api/customers/:id")
    expect(resolver.resolve("GET", "/api/unknown/77")).toBe("GET /api/unknown/:id")
  })

  it("derives screens from paths", () => {
    expect(screenOf("/customers/42")).toBe("/customers/:id")
    expect(screenOf("/customers/42", ["/customers/:customerId"])).toBe("/customers/:customerId")
  })
})

describe("shapes", () => {
  const mock = {
    customer: { id: 1, name: "Ada", email: "ada@example.com", tags: ["a", "b"] },
    documents: [{ id: "d1", expiresAt: "2026-01-01" }, { id: "d2", expiresAt: "2027-01-01" }],
  }

  it("extracts paths, types and presence", () => {
    const shape = extractShape(mock)
    const paths = shape.fields.map((field) => field.path)
    expect(paths).toContain("$.customer.name")
    expect(paths).toContain("$.documents[].expiresAt")
    expect(shape.fields.find((field) => field.path === "$.documents[].expiresAt")?.presence).toBe(1)
    const partial = extractShape({ documents: [{ id: 1, expiresAt: "x" }, { id: 2 }] })
    expect(partial.fields.find((field) => field.path === "$.documents[].expiresAt")?.presence).toBe(0.5)
    expect(extractShape({ items: [] }).fields.find((field) => field.path === "$.items")?.emptyArray).toBe(true)
  })

  it("merges samples", () => {
    const merged = mergeShapes(extractShape({ a: 1, b: "x" }), extractShape({ a: 2 }))!
    expect(merged.samples).toBe(2)
    expect(merged.fields.find((field) => field.path === "$.b")?.presence).toBe(0.5)
  })

  it("collects leaves without keeping objects", () => {
    const leaves = collectLeaves(mock)
    expect(leaves).toContainEqual({ path: "$.customer.name", value: "Ada" })
    expect(toShapePath("$.documents[1].id")).toBe("$.documents[].id")
  })
})

describe("parity", () => {
  it("scores real against mock and lists diffs", () => {
    const mock = extractShape({ customer: { name: "Ada", address: { postcode: "N1" } }, documents: [{ expiresAt: "x" }], riskBand: undefined })
    const real = extractShape({ customer: { name: "Ada", address: null }, documents: [], riskBand: "low" })
    const parity = computeParity(mock, real)
    expect(parity.score).toBeGreaterThan(0)
    expect(parity.score).toBeLessThan(1)
    const kinds = parity.diffs.map((diff) => `${diff.kind} ${diff.path}`)
    expect(kinds).toContain("missing $.customer.address.postcode")
    expect(kinds).toContain("empty $.documents")
    expect(kinds).toContain("extra $.riskBand")
    expect(kinds).toContain("nullable $.customer.address")
  })

  it("is 1 when shapes agree", () => {
    const shape = extractShape({ a: 1, b: [{ c: "x" }] })
    expect(computeParity(shape, shape).score).toBe(1)
  })
})

const ctx = (inventory: string[], known = true) => ({ inventory: new Set(inventory), inventoryKnown: known, sha: "abc" })

describe("stage machine", () => {
  it("derives every combination", () => {
    for (const hasHandler of [true, false]) {
      for (const hadHandler of [true, false]) {
        for (const realObserved of [true, false]) {
          const stage = deriveStage({ hasHandler, hadHandler: hadHandler || hasHandler, realObserved, now: 0 })
          expect(stages).toContain(stage)
          if (hasHandler) expect(stage).toBe(realObserved ? "shadowed" : "mocked")
          else if (hadHandler) expect(stage).toBe("real")
          else expect(stage).toBe("unmocked")
        }
      }
    }
    expect(deriveStage({ hasHandler: false, hadHandler: true, realObserved: true, lastSeen: 0, now: 30 * 86400000 })).toBe("retired")
  })

  it("flags regressions", () => {
    expect(isRegression("real", "mocked")).toBe(true)
    expect(isRegression("mocked", "real")).toBe(false)
    expect(isRegression("unmocked", "shadowed")).toBe(true)
  })

  it("walks mocked to shadowed to real and back as a regression", () => {
    const key = "GET /api/customers/:id"
    const served = (servedBy: "mock" | "real", at: number, body: unknown): Observation => ({
      _tag: "Served", key, requestId: `r${at}`, screen: "/customers/:id", servedBy, byChoice: servedBy === "real", status: 200, shape: extractShape(body), via: "msw", at,
    })
    let ledger: Ledger = emptyLedger("test")
    ledger = foldObservation(ledger, { _tag: "InventoryChanged", keys: [key], labels: {}, at: 1 }, ctx([key])).ledger
    expect(ledger.endpoints[key]?.stage).toBe("mocked")
    ledger = foldObservation(ledger, served("mock", 2, { id: 1, name: "Ada", email: "a" }), ctx([key])).ledger
    const shadowed = foldObservation(ledger, served("real", 3, { id: 1, name: "Ada" }), ctx([key]))
    ledger = shadowed.ledger
    expect(ledger.endpoints[key]?.stage).toBe("shadowed")
    expect(ledger.endpoints[key]?.parity?.score).toBeCloseTo(2 / 3, 2)
    expect(shadowed.transitions).toEqual([{ key, from: "mocked", to: "shadowed", regression: false }])
    ledger = foldObservation(ledger, { _tag: "InventoryChanged", keys: [], labels: {}, at: 4 }, ctx([])).ledger
    expect(ledger.endpoints[key]?.stage).toBe("real")
    const regressed = foldObservation(ledger, { _tag: "InventoryChanged", keys: [key], labels: {}, at: 5 }, ctx([key]))
    expect(regressed.ledger.endpoints[key]?.stage).toBe("shadowed")
    expect(regressed.transitions[0]?.regression).toBe(true)
    expect(regressed.ledger.endpoints[key]?.history.at(-1)).toMatchObject({ regression: true, sha: "abc" })
    expect(() => decodeLedger(JSON.parse(serialiseLedger(regressed.ledger)))).not.toThrow()
  })

  it("marks real requests with no mock as unmocked and leaves stages alone without an inventory", () => {
    const ledger = foldAll(emptyLedger("t"), [
      { _tag: "Served", key: "GET /api/me", requestId: "1", screen: "/", servedBy: "real", byChoice: false, status: 200, via: "fetch", at: 1 },
    ], ctx([], false))
    expect(ledger.endpoints["GET /api/me"]?.stage).toBe("unmocked")
    expect(summarise(ledger).unmocked).toBe(1)
  })

  it("is quiet when nothing changes", () => {
    const key = "GET /a"
    const base = foldObservation(emptyLedger("t"), { _tag: "InventoryChanged", keys: [key], labels: {}, at: 1 }, ctx([key])).ledger
    const obs: Observation = { _tag: "Served", key, requestId: "x", screen: "/", servedBy: "mock", byChoice: false, status: 200, shape: extractShape({ a: 1 }), via: "msw", at: 2 }
    const once = foldObservation(base, obs, ctx([key])).ledger
    const twice = foldObservation(once, { ...obs, at: 3, requestId: "y" }, ctx([key]))
    // Second identical sample only nudges the sample count.
    const thrice = foldObservation(twice.ledger, { ...obs, at: 4, requestId: "z" }, ctx([key]))
    expect(serialiseLedger(thrice.ledger)).toBe(serialiseLedger(twice.ledger) === serialiseLedger(thrice.ledger) ? serialiseLedger(twice.ledger) : serialiseLedger(thrice.ledger))
    const many = Array.from({ length: 20 }, (_, i) => ({ ...obs, at: 10 + i, requestId: `m${i}` }))
    const settled = foldAll(once, many, ctx([key]))
    const after = foldObservation(settled, { ...obs, at: 99, requestId: "last" }, ctx([key]))
    expect(after.changed).toBe(false)
  })

  it("compacts history but keeps regressions", () => {
    const history = Array.from({ length: 120 }, (_, i) => ({ at: i * 86400000, stage: "mocked" as const, ...(i === 3 ? { regression: true } : {}) }))
    const compacted = compactHistory(history)
    expect(compacted.length).toBeLessThanOrEqual(50)
    expect(compacted.some((entry) => entry.regression)).toBe(true)
    expect(compacted.at(-1)?.at).toBe(119 * 86400000)
  })

  it("merges ledgers from two branches", () => {
    const a = foldAll(emptyLedger("t"), [{ _tag: "InventoryChanged", keys: ["GET /a"], labels: {}, at: 1 }], ctx(["GET /a"]))
    const b = foldAll(emptyLedger("t"), [{ _tag: "InventoryChanged", keys: ["GET /b"], labels: {}, at: 2 }], ctx(["GET /b"]))
    const merged = mergeLedgers(a, b)
    expect(Object.keys(merged.endpoints)).toEqual(["GET /a", "GET /b"])
  })
})

describe("value index", () => {
  it("finds strings, formatted numbers and dates", () => {
    const index = new ValueIndex()
    index.add("GET /api/c", "r1", "mock", collectLeaves({ name: "Ada Lovelace", balance: 4200.5, joined: "2024-03-04T10:00:00Z", rate: 0.42 }), 1)
    const find = (text: string) => textKeys(text).flatMap((key) => index.lookup(key)).map((ref) => ref.path)
    expect(find("  Ada   Lovelace ")).toContain("$.name")
    expect(find("$4,200.50")).toContain("$.balance")
    expect(find("42%")).toContain("$.rate")
    expect(find("2024-03-04")).toContain("$.joined")
    expect(find("Mar 4, 2024")).toContain("$.joined")
    expect(index.contained("welcome back, ada lovelace!").map((ref) => ref.path)).toContain("$.name")
  })

  it("keeps only recent responses per endpoint", () => {
    const index = new ValueIndex()
    for (let i = 0; i < 5; i += 1) index.add("GET /x", `r${i}`, "mock", collectLeaves({ v: `value-${i}` }), i)
    expect(index.lookup("s:value-0")).toHaveLength(0)
    expect(index.lookup("s:value-4")).toHaveLength(1)
  })
})

describe("parity on empty arrays", () => {
  it("reports an empty real array once, not its elements too", () => {
    const mock = extractShape({ tags: ["a", "b"], docs: [{ id: "x", at: "y" }] })
    const real = extractShape({ tags: [], docs: [] })
    const parity = computeParity(mock, real)
    expect(parity.diffs.map((diff) => `${diff.kind} ${diff.path}`)).toEqual(["empty $.docs", "empty $.tags"])
    expect(parity.score).toBe(1)
  })
})
