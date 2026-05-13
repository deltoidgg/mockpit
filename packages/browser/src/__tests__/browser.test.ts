// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { defineMockPitConfig, defineResource, defineScenario } from "@mockpit/core"
import { createMockPitClient, createMemoryStorage } from "../index"

describe("@mockpit/browser", () => {
  it("records live API fetches and exposes a global snapshot", async () => {
    const client = createMockPitClient({
      config: defineMockPitConfig({
        project: "browser-test",
        mode: { default: "live" },
        resources: [defineResource({ key: "customers.list", label: "Customers" })],
      }),
      storage: createMemoryStorage(),
      getRoutePath: () => "/customers",
      fetch: async () =>
        new Response(JSON.stringify({ customers: [{ id: "1" }] }), {
          headers: { "content-type": "application/json" },
        }),
    })

    await client.fetch("customers.list", "/api/customers")

    expect(client.snapshot().records[0]?.sourceKind).toBe("api")
    expect(window.__MOCKPIT__?.snapshot().project).toBe("browser-test")
  })

  it("uses explicit fallback only when the current mode allows it", async () => {
    const client = createMockPitClient({
      config: defineMockPitConfig({
        project: "fallback-test",
        mode: { default: "hybrid" },
        resources: [
          defineResource<{ items: readonly string[] }>({
            key: "items.list",
            label: "Items",
            fallback: () => ({ items: ["fallback"] }),
          }),
        ],
      }),
      storage: createMemoryStorage(),
      getRoutePath: () => "/items",
      fetch: async () => {
        throw new Error("Network down")
      },
    })

    const value = await client.fetch<{ items: readonly string[] }>("items.list", "/api/items")

    expect(value.items).toEqual(["fallback"])
    expect(client.snapshot().records[0]?.sourceKind).toBe("fallback")
  })

  it("normalises Request inputs, validates schemas, and exports Markdown", async () => {
    const client = createMockPitClient({
      config: defineMockPitConfig({
        project: "schema-test",
        mode: { default: "live" },
        resources: [
          defineResource<{ ok: boolean }>({
            key: "health.check",
            label: "Health",
            schema: Schema.Struct({ ok: Schema.Boolean }),
          }),
        ],
      }),
      storage: createMemoryStorage(),
      getRoutePath: () => "/health",
      fetch: async () =>
        new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        }),
    })

    await client.fetch("health.check", new Request("https://example.test/api/health", { method: "POST" }))

    expect(client.snapshot().records[0]?.request?.method).toBe("POST")
    expect(client.exportMarkdown()).toContain("MockPit Route Audit")
  })

  it("tracks mode transitions, manual routes, scenarios, and transport state", () => {
    const client = createMockPitClient({
      config: defineMockPitConfig({
        project: "state-test",
        mode: { default: "mock" },
        scenarios: [
          defineScenario({
            key: "persona",
            label: "Persona",
            variants: [{ key: "buyer", label: "Buyer" }, { key: "operator", label: "Operator" }],
          }),
        ],
      }),
      storage: createMemoryStorage(),
    })

    client.setRoute("/orders", "/orders")
    client.setTransportState({ mockTransportActive: true })
    const transition = client.setMode("live")
    client.setScenario("persona", "operator")

    expect(transition.transportCleanupRequired).toBe(true)
    expect(client.snapshot().routePath).toBe("/orders")
    expect(client.snapshot().scenarios?.selected.persona).toBe("operator")
  })
})
