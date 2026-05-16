export const devtoolsStyles = `
:host {
  all: initial;
  color-scheme: dark;
  --mp-bg: #0a0a0b;
  --mp-surface: #111113;
  --mp-card: #141416;
  --mp-raised: #1a1a1d;
  --mp-border: #1f1f23;
  --mp-border-hover: #2a2a2e;
  --mp-text: #fafafa;
  --mp-muted: #888;
  --mp-accent: #34d399;
  --mp-accent-soft: rgba(52, 211, 153, 0.08);
  --mp-accent-border: rgba(52, 211, 153, 0.3);
  --mp-ready: #34d399;
  --mp-warning: #fbbf24;
  --mp-blocked: #f87171;
  --mp-info: #60a5fa;
  --mp-focus-ring: 0 0 0 2px rgba(52, 211, 153, 0.4);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

*, *::before, *::after {
  box-sizing: border-box;
}

button, select, input {
  font: inherit;
  color: inherit;
}

.trigger {
  position: fixed;
  z-index: 2147483647;
  border: 1px solid var(--mp-border);
  background: var(--mp-surface);
  color: var(--mp-muted);
  border-radius: 999px;
  padding: 7px 14px 7px 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease;
}

.trigger::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--mp-accent);
  flex-shrink: 0;
  box-shadow: 0 0 6px rgba(52, 211, 153, 0.5);
}

.trigger:hover {
  border-color: var(--mp-border-hover);
  transform: translateY(-1px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

.trigger:focus-visible {
  outline: none;
  box-shadow: var(--mp-focus-ring);
}

.bottom-left { left: 16px; bottom: 16px; }
.bottom-right { right: 16px; bottom: 16px; }

.panel {
  position: fixed;
  z-index: 2147483647;
  top: 16px;
  bottom: 16px;
  width: min(520px, calc(100vw - 32px));
  background: var(--mp-bg);
  color: var(--mp-text);
  border: 1px solid var(--mp-border);
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: mp-panel-in 200ms ease both;
}

@keyframes mp-panel-in {
  from { opacity: 0; transform: translateX(12px); }
  to { opacity: 1; transform: translateX(0); }
}

.panel.left {
  left: 16px;
  animation-name: mp-panel-in-left;
}

@keyframes mp-panel-in-left {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
}

.panel.right { right: 16px; }

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--mp-border);
  background: var(--mp-surface);
}

.title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.subtitle {
  color: var(--mp-muted);
  font-size: 11px;
  font-weight: 500;
  font-family: "JetBrains Mono", ui-monospace, "SFMono-Regular", monospace;
}

.close {
  border: 1px solid var(--mp-border);
  border-radius: 6px;
  background: var(--mp-card);
  cursor: pointer;
  padding: 5px 10px;
  font-size: 11px;
  color: var(--mp-muted);
  transition: border-color 150ms ease, color 150ms ease;
}

.close:hover {
  border-color: var(--mp-border-hover);
  color: var(--mp-text);
}

.close:focus-visible {
  outline: none;
  box-shadow: var(--mp-focus-ring);
}

.tabs {
  display: flex;
  overflow-x: auto;
  border-bottom: 1px solid var(--mp-border);
  background: var(--mp-surface);
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar { display: none; }

.tab {
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: var(--mp-muted);
  white-space: nowrap;
  transition: color 150ms ease, border-color 150ms ease;
}

.tab:hover {
  color: var(--mp-text);
}

.tab[aria-selected="true"] {
  color: var(--mp-text);
  font-weight: 600;
  border-bottom-color: var(--mp-accent);
}

.tab:focus-visible {
  outline: none;
  box-shadow: inset var(--mp-focus-ring);
}

.content {
  overflow: auto;
  padding: 14px;
  font-size: 12px;
  line-height: 1.5;
  scrollbar-width: thin;
  scrollbar-color: #2a2a2e transparent;
}

.content::-webkit-scrollbar { width: 6px; }
.content::-webkit-scrollbar-track { background: transparent; }
.content::-webkit-scrollbar-thumb { background: #2a2a2e; border-radius: 3px; }
.content::-webkit-scrollbar-thumb:hover { background: #3a3a3e; }

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.metric, .row, .section {
  border: 1px solid var(--mp-border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--mp-card);
  transition: border-color 200ms ease;
}

.row:hover, .section:hover {
  border-color: var(--mp-border-hover);
}

.metric-label, .muted {
  color: var(--mp-muted);
  font-size: 11px;
}

.metric-value {
  margin-top: 3px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
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
  border: 1px solid var(--mp-border);
  border-radius: 10px;
  padding: 8px 10px;
  margin: 10px 0;
  background: var(--mp-card);
}

.filters label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--mp-muted);
  font-size: 11px;
  cursor: pointer;
}

.filters select {
  border: 1px solid var(--mp-border);
  border-radius: 6px;
  background: var(--mp-raised);
  padding: 3px 6px;
  color: var(--mp-text);
  font-size: 11px;
  transition: border-color 150ms ease;
  -webkit-appearance: none;
  appearance: none;
}

.filters select:hover {
  border-color: var(--mp-border-hover);
}

.filters select:focus-visible {
  outline: none;
  box-shadow: var(--mp-focus-ring);
}

.filters input[type="checkbox"] {
  accent-color: var(--mp-accent);
  width: 13px;
  height: 13px;
}

.mode {
  border: 1px solid var(--mp-border);
  background: var(--mp-card);
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  color: var(--mp-muted);
  transition: all 150ms ease;
}

.mode:hover {
  border-color: var(--mp-border-hover);
  color: var(--mp-text);
}

.mode.active {
  border-color: var(--mp-accent-border);
  color: var(--mp-accent);
  background: var(--mp-accent-soft);
  font-weight: 600;
}

.mode:focus-visible {
  outline: none;
  box-shadow: var(--mp-focus-ring);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 12px;
}

.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  background: rgba(136, 136, 136, 0.1);
  color: var(--mp-muted);
  border: 1px solid transparent;
}

.badge.ready {
  background: rgba(52, 211, 153, 0.1);
  color: var(--mp-ready);
  border-color: rgba(52, 211, 153, 0.2);
}

.badge.warning, .badge.unknown {
  background: rgba(251, 191, 36, 0.1);
  color: var(--mp-warning);
  border-color: rgba(251, 191, 36, 0.2);
}

.badge.blocked, .badge.error {
  background: rgba(248, 113, 113, 0.1);
  color: var(--mp-blocked);
  border-color: rgba(248, 113, 113, 0.2);
}

.ready { color: var(--mp-ready); }
.warning, .unknown { color: var(--mp-warning); }
.blocked, .error { color: var(--mp-blocked); }

p {
  margin: 4px 0 0;
}

pre {
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid var(--mp-border);
  background: var(--mp-surface);
  color: #e2e8f0;
  padding: 12px;
  border-radius: 10px;
  max-height: 280px;
  overflow: auto;
  font-family: "JetBrains Mono", ui-monospace, "SFMono-Regular", monospace;
  font-size: 11px;
  line-height: 1.6;
  scrollbar-width: thin;
  scrollbar-color: #2a2a2e transparent;
}

pre::-webkit-scrollbar { width: 6px; height: 6px; }
pre::-webkit-scrollbar-track { background: transparent; }
pre::-webkit-scrollbar-thumb { background: #2a2a2e; border-radius: 3px; }

.copy {
  border: 1px solid var(--mp-border);
  background: var(--mp-card);
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  color: var(--mp-muted);
  transition: all 150ms ease;
}

.copy:hover {
  border-color: var(--mp-accent-border);
  color: var(--mp-accent);
  background: var(--mp-accent-soft);
}

.copy:focus-visible {
  outline: none;
  box-shadow: var(--mp-focus-ring);
}
`
