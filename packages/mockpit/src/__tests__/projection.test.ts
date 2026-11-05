// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { Engine } from "../engine/engine.js"
import { memoryLedgerStore } from "../engine/store.js"
import { collectLeaves } from "../engine/shape.js"
import { toMarkdown } from "../engine/report.js"
import { scan } from "../projection/scan.js"
import { ValueIndex } from "../projection/values.js"
import { buildSnapshot } from "../overlay/snapshot.js"
import { initialModel, Message, relativeTime, update } from "../overlay/app.js"

const index = () => {
  const values = new ValueIndex()
  values.add("GET /api/c", "r1", "mock", collectLeaves({ customer: { name: "Ada Lovelace", tier: "Gold", score: 7, balance: 18250.5 } }), 1)
  values.add("GET /api/me", "r2", "real", collectLeaves({ user: { name: "Sam Rivera", tier: "Gold" } }), 2)
  return values
}

describe("projection", () => {
  it("scores long strings as matched, short values as inferred unless corroborated", () => {
    document.body.innerHTML = `
      <section><h1>Ada Lovelace</h1><p>Score <b>7</b></p><p>£18,250.50</p></section>
      <aside><span>7</span></aside>
      <div data-mockpit-ignore><span>Ada Lovelace</span></div>`
    const { regions } = scan({ root: document.body, index: index() })
    const byText = Object.fromEntries(regions.map((region) => [(region.node as Text).nodeValue, region]))
    expect(byText["Ada Lovelace"]).toMatchObject({ key: "GET /api/c", path: "$.customer.name", match: "matched", servedBy: "mock" })
    expect(byText["7"]).toMatchObject({ key: "GET /api/c", match: "matched" })
    expect(byText["£18,250.50"]).toMatchObject({ path: "$.customer.balance" })
    // The aside's lone "7" has no corroborating neighbour: below threshold.
    expect(regions.filter((region) => (region.node as Text).nodeValue === "7")).toHaveLength(1)
    // Ignored subtree is not scanned.
    expect(regions.filter((region) => (region.node as Text).nodeValue === "Ada Lovelace")).toHaveLength(1)
  })

  it("prefers the most recent response for ambiguous values and finds attributes", () => {
    document.body.innerHTML = `<p>Gold member</p><img alt="Sam Rivera" /><input value="Ada Lovelace" />`
    const { regions } = scan({ root: document.body, index: index() })
    expect(regions.find((region) => region.attribute === "alt")).toMatchObject({ key: "GET /api/me", servedBy: "real" })
    expect(regions.find((region) => region.attribute === "value")).toMatchObject({ key: "GET /api/c" })
  })

  it("lets a refiner confirm and enrich an attribution", () => {
    document.body.innerHTML = `<p><span>7</span></p>`
    const { regions } = scan({
      root: document.body,
      index: index(),
      refiners: [{ tier: "react", refine: ({ candidates }) => ({ ref: candidates[0]!, confidence: 1, component: "Score" }) }],
    })
    expect(regions[0]).toMatchObject({ tier: "react", match: "matched", component: "Score" })
  })

  it("marks visible source literals that are not data", () => {
    document.body.innerHTML = `<p>Balances refresh nightly.</p><p>Ada Lovelace</p>`
    const { literals } = scan({
      root: document.body,
      index: index(),
      literals: [
        { file: "a.tsx", line: 3, column: 1, text: "Balances refresh nightly.", component: "List" },
        { file: "a.tsx", line: 4, column: 1, text: "Ada Lovelace" },
      ],
    })
    expect(literals.map((hit) => hit.literal.text)).toEqual(["Balances refresh nightly."])
  })
})

describe("overlay model", () => {
  it("builds a snapshot from engine state", async () => {
    const engine = new Engine({ project: "demo", store: memoryLedgerStore(), persistPrefs: false, writeDelay: 0, pathname: () => "/c/1" })
    await engine.ready
    engine.setInventory("msw", ["GET /api/c"])
    engine.requestStarted("GET /api/c", "r1")
    engine.served({ key: "GET /api/c", requestId: "r1", servedBy: "mock", status: 200, body: { a: 1 }, via: "msw" })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const snapshot = buildSnapshot({ state: engine.getState(), regionCounts: { "GET /api/c": 3 }, literals: [], now: Date.now() })
    expect(snapshot.summary).toMatchObject({ total: 1, mocked: 1 })
    expect(snapshot.screen).toBe("/c/:id")
    expect(snapshot.screenRows[0]).toMatchObject({ key: "GET /api/c", stage: "mocked", served: "mock", regions: 3, requests: 1 })
    expect(toMarkdown(engine.getLedger())).toContain("| `GET /api/c` | mocked | – |")
  })

  it("updates the drawer and emits actions", () => {
    const opened = update(initialModel, Message.ClickedStrip())
    expect(opened.model.view).toBe("screen")
    expect(opened.commands).toHaveLength(1)
    const row = { key: "GET /a", label: null, stage: "mocked", served: "mock", override: null, controllable: true, parity: null, diffs: [], requests: 1, lastAt: 1, lastChanged: 1, latency: null, status: 200, failing: false, failure: null, note: null, regression: false, shadow: true, safetyNet: false, regions: 0, pinned: false, via: "msw", command: null, screens: [] } as const
    const withRows = { ...opened.model, snapshot: { ...opened.model.snapshot, screenRows: [row, { ...row, key: "GET /b" }] } }
    const down = update(withRows, Message.PressedListKey({ key: "ArrowDown" }))
    expect(down.model.active).toBe(1)
    const expanded = update(down.model, Message.PressedListKey({ key: "Enter" }))
    expect(expanded.model.expanded).toBe("GET /b")
    expect(update(expanded.model, Message.PressedListKey({ key: "f" })).commands).toHaveLength(1)
    const noted = update(update(expanded.model, Message.ClickedNote({ key: "GET /b" })).model, Message.ChangedNote({ text: "blocked on auth" }))
    expect(noted.model.noteText).toBe("blocked on auth")
    expect(update(noted.model, Message.SubmittedNote()).model.noteKey).toBeNull()
    expect(relativeTime(100_000, 100_000 - 5 * 60_000)).toBe("5m ago")
    expect(relativeTime(0, null)).toBe("never")
  })
})
