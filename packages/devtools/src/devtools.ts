import type { MockKitClient } from "@mockkit/browser"
import {
  formatSourceMix,
  sourceKindLabels,
  statusLabels,
  type AuditRecord,
  type MockKitSnapshot,
  type ProvenanceMode,
} from "@mockkit/core"
import { devtoolsStyles } from "./styles"

export interface MountMockKitDevtoolsOptions {
  readonly client?: MockKitClient
  readonly initialIsOpen?: boolean
  readonly position?: "bottom-left" | "bottom-right"
  readonly panelPosition?: "left" | "right"
}

const tabs = ["Overview", "Route", "Resources", "UI Marks", "Capture", "Export"] as const
type Tab = (typeof tabs)[number]

export class MockKitDevtoolsElement extends HTMLElement {
  client: MockKitClient | undefined
  private isOpen = false
  private selectedTab: Tab = "Overview"
  private position: "bottom-left" | "bottom-right" = "bottom-left"
  private panelPosition: "left" | "right" = "right"
  private unsubscribe: (() => void) | undefined
  private readonly keyHandler = (event: KeyboardEvent) => {
    if (event.altKey && event.shiftKey && event.code === "KeyP") {
      this.setOpen(!this.isOpen)
    }
  }

  connectedCallback(): void {
    this.client = this.client ?? window.__MOCKKIT__?.client
    this.position = readPosition(this.getAttribute("position"), "bottom-left")
    this.panelPosition = readPanelPosition(this.getAttribute("panel-position"), "right")
    const initial = this.getAttribute("initial-is-open")
    this.isOpen = initial === "true" || this.readOpenState()
    this.attachShadow({ mode: "open" })
    this.unsubscribe = this.client?.subscribe(() => this.render())
    window.addEventListener("keydown", this.keyHandler)
    this.render()
  }

  disconnectedCallback(): void {
    this.unsubscribe?.()
    window.removeEventListener("keydown", this.keyHandler)
  }

  setClient(client: MockKitClient): void {
    this.client = client
    this.unsubscribe?.()
    this.unsubscribe = client.subscribe(() => this.render())
    this.render()
  }

  private setOpen(next: boolean): void {
    this.isOpen = next
    this.writeOpenState()
    this.render()
  }

  private render(): void {
    if (!this.shadowRoot) return
    const snapshot = this.client?.snapshot()
    this.shadowRoot.innerHTML = `
      <style>${devtoolsStyles}</style>
      ${this.renderTrigger(snapshot)}
      ${this.isOpen ? this.renderPanel(snapshot) : ""}
    `
    this.bindEvents()
  }

  private renderTrigger(snapshot: MockKitSnapshot | undefined): string {
    const label = snapshot
      ? `MockKit · ${capitalise(snapshot.mode)} · ${
          snapshot.summary.capture?.status === "blocked"
            ? "Blocked"
            : formatSourceMix(snapshot.summary.sourceCounts)
        }`
      : "MockKit · No client"

    return `<button class="trigger ${this.position}" type="button" data-action="toggle">${escapeHtml(
      label,
    )}</button>`
  }

  private renderPanel(snapshot: MockKitSnapshot | undefined): string {
    return `
      <section class="panel ${this.panelPosition}" role="complementary" aria-label="MockKit devtools">
        <header class="header">
          <div class="title">
            <span>MockKit</span>
            <span class="subtitle">${escapeHtml(snapshot?.routePath ?? "No client connected")}</span>
          </div>
          <button class="close" type="button" data-action="toggle">Close</button>
        </header>
        <nav class="tabs" role="tablist">
          ${tabs
            .map(
              (tab) =>
                `<button class="tab" type="button" role="tab" aria-selected="${
                  tab === this.selectedTab
                }" data-tab="${tab}">${tab}</button>`,
            )
            .join("")}
        </nav>
        <main class="content">
          ${snapshot ? this.renderTab(snapshot) : "<p>No MockKit client is available.</p>"}
        </main>
      </section>
    `
  }

  private renderTab(snapshot: MockKitSnapshot): string {
    switch (this.selectedTab) {
      case "Route":
        return renderRoute(snapshot)
      case "Resources":
        return renderResources(snapshot)
      case "UI Marks":
        return renderUiMarks(snapshot)
      case "Capture":
        return renderCapture(snapshot)
      case "Export":
        return renderExport(this.client)
      default:
        return renderOverview(snapshot)
    }
  }

  private bindEvents(): void {
    this.shadowRoot?.querySelectorAll<HTMLElement>("[data-action='toggle']").forEach((button) => {
      button.addEventListener("click", () => this.setOpen(!this.isOpen))
    })

    this.shadowRoot?.querySelectorAll<HTMLElement>("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        this.selectedTab = button.dataset.tab as Tab
        this.render()
      })
    })

    this.shadowRoot?.querySelectorAll<HTMLElement>("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        this.client?.setMode(button.dataset.mode as ProvenanceMode)
        this.render()
      })
    })

    this.shadowRoot?.querySelector<HTMLElement>("[data-copy-json]")?.addEventListener("click", () => {
      const json = this.client?.exportJson()
      if (json && navigator.clipboard) void navigator.clipboard.writeText(json)
    })
  }

  private readOpenState(): boolean {
    const key = this.openStateKey()
    if (!key) return false
    return window.localStorage.getItem(key) === "true"
  }

  private writeOpenState(): void {
    const key = this.openStateKey()
    if (!key) return
    window.localStorage.setItem(key, String(this.isOpen))
  }

  private openStateKey(): string | undefined {
    return this.client ? `${this.client.config.project}.mockkit.devtools.open` : undefined
  }
}

export const defineMockKitElements = (): void => {
  if (!customElements.get("mockkit-devtools")) {
    customElements.define("mockkit-devtools", MockKitDevtoolsElement)
  }
}

export const mountMockKitDevtools = (
  options: MountMockKitDevtoolsOptions = {},
): MockKitDevtoolsElement => {
  defineMockKitElements()
  const element = document.createElement("mockkit-devtools") as MockKitDevtoolsElement
  if (options.client) element.client = options.client
  if (typeof options.initialIsOpen === "boolean") {
    element.setAttribute("initial-is-open", String(options.initialIsOpen))
  }
  if (options.position) element.setAttribute("position", options.position)
  if (options.panelPosition) element.setAttribute("panel-position", options.panelPosition)
  document.body.append(element)
  return element
}

const renderOverview = (snapshot: MockKitSnapshot): string => `
  <div class="grid">
    ${metric("Mode", capitalise(snapshot.mode))}
    ${metric("Status", statusLabels[snapshot.summary.status])}
    ${metric("Source mix", formatSourceMix(snapshot.summary.sourceCounts))}
    ${metric("Highest risk", sourceKindLabels[snapshot.summary.highestRisk])}
  </div>
  <div class="mode-row">
    ${(["mock", "hybrid", "live", "audit", "capture"] as const)
      .map(
        (mode) =>
          `<button class="mode ${mode === snapshot.mode ? "active" : ""}" type="button" data-mode="${mode}">${modeLabel(
            mode,
          )}</button>`,
      )
      .join("")}
  </div>
  <div class="list">
    ${snapshot.summary.records
      .filter((record) => record.status !== "ready")
      .slice(0, 5)
      .map(renderRecordRow)
      .join("") || `<p class="muted">No current route issues.</p>`}
  </div>
`

const renderRoute = (snapshot: MockKitSnapshot): string => `
  <div class="list">
    ${
      snapshot.summary.sections
        .map(
          (section) => `
            <section class="section">
              <div class="row-title">
                <span>${escapeHtml(section.label)}</span>
                <span class="badge ${section.status}">${statusLabels[section.status]}</span>
              </div>
              <p class="muted">Mix: ${escapeHtml(formatSourceMix(section.sourceCounts))}</p>
              <p class="muted">Highest risk: ${sourceKindLabels[section.highestRisk]}</p>
            </section>
          `,
        )
        .join("") || `<p class="muted">No sections configured for this route.</p>`
    }
  </div>
`

const renderResources = (snapshot: MockKitSnapshot): string => `
  <div class="list">
    ${snapshot.summary.records.map(renderRecordRow).join("") || `<p class="muted">No records.</p>`}
  </div>
`

const renderUiMarks = (snapshot: MockKitSnapshot): string => {
  const marks = snapshot.records.filter((record) => record.resourceKey.startsWith("ui."))
  return `<div class="list">${marks.map(renderRecordRow).join("") || `<p class="muted">No UI marks.</p>`}</div>`
}

const renderCapture = (snapshot: MockKitSnapshot): string => {
  const capture = snapshot.summary.capture
  if (!capture || capture.status === "not-configured") {
    return `<p class="muted">No capture policy is configured for this route.</p>`
  }
  return `
    ${metric("Capture status", capitalise(capture.status))}
    <div class="list">
      ${capture.resources
        .map(
          (resource) => `
            <div class="row">
              <div class="row-title">
                <span>${escapeHtml(resource.resourceKey)}</span>
                <span class="badge ${resource.passed ? "ready" : "blocked"}">${
                  resource.passed ? "Passed" : "Blocked"
                }</span>
              </div>
              <p class="muted">${escapeHtml(resource.reason)}</p>
            </div>
          `,
        )
        .join("")}
      ${capture.blockers.map((blocker) => `<p class="blocked">${escapeHtml(blocker)}</p>`).join("")}
    </div>
  `
}

const renderExport = (client: MockKitClient | undefined): string => {
  const json = client?.exportJson() ?? "{}"
  return `
    <button class="copy" type="button" data-copy-json>Copy current route JSON</button>
    <pre>${escapeHtml(json)}</pre>
  `
}

const renderRecordRow = (record: AuditRecord): string => `
  <article class="row">
    <div class="row-title">
      <span>${escapeHtml(record.resourceKey)}</span>
      <span class="badge ${record.status}">${sourceKindLabels[record.sourceKind]}</span>
    </div>
    <p class="muted">${escapeHtml(record.label)} · ${statusLabels[record.status]}</p>
    ${record.reason ? `<p>${escapeHtml(record.reason)}</p>` : ""}
    ${
      record.fieldCoverage
        ? `<p class="muted">Coverage: ${record.fieldCoverage.present}/${record.fieldCoverage.total}</p>`
        : ""
    }
  </article>
`

const metric = (label: string, value: string): string => `
  <div class="metric">
    <div class="metric-label">${escapeHtml(label)}</div>
    <div class="metric-value">${escapeHtml(value)}</div>
  </div>
`

const modeLabel = (mode: ProvenanceMode): string => {
  const labels: Record<ProvenanceMode, string> = {
    mock: "Mock prototype",
    hybrid: "Live + fallback",
    live: "Live only",
    audit: "Live audit",
    capture: "Capture",
  }
  return labels[mode]
}

const capitalise = (value: string): string => `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")

const readPosition = (
  value: string | null,
  fallback: "bottom-left" | "bottom-right",
): "bottom-left" | "bottom-right" =>
  value === "bottom-right" || value === "bottom-left" ? value : fallback

const readPanelPosition = (value: string | null, fallback: "left" | "right"): "left" | "right" =>
  value === "left" || value === "right" ? value : fallback
