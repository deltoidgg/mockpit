/**
 * The "real" backend for the example, served by a Vite middleware. It is
 * deliberately behind the prototype: some endpoints are complete, some are
 * missing fields the mock has, one does not exist yet, and one exists only
 * here (no mock was ever written for it).
 */
import type { Plugin } from "vite"

const customers = [
  { id: 1, name: "Ada Lovelace", company: "Analytical Engines Ltd", status: "active", balance: 18250.5, joined: "2023-02-14T09:00:00Z" },
  { id: 2, name: "Grace Hopper", company: "Compiler Works", status: "active", balance: 9120, joined: "2022-11-03T09:00:00Z" },
  { id: 3, name: "Katherine Johnson", company: "Orbital Paths", status: "review", balance: 40400.75, joined: "2024-06-21T09:00:00Z" },
]

export const backend = (): Plugin => ({
  name: "example-backend",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const url = new URL(request.url ?? "/", "http://localhost")
      const json = (status: number, body: unknown) => {
        response.statusCode = status
        response.setHeader("content-type", "application/json")
        response.end(JSON.stringify(body))
      }
      if (!url.pathname.startsWith("/api/")) return next()
      if (url.pathname === "/api/me") return json(200, { user: { name: "Sam Rivera", role: "Relationship manager" } })
      if (url.pathname === "/api/customers") return json(200, { customers })
      const detail = /^\/api\/customers\/(\d+)$/.exec(url.pathname)
      if (detail) {
        const customer = customers.find((candidate) => candidate.id === Number(detail[1]))
        // Real detail has no email, no address, and no risk notes yet.
        return customer ? json(200, { customer: { ...customer, tags: [] } }) : json(404, { error: "not found" })
      }
      // KYC and notes are not built yet.
      return json(501, { error: "not implemented" })
    })
  },
})
