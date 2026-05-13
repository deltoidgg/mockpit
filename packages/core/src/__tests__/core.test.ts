import { describe, expect, it } from "vitest"
import {
  createAuditRecord,
  createInitialScenarioState,
  createRouteAuditExport,
  defineCapturePolicy,
  defineMockPitConfig,
  defineResource,
  defineScenario,
  defineSection,
  evaluateCapture,
  formatSourceMix,
  routeAuditToMarkdown,
  redactRecord,
  setScenarioVariant,
  summariseRoute,
} from "../index"

describe("@mockpit/core", () => {
  it("summarises route source distribution and highest risk", () => {
    const config = defineMockPitConfig({
      project: "test",
      resources: [
        defineResource({ key: "customers.list", label: "Customers" }),
        defineResource({ key: "ui.copy", label: "Copy" }),
      ],
      sections: [
        defineSection({
          route: "/customers",
          id: "customers.table",
          label: "Customers table",
          resources: ["customers.list", "ui.copy"],
        }),
      ],
    })
    const records = [
      createAuditRecord({
        routePath: "/customers",
        resourceKey: "customers.list",
        sourceKind: "api",
        status: "ready",
      }),
      createAuditRecord({
        routePath: "/customers",
        resourceKey: "ui.copy",
        sourceKind: "hardcoded",
        status: "warning",
      }),
    ]

    const summary = summariseRoute(config, records, "/customers", "audit")

    expect(summary.highestRisk).toBe("hardcoded")
    expect(summary.sourceCounts.api).toBe(1)
    expect(summary.sourceCounts.hardcoded).toBe(1)
    expect(formatSourceMix(summary.sourceCounts)).toContain("1 api")
    expect(summary.sections[0]?.status).toBe("warning")
  })

  it("blocks capture when required resources are not live enough", () => {
    const config = defineMockPitConfig({
      project: "test",
      resources: [defineResource({ key: "customers.evidence", label: "Evidence" })],
      capture: [
        defineCapturePolicy({
          route: "/customers/123",
          required: [{ resourceKey: "customers.evidence", allowedSources: ["api"], minCoverage: 0.7 }],
          blockOn: ["fallback", "empty", "unknown"],
        }),
      ],
    })
    const records = [
      createAuditRecord({
        routePath: "/customers/123",
        resourceKey: "customers.evidence",
        sourceKind: "empty",
        status: "warning",
        fieldCoverage: { present: 0, total: 4 },
      }),
    ]

    const capture = evaluateCapture(config, "/customers/123", records)

    expect(capture.status).toBe("blocked")
    expect(capture.blockers.join(" ")).toContain("customers.evidence")
  })

  it("redacts metadata by default", () => {
    const record = createAuditRecord({
      resourceKey: "secret.customer",
      sourceKind: "api",
      status: "ready",
      metadata: { email: "person@example.com" },
    })

    expect(redactRecord(record)).not.toHaveProperty("metadata")
  })

  it("creates scenario state separately from source provenance", () => {
    const config = defineMockPitConfig({
      project: "test",
      scenarios: [
        defineScenario({
          key: "persona",
          label: "Persona",
          defaultVariant: "buyer",
          variants: [{ key: "buyer", label: "Buyer" }, { key: "operator", label: "Operator" }],
        }),
      ],
    })

    const state = setScenarioVariant(createInitialScenarioState(config, "now"), "persona", "operator", "later")

    expect(state.selected.persona).toBe("operator")
    expect(state.updatedAt).toBe("later")
  })

  it("exports route audits and Markdown from the shared core", () => {
    const config = defineMockPitConfig({
      project: "test",
      resources: [defineResource({ key: "customers.list", label: "Customers" })],
    })
    const records = [
      createAuditRecord({
        routePath: "/customers",
        resourceKey: "customers.list",
        sourceKind: "api",
        status: "ready",
      }),
    ]

    const routeExport = createRouteAuditExport({
      config,
      routePath: "/customers",
      mode: "live",
      records,
      generatedAt: "2026-05-13T00:00:00.000Z",
    })

    expect(routeExport.records).toHaveLength(1)
    expect(routeAuditToMarkdown(routeExport)).toContain("MockPit Route Audit")
  })
})
