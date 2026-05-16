import type { MockPitClient } from "@mockpit/browser"
import type { SourceKind } from "@mockpit/core"

const markSources = new Set<SourceKind>([
  "derived",
  "hardcoded",
  "authoredFallback",
  "fallback",
  "unknown",
])

export class MockPitMarkElement extends HTMLElement {
  client: MockPitClient | undefined
  private recordId: string | undefined
  private unsubscribe: (() => void) | undefined

  connectedCallback(): void {
    this.client = this.client ?? window.__MOCKPIT__?.client
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
    const resourceKey =
      this.dataset.resourceKey ?? this.dataset.mockpitKey ?? this.dataset.provenanceKey
    const sourceKind = (this.dataset.sourceKind ??
      this.dataset.mockpitSource ??
      this.dataset.provenanceSource) as SourceKind | undefined
    if (!resourceKey || !sourceKind || !markSources.has(sourceKind)) return

    const record = client.recordUiMark({
      resourceKey,
      sourceKind,
      label: this.dataset.label ?? this.dataset.mockpitLabel ?? this.dataset.provenanceLabel ?? resourceKey,
      reason: this.dataset.reason ?? "UI-authored provenance marker.",
      sectionId: this.dataset.sectionId,
    })
    this.recordId = record.id
  }

  private applyHighlight(): void {
    const mode = this.client?.getMode()
    const active = mode === "audit" || mode === "capture"
    const highlighted = document.documentElement.dataset.mockpitHighlightSource ?? "all"
    const sourceKind =
      this.dataset.sourceKind ?? this.dataset.mockpitSource ?? this.dataset.provenanceSource ?? "unknown"
    if (!active) {
      this.style.outline = ""
      this.style.boxShadow = ""
      this.title = ""
      return
    }
    if (highlighted !== "all" && highlighted !== sourceKind) {
      this.style.outline = ""
      this.style.boxShadow = ""
      return
    }
    this.style.outline = "2px solid #34d399"
    this.style.outlineOffset = "2px"
    this.style.boxShadow = "0 0 0 4px rgba(52, 211, 153, 0.15)"
    this.title = `${this.dataset.label ?? this.dataset.resourceKey}: ${sourceKind}`
  }
}

export const defineMockPitMarkElement = (): void => {
  if (!customElements.get("mockpit-mark")) {
    customElements.define("mockpit-mark", MockPitMarkElement)
  }
}

export const registerAttributeMarks = (client?: MockPitClient): void => {
  const actualClient = client ?? window.__MOCKPIT__?.client
  if (!actualClient) return
  document.querySelectorAll<HTMLElement>("[data-mockpit-key], [data-provenance-key]").forEach((element) => {
    if (element instanceof MockPitMarkElement) return
    const resourceKey = element.dataset.mockpitKey ?? element.dataset.provenanceKey
    const sourceKind = (element.dataset.mockpitSource ?? element.dataset.provenanceSource) as
      | SourceKind
      | undefined
    if (!resourceKey || !sourceKind || !markSources.has(sourceKind)) return
    actualClient.recordUiMark({
      resourceKey,
      sourceKind,
      label: element.dataset.mockpitLabel ?? element.dataset.provenanceLabel ?? resourceKey,
      reason: element.dataset.mockpitReason ?? element.dataset.provenanceReason ?? "DOM attribute provenance marker.",
    })
  })
}
