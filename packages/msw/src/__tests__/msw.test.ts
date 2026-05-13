import { describe, expect, it } from "vitest"
import { createMockPitClient, createMemoryStorage } from "@mockpit/browser"
import { defineMockPitConfig, defineResource } from "@mockpit/core"
import { cleanupMswWorkers, isCriticalRequest, withMockPitHandler } from "../index"

describe("@mockpit/msw", () => {
  it("records a mock source when a decorated handler succeeds", async () => {
    const client = createMockPitClient({
      config: defineMockPitConfig({
        project: "msw-test",
        resources: [defineResource({ key: "customers.list", label: "Customers" })],
      }),
      storage: createMemoryStorage(),
      getRoutePath: () => "/customers",
    })

    const handler = withMockPitHandler(
      "customers.list",
      (context: { request: Request }) => {
        expect(context.request.url).toContain("/api/customers")
        return new Response(JSON.stringify({ customers: [] }))
      },
      { mockpit: client },
    )
    const response = await handler({ request: new Request("https://example.test/api/customers") })

    expect(client.snapshot().records[0]?.sourceKind).toBe("mock")
    expect(response.headers.get("x-mockpit-source")).toBe("mock")
    expect(client.getTransportState().handlers?.[0]?.resourceKey).toBe("customers.list")
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
