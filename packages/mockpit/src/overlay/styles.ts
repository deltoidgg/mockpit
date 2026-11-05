/**
 * One accent, ink on paper. State is encoded by shape first (hatch, dashed
 * outline, nothing) and colour second. No gradients, glows, pulses or icons.
 */
export const styles = /* css */ `
:host {
  all: initial;
  --mp-paper: #ffffff;
  --mp-paper-2: #f6f6f4;
  --mp-ink: #141414;
  --mp-ink-2: #5c5c58;
  --mp-rule: #e6e6e2;
  --mp-mock: #e8641c;
  --mp-mock-ink: #9a3d0c;
  --mp-regress: #b3261e;
  --mp-ui: -apple-system, "Segoe UI", system-ui, sans-serif;
  --mp-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  position: fixed;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  z-index: 2147483646;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :host {
    --mp-paper: #111214;
    --mp-paper-2: #18191c;
    --mp-ink: #ededea;
    --mp-ink-2: #9a9a94;
    --mp-rule: #262729;
    --mp-mock: #ff7a2f;
    --mp-mock-ink: #ffb38a;
    --mp-regress: #ff6b62;
  }
}
:host([data-theme="light"]) { color-scheme: light; }
:host([data-theme="dark"]) {
  --mp-paper: #111214; --mp-paper-2: #18191c; --mp-ink: #ededea; --mp-ink-2: #9a9a94;
  --mp-rule: #262729; --mp-mock: #ff7a2f; --mp-mock-ink: #ffb38a; --mp-regress: #ff6b62;
}

*, *::before, *::after { box-sizing: border-box; }
button, input { font: inherit; color: inherit; }

.mp-root {
  font: 12px/1.45 var(--mp-ui);
  color: var(--mp-ink);
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

/* Paint layer */
.mp-paint {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  overflow: visible;
}
.mp-hatch-tint { fill: var(--mp-mock); fill-opacity: 0.08; }
.mp-hatch-line { stroke: var(--mp-mock); stroke-width: 1; stroke-opacity: 0.65; }
.mp-region rect { vector-effect: non-scaling-stroke; }
.mp-mock rect { fill: url(#mp-hatch); stroke: var(--mp-mock); stroke-opacity: 0.5; stroke-width: 1; }
.mp-shadow rect { fill: none; stroke: var(--mp-mock); stroke-width: 1.25; stroke-dasharray: 4 3; }
.mp-real rect { fill: none; stroke: var(--mp-ink-2); stroke-width: 1; }
.mp-literal rect { fill: none; stroke: var(--mp-ink-2); stroke-width: 1; stroke-dasharray: 1 2; }
.mp-highlight rect { stroke-width: 2; stroke-opacity: 1; }
.mp-pinned rect { stroke-opacity: 1; }
.mp-pin-label {
  font: 600 10px var(--mp-mono);
  fill: var(--mp-mock-ink);
  paint-order: stroke;
  stroke: var(--mp-paper);
  stroke-width: 3px;
}
.mp-new { animation: mp-fade 120ms ease-out; }
@keyframes mp-fade { from { opacity: 0; } to { opacity: 1; } }

/* Strip */
.mp-strip {
  position: fixed;
  left: 0;
  bottom: 0;
  height: 28px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px 0 10px;
  margin: 0;
  border: 0;
  border-top: 1px solid var(--mp-rule);
  border-right: 1px solid var(--mp-rule);
  border-radius: 0 4px 0 0;
  background: var(--mp-paper);
  color: var(--mp-ink-2);
  font: 11px var(--mp-mono);
  cursor: pointer;
}
.mp-strip:hover, .mp-strip[aria-pressed="true"] { color: var(--mp-ink); }
.mp-strip:focus-visible, .mp-text-button:focus-visible, .mp-tab:focus-visible, .mp-list:focus-visible {
  outline: 2px solid var(--mp-mock);
  outline-offset: -2px;
}
.mp-bar { display: flex; width: 96px; height: 8px; gap: 1px; }
.mp-seg { display: block; height: 100%; }
.mp-seg-real { background: var(--mp-ink-2); opacity: 0.35; }
.mp-seg-shadowed { border: 1px dashed var(--mp-mock); }
.mp-seg-mocked { background: repeating-linear-gradient(45deg, var(--mp-mock) 0 1px, transparent 1px 4px); box-shadow: inset 0 0 0 1px var(--mp-mock); }

/* Drawer */
.mp-drawer {
  position: fixed;
  display: flex;
  flex-direction: column;
  background: var(--mp-paper);
  color: var(--mp-ink);
  animation: mp-rise 140ms ease-out;
}
.mp-drawer.mp-dock-bottom { left: 0; right: 0; bottom: 28px; border-top: 1px solid var(--mp-rule); min-height: 160px; }
.mp-drawer.mp-dock-right { top: 0; right: 0; bottom: 28px; border-left: 1px solid var(--mp-rule); min-width: 320px; }
@keyframes mp-rise { from { transform: translateY(6px); opacity: 0; } to { transform: none; opacity: 1; } }
.mp-dock-right .mp-drawer { animation-name: mp-slide; }
@keyframes mp-slide { from { transform: translateX(6px); opacity: 0; } to { transform: none; opacity: 1; } }
.mp-handle { flex: none; height: 9px; cursor: ns-resize; display: flex; justify-content: center; align-items: center; touch-action: none; }
.mp-handle::after { content: ""; width: 32px; height: 1px; background: var(--mp-ink-2); }
.mp-dock-right .mp-handle { position: absolute; left: 0; top: 0; bottom: 0; width: 9px; height: auto; cursor: ew-resize; }
.mp-dock-right .mp-handle::after { width: 1px; height: 32px; }
.mp-resizing { user-select: none; }
.mp-head { display: flex; align-items: center; gap: 14px; padding: 0 14px 8px; border-bottom: 1px solid var(--mp-rule); flex-wrap: wrap; }
.mp-project { font-weight: 600; font-size: 13px; }
.mp-context { max-width: 32ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-tabs { display: flex; gap: 14px; }
.mp-tab { appearance: none; border: 0; background: none; padding: 4px 0; cursor: pointer; color: var(--mp-ink-2); border-bottom: 2px solid transparent; }
.mp-tab:hover { color: var(--mp-ink); }
.mp-tab.mp-current { color: var(--mp-ink); border-bottom-color: var(--mp-mock); }
.mp-spacer { flex: 1; }
.mp-body { flex: 1; overflow: auto; padding: 4px 0 12px; overscroll-behavior: contain; }
.mp-warning { padding: 6px 14px; border-bottom: 1px solid var(--mp-rule); color: var(--mp-mock-ink); display: flex; gap: 12px; align-items: center; }
.mp-empty { color: var(--mp-ink-2); padding: 18px 14px; margin: 0; }

.mp-text-button {
  appearance: none;
  border: 0;
  background: none;
  padding: 2px 0;
  cursor: pointer;
  color: var(--mp-ink-2);
  text-decoration: underline;
  text-decoration-color: var(--mp-rule);
  text-underline-offset: 3px;
}
.mp-text-button:hover { color: var(--mp-ink); text-decoration-color: currentColor; }
.mp-text-button.mp-primary { color: var(--mp-mock-ink); text-decoration-color: var(--mp-mock); }
.mp-text-button.mp-current { color: var(--mp-ink); text-decoration-color: var(--mp-mock); }

.mp-mono, .mp-key, .mp-num { font-family: var(--mp-mono); }
.mp-dim { color: var(--mp-ink-2); }

/* Rows */
.mp-list { list-style: none; margin: 0; padding: 0; outline: none; }
.mp-row { border-bottom: 1px solid var(--mp-rule); }
.mp-row:hover, .mp-row.mp-active { background: var(--mp-paper-2); }
.mp-line {
  display: grid;
  grid-template-columns: 10px minmax(12ch, 1fr) 11ch 92px 6ch 8ch;
  gap: 12px;
  align-items: center;
  padding: 5px 14px;
  cursor: pointer;
  min-height: 28px;
}
.mp-dock-right .mp-line { grid-template-columns: 10px minmax(10ch, 1fr) 9ch 84px; }
.mp-dock-right .mp-line > :nth-child(n+5) { display: none; }
.mp-key { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.mp-stage { color: var(--mp-ink-2); }
.mp-stage-mocked, .mp-stage-shadowed { color: var(--mp-mock-ink); }
.mp-regressed .mp-stage { color: var(--mp-regress); }
.mp-when { text-align: right; }
.mp-glyph { width: 10px; height: 10px; display: block; }
.mp-glyph-mocked { background: repeating-linear-gradient(45deg, var(--mp-mock) 0 1px, transparent 1px 3px); box-shadow: inset 0 0 0 1px var(--mp-mock); }
.mp-glyph-shadowed { border: 1px dashed var(--mp-mock); }
.mp-glyph-unmocked, .mp-glyph-real, .mp-glyph-retired { background: none; }
.mp-parity { display: flex; align-items: center; gap: 6px; }
.mp-parity .mp-num { width: 4ch; text-align: right; }
.mp-pbar { flex: none; width: 48px; height: 3px; background: var(--mp-rule); }
.mp-pfill { display: block; height: 100%; background: var(--mp-ink-2); }
.mp-pbar-none { background: none; }
.mp-note { padding: 0 14px 6px 36px; color: var(--mp-ink-2); }
.mp-detail { padding: 2px 14px 10px 36px; display: flex; flex-direction: column; gap: 6px; }
.mp-failure { color: var(--mp-regress); font-family: var(--mp-mono); }
.mp-diff { border-collapse: collapse; font-size: 12px; }
.mp-diff td { padding: 1px 16px 1px 0; vertical-align: top; }
.mp-diff-kind { color: var(--mp-ink-2); width: 7ch; }
.mp-diff-missing .mp-mono:first-of-type, .mp-diff-type .mp-mono:first-of-type { color: var(--mp-mock-ink); }
.mp-diff-extra { color: var(--mp-ink-2); }
.mp-actions { display: flex; gap: 14px; flex-wrap: wrap; }
.mp-note-edit { display: flex; gap: 10px; align-items: center; }
.mp-input {
  flex: 1;
  max-width: 48ch;
  border: 0;
  border-bottom: 1px solid var(--mp-ink-2);
  background: transparent;
  padding: 3px 0;
  outline: none;
}
.mp-input:focus { border-bottom-color: var(--mp-mock); }

/* Ledger */
.mp-ledger-head { display: flex; gap: 12px; padding: 8px 14px 4px; align-items: center; }
.mp-burn { display: flex; align-items: center; gap: 8px; padding: 4px 14px 8px; }
.mp-burn-svg { flex: 1; height: 32px; overflow: visible; }
.mp-burn-line { fill: none; stroke: var(--mp-ink-2); stroke-width: 1; vector-effect: non-scaling-stroke; }
.mp-burn-tick { stroke: var(--mp-mock); stroke-width: 3; vector-effect: non-scaling-stroke; }
.mp-sort { display: flex; gap: 12px; padding: 0 14px 6px; align-items: baseline; }

/* Literals */
.mp-literals { padding: 4px 14px; display: flex; flex-direction: column; gap: 12px; }
.mp-literal-head { display: flex; gap: 12px; font-weight: 600; border-bottom: 1px solid var(--mp-rule); padding-bottom: 3px; }
.mp-literal-head .mp-mono { font-weight: 400; }
.mp-literal-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.mp-literal-list li { display: flex; gap: 12px; justify-content: space-between; }
.mp-literal-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Inspect card */
.mp-card {
  position: fixed;
  width: 280px;
  padding: 10px 12px;
  background: var(--mp-paper);
  color: var(--mp-ink);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  gap: 3px;
  pointer-events: none;
  font: 12px/1.45 var(--mp-ui);
}
.mp-card-pinned { pointer-events: auto; }
.mp-card-key { font-weight: 600; overflow-wrap: anywhere; }
.mp-card-source { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.mp-card .mp-actions { margin-top: 6px; }
.mp-hint { font-size: 11px; }

@media (prefers-reduced-motion: reduce) {
  .mp-drawer, .mp-new { animation: none; }
}
`
