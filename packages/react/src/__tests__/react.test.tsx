// @vitest-environment jsdom

import React from "react"
import { createRoot } from "react-dom/client"
import { act } from "react"
import { describe, expect, it } from "vitest"
import { createMockPitClient, createMemoryStorage } from "@mockpit/browser"
import { defineMockPitConfig, defineResource } from "@mockpit/core"
import {
  AuditMark,
  AuditSection,
  MockPitProvider,
  useMockPitClient,
  useMockPitRecords,
} from "../index"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe("@mockpit/react", () => {
  it("provides hooks and records AuditMark lifecycle", async () => {
    const client = createMockPitClient({
      config: defineMockPitConfig({
        project: "react-test",
        resources: [defineResource({ key: "ui.copy", label: "Copy" })],
      }),
      storage: createMemoryStorage(),
      getRoutePath: () => "/",
    })
    const rootElement = document.createElement("div")
    document.body.append(rootElement)
    const root = createRoot(rootElement)

    function Probe() {
      const mockpit = useMockPitClient()
      const records = useMockPitRecords()
      return (
        <AuditSection id="demo">
          <button onClick={() => mockpit.setMode("audit")}>{records.length}</button>
          <AuditMark resourceKey="ui.copy" source="hardcoded" label="Copy">
            Copy
          </AuditMark>
        </AuditSection>
      )
    }

    await act(async () => {
      root.render(
        <MockPitProvider client={client}>
          <Probe />
        </MockPitProvider>,
      )
    })

    expect(client.snapshot().records[0]?.kind).toBe("uiMark")

    await act(async () => {
      root.unmount()
    })

    expect(client.snapshot().records[0]?.visibility).toBe("unmounted")
  })
})
