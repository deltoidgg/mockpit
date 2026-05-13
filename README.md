# MockKit

MockKit is a TypeScript package family for runtime prototype provenance. It helps teams answer:

> What is this screen made of right now?

The MVP is intentionally local-first:

- `@mockkit/core` models source records, modes, sections, capture policies, summaries, and exports.
- `@mockkit/browser` exposes a browser client with audited fetch, wrappers, storage, and `window.__MOCKKIT__`.
- `@mockkit/devtools` provides framework-neutral custom elements with Shadow DOM isolation.
- `@mockkit/msw` integrates with Mock Service Worker without making MSW a core dependency.

This repository is a workspace scaffold and does not require git initialisation.
