// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { defineMockKitConfig, defineResource } from "@mockkit/core"
import { createMockKitClient, createMemoryStorage } from "../index"

describe("@mockkit/browser", () => {
  it("records live API fetches and exposes a global snapshot", async () => {
    const client = createMockKitClient({
      config: defineMockKitConfig({
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
    expect(window.__MOCKKIT__?.snapshot().project).toBe("browser-test")
  })

  it("uses explicit fallback only when the current mode allows it", async () => {
    const client = createMockKitClient({
      config: defineMockKitConfig({
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
})
