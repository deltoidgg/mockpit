"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  MockKitDevtoolsElement: () => MockKitDevtoolsElement,
  MockKitMarkElement: () => MockKitMarkElement,
  defineAllMockKitElements: () => defineAllMockKitElements,
  defineMockKitElements: () => defineMockKitElements,
  defineMockKitMarkElement: () => defineMockKitMarkElement,
  mountMockKitDevtools: () => mountMockKitDevtools
});
module.exports = __toCommonJS(index_exports);

// src/devtools.ts
var import_core = require("@mockkit/core");

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
var tabs = ["Overview", "Route", "Resources", "UI Marks", "Capture", "Export"];
var MockKitDevtoolsElement = class extends HTMLElement {
  client;
  isOpen = false;
  selectedTab = "Overview";
  position = "bottom-left";
  panelPosition = "right";
  unsubscribe;
  keyHandler = (event) => {
    if (event.altKey && event.shiftKey && event.code === "KeyP") {
      this.setOpen(!this.isOpen);
    }
  };
  connectedCallback() {
    this.client = this.client ?? window.__MOCKKIT__?.client;
    this.position = readPosition(this.getAttribute("position"), "bottom-left");
    this.panelPosition = readPanelPosition(this.getAttribute("panel-position"), "right");
    const initial = this.getAttribute("initial-is-open");
    this.isOpen = initial === "true" || this.readOpenState();
    this.attachShadow({ mode: "open" });
    this.unsubscribe = this.client?.subscribe(() => this.render());
    window.addEventListener("keydown", this.keyHandler);
    this.render();
  }
  disconnectedCallback() {
    this.unsubscribe?.();
    window.removeEventListener("keydown", this.keyHandler);
  }
  setClient(client) {
    this.client = client;
    this.unsubscribe?.();
    this.unsubscribe = client.subscribe(() => this.render());
    this.render();
  }
  setOpen(next) {
    this.isOpen = next;
    this.writeOpenState();
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
    const label = snapshot ? `MockKit \xB7 ${capitalise(snapshot.mode)} \xB7 ${snapshot.summary.capture?.status === "blocked" ? "Blocked" : (0, import_core.formatSourceMix)(snapshot.summary.sourceCounts)}` : "MockKit \xB7 No client";
    return `<button class="trigger ${this.position}" type="button" data-action="toggle">${escapeHtml(
      label
    )}</button>`;
  }
  renderPanel(snapshot) {
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
          ${tabs.map(
      (tab) => `<button class="tab" type="button" role="tab" aria-selected="${tab === this.selectedTab}" data-tab="${tab}">${tab}</button>`
    ).join("")}
        </nav>
        <main class="content">
          ${snapshot ? this.renderTab(snapshot) : "<p>No MockKit client is available.</p>"}
        </main>
      </section>
    `;
  }
  renderTab(snapshot) {
    switch (this.selectedTab) {
      case "Route":
        return renderRoute(snapshot);
      case "Resources":
        return renderResources(snapshot);
      case "UI Marks":
        return renderUiMarks(snapshot);
      case "Capture":
        return renderCapture(snapshot);
      case "Export":
        return renderExport(this.client);
      default:
        return renderOverview(snapshot);
    }
  }
  bindEvents() {
    this.shadowRoot?.querySelectorAll("[data-action='toggle']").forEach((button) => {
      button.addEventListener("click", () => this.setOpen(!this.isOpen));
    });
    this.shadowRoot?.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        this.selectedTab = button.dataset.tab;
        this.render();
      });
    });
    this.shadowRoot?.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        this.client?.setMode(button.dataset.mode);
        this.render();
      });
    });
    this.shadowRoot?.querySelector("[data-copy-json]")?.addEventListener("click", () => {
      const json = this.client?.exportJson();
      if (json && navigator.clipboard) void navigator.clipboard.writeText(json);
    });
  }
  readOpenState() {
    const key = this.openStateKey();
    if (!key) return false;
    return window.localStorage.getItem(key) === "true";
  }
  writeOpenState() {
    const key = this.openStateKey();
    if (!key) return;
    window.localStorage.setItem(key, String(this.isOpen));
  }
  openStateKey() {
    return this.client ? `${this.client.config.project}.mockkit.devtools.open` : void 0;
  }
};
var defineMockKitElements = () => {
  if (!customElements.get("mockkit-devtools")) {
    customElements.define("mockkit-devtools", MockKitDevtoolsElement);
  }
};
var mountMockKitDevtools = (options = {}) => {
  defineMockKitElements();
  const element = document.createElement("mockkit-devtools");
  if (options.client) element.client = options.client;
  if (typeof options.initialIsOpen === "boolean") {
    element.setAttribute("initial-is-open", String(options.initialIsOpen));
  }
  if (options.position) element.setAttribute("position", options.position);
  if (options.panelPosition) element.setAttribute("panel-position", options.panelPosition);
  document.body.append(element);
  return element;
};
var renderOverview = (snapshot) => `
  <div class="grid">
    ${metric("Mode", capitalise(snapshot.mode))}
    ${metric("Status", import_core.statusLabels[snapshot.summary.status])}
    ${metric("Source mix", (0, import_core.formatSourceMix)(snapshot.summary.sourceCounts))}
    ${metric("Highest risk", import_core.sourceKindLabels[snapshot.summary.highestRisk])}
  </div>
  <div class="mode-row">
    ${["mock", "hybrid", "live", "audit", "capture"].map(
  (mode) => `<button class="mode ${mode === snapshot.mode ? "active" : ""}" type="button" data-mode="${mode}">${modeLabel(
    mode
  )}</button>`
).join("")}
  </div>
  <div class="list">
    ${snapshot.summary.records.filter((record) => record.status !== "ready").slice(0, 5).map(renderRecordRow).join("") || `<p class="muted">No current route issues.</p>`}
  </div>
`;
var renderRoute = (snapshot) => `
  <div class="list">
    ${snapshot.summary.sections.map(
  (section) => `
            <section class="section">
              <div class="row-title">
                <span>${escapeHtml(section.label)}</span>
                <span class="badge ${section.status}">${import_core.statusLabels[section.status]}</span>
              </div>
              <p class="muted">Mix: ${escapeHtml((0, import_core.formatSourceMix)(section.sourceCounts))}</p>
              <p class="muted">Highest risk: ${import_core.sourceKindLabels[section.highestRisk]}</p>
            </section>
          `
).join("") || `<p class="muted">No sections configured for this route.</p>`}
  </div>
`;
var renderResources = (snapshot) => `
  <div class="list">
    ${snapshot.summary.records.map(renderRecordRow).join("") || `<p class="muted">No records.</p>`}
  </div>
`;
var renderUiMarks = (snapshot) => {
  const marks = snapshot.records.filter((record) => record.resourceKey.startsWith("ui."));
  return `<div class="list">${marks.map(renderRecordRow).join("") || `<p class="muted">No UI marks.</p>`}</div>`;
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
  const json = client?.exportJson() ?? "{}";
  return `
    <button class="copy" type="button" data-copy-json>Copy current route JSON</button>
    <pre>${escapeHtml(json)}</pre>
  `;
};
var renderRecordRow = (record) => `
  <article class="row">
    <div class="row-title">
      <span>${escapeHtml(record.resourceKey)}</span>
      <span class="badge ${record.status}">${import_core.sourceKindLabels[record.sourceKind]}</span>
    </div>
    <p class="muted">${escapeHtml(record.label)} \xB7 ${import_core.statusLabels[record.status]}</p>
    ${record.reason ? `<p>${escapeHtml(record.reason)}</p>` : ""}
    ${record.fieldCoverage ? `<p class="muted">Coverage: ${record.fieldCoverage.present}/${record.fieldCoverage.total}</p>` : ""}
  </article>
`;
var metric = (label, value) => `
  <div class="metric">
    <div class="metric-label">${escapeHtml(label)}</div>
    <div class="metric-value">${escapeHtml(value)}</div>
  </div>
`;
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
var readPosition = (value, fallback) => value === "bottom-right" || value === "bottom-left" ? value : fallback;
var readPanelPosition = (value, fallback) => value === "left" || value === "right" ? value : fallback;

// src/mark.ts
var markSources = /* @__PURE__ */ new Set([
  "derived",
  "hardcoded",
  "authoredFallback",
  "fallback",
  "unknown"
]);
var MockKitMarkElement = class extends HTMLElement {
  client;
  recordId;
  unsubscribe;
  connectedCallback() {
    this.client = this.client ?? window.__MOCKKIT__?.client;
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
    const resourceKey = this.dataset.resourceKey;
    const sourceKind = this.dataset.sourceKind;
    if (!resourceKey || !sourceKind || !markSources.has(sourceKind)) return;
    const record = client.recordUiMark({
      resourceKey,
      sourceKind,
      label: this.dataset.label ?? resourceKey,
      reason: this.dataset.reason ?? "UI-authored provenance marker.",
      sectionId: this.dataset.sectionId
    });
    this.recordId = record.id;
  }
  applyHighlight() {
    const mode = this.client?.getMode();
    const active = mode === "audit" || mode === "capture";
    if (!active) {
      this.style.outline = "";
      this.style.boxShadow = "";
      this.title = "";
      return;
    }
    this.style.outline = "2px solid #f59e0b";
    this.style.outlineOffset = "2px";
    this.style.boxShadow = "0 0 0 4px rgba(245, 158, 11, 0.16)";
    this.title = `${this.dataset.label ?? this.dataset.resourceKey}: ${this.dataset.sourceKind}`;
  }
};
var defineMockKitMarkElement = () => {
  if (!customElements.get("mockkit-mark")) {
    customElements.define("mockkit-mark", MockKitMarkElement);
  }
};

// src/index.ts
var defineAllMockKitElements = () => {
  defineMockKitElements();
  defineMockKitMarkElement();
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MockKitDevtoolsElement,
  MockKitMarkElement,
  defineAllMockKitElements,
  defineMockKitElements,
  defineMockKitMarkElement,
  mountMockKitDevtools
});
//# sourceMappingURL=index.cjs.map