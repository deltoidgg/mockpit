// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"
import { createMockPitClient, createMemoryStorage } from "@mockpit/browser"
import { defineMockPitConfig, defineResource } from "@mockpit/core"
import { defineAllMockPitElements, mountMockPitDevtools } from "../index"

describe("@mockpit/devtools", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    window.localStorage.clear()
  })

  it("renders a framework-neutral devtools trigger and panel", () => {
    const client = createMockPitClient({
      config: defineMockPitConfig({
        project: "devtools-test",
        resources: [defineResource({ key: "ui.copy", label: "Copy" })],
      }),
      storage: createMemoryStorage(),
      getRoutePath: () => "/",
    })
    client.record({ resourceKey: "ui.copy", sourceKind: "hardcoded", reason: "Static copy." })

    const element = mountMockPitDevtools({ client, initialIsOpen: true })

    expect(element.shadowRoot?.textContent).toContain("MockPit")
    expect(element.shadowRoot?.textContent).toContain("Hardcoded")
  })

  it("records custom element UI marks", () => {
    const client = createMockPitClient({
      config: defineMockPitConfig({
        project: "mark-test",
        resources: [defineResource({ key: "ui.copy", label: "Copy" })],
      }),
      storage: createMemoryStorage(),
      getRoutePath: () => "/",
    })
    defineAllMockPitElements()

    const mark = document.createElement("mockpit-mark")
    mark.setAttribute("data-resource-key", "ui.copy")
    mark.setAttribute("data-source-kind", "hardcoded")
    mark.textContent = "No customers yet."
    document.body.append(mark)

    expect(client.snapshot().records[0]?.resourceKey).toBe("ui.copy")
  })

  it("renders beta tabs and export actions", () => {
    const client = createMockPitClient({
      config: defineMockPitConfig({
        project: "tabs-test",
        resources: [defineResource({ key: "items.list", label: "Items" })],
      }),
      storage: createMemoryStorage(),
      getRoutePath: () => "/",
    })
    client.recordResource({
      resourceKey: "items.list",
      sourceKind: "fallback",
      fallbackSource: "fixtures/items.ts",
      reason: "Live API was unavailable.",
    })

    const element = mountMockPitDevtools({ client, initialIsOpen: true })

    expect(element.shadowRoot?.textContent).toContain("Fallbacks")
    expect(element.shadowRoot?.textContent).toContain("Scenarios")
    expect(element.shadowRoot?.textContent).toContain("Export")

    const exportTab = Array.from(element.shadowRoot?.querySelectorAll<HTMLButtonElement>("[data-tab]") ?? []).find(
      (button) => button.dataset.tab === "Export",
    )
    exportTab?.click()
    expect(element.shadowRoot?.textContent).toContain("Copy Markdown")
    expect(element.shadowRoot?.textContent).toContain("mockpit audit")
  })

  it("supports keyboard tablist navigation", () => {
    const client = createMockPitClient({
      config: defineMockPitConfig({
        project: "keyboard-test",
        resources: [defineResource({ key: "items.list", label: "Items" })],
      }),
      storage: createMemoryStorage(),
      getRoutePath: () => "/",
    })

    const element = mountMockPitDevtools({ client, initialIsOpen: true })
    const overviewTab = Array.from(
      element.shadowRoot?.querySelectorAll<HTMLButtonElement>("[data-tab]") ?? [],
    ).find((button) => button.dataset.tab === "Overview")

    overviewTab?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))

    const selected = element.shadowRoot?.querySelector<HTMLButtonElement>("[data-tab][aria-selected='true']")
    expect(selected?.dataset.tab).toBe("Route")
  })
})
