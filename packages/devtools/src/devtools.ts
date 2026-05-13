import type { MockPitClient } from "@mockpit/browser"
import {
  auditStatuses,
  formatSourceMix,
  sourceKindLabels,
  sourceKinds,
  statusLabels,
  type AuditRecord,
  type AuditStatus,
  type MockPitSnapshot,
  type ProvenanceMode,
  type SourceKind,
} from "@mockpit/core"
import { devtoolsStyles } from "./styles"

export interface MountMockPitDevtoolsOptions {
  readonly client?: MockPitClient
  readonly initialIsOpen?: boolean
  readonly position?: "bottom-left" | "bottom-right"
  readonly panelPosition?: "left" | "right"
}

const tabs = [
  "Overview",
  "Route",
  "Resources",
  "UI Marks",
  "Fallbacks",
  "Scenarios",
  "Capture",
  "Export",
] as const
type Tab = (typeof tabs)[number]
type RouteScope = "current" | "all"

interface DevtoolsFilters {
  readonly source: SourceKind | "all"
  readonly status: AuditStatus | "all"
  readonly scope: RouteScope
  readonly proofOnly: boolean
  readonly problemOnly: boolean
  readonly highlight: SourceKind | "all"
}

const defaultFilters: DevtoolsFilters = {
  source: "all",
  status: "all",
  scope: "current",
  proofOnly: false,
  problemOnly: false,
  highlight: "all",
}

export class MockPitDevtoolsElement extends HTMLElement {
  client: MockPitClient | undefined
  private isOpen = false
  private selectedTab: Tab = "Overview"
  private position: "bottom-left" | "bottom-right" = "bottom-left"
  private panelPosition: "left" | "right" = "right"
  private filters: DevtoolsFilters = defaultFilters
  private unsubscribe: (() => void) | undefined
  private previousMode: ProvenanceMode | undefined
  private readonly keyHandler = (event: KeyboardEvent) => {
    if (event.altKey && event.shiftKey && event.code === "KeyP") this.setOpen(!this.isOpen)
  }

  connectedCallback(): void {
    this.client = this.client ?? window.__MOCKPIT__?.client
    this.position = readPosition(this.getAttribute("position"), "bottom-left")
    this.panelPosition = readPanelPosition(this.getAttribute("panel-position"), "right")
    this.attachShadow({ mode: "open" })
    this.readState()
    const initial = this.getAttribute("initial-is-open")
    this.isOpen = initial === "true" || this.isOpen
    this.unsubscribe = this.client?.subscribe(() => this.handleClientUpdate())
    window.addEventListener("keydown", this.keyHandler)
    this.applyHighlightFilter()
    this.render()
  }

  disconnectedCallback(): void {
    this.unsubscribe?.()
    window.removeEventListener("keydown", this.keyHandler)
  }

  setClient(client: MockPitClient): void {
    this.client = client
    this.unsubscribe?.()
    this.unsubscribe = client.subscribe(() => this.handleClientUpdate())
    this.readState()
    this.render()
  }

  private handleClientUpdate(): void {
    const mode = this.client?.getMode()
    if (mode === "capture" && this.previousMode !== "capture") {
      this.selectedTab = "Capture"
      this.isOpen = true
      this.writeState()
    }
    this.previousMode = mode
    this.render()
  }

  private setOpen(next: boolean): void {
    this.isOpen = next
    this.writeState()
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

  private renderTrigger(snapshot: MockPitSnapshot | undefined): string {
    const issueCount = snapshot?.summary.records.filter((record) => record.status !== "ready").length ?? 0
    const label = snapshot
      ? `MockPit · ${capitalise(snapshot.mode)} · ${
          snapshot.summary.capture?.status === "blocked"
            ? "Blocked"
            : issueCount > 0
              ? `${issueCount} issues`
              : formatSourceMix(snapshot.summary.sourceCounts)
        }`
      : "MockPit · No client"
    return `<button class="trigger ${this.position}" type="button" data-action="toggle" aria-label="${escapeHtml(
      label,
    )}">${escapeHtml(label)}</button>`
  }

  private renderPanel(snapshot: MockPitSnapshot | undefined): string {
    return `
      <section class="panel ${this.panelPosition}" role="complementary" aria-label="MockPit devtools">
        <header class="header">
          <div class="title">
            <span>MockPit</span>
            <span class="subtitle">${escapeHtml(snapshot?.routePath ?? "No client connected")}</span>
          </div>
          <button class="close" type="button" data-action="toggle">Close</button>
        </header>
        <nav class="tabs" role="tablist" aria-label="MockPit panels">
          ${tabs
            .map(
              (tab) =>
                `<button class="tab" type="button" role="tab" aria-selected="${
                  tab === this.selectedTab
                }" tabindex="${tab === this.selectedTab ? "0" : "-1"}" data-tab="${tab}">${tab}</button>`,
            )
            .join("")}
        </nav>
        <main class="content">
          ${snapshot ? this.renderTab(snapshot) : "<p>No MockPit client is available.</p>"}
        </main>
      </section>
    `
  }

  private renderTab(snapshot: MockPitSnapshot): string {
    switch (this.selectedTab) {
      case "Route":
        return renderRoute(snapshot)
      case "Resources":
        return renderResources(snapshot, this.filters)
      case "UI Marks":
        return renderUiMarks(snapshot, this.filters)
      case "Fallbacks":
        return renderFallbacks(snapshot)
      case "Scenarios":
        return renderScenarios(snapshot, this.client)
      case "Capture":
        return renderCapture(snapshot)
      case "Export":
        return renderExport(this.client)
      default:
        return renderOverview(snapshot, this.filters)
    }
  }

  private bindEvents(): void {
    this.shadowRoot?.querySelectorAll<HTMLElement>("[data-action='toggle']").forEach((button) => {
      button.addEventListener("click", () => this.setOpen(!this.isOpen))
    })

    this.shadowRoot?.querySelectorAll<HTMLElement>("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        this.selectedTab = button.dataset.tab as Tab
        this.writeState()
        this.render()
      })
      button.addEventListener("keydown", (event) => {
        const nextTab = nextKeyboardTab(button.dataset.tab as Tab, event.key)
        if (!nextTab) return
        event.preventDefault()
        this.selectedTab = nextTab
        this.writeState()
        this.render()
        queueMicrotask(() => this.focusTab(nextTab))
      })
    })

    this.shadowRoot?.querySelectorAll<HTMLElement>("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const transition = this.client?.setMode(button.dataset.mode as ProvenanceMode)
        if (transition?.nextMode === "capture") this.selectedTab = "Capture"
        this.writeState()
        this.render()
      })
    })

    this.shadowRoot?.querySelectorAll<HTMLSelectElement>("[data-filter]").forEach((select) => {
      select.addEventListener("change", () => {
        this.filters = { ...this.filters, [select.dataset.filter ?? "source"]: select.value }
        this.applyHighlightFilter()
        this.writeState()
        this.render()
      })
    })

    this.shadowRoot?.querySelectorAll<HTMLInputElement>("[data-check-filter]").forEach((input) => {
      input.addEventListener("change", () => {
        this.filters = { ...this.filters, [input.dataset.checkFilter ?? "proofOnly"]: input.checked }
        this.writeState()
        this.render()
      })
    })

    this.shadowRoot?.querySelectorAll<HTMLButtonElement>("[data-scenario]").forEach((button) => {
      button.addEventListener("click", () => {
        this.client?.setScenario(button.dataset.scenario ?? "", button.dataset.variant ?? "")
        this.render()
      })
    })

    this.shadowRoot?.querySelector<HTMLElement>("[data-copy-json]")?.addEventListener("click", () => {
      const json = JSON.stringify(this.client?.exportRoute(), null, 2)
      if (json && navigator.clipboard) void navigator.clipboard.writeText(json)
    })
    this.shadowRoot?.querySelector<HTMLElement>("[data-copy-markdown]")?.addEventListener("click", () => {
      const markdown = this.client?.exportMarkdown()
      if (markdown && navigator.clipboard) void navigator.clipboard.writeText(markdown)
    })
    this.shadowRoot?.querySelector<HTMLElement>("[data-download-json]")?.addEventListener("click", () => {
      const json = JSON.stringify(this.client?.exportRoute(), null, 2)
      downloadText("mockpit-route-audit.json", json, "application/json")
    })
  }

  private applyHighlightFilter(): void {
    if (typeof document === "undefined") return
    document.documentElement.dataset.mockpitHighlightSource = this.filters.highlight
  }

  private focusTab(tab: Tab): void {
    const button = Array.from(this.shadowRoot?.querySelectorAll<HTMLElement>("[data-tab]") ?? []).find(
      (candidate) => candidate.dataset.tab === tab,
    )
    button?.focus()
  }

  private readState(): void {
    const prefix = this.statePrefix()
    if (!prefix || typeof window === "undefined") return
    this.isOpen = window.localStorage.getItem(`${prefix}.open`) === "true"
    this.selectedTab = readTab(window.localStorage.getItem(`${prefix}.tab`), "Overview")
    this.filters = readFilters(window.localStorage.getItem(`${prefix}.filters`))
  }

  private writeState(): void {
    const prefix = this.statePrefix()
    if (!prefix || typeof window === "undefined") return
    window.localStorage.setItem(`${prefix}.open`, String(this.isOpen))
    window.localStorage.setItem(`${prefix}.tab`, this.selectedTab)
    window.localStorage.setItem(`${prefix}.filters`, JSON.stringify(this.filters))
  }

  private statePrefix(): string | undefined {
    return this.client ? `${this.client.config.project}.mockpit.devtools` : undefined
  }
}

export const defineMockPitElements = (): void => {
  if (!customElements.get("mockpit-devtools")) {
    customElements.define("mockpit-devtools", MockPitDevtoolsElement)
  }
}

export const mountMockPitDevtools = (
  options: MountMockPitDevtoolsOptions = {},
): MockPitDevtoolsElement => {
  defineMockPitElements()
  const element = document.createElement("mockpit-devtools") as MockPitDevtoolsElement
  if (options.client) element.client = options.client
  if (typeof options.initialIsOpen === "boolean") {
    element.setAttribute("initial-is-open", String(options.initialIsOpen))
  }
  if (options.position) element.setAttribute("position", options.position)
  if (options.panelPosition) element.setAttribute("panel-position", options.panelPosition)
  document.body.append(element)
  return element
}

const renderOverview = (snapshot: MockPitSnapshot, filters: DevtoolsFilters): string => `
  <div class="grid">
    ${metric("Mode", capitalise(snapshot.mode))}
    ${metric("Status", statusLabels[snapshot.summary.status])}
    ${metric("Source mix", formatSourceMix(snapshot.summary.sourceCounts))}
    ${metric("Highest risk", sourceKindLabels[snapshot.summary.highestRisk])}
    ${metric("Capture", snapshot.summary.capture?.status ?? "not-configured")}
    ${metric("Mock transport", snapshot.transport?.mockTransportActive ? "On" : "Off")}
  </div>
  ${renderModeSwitcher(snapshot.mode)}
  ${renderFilters(filters, true)}
  <div class="list">
    ${filterRecords(snapshot.summary.records, filters)
      .filter((record) => record.status !== "ready")
      .slice(0, 5)
      .map(renderRecordRow)
      .join("") || `<p class="muted">No current route issues.</p>`}
  </div>
`

const renderRoute = (snapshot: MockPitSnapshot): string => `
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
              <p class="muted">${section.proofCriticalCount} proof-critical · ${section.warningCount} warnings · ${section.blockedCount} blocked</p>
            </section>
          `,
        )
        .join("") || `<p class="muted">No sections configured for this route.</p>`
    }
  </div>
`

const renderResources = (snapshot: MockPitSnapshot, filters: DevtoolsFilters): string => `
  ${renderFilters(filters)}
  <div class="list">
    ${filterRecords(recordsForScope(snapshot, filters), filters)
      .filter((record) => record.kind !== "uiMark")
      .map(renderRecordRow)
      .join("") || `<p class="muted">No matching resources.</p>`}
  </div>
`

const renderUiMarks = (snapshot: MockPitSnapshot, filters: DevtoolsFilters): string => `
  ${renderFilters(filters, true)}
  <div class="list">
    ${filterRecords(recordsForScope(snapshot, filters), filters)
      .filter((record) => record.kind === "uiMark" || record.resourceKey.startsWith("ui."))
      .map(renderRecordRow)
      .join("") || `<p class="muted">No matching UI marks.</p>`}
  </div>
`

const renderFallbacks = (snapshot: MockPitSnapshot): string => {
  const records = snapshot.records.filter(
    (record) => record.sourceKind === "fallback" || record.fallbackSource,
  )
  return `<div class="list">${
    records
      .map(
        (record) => `
        <article class="row">
          <div class="row-title">
            <span>${escapeHtml(record.resourceKey)}</span>
            <span class="badge ${record.status}">${sourceKindLabels[record.sourceKind]}</span>
          </div>
          <p>${escapeHtml(record.reason ?? "Fallback was used.")}</p>
          <p class="muted">Source: ${escapeHtml(record.fallbackSource ?? "Not specified")}</p>
          <p class="muted">Next: ${escapeHtml(record.remediation ?? "Replace fallback with live integration or mark presentation-only.")}</p>
        </article>`,
      )
      .join("") || `<p class="muted">No fallback records.</p>`
  }</div>`
}

const renderScenarios = (snapshot: MockPitSnapshot, client: MockPitClient | undefined): string => {
  const scenarios = client?.config.scenarios ?? []
  if (scenarios.length === 0) return `<p class="muted">No scenarios configured. Scenarios are separate from source provenance.</p>`
  return `<div class="list">${scenarios
    .map((scenario) => {
      const selected = snapshot.scenarios?.selected[scenario.key] ?? scenario.defaultVariant
      return `
        <section class="section">
          <div class="row-title">
            <span>${escapeHtml(scenario.label)}</span>
            <span class="badge">Scenario</span>
          </div>
          <p class="muted">Scenarios do not change whether data is live, mock, fallback, or hardcoded.</p>
          <div class="mode-row">
            ${scenario.variants
              .map(
                (variant) =>
                  `<button class="mode ${variant.key === selected ? "active" : ""}" type="button" data-scenario="${scenario.key}" data-variant="${variant.key}">${escapeHtml(
                    variant.label,
                  )}</button>`,
              )
              .join("")}
          </div>
        </section>`
    })
    .join("")}</div>`
}

const renderCapture = (snapshot: MockPitSnapshot): string => {
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

const renderExport = (client: MockPitClient | undefined): string => {
  const route = client?.exportRoute()
  const markdown = client?.exportMarkdown() ?? ""
  return `
    <div class="grid">
      ${metric("Redaction", route?.redaction.default ?? "metadata-only")}
      ${metric("Records", String(route?.records.length ?? 0))}
    </div>
    <div class="mode-row">
      <button class="copy" type="button" data-copy-json>Copy JSON</button>
      <button class="copy" type="button" data-download-json>Download JSON</button>
      <button class="copy" type="button" data-copy-markdown>Copy Markdown</button>
    </div>
    <p class="muted">CLI: mockpit audit --base-url http://localhost:5173 --routes ${escapeHtml(route?.routePath ?? "/")} --out mockpit-report</p>
    <pre>${escapeHtml(markdown)}</pre>
  `
}

const renderModeSwitcher = (mode: ProvenanceMode): string => `
  <div class="mode-row">
    ${(["mock", "hybrid", "live", "audit", "capture"] as const)
      .map(
        (candidate) =>
          `<button class="mode ${candidate === mode ? "active" : ""}" type="button" data-mode="${candidate}">${modeLabel(
            candidate,
          )}</button>`,
      )
      .join("")}
  </div>
`

const renderFilters = (filters: DevtoolsFilters, includeHighlight = false): string => `
  <div class="filters" aria-label="Resource filters">
    <label>Source ${select("source", ["all", ...sourceKinds], filters.source)}</label>
    <label>Status ${select("status", ["all", ...auditStatuses], filters.status)}</label>
    <label>Scope ${select("scope", ["current", "all"], filters.scope)}</label>
    ${
      includeHighlight
        ? `<label>Highlight ${select("highlight", ["all", ...sourceKinds], filters.highlight)}</label>`
        : ""
    }
    <label><input type="checkbox" data-check-filter="proofOnly" ${filters.proofOnly ? "checked" : ""} /> Proof only</label>
    <label><input type="checkbox" data-check-filter="problemOnly" ${filters.problemOnly ? "checked" : ""} /> Problems only</label>
  </div>
`

const select = (key: string, values: readonly string[], selected: string): string => `
  <select data-filter="${key}" aria-label="${key}">
    ${values.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("")}
  </select>
`

const renderRecordRow = (record: AuditRecord): string => `
  <article class="row">
    <div class="row-title">
      <span>${escapeHtml(record.resourceKey)}</span>
      <span class="badge ${record.status}">${sourceKindLabels[record.sourceKind]}</span>
    </div>
    <p class="muted">${escapeHtml(record.label)} · ${statusLabels[record.status]} · ${record.visibility ?? "mounted"}</p>
    ${record.reason ? `<p>${escapeHtml(record.reason)}</p>` : ""}
    ${record.request?.route ? `<p class="muted">${escapeHtml(record.request.route)}</p>` : ""}
    ${
      record.fieldCoverage
        ? `<p class="muted">Coverage: ${record.fieldCoverage.present}/${record.fieldCoverage.total}</p>`
        : ""
    }
    ${record.remediation ? `<p class="muted">Next: ${escapeHtml(record.remediation)}</p>` : ""}
  </article>
`

const metric = (label: string, value: string): string => `
  <div class="metric">
    <div class="metric-label">${escapeHtml(label)}</div>
    <div class="metric-value">${escapeHtml(value)}</div>
  </div>
`

const recordsForScope = (snapshot: MockPitSnapshot, filters: DevtoolsFilters): readonly AuditRecord[] =>
  filters.scope === "all" ? snapshot.records : snapshot.summary.records

const filterRecords = (
  records: readonly AuditRecord[],
  filters: DevtoolsFilters,
): readonly AuditRecord[] =>
  records.filter((record) => {
    if (filters.source !== "all" && record.sourceKind !== filters.source) return false
    if (filters.status !== "all" && record.status !== filters.status) return false
    if (filters.proofOnly && !record.proofCritical) return false
    if (filters.problemOnly && record.status === "ready") return false
    return true
  })

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

const readTab = (value: string | null, fallback: Tab): Tab =>
  tabs.includes(value as Tab) ? (value as Tab) : fallback

const nextKeyboardTab = (current: Tab, key: string): Tab | undefined => {
  const index = tabs.indexOf(current)
  if (key === "Home") return tabs[0]
  if (key === "End") return tabs[tabs.length - 1]
  if (key === "ArrowRight") return tabs[(index + 1) % tabs.length]
  if (key === "ArrowLeft") return tabs[(index - 1 + tabs.length) % tabs.length]
  return undefined
}

const readFilters = (value: string | null): DevtoolsFilters => {
  if (!value) return defaultFilters
  try {
    return { ...defaultFilters, ...(JSON.parse(value) as Partial<DevtoolsFilters>) }
  } catch {
    return defaultFilters
  }
}

const readPosition = (
  value: string | null,
  fallback: "bottom-left" | "bottom-right",
): "bottom-left" | "bottom-right" =>
  value === "bottom-right" || value === "bottom-left" ? value : fallback

const readPanelPosition = (value: string | null, fallback: "left" | "right"): "left" | "right" =>
  value === "left" || value === "right" ? value : fallback

const downloadText = (filename: string, text: string, type: string): void => {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
