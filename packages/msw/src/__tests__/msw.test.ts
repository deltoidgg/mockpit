import { describe, expect, it } from "vitest"
import { createMockKitClient, createMemoryStorage } from "@mockkit/browser"
import { defineMockKitConfig, defineResource } from "@mockkit/core"
import { cleanupMswWorkers, isCriticalRequest, withMockKitHandler } from "../index"

describe("@mockkit/msw", () => {
  it("records a mock source when a decorated handler succeeds", async () => {
    const client = createMockKitClient({
      config: defineMockKitConfig({
        project: "msw-test",
        resources: [defineResource({ key: "customers.list", label: "Customers" })],
      }),
      storage: createMemoryStorage(),
      getRoutePath: () => "/customers",
    })

    const handler = withMockKitHandler(
      "customers.list",
      (context: { request: Request }) => {
        expect(context.request.url).toContain("/api/customers")
        return new Response(JSON.stringify({ customers: [] }))
      },
      { mockkit: client },
    )
    await handler({ request: new Request("https://example.test/api/customers") })

    expect(client.snapshot().records[0]?.sourceKind).toBe("mock")
  })

  it("matches critical request routes without making every request critical", () => {
    expect(isCriticalRequest({ method: "GET", url: "https://example.test/api/customers" }, ["GET /api/customers"])).toBe(
      true,
    )
    expect(isCriticalRequest({ method: "GET", url: "https://example.test/favicon.ico" }, ["GET /api/customers"])).toBe(
      false,
    )
  })

  it("is safe when service workers are unavailable", async () => {
    await expect(cleanupMswWorkers()).resolves.toEqual({ checked: 0, unregistered: 0 })
  })
})
