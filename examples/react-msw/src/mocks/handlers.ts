import { http, HttpResponse, delay } from "msw"

const customers = [
  { id: 1, name: "Ada Lovelace", company: "Analytical Engines Ltd", status: "active", balance: 18250.5, joined: "2023-02-14T09:00:00Z" },
  { id: 2, name: "Grace Hopper", company: "Compiler Works", status: "active", balance: 9120, joined: "2022-11-03T09:00:00Z" },
  { id: 3, name: "Katherine Johnson", company: "Orbital Paths", status: "review", balance: 40400.75, joined: "2024-06-21T09:00:00Z" },
  { id: 4, name: "Mary Jackson", company: "Wind Tunnel Co", status: "active", balance: 2210, joined: "2025-01-09T09:00:00Z" },
]

export const handlers = [
  http.get("/api/customers", async () => {
    await delay(120)
    return HttpResponse.json({ customers })
  }),
  http.get("/api/customers/:id", async ({ params }) => {
    await delay(120)
    const customer = customers.find((candidate) => candidate.id === Number(params["id"])) ?? customers[0]!
    return HttpResponse.json({
      customer: {
        ...customer,
        email: `${customer.name.split(" ")[0]!.toLowerCase()}@example.com`,
        address: { line1: "12 Babbage Row", city: "London", postcode: "N1 9GU" },
        tags: ["priority", "q3 review"],
        riskNotes: "Exposure concentrated in one supplier.",
      },
    })
  }),
  http.get("/api/customers/:id/kyc", async () => {
    await delay(200)
    return HttpResponse.json({
      status: "in progress",
      documents: [
        { id: "doc-1", kind: "Passport", expiresAt: "2029-04-30" },
        { id: "doc-2", kind: "Proof of address", expiresAt: "2026-12-01" },
      ],
    })
  }),
  http.post("/api/customers/:id/notes", async ({ request }) => {
    const body = (await request.json()) as { text: string }
    return HttpResponse.json({ id: `note-${Date.now()}`, text: body.text, createdAt: new Date().toISOString() })
  }),
]
