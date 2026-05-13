import { describe, expect, it } from "vitest"
import {
  createAuditRecord,
  defineCapturePolicy,
  defineMockKitConfig,
  defineResource,
  defineSection,
  evaluateCapture,
  formatSourceMix,
  redactRecord,
  summariseRoute,
} from "../index"

describe("@mockkit/core", () => {
  it("summarises route source distribution and highest risk", () => {
    const config = defineMockKitConfig({
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
    const config = defineMockKitConfig({
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
})
