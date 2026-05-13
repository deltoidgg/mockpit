# MockPit

MockPit is a TypeScript package family for runtime prototype provenance. It helps teams answer:

> What is this screen made of right now?

The MVP is intentionally local-first:

- `@mockpit/core` models source records, modes, sections, capture policies, summaries, and exports.
- `@mockpit/browser` exposes a browser client with audited fetch, wrappers, route/scenario state, transport state, and `window.__MOCKPIT__`.
- `@mockpit/devtools` provides framework-neutral custom elements with Shadow DOM isolation, filters, capture checks, scenarios, and route export.
- `@mockpit/msw` integrates with Mock Service Worker without making MSW a core dependency.
- `@mockpit/react` wraps the browser client and custom elements with provider, hooks, `AuditMark`, and `AuditSection`.
- `@mockpit/cli` provides `init`, `doctor`, and route audit report commands.

This repository is a workspace scaffold and does not require git initialisation.
