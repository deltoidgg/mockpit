// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"
import { createMockKitClient, createMemoryStorage } from "@mockkit/browser"
import { defineMockKitConfig, defineResource } from "@mockkit/core"
import { defineAllMockKitElements, mountMockKitDevtools } from "../index"

describe("@mockkit/devtools", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    window.localStorage.clear()
  })

  it("renders a framework-neutral devtools trigger and panel", () => {
    const client = createMockKitClient({
      config: defineMockKitConfig({
        project: "devtools-test",
        resources: [defineResource({ key: "ui.copy", label: "Copy" })],
      }),
      storage: createMemoryStorage(),
      getRoutePath: () => "/",
    })
    client.record({ resourceKey: "ui.copy", sourceKind: "hardcoded", reason: "Static copy." })

    const element = mountMockKitDevtools({ client, initialIsOpen: true })

    expect(element.shadowRoot?.textContent).toContain("MockKit")
    expect(element.shadowRoot?.textContent).toContain("hardcoded")
  })

  it("records custom element UI marks", () => {
    const client = createMockKitClient({
      config: defineMockKitConfig({
        project: "mark-test",
        resources: [defineResource({ key: "ui.copy", label: "Copy" })],
      }),
      storage: createMemoryStorage(),
      getRoutePath: () => "/",
    })
    defineAllMockKitElements()

    const mark = document.createElement("mockkit-mark")
    mark.setAttribute("data-resource-key", "ui.copy")
    mark.setAttribute("data-source-kind", "hardcoded")
    mark.textContent = "No customers yet."
    document.body.append(mark)

    expect(client.snapshot().records[0]?.resourceKey).toBe("ui.copy")
  })
})
