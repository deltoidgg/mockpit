export const devtoolsStyles = `
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
`
