# MockPit

Runtime provenance devtools for prototype-driven development.

MockPit is a TypeScript package family that records, visualises, and exports data provenance from a running prototype. It answers one question:

> **What is this screen made of right now?**

Any given route can mix live API data, MSW mocks, fixture fallbacks, hardcoded copy, derived values, empty responses, unsupported capabilities, and errors. MockPit makes that mix visible so you can prototype fast without losing track of what's real.

## Why MockPit?

Prototype-driven development (especially with AI-assisted coding) produces screens that look convincing before their data sources are trustworthy. MockPit classifies every piece of visible data into a source taxonomy:

| Source | What it means |
| --- | --- |
| `api` | Came from a live service response |
| `mock` | Came from mock transport (e.g. MSW) |
| `fallback` | Live data failed, so a fixture fallback was substituted |
| `derived` | Computed locally from other inputs |
| `hardcoded` | Written directly in the app |
| `authoredFallback` | Human-written fallback copy shown because source data is absent |
| `empty` | Live request succeeded but returned nothing usable |
| `unsupported` | Backend capability or route isn't available |
| `error` | Request, parsing, or handler failure |
| `unknown` | Couldn't be classified |

## Features

- In-app devtools panel with tabs for Overview, Route, Resources, UI Marks, Fallbacks, Scenarios, Capture, and Export
- Audited fetch: wrap `fetch` or any async operation to automatically classify and record data sources
- Framework-neutral: core and devtools use Shadow DOM custom elements, works with any framework or vanilla JS
- React adapter with provider, hooks, `AuditMark`, `AuditSection`, and devtools components
- Optional MSW adapter with handler decoration, critical route detection, and stale worker cleanup
- Five trust modes: `mock`, `hybrid`, `live`, `audit`, and `capture`
- Capture policies to define per-route proof requirements and block recording until data sources meet thresholds
- CLI audits: visit routes with Playwright, collect provenance snapshots, generate JSON/Markdown reports
- Metadata-only exports by default, with redaction policies required before including values

## Packages

| Package | What it does |
| --- | --- |
| `@mockpit/core` | Source taxonomy, data model, config validation, mode policies, capture evaluation, summaries, export/redaction |
| `@mockpit/browser` | Browser client, audited fetch, localStorage-backed state, route adapters, `window.__MOCKPIT__` global hook |
| `@mockpit/devtools` | Custom elements (`mockpit-devtools`, `mockpit-mark`, `mockpit-section`) with Shadow DOM isolation |
| `@mockpit/msw` | MSW adapter with handler decoration, browser/node subpath exports, critical route detection |
| `@mockpit/react` | `MockPitProvider`, hooks, `MockPitDevtools`, `AuditMark`, `AuditSection` |
| `@mockpit/cli` | `mockpit init`, `mockpit doctor`, `mockpit audit` commands |

## Quick Start

### Vanilla (no framework, no MSW)

#### Install

```sh
pnpm add -D @mockpit/core @mockpit/browser @mockpit/devtools
```

#### Configure

```ts
// mockpit.config.ts
import { defineMockPitConfig, defineResource, defineSection } from "@mockpit/core"

export const config = defineMockPitConfig({
  project: "my-app",
  mode: { default: "mock" },
  resources: [
    defineResource({
      key: "customers.list",
      label: "Customer list",
      match: { method: "GET", url: "/api/customers" },
      assess: (data: { customers: unknown[] }) => ({
        empty: data.customers.length === 0,
        coverage: { present: data.customers.length > 0 ? 1 : 0, total: 1 },
      }),
      fallback: () => import("./fixtures/customers").then((m) => m.customers),
    }),
  ],
  sections: [
    defineSection({
      route: "/customers",
      id: "customers.table",
      label: "Customer table",
      resources: ["customers.list"],
    }),
  ],
})
```

#### Create client and mount devtools

```ts
import { createMockPitClient } from "@mockpit/browser"
import { defineAllMockPitElements, mountMockPitDevtools } from "@mockpit/devtools"
import { config } from "./mockpit.config"

const mockpit = createMockPitClient({ config })

defineAllMockPitElements()
mountMockPitDevtools({ client: mockpit })
```

#### Instrument fetch

```ts
const data = await mockpit.fetch("customers.list", "/api/customers")
```

#### Mark hardcoded UI values

```html
<mockpit-mark
  data-resource-key="ui.customers.emptyState"
  data-source-kind="hardcoded"
  data-label="Customer empty state copy"
>
  No customers match this filter.
</mockpit-mark>
```

### React

#### Install

```sh
pnpm add -D @mockpit/core @mockpit/browser @mockpit/devtools @mockpit/react
```

#### Mount

```tsx
import { createMockPitClient } from "@mockpit/browser"
import { MockPitProvider, MockPitDevtools } from "@mockpit/react"
import { config } from "./mockpit.config"

const mockpit = createMockPitClient({ config })

function Root() {
  return (
    <MockPitProvider client={mockpit}>
      <App />
      <MockPitDevtools />
    </MockPitProvider>
  )
}
```

#### Use hooks and markers

```tsx
import { useRouteProvenance, useMockPitMode, AuditMark, AuditSection } from "@mockpit/react"

function CustomerPage() {
  const summary = useRouteProvenance()
  const { mode, setMode } = useMockPitMode()

  return (
    <AuditSection id="customers.table">
      <h1>Customers</h1>
      <AuditMark
        resourceKey="ui.customers.emptyState"
        sourceKind="hardcoded"
        label="Customer empty state copy"
      >
        No customers found.
      </AuditMark>
    </AuditSection>
  )
}
```

#### Hooks

| Hook | Returns |
| --- | --- |
| `useMockPitClient()` | The `MockPitClient` instance |
| `useMockPitSnapshot()` | Full provenance snapshot (reactive) |
| `useMockPitMode()` | `{ mode, setMode }` |
| `useMockPitRecords(filter?)` | Filtered or all audit records |
| `useRouteProvenance()` | Route summary with source distribution |
| `useSectionProvenance(id)` | Section summary |
| `useCaptureStatus()` | Capture evaluation for current route |
| `useScenarioControls()` | `{ scenarios, definitions, setScenario }` |

### With MSW

#### Install

```sh
pnpm add -D @mockpit/core @mockpit/browser @mockpit/devtools @mockpit/msw msw
```

#### Set up the worker

Use `@mockpit/msw/browser` in browser apps and `@mockpit/msw/node` in tests.

```ts
import { http, HttpResponse } from "msw"
import { setupMockPitWorker, withMockPitHandler } from "@mockpit/msw/browser"

const worker = await setupMockPitWorker({
  mockpit,
  critical: ["GET /api/customers"],
  handlers: [
    http.get(
      "/api/customers",
      withMockPitHandler("customers.list", () =>
        HttpResponse.json({ customers: [{ id: 1, name: "Acme" }] }),
        { mockpit, method: "GET", url: "/api/customers" },
      ),
    ),
  ],
})

await worker.start()
```

`withMockPitHandler` records `mock` source for the resource, adds an `x-mockpit-source: mock` response header, and catches handler errors.

`critical` routes trigger a `blocked` transport record if an unhandled request matches during mock mode.

#### Clean up stale workers

```ts
import { cleanupMswWorkers } from "@mockpit/msw/browser"

await cleanupMswWorkers({ scriptName: "/mockServiceWorker.js" })
```

## Browser Client API

`createMockPitClient` returns a client with these methods:

```ts
const mockpit = createMockPitClient({ config })

// Audited fetch, classifies source automatically
const data = await mockpit.fetch("customers.list", "/api/customers")

// Wrap any async operation
const detail = await mockpit.wrap("customers.detail", () => sdk.getCustomer(id))

// Manual recording
mockpit.record({ resourceKey: "ui.title", sourceKind: "hardcoded", status: "warning" })
mockpit.recordResource({ resourceKey: "orders.list", sourceKind: "api", status: "ready" })
mockpit.recordUiMark({ resourceKey: "ui.copy", sourceKind: "authoredFallback", label: "Fallback copy" })
mockpit.recordTransportIssue({ sourceKind: "unknown", status: "blocked", reason: "Unhandled request" })

// Mode control
const mode = mockpit.getMode()
const transition = mockpit.setMode("audit") // returns { requiresReload, ... }

// Route
mockpit.setRoute("/customers/123", "/customers/:id")

// Scenarios
mockpit.setScenario("persona", "enterprise-buyer")

// Snapshot and export
const snapshot = mockpit.snapshot()
const routeExport = mockpit.exportRoute()
const markdown = mockpit.exportMarkdown()
const json = mockpit.exportJson()

// Subscribe to changes
const unsubscribe = mockpit.subscribe(() => { /* records changed */ })
```

### Global hook

By default the client sets `window.__MOCKPIT__` with `version`, `client`, `snapshot`, `exportRoute`, and `subscribe`. The CLI `audit` command and devtools both read from this. You can disable it with `exposeGlobal: false`.

## Modes

Modes are trust policies, not feature flags.

| Mode | Transport | Fallback | Highlights | When to use |
| --- | --- | --- | --- | --- |
| `mock` | Mock transport allowed | Not needed | Optional | Fixture-driven prototyping |
| `hybrid` | Live first | Explicit fallback allowed | Panel warnings | Partial backend integration |
| `live` | Live only | No fallback | None | Integration testing |
| `audit` | Live only | No fallback | Shows source categories | Visual source review |
| `capture` | Live only | Blocked by default | Preflight checklist | Recorded demos, customer proof |

Switch modes at runtime:

```ts
mockpit.setMode("audit")
```

If a mode transition requires stopping mock transport, it returns `{ requiresReload: true }`.

## Capture Policies

Capture policies let you define what must be live before a route can be treated as proof:

```ts
import { defineCapturePolicy } from "@mockpit/core"

defineCapturePolicy({
  route: "/customers/:id",
  required: [
    { resourceKey: "customers.detail", allowedSources: ["api"], minCoverage: 0.8 },
  ],
  blockOn: ["mock", "fallback", "unsupported", "error", "unknown"],
})
```

The devtools Capture tab shows a pass/fail checklist. The CLI `audit` command can fail CI when capture policies aren't met.

## Scenarios

Scenarios describe demo context (persona, locale, fixture variant) separately from data source provenance:

```ts
import { defineScenario } from "@mockpit/core"

defineScenario({
  key: "persona",
  label: "Persona",
  variants: [
    { key: "buyer", label: "Buyer" },
    { key: "seller", label: "Seller" },
  ],
})
```

```ts
mockpit.setScenario("persona", "buyer")
```

The devtools Scenarios tab manages this state independently from modes.

## CLI

The CLI is included in `@mockpit/cli`. The `audit` command needs Playwright as a peer dependency.

```sh
pnpm add -D @mockpit/cli
```

### Commands

**`mockpit init`** scaffolds `mockpit.config.mjs` and `src/mockpit/client.ts`.

**`mockpit doctor`** validates config, checks for duplicate keys, missing section resources, MSW worker file, redaction policy, and empty resource arrays.

```sh
mockpit doctor --config mockpit.config.mjs
```

**`mockpit audit`** visits routes with Playwright, collects `window.__MOCKPIT__` snapshots, and writes reports.

```sh
mockpit audit \
  --base-url http://localhost:5173 \
  --routes /,/customers,/customers/123 \
  --out mockpit-report \
  --fail-on-capture-fail
```

Output:

```
mockpit-report/
  manifest.json
  summary.md
  routes/
    index.json
    customers.json
    customers-123.json
```

## Export and Redaction

Exports are metadata-only by default, so no payload values are included. If you need values in exports, configure a redaction policy first:

```ts
defineRedactionPolicy({
  default: "metadata-only",
  allowFields: ["fieldCoverage", "sourceKind", "status", "reason"],
  maskPatterns: [/email/i, /token/i, /name/i],
})
```

Export from code:

```ts
const json = mockpit.exportJson()          // stringified route JSON
const route = mockpit.exportRoute()        // RouteAuditExport object
const markdown = mockpit.exportMarkdown()  // Markdown summary
```

## Devtools

The devtools panel has eight tabs:

| Tab | What you see |
| --- | --- |
| **Overview** | Current mode, route, source distribution, highest-risk source, capture status, scenario state, mode switcher |
| **Route** | Section summaries, per-section source mix, proof-critical resources |
| **Resources** | Records table with source, status, coverage, reason. Filterable by source kind and route |
| **UI Marks** | Hardcoded, derived, and authored fallback markers |
| **Fallbacks** | Why fallback happened, fixture source, remediation hints |
| **Scenarios** | Scenario controls (separate from source modes) |
| **Capture** | Route capture policy checklist, pass/fail per resource, blockers |
| **Export** | Copy/download JSON, copy Markdown, redaction status, CLI audit command |

Toggle with **Alt+Shift+P** or click the floating trigger. Open state, selected tab, and filters persist per project.

### Custom elements

The devtools are built as custom elements and work without React:

- `<mockpit-devtools>` is the full panel
- `<mockpit-mark>` registers a UI provenance marker (highlights in audit/capture modes)
- `<mockpit-section>` groups content for section-level summaries

You can also use `data-mockpit-key` or `data-provenance-key` attributes on any element instead of wrapper elements.

## Examples

The repo includes three example apps:

| Example | Path | What it shows |
| --- | --- | --- |
| Vanilla + Vite | `examples/vite-basic` | Custom elements, audited fetch, mode switching, all source kinds |
| React + Vite | `examples/vite-react-basic` | Provider, hooks, `AuditMark`, `AuditSection`, devtools component |
| MSW + Vite | `examples/vite-msw` | `setupMockPitWorker`, `withMockPitHandler`, scenarios, critical routes |

To run an example:

```sh
pnpm install
pnpm build
pnpm --filter @mockpit/example-vite-basic dev
```

## Development

### Prerequisites

- Node.js >= 20
- pnpm (corepack-managed, see `packageManager` in root `package.json`)

### Setup

```sh
git clone https://github.com/deltoidgg/mockpit.git
cd mockpit
pnpm install
```

### Build

```sh
pnpm build
```

Packages build in dependency order: `core` then `browser` + `cli`, then `devtools` + `msw`, then `react`, then examples.

### Test

```sh
pnpm test
```

### Lint

```sh
pnpm lint
```

### Project structure

```
mockpit/
  packages/
    core/         # Data model, config, mode policies, capture, export
    browser/      # Client factory, audited fetch, storage, route adapters
    devtools/     # Shadow DOM custom elements
    msw/          # MSW adapter (browser + node subpaths)
    react/        # Provider, hooks, components
    cli/          # init, doctor, audit commands
  examples/
    vite-basic/          # Vanilla example
    vite-react-basic/    # React example
    vite-msw/            # MSW example
  turbo.json             # Turborepo task config
  pnpm-workspace.yaml    # Workspace config
  vitest.config.ts       # Test config
  vitest.workspace.ts    # Workspace test config
```

## AI-Agent Conventions

When using AI coding agents with a MockPit project, include these rules:

- Any API-backed UI section should define a resource key
- Any hardcoded display value that could be mistaken for live evidence should use `AuditMark` or `<mockpit-mark>`
- Capture mode must not use mock, fallback, unsupported, error, or unknown proof-critical records

## License

[MIT](LICENSE)
