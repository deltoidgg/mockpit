import type { MockPitClient } from "@mockpit/browser"
import { formatSourceMix } from "@mockpit/core"

export class MockPitSectionElement extends HTMLElement {
  client: MockPitClient | undefined
  private unsubscribe: (() => void) | undefined

  connectedCallback(): void {
    this.client = this.client ?? window.__MOCKPIT__?.client
    this.unsubscribe = this.client?.subscribe(() => this.applyHighlight())
    this.applyHighlight()
  }

  disconnectedCallback(): void {
    this.unsubscribe?.()
  }

  private applyHighlight(): void {
    const client = this.client
    const mode = client?.getMode()
    const active = mode === "audit" || mode === "capture"
    const sectionId = this.dataset.sectionId ?? this.dataset.mockpitSection
    if (!active || !sectionId || !client) {
      this.style.outline = ""
      this.title = ""
      return
    }
    const section = client.snapshot().summary.sections.find((candidate) => candidate.id === sectionId)
    if (!section) return
    this.style.outline = "1px dashed #34d399"
    this.style.outlineOffset = "4px"
    this.title = `${section.label}: ${formatSourceMix(section.sourceCounts)}`
  }
}

export const defineMockPitSectionElement = (): void => {
  if (!customElements.get("mockpit-section")) {
    customElements.define("mockpit-section", MockPitSectionElement)
  }
}
