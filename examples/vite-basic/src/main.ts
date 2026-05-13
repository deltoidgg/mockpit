import "./styles.css"
import { createMockKitClient } from "@mockkit/browser"
import { defineCapturePolicy, defineMockKitConfig, defineResource, defineSection } from "@mockkit/core"
import { defineAllMockKitElements, mountMockKitDevtools } from "@mockkit/devtools"

interface CustomersResponse {
  readonly customers: readonly { readonly id: string; readonly name: string; readonly score: number }[]
}

const config = defineMockKitConfig({
  project: "mockkit-vite-basic",
  mode: { default: "mock" },
  resources: [
    defineResource<CustomersResponse>({
      key: "customers.list",
      label: "Customer list",
      match: { method: "GET", url: "/api/customers" },
      assess: (data) => ({
        empty: data.customers.length === 0,
        reason: data.customers.length === 0 ? "No customers returned." : undefined,
        coverage: { present: data.customers.length > 0 ? 1 : 0, total: 1 },
      }),
      fallback: () => ({ customers: [{ id: "fallback", name: "Fallback Customer", score: 61 }] }),
    }),
    defineResource({
      key: "customers.mock",
      label: "Mocked customer profile",
      match: { method: "GET", url: "/api/mock-profile" },
    }),
    defineResource<{ recommendations: readonly string[] }>({
      key: "customers.recommendations",
      label: "Recommendations",
      match: { method: "GET", url: "/api/recommendations" },
      assess: (data) => ({
        empty: data.recommendations.length === 0,
        coverage: { present: data.recommendations.length, total: 3 },
      }),
      fallback: () => ({ recommendations: ["Use fallback recommendation", "Confirm live API contract"] }),
    }),
    defineResource<{ claims: readonly string[] }>({
      key: "customers.evidence",
      label: "Evidence claims",
      match: { method: "GET", url: "/api/evidence" },
      assess: (data) => ({
        empty: data.claims.length === 0,
        reason: "Live evidence endpoint returned no claims.",
        coverage: { present: data.claims.length, total: 4 },
      }),
    }),
    defineResource<{ supported: boolean }>({
      key: "customers.unsupported",
      label: "Unsupported backend capability",
      match: { method: "GET", url: "/api/unsupported" },
      assess: (data) => ({
        unsupported: !data.supported,
        reason: "The backend reports this capability is not available yet.",
      }),
    }),
    defineResource({
      key: "customers.error",
      label: "Erroring endpoint",
      match: { method: "GET", url: "/api/error" },
    }),
    defineResource({
      key: "ui.customers.scoreDelta",
      label: "Score delta",
      criticality: "presentation",
    }),
    defineResource({
      key: "ui.customers.emptyState",
      label: "Customer empty state copy",
      criticality: "presentation",
    }),
    defineResource({
      key: "ui.customers.narrative",
      label: "Fallback narrative",
      criticality: "presentation",
    }),
  ],
  sections: [
    defineSection({
      route: "/",
      id: "customers.demo",
      label: "Customer demo surface",
      resources: [
        "customers.list",
        "customers.mock",
        "customers.recommendations",
        "customers.evidence",
        "customers.unsupported",
        "customers.error",
        "ui.customers.scoreDelta",
        "ui.customers.emptyState",
        "ui.customers.narrative",
      ],
    }),
  ],
  capture: [
    defineCapturePolicy({
      route: "/",
      name: "Homepage capture proof",
      required: [
        { resourceKey: "customers.list", allowedSources: ["api"], minCoverage: 0.8 },
        { resourceKey: "customers.evidence", allowedSources: ["api"], minCoverage: 0.7 },
      ],
      blockOn: ["mock", "fallback", "unsupported", "error", "unknown"],
    }),
  ],
})

const mockkit = createMockKitClient({
  config,
  fetch: fakeFetch,
})

defineAllMockKitElements()
mountMockKitDevtools({ client: mockkit, position: "bottom-left", panelPosition: "right" })

const app = document.querySelector<HTMLDivElement>("#app")
if (!app) throw new Error("App root missing.")

app.innerHTML = `
  <h1>MockKit Vite Example</h1>
  <p>This page deliberately records live, mock, fallback, empty, unsupported, error, derived, hardcoded, authored fallback, and unknown sources.</p>
  <div class="layout">
    <aside class="panel">
      <h2>Record sources</h2>
      <button data-action="api">Live API</button>
      <button data-action="mock">Mock response</button>
      <button data-action="fallback">Fallback fixture</button>
      <button data-action="empty">Empty live response</button>
      <button data-action="unsupported">Unsupported capability</button>
      <button data-action="error">Error response</button>
      <button data-action="unknown">Unknown source</button>
      <button data-action="audit">Switch to audit mode</button>
      <button data-action="capture">Switch to capture mode</button>
    </aside>
    <section class="workspace">
      <h2>Customer workspace</h2>
      <div class="cards">
        <div class="card">
          <strong>Derived score delta</strong>
          <p><mockkit-mark data-resource-key="ui.customers.scoreDelta" data-source-kind="derived" data-label="Score delta" data-reason="Computed in the browser from current and previous scores.">+12%</mockkit-mark></p>
        </div>
        <div class="card">
          <strong>Hardcoded empty state</strong>
          <p><mockkit-mark data-resource-key="ui.customers.emptyState" data-source-kind="hardcoded" data-label="Customer empty state copy">No customers match this filter.</mockkit-mark></p>
        </div>
        <div class="card">
          <strong>Authored fallback narrative</strong>
          <p><mockkit-mark data-resource-key="ui.customers.narrative" data-source-kind="authoredFallback" data-label="Fallback narrative">Customer impact summary will appear when live evidence exists.</mockkit-mark></p>
        </div>
      </div>
      <h2>Output</h2>
      <div class="output" id="output">Select a source action.</div>
    </section>
  </div>
`

const output = document.querySelector<HTMLDivElement>("#output")

document.addEventListener("click", async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]")
  if (!button) return
  const action = button.dataset.action
  try {
    if (action === "api") write(await mockkit.fetch("customers.list", "/api/customers"))
    if (action === "mock") write(await mockkit.fetch("customers.mock", "/api/mock-profile"))
    if (action === "fallback") {
      mockkit.setMode("hybrid")
      write(await mockkit.fetch("customers.recommendations", "/api/recommendations"))
    }
    if (action === "empty") write(await mockkit.fetch("customers.evidence", "/api/evidence"))
    if (action === "unsupported") write(await mockkit.fetch("customers.unsupported", "/api/unsupported"))
    if (action === "error") await mockkit.fetch("customers.error", "/api/error")
    if (action === "unknown") {
      mockkit.record({
        resourceKey: "unknown.uninstrumented",
        label: "Uninstrumented lookup",
        sourceKind: "unknown",
        reason: "A prototype lookup happened outside the resource map.",
      })
      write({ unknown: true })
    }
    if (action === "audit") {
      mockkit.setMode("audit")
      write({ mode: "audit" })
    }
    if (action === "capture") {
      mockkit.setMode("capture")
      write({ mode: "capture" })
    }
  } catch (error) {
    write({ error: error instanceof Error ? error.message : String(error) })
  }
})

function write(value: unknown): void {
  if (!output) return
  output.textContent = JSON.stringify(value, null, 2)
}

async function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input)
  if (url.endsWith("/api/customers")) {
    return json({ customers: [{ id: "cust_1", name: "Live Customer", score: 82 }] })
  }
  if (url.endsWith("/api/mock-profile")) {
    return json(
      { id: "mock_1", name: "Mock Customer" },
      { headers: { "x-mockkit-source": "mock" } },
    )
  }
  if (url.endsWith("/api/recommendations")) {
    throw new Error("Recommendations API is not reachable.")
  }
  if (url.endsWith("/api/evidence")) return json({ claims: [] })
  if (url.endsWith("/api/unsupported")) return json({ supported: false })
  if (url.endsWith("/api/error")) throw new Error("Simulated network failure.")
  return json({ ok: true })
}

function json(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  })
}
