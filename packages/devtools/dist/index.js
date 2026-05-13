// src/devtools.ts
import {
  auditStatuses,
  formatSourceMix,
  sourceKindLabels,
  sourceKinds,
  statusLabels
} from "@mockpit/core";

// src/styles.ts
var devtoolsStyles = `
:host {
  all: initial;
  color-scheme: light;
  --mk-bg: #ffffff;
  --mk-panel: #f8fafc;
  --mk-border: #cbd5e1;
  --mk-text: #0f172a;
  --mk-muted: #64748b;
  --mk-ready: #166534;
  --mk-warning: #92400e;
  --mk-blocked: #991b1b;
  --mk-focus: #2563eb;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

button, select {
  font: inherit;
}

.trigger {
  position: fixed;
  z-index: 2147483647;
  border: 1px solid var(--mk-border);
  background: var(--mk-bg);
  color: var(--mk-text);
  border-radius: 999px;
  padding: 8px 12px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
  cursor: pointer;
  font-size: 12px;
  line-height: 1.2;
}

.bottom-left { left: 16px; bottom: 16px; }
.bottom-right { right: 16px; bottom: 16px; }

.panel {
  position: fixed;
  z-index: 2147483647;
  top: 16px;
  bottom: 16px;
  width: min(520px, calc(100vw - 32px));
  background: var(--mk-bg);
  color: var(--mk-text);
  border: 1px solid var(--mk-border);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.24);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel.right { right: 16px; }
.panel.left { left: 16px; }

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--mk-border);
  background: var(--mk-panel);
}

.title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  font-weight: 700;
}

.subtitle {
  color: var(--mk-muted);
  font-size: 11px;
  font-weight: 500;
}

.close {
  border: 1px solid var(--mk-border);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  padding: 5px 8px;
}

.tabs {
  display: flex;
  overflow-x: auto;
  border-bottom: 1px solid var(--mk-border);
  background: #fff;
}

.tab {
  border: 0;
  border-right: 1px solid var(--mk-border);
  background: transparent;
  padding: 9px 10px;
  cursor: pointer;
  font-size: 12px;
  color: var(--mk-muted);
}

.tab[aria-selected="true"] {
  color: var(--mk-text);
  font-weight: 700;
  background: var(--mk-panel);
}

.content {
  overflow: auto;
  padding: 14px;
  font-size: 12px;
  line-height: 1.45;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.metric, .row, .section {
  border: 1px solid var(--mk-border);
  border-radius: 8px;
  padding: 10px;
  background: #fff;
}

.metric-label, .muted {
  color: var(--mk-muted);
  font-size: 11px;
}

.metric-value {
  margin-top: 2px;
  font-size: 14px;
  font-weight: 700;
}

.mode-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  border: 1px solid var(--mk-border);
  border-radius: 8px;
  padding: 8px;
  margin: 10px 0;
  background: #fff;
}

.filters label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--mk-muted);
  font-size: 11px;
}

.filters select {
  border: 1px solid var(--mk-border);
  border-radius: 6px;
  background: #fff;
  padding: 4px 6px;
  color: var(--mk-text);
}

.mode {
  border: 1px solid var(--mk-border);
  background: #fff;
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 11px;
}

.mode.active {
  border-color: var(--mk-focus);
  color: var(--mk-focus);
  font-weight: 700;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row-title {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-weight: 700;
}

.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid var(--mk-border);
  padding: 1px 7px;
  font-size: 10px;
  color: var(--mk-muted);
  white-space: nowrap;
}

.ready { color: var(--mk-ready); }
.warning, .unknown { color: var(--mk-warning); }
.blocked, .error { color: var(--mk-blocked); }

pre {
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid var(--mk-border);
  background: #0f172a;
  color: #e2e8f0;
  padding: 10px;
  border-radius: 8px;
  max-height: 280px;
  overflow: auto;
}

.copy {
  border: 1px solid var(--mk-border);
  background: #fff;
  border-radius: 6px;
  padding: 7px 9px;
  cursor: pointer;
}
`;

// src/devtools.ts
var tabs = [
  "Overview",
  "Route",
  "Resources",
  "UI Marks",
  "Fallbacks",
  "Scenarios",
  "Capture",
  "Export"
];
var defaultFilters = {
  source: "all",
  status: "all",
  scope: "current",
  proofOnly: false,
  problemOnly: false,
  highlight: "all"
};
var MockPitDevtoolsElement = class extends HTMLElement {
  client;
  isOpen = false;
  selectedTab = "Overview";
  position = "bottom-left";
  panelPosition = "right";
  filters = defaultFilters;
  unsubscribe;
  previousMode;
  keyHandler = (event) => {
    if (event.altKey && event.shiftKey && event.code === "KeyP") this.setOpen(!this.isOpen);
  };
  connectedCallback() {
    this.client = this.client ?? window.__MOCKPIT__?.client;
    this.position = readPosition(this.getAttribute("position"), "bottom-left");
    this.panelPosition = readPanelPosition(this.getAttribute("panel-position"), "right");
    this.attachShadow({ mode: "open" });
    this.readState();
    const initial = this.getAttribute("initial-is-open");
    this.isOpen = initial === "true" || this.isOpen;
    this.unsubscribe = this.client?.subscribe(() => this.handleClientUpdate());
    window.addEventListener("keydown", this.keyHandler);
    this.applyHighlightFilter();
    this.render();
  }
  disconnectedCallback() {
    this.unsubscribe?.();
    window.removeEventListener("keydown", this.keyHandler);
  }
  setClient(client) {
    this.client = client;
    this.unsubscribe?.();
    this.unsubscribe = client.subscribe(() => this.handleClientUpdate());
    this.readState();
    this.render();
  }
  handleClientUpdate() {
    const mode = this.client?.getMode();
    if (mode === "capture" && this.previousMode !== "capture") {
      this.selectedTab = "Capture";
      this.isOpen = true;
      this.writeState();
    }
    this.previousMode = mode;
    this.render();
  }
  setOpen(next) {
    this.isOpen = next;
    this.writeState();
    this.render();
  }
  render() {
    if (!this.shadowRoot) return;
    const snapshot = this.client?.snapshot();
    this.shadowRoot.innerHTML = `
      <style>${devtoolsStyles}</style>
      ${this.renderTrigger(snapshot)}
      ${this.isOpen ? this.renderPanel(snapshot) : ""}
    `;
    this.bindEvents();
  }
  renderTrigger(snapshot) {
    const issueCount = snapshot?.summary.records.filter((record) => record.status !== "ready").length ?? 0;
    const label = snapshot ? `MockPit \xB7 ${capitalise(snapshot.mode)} \xB7 ${snapshot.summary.capture?.status === "blocked" ? "Blocked" : issueCount > 0 ? `${issueCount} issues` : formatSourceMix(snapshot.summary.sourceCounts)}` : "MockPit \xB7 No client";
    return `<button class="trigger ${this.position}" type="button" data-action="toggle" aria-label="${escapeHtml(
      label
    )}">${escapeHtml(label)}</button>`;
  }
  renderPanel(snapshot) {
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
          ${tabs.map(
      (tab) => `<button class="tab" type="button" role="tab" aria-selected="${tab === this.selectedTab}" tabindex="${tab === this.selectedTab ? "0" : "-1"}" data-tab="${tab}">${tab}</button>`
    ).join("")}
        </nav>
        <main class="content">
          ${snapshot ? this.renderTab(snapshot) : "<p>No MockPit client is available.</p>"}
        </main>
      </section>
    `;
  }
  renderTab(snapshot) {
    switch (this.selectedTab) {
      case "Route":
        return renderRoute(snapshot);
      case "Resources":
        return renderResources(snapshot, this.filters);
      case "UI Marks":
        return renderUiMarks(snapshot, this.filters);
      case "Fallbacks":
        return renderFallbacks(snapshot);
      case "Scenarios":
        return renderScenarios(snapshot, this.client);
      case "Capture":
        return renderCapture(snapshot);
      case "Export":
        return renderExport(this.client);
      default:
        return renderOverview(snapshot, this.filters);
    }
  }
  bindEvents() {
    this.shadowRoot?.querySelectorAll("[data-action='toggle']").forEach((button) => {
      button.addEventListener("click", () => this.setOpen(!this.isOpen));
    });
    this.shadowRoot?.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        this.selectedTab = button.dataset.tab;
        this.writeState();
        this.render();
      });
      button.addEventListener("keydown", (event) => {
        const nextTab = nextKeyboardTab(button.dataset.tab, event.key);
        if (!nextTab) return;
        event.preventDefault();
        this.selectedTab = nextTab;
        this.writeState();
        this.render();
        queueMicrotask(() => this.focusTab(nextTab));
      });
    });
    this.shadowRoot?.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const transition = this.client?.setMode(button.dataset.mode);
        if (transition?.nextMode === "capture") this.selectedTab = "Capture";
        this.writeState();
        this.render();
      });
    });
    this.shadowRoot?.querySelectorAll("[data-filter]").forEach((select2) => {
      select2.addEventListener("change", () => {
        this.filters = { ...this.filters, [select2.dataset.filter ?? "source"]: select2.value };
        this.applyHighlightFilter();
        this.writeState();
        this.render();
      });
    });
    this.shadowRoot?.querySelectorAll("[data-check-filter]").forEach((input) => {
      input.addEventListener("change", () => {
        this.filters = { ...this.filters, [input.dataset.checkFilter ?? "proofOnly"]: input.checked };
        this.writeState();
        this.render();
      });
    });
    this.shadowRoot?.querySelectorAll("[data-scenario]").forEach((button) => {
      button.addEventListener("click", () => {
        this.client?.setScenario(button.dataset.scenario ?? "", button.dataset.variant ?? "");
        this.render();
      });
    });
    this.shadowRoot?.querySelector("[data-copy-json]")?.addEventListener("click", () => {
      const json = JSON.stringify(this.client?.exportRoute(), null, 2);
      if (json && navigator.clipboard) void navigator.clipboard.writeText(json);
    });
    this.shadowRoot?.querySelector("[data-copy-markdown]")?.addEventListener("click", () => {
      const markdown = this.client?.exportMarkdown();
      if (markdown && navigator.clipboard) void navigator.clipboard.writeText(markdown);
    });
    this.shadowRoot?.querySelector("[data-download-json]")?.addEventListener("click", () => {
      const json = JSON.stringify(this.client?.exportRoute(), null, 2);
      downloadText("mockpit-route-audit.json", json, "application/json");
    });
  }
  applyHighlightFilter() {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.mockpitHighlightSource = this.filters.highlight;
  }
  focusTab(tab) {
    const button = Array.from(this.shadowRoot?.querySelectorAll("[data-tab]") ?? []).find(
      (candidate) => candidate.dataset.tab === tab
    );
    button?.focus();
  }
  readState() {
    const prefix = this.statePrefix();
    if (!prefix || typeof window === "undefined") return;
    this.isOpen = window.localStorage.getItem(`${prefix}.open`) === "true";
    this.selectedTab = readTab(window.localStorage.getItem(`${prefix}.tab`), "Overview");
    this.filters = readFilters(window.localStorage.getItem(`${prefix}.filters`));
  }
  writeState() {
    const prefix = this.statePrefix();
    if (!prefix || typeof window === "undefined") return;
    window.localStorage.setItem(`${prefix}.open`, String(this.isOpen));
    window.localStorage.setItem(`${prefix}.tab`, this.selectedTab);
    window.localStorage.setItem(`${prefix}.filters`, JSON.stringify(this.filters));
  }
  statePrefix() {
    return this.client ? `${this.client.config.project}.mockpit.devtools` : void 0;
  }
};
var defineMockPitElements = () => {
  if (!customElements.get("mockpit-devtools")) {
    customElements.define("mockpit-devtools", MockPitDevtoolsElement);
  }
};
var mountMockPitDevtools = (options = {}) => {
  defineMockPitElements();
  const element = document.createElement("mockpit-devtools");
  if (options.client) element.client = options.client;
  if (typeof options.initialIsOpen === "boolean") {
    element.setAttribute("initial-is-open", String(options.initialIsOpen));
  }
  if (options.position) element.setAttribute("position", options.position);
  if (options.panelPosition) element.setAttribute("panel-position", options.panelPosition);
  document.body.append(element);
  return element;
};
var renderOverview = (snapshot, filters) => `
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
    ${filterRecords(snapshot.summary.records, filters).filter((record) => record.status !== "ready").slice(0, 5).map(renderRecordRow).join("") || `<p class="muted">No current route issues.</p>`}
  </div>
`;
var renderRoute = (snapshot) => `
  <div class="list">
    ${snapshot.summary.sections.map(
  (section) => `
            <section class="section">
              <div class="row-title">
                <span>${escapeHtml(section.label)}</span>
                <span class="badge ${section.status}">${statusLabels[section.status]}</span>
              </div>
              <p class="muted">Mix: ${escapeHtml(formatSourceMix(section.sourceCounts))}</p>
              <p class="muted">Highest risk: ${sourceKindLabels[section.highestRisk]}</p>
              <p class="muted">${section.proofCriticalCount} proof-critical \xB7 ${section.warningCount} warnings \xB7 ${section.blockedCount} blocked</p>
            </section>
          `
).join("") || `<p class="muted">No sections configured for this route.</p>`}
  </div>
`;
var renderResources = (snapshot, filters) => `
  ${renderFilters(filters)}
  <div class="list">
    ${filterRecords(recordsForScope(snapshot, filters), filters).filter((record) => record.kind !== "uiMark").map(renderRecordRow).join("") || `<p class="muted">No matching resources.</p>`}
  </div>
`;
var renderUiMarks = (snapshot, filters) => `
  ${renderFilters(filters, true)}
  <div class="list">
    ${filterRecords(recordsForScope(snapshot, filters), filters).filter((record) => record.kind === "uiMark" || record.resourceKey.startsWith("ui.")).map(renderRecordRow).join("") || `<p class="muted">No matching UI marks.</p>`}
  </div>
`;
var renderFallbacks = (snapshot) => {
  const records = snapshot.records.filter(
    (record) => record.sourceKind === "fallback" || record.fallbackSource
  );
  return `<div class="list">${records.map(
    (record) => `
        <article class="row">
          <div class="row-title">
            <span>${escapeHtml(record.resourceKey)}</span>
            <span class="badge ${record.status}">${sourceKindLabels[record.sourceKind]}</span>
          </div>
          <p>${escapeHtml(record.reason ?? "Fallback was used.")}</p>
          <p class="muted">Source: ${escapeHtml(record.fallbackSource ?? "Not specified")}</p>
          <p class="muted">Next: ${escapeHtml(record.remediation ?? "Replace fallback with live integration or mark presentation-only.")}</p>
        </article>`
  ).join("") || `<p class="muted">No fallback records.</p>`}</div>`;
};
var renderScenarios = (snapshot, client) => {
  const scenarios = client?.config.scenarios ?? [];
  if (scenarios.length === 0) return `<p class="muted">No scenarios configured. Scenarios are separate from source provenance.</p>`;
  return `<div class="list">${scenarios.map((scenario) => {
    const selected = snapshot.scenarios?.selected[scenario.key] ?? scenario.defaultVariant;
    return `
        <section class="section">
          <div class="row-title">
            <span>${escapeHtml(scenario.label)}</span>
            <span class="badge">Scenario</span>
          </div>
          <p class="muted">Scenarios do not change whether data is live, mock, fallback, or hardcoded.</p>
          <div class="mode-row">
            ${scenario.variants.map(
      (variant) => `<button class="mode ${variant.key === selected ? "active" : ""}" type="button" data-scenario="${scenario.key}" data-variant="${variant.key}">${escapeHtml(
        variant.label
      )}</button>`
    ).join("")}
          </div>
        </section>`;
  }).join("")}</div>`;
};
var renderCapture = (snapshot) => {
  const capture = snapshot.summary.capture;
  if (!capture || capture.status === "not-configured") {
    return `<p class="muted">No capture policy is configured for this route.</p>`;
  }
  return `
    ${metric("Capture status", capitalise(capture.status))}
    <div class="list">
      ${capture.resources.map(
    (resource) => `
            <div class="row">
              <div class="row-title">
                <span>${escapeHtml(resource.resourceKey)}</span>
                <span class="badge ${resource.passed ? "ready" : "blocked"}">${resource.passed ? "Passed" : "Blocked"}</span>
              </div>
              <p class="muted">${escapeHtml(resource.reason)}</p>
            </div>
          `
  ).join("")}
      ${capture.blockers.map((blocker) => `<p class="blocked">${escapeHtml(blocker)}</p>`).join("")}
    </div>
  `;
};
var renderExport = (client) => {
  const route = client?.exportRoute();
  const markdown = client?.exportMarkdown() ?? "";
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
  `;
};
var renderModeSwitcher = (mode) => `
  <div class="mode-row">
    ${["mock", "hybrid", "live", "audit", "capture"].map(
  (candidate) => `<button class="mode ${candidate === mode ? "active" : ""}" type="button" data-mode="${candidate}">${modeLabel(
    candidate
  )}</button>`
).join("")}
  </div>
`;
var renderFilters = (filters, includeHighlight = false) => `
  <div class="filters" aria-label="Resource filters">
    <label>Source ${select("source", ["all", ...sourceKinds], filters.source)}</label>
    <label>Status ${select("status", ["all", ...auditStatuses], filters.status)}</label>
    <label>Scope ${select("scope", ["current", "all"], filters.scope)}</label>
    ${includeHighlight ? `<label>Highlight ${select("highlight", ["all", ...sourceKinds], filters.highlight)}</label>` : ""}
    <label><input type="checkbox" data-check-filter="proofOnly" ${filters.proofOnly ? "checked" : ""} /> Proof only</label>
    <label><input type="checkbox" data-check-filter="problemOnly" ${filters.problemOnly ? "checked" : ""} /> Problems only</label>
  </div>
`;
var select = (key, values, selected) => `
  <select data-filter="${key}" aria-label="${key}">
    ${values.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("")}
  </select>
`;
var renderRecordRow = (record) => `
  <article class="row">
    <div class="row-title">
      <span>${escapeHtml(record.resourceKey)}</span>
      <span class="badge ${record.status}">${sourceKindLabels[record.sourceKind]}</span>
    </div>
    <p class="muted">${escapeHtml(record.label)} \xB7 ${statusLabels[record.status]} \xB7 ${record.visibility ?? "mounted"}</p>
    ${record.reason ? `<p>${escapeHtml(record.reason)}</p>` : ""}
    ${record.request?.route ? `<p class="muted">${escapeHtml(record.request.route)}</p>` : ""}
    ${record.fieldCoverage ? `<p class="muted">Coverage: ${record.fieldCoverage.present}/${record.fieldCoverage.total}</p>` : ""}
    ${record.remediation ? `<p class="muted">Next: ${escapeHtml(record.remediation)}</p>` : ""}
  </article>
`;
var metric = (label, value) => `
  <div class="metric">
    <div class="metric-label">${escapeHtml(label)}</div>
    <div class="metric-value">${escapeHtml(value)}</div>
  </div>
`;
var recordsForScope = (snapshot, filters) => filters.scope === "all" ? snapshot.records : snapshot.summary.records;
var filterRecords = (records, filters) => records.filter((record) => {
  if (filters.source !== "all" && record.sourceKind !== filters.source) return false;
  if (filters.status !== "all" && record.status !== filters.status) return false;
  if (filters.proofOnly && !record.proofCritical) return false;
  if (filters.problemOnly && record.status === "ready") return false;
  return true;
});
var modeLabel = (mode) => {
  const labels = {
    mock: "Mock prototype",
    hybrid: "Live + fallback",
    live: "Live only",
    audit: "Live audit",
    capture: "Capture"
  };
  return labels[mode];
};
var capitalise = (value) => `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
var escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
var readTab = (value, fallback) => tabs.includes(value) ? value : fallback;
var nextKeyboardTab = (current, key) => {
  const index = tabs.indexOf(current);
  if (key === "Home") return tabs[0];
  if (key === "End") return tabs[tabs.length - 1];
  if (key === "ArrowRight") return tabs[(index + 1) % tabs.length];
  if (key === "ArrowLeft") return tabs[(index - 1 + tabs.length) % tabs.length];
  return void 0;
};
var readFilters = (value) => {
  if (!value) return defaultFilters;
  try {
    return { ...defaultFilters, ...JSON.parse(value) };
  } catch {
    return defaultFilters;
  }
};
var readPosition = (value, fallback) => value === "bottom-right" || value === "bottom-left" ? value : fallback;
var readPanelPosition = (value, fallback) => value === "left" || value === "right" ? value : fallback;
var downloadText = (filename, text, type) => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

// src/mark.ts
var markSources = /* @__PURE__ */ new Set([
  "derived",
  "hardcoded",
  "authoredFallback",
  "fallback",
  "unknown"
]);
var MockPitMarkElement = class extends HTMLElement {
  client;
  recordId;
  unsubscribe;
  connectedCallback() {
    this.client = this.client ?? window.__MOCKPIT__?.client;
    this.style.position = this.style.position || "relative";
    this.record();
    this.unsubscribe = this.client?.subscribe(() => this.applyHighlight());
    this.applyHighlight();
  }
  disconnectedCallback() {
    if (this.recordId) this.client?.remove(this.recordId);
    this.unsubscribe?.();
  }
  record() {
    const client = this.client;
    if (!client) return;
    const resourceKey = this.dataset.resourceKey ?? this.dataset.mockpitKey ?? this.dataset.provenanceKey;
    const sourceKind = this.dataset.sourceKind ?? this.dataset.mockpitSource ?? this.dataset.provenanceSource;
    if (!resourceKey || !sourceKind || !markSources.has(sourceKind)) return;
    const record = client.recordUiMark({
      resourceKey,
      sourceKind,
      label: this.dataset.label ?? this.dataset.mockpitLabel ?? this.dataset.provenanceLabel ?? resourceKey,
      reason: this.dataset.reason ?? "UI-authored provenance marker.",
      sectionId: this.dataset.sectionId
    });
    this.recordId = record.id;
  }
  applyHighlight() {
    const mode = this.client?.getMode();
    const active = mode === "audit" || mode === "capture";
    const highlighted = document.documentElement.dataset.mockpitHighlightSource ?? "all";
    const sourceKind = this.dataset.sourceKind ?? this.dataset.mockpitSource ?? this.dataset.provenanceSource ?? "unknown";
    if (!active) {
      this.style.outline = "";
      this.style.boxShadow = "";
      this.title = "";
      return;
    }
    if (highlighted !== "all" && highlighted !== sourceKind) {
      this.style.outline = "";
      this.style.boxShadow = "";
      return;
    }
    this.style.outline = "2px solid #f59e0b";
    this.style.outlineOffset = "2px";
    this.style.boxShadow = "0 0 0 4px rgba(245, 158, 11, 0.16)";
    this.title = `${this.dataset.label ?? this.dataset.resourceKey}: ${sourceKind}`;
  }
};
var defineMockPitMarkElement = () => {
  if (!customElements.get("mockpit-mark")) {
    customElements.define("mockpit-mark", MockPitMarkElement);
  }
};
var registerAttributeMarks = (client) => {
  const actualClient = client ?? window.__MOCKPIT__?.client;
  if (!actualClient) return;
  document.querySelectorAll("[data-mockpit-key], [data-provenance-key]").forEach((element) => {
    if (element instanceof MockPitMarkElement) return;
    const resourceKey = element.dataset.mockpitKey ?? element.dataset.provenanceKey;
    const sourceKind = element.dataset.mockpitSource ?? element.dataset.provenanceSource;
    if (!resourceKey || !sourceKind || !markSources.has(sourceKind)) return;
    actualClient.recordUiMark({
      resourceKey,
      sourceKind,
      label: element.dataset.mockpitLabel ?? element.dataset.provenanceLabel ?? resourceKey,
      reason: element.dataset.mockpitReason ?? element.dataset.provenanceReason ?? "DOM attribute provenance marker."
    });
  });
};

// src/section.ts
import { formatSourceMix as formatSourceMix2 } from "@mockpit/core";
var MockPitSectionElement = class extends HTMLElement {
  client;
  unsubscribe;
  connectedCallback() {
    this.client = this.client ?? window.__MOCKPIT__?.client;
    this.unsubscribe = this.client?.subscribe(() => this.applyHighlight());
    this.applyHighlight();
  }
  disconnectedCallback() {
    this.unsubscribe?.();
  }
  applyHighlight() {
    const client = this.client;
    const mode = client?.getMode();
    const active = mode === "audit" || mode === "capture";
    const sectionId = this.dataset.sectionId ?? this.dataset.mockpitSection;
    if (!active || !sectionId || !client) {
      this.style.outline = "";
      this.title = "";
      return;
    }
    const section = client.snapshot().summary.sections.find((candidate) => candidate.id === sectionId);
    if (!section) return;
    this.style.outline = "1px solid #2563eb";
    this.style.outlineOffset = "4px";
    this.title = `${section.label}: ${formatSourceMix2(section.sourceCounts)}`;
  }
};
var defineMockPitSectionElement = () => {
  if (!customElements.get("mockpit-section")) {
    customElements.define("mockpit-section", MockPitSectionElement);
  }
};

// src/index.ts
var defineAllMockPitElements = () => {
  defineMockPitElements();
  defineMockPitMarkElement();
  defineMockPitSectionElement();
  queueMicrotask(() => registerAttributeMarks());
};
export {
  MockPitDevtoolsElement,
  MockPitMarkElement,
  MockPitSectionElement,
  defineAllMockPitElements,
  defineMockPitElements,
  defineMockPitMarkElement,
  defineMockPitSectionElement,
  mountMockPitDevtools,
  registerAttributeMarks
};
//# sourceMappingURL=index.js.map