import { http, HttpResponse } from "msw"
import { createMockPitClient } from "@mockpit/browser"
import { defineMockPitConfig, defineResource, defineScenario } from "@mockpit/core"
import { defineAllMockPitElements, mountMockPitDevtools } from "@mockpit/devtools"
import { setupMockPitWorker, withMockPitHandler } from "@mockpit/msw/browser"
import "./styles.css"

const config = defineMockPitConfig({
  project: "mockpit-msw",
  mode: { default: "mock" },
  resources: [defineResource({ key: "products.list", label: "Products list" })],
  scenarios: [
    defineScenario({
      key: "persona",
      label: "Persona",
      defaultVariant: "buyer",
      variants: [
        { key: "buyer", label: "Buyer" },
        { key: "operator", label: "Operator" },
      ],
    }),
  ],
})

const mockpit = createMockPitClient({ config })

defineAllMockPitElements()
mountMockPitDevtools({ client: mockpit, initialIsOpen: true })

const worker = await setupMockPitWorker({
  mockpit,
  critical: ["GET /api/products"],
  handlers: [
    http.get(
      "/api/products",
      withMockPitHandler(
        "products.list",
        () => HttpResponse.json({ products: [{ id: "mock-product", name: "Mock product" }] }),
        { mockpit, method: "GET", url: "/api/products", scenario: "buyer" },
      ),
    ),
  ],
})

await worker.start({ quiet: true })

document.querySelector("#app")!.innerHTML = `
  <h1>MockPit MSW Example</h1>
  <button id="load">Load mocked products</button>
  <pre id="out">Waiting</pre>
`

document.querySelector("#load")?.addEventListener("click", async () => {
  const response = await fetch("/api/products")
  document.querySelector("#out")!.textContent = JSON.stringify(await response.json(), null, 2)
})
