import type { MockKitClient } from "@mockkit/browser"
import type { SourceKind } from "@mockkit/core"

const markSources = new Set<SourceKind>([
  "derived",
  "hardcoded",
  "authoredFallback",
  "fallback",
  "unknown",
])

export class MockKitMarkElement extends HTMLElement {
  client: MockKitClient | undefined
  private recordId: string | undefined
  private unsubscribe: (() => void) | undefined

  connectedCallback(): void {
    this.client = this.client ?? window.__MOCKKIT__?.client
    this.style.position = this.style.position || "relative"
    this.record()
    this.unsubscribe = this.client?.subscribe(() => this.applyHighlight())
    this.applyHighlight()
  }

  disconnectedCallback(): void {
    if (this.recordId) this.client?.remove(this.recordId)
    this.unsubscribe?.()
  }

  private record(): void {
    const client = this.client
    if (!client) return
    const resourceKey = this.dataset.resourceKey
    const sourceKind = this.dataset.sourceKind as SourceKind | undefined
    if (!resourceKey || !sourceKind || !markSources.has(sourceKind)) return

    const record = client.recordUiMark({
      resourceKey,
      sourceKind,
      label: this.dataset.label ?? resourceKey,
      reason: this.dataset.reason ?? "UI-authored provenance marker.",
      sectionId: this.dataset.sectionId,
    })
    this.recordId = record.id
  }

  private applyHighlight(): void {
    const mode = this.client?.getMode()
    const active = mode === "audit" || mode === "capture"
    if (!active) {
      this.style.outline = ""
      this.style.boxShadow = ""
      this.title = ""
      return
    }
    this.style.outline = "2px solid #f59e0b"
    this.style.outlineOffset = "2px"
    this.style.boxShadow = "0 0 0 4px rgba(245, 158, 11, 0.16)"
    this.title = `${this.dataset.label ?? this.dataset.resourceKey}: ${this.dataset.sourceKind}`
  }
}

export const defineMockKitMarkElement = (): void => {
  if (!customElements.get("mockkit-mark")) {
    customElements.define("mockkit-mark", MockKitMarkElement)
  }
}
