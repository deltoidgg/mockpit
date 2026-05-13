import React from "react"
import { createRoot } from "react-dom/client"
import { createMockPitClient } from "@mockpit/browser"
import { defineCapturePolicy, defineMockPitConfig, defineResource, defineSection } from "@mockpit/core"
import {
  AuditMark,
  AuditSection,
  MockPitDevtools,
  MockPitProvider,
  useMockPitClient,
  useRouteProvenance,
} from "@mockpit/react"
import "./styles.css"

const config = defineMockPitConfig({
  project: "mockpit-react-basic",
  mode: { default: "live" },
  resources: [
    defineResource<{ orders: readonly { id: string; value: number }[] }>({
      key: "orders.list",
      label: "Orders list",
      assess: (data) => ({
        empty: data.orders.length === 0,
        coverage: { present: data.orders.length > 0 ? 1 : 0, total: 1 },
      }),
      fallback: () => ({ orders: [{ id: "fallback-order", value: 1200 }] }),
      fallbackSource: "src/fixtures/orders.ts",
      remediation: "Implement GET /api/orders with non-empty order data.",
    }),
    defineResource({ key: "ui.orders.emptyState", label: "Orders empty state", criticality: "presentation" }),
  ],
  sections: [
    defineSection({
      route: "/",
      id: "orders.table",
      label: "Orders table",
      resources: ["orders.list", "ui.orders.emptyState"],
    }),
  ],
  capture: [
    defineCapturePolicy({
      route: "/",
      required: [{ resourceKey: "orders.list", allowedSources: ["api"], minCoverage: 0.8 }],
      blockOn: ["mock", "fallback", "error", "unknown"],
    }),
  ],
})

const mockpit = createMockPitClient({
  config,
  fetch: async () =>
    new Response(JSON.stringify({ orders: [{ id: "ord_1", value: 4200 }] }), {
      headers: { "content-type": "application/json" },
    }),
})

function App() {
  const client = useMockPitClient()
  const summary = useRouteProvenance()
  return (
    <>
      <main>
        <h1>MockPit React Example</h1>
        <p>Route status: {summary.status}</p>
        <button onClick={() => void client.fetch("orders.list", "/api/orders")}>Load orders</button>
        <button onClick={() => client.setMode("audit")}>Audit mode</button>
        <AuditSection id="orders.table">
          <section className="card">
            <h2>Orders</h2>
            <AuditMark
              resourceKey="ui.orders.emptyState"
              source="hardcoded"
              label="Orders empty state"
              reason="Static UI copy for the prototype."
            >
              No orders need review.
            </AuditMark>
          </section>
        </AuditSection>
      </main>
      <MockPitDevtools initialIsOpen={false} />
    </>
  )
}

createRoot(document.querySelector("#root")!).render(
  <MockPitProvider client={mockpit}>
    <App />
  </MockPitProvider>,
)
