# ProvenanceKit Technical Build Plan

**Date:** 2026-05-13  
**Working project name:** ProvenanceKit  
**Primary goal:** build an npm package family in TypeScript and Effect that lets any project record, inspect, and export runtime provenance for live, mock, fallback, hardcoded, derived, empty, unsupported, and errored data.

---

## 1. Technical summary

ProvenanceKit should be implemented as a TypeScript monorepo with an Effect-powered core and small adapters for browser, React, MSW, CLI audit export, and eventually other frameworks.

The key technical decision is to treat provenance as a runtime graph:

```text
route -> section -> resource record -> source kind -> status/reason/coverage
```

A resource record can come from an HTTP fetch wrapper, an MSW handler, a UI marker, a section wrapper, a scenario control, a backend capability detector, or a CLI audit run. All records go through a shared core store, are validated with schemas, and are exposed to UI and export tooling.

The package should be built so users can start with minimal integration:

```tsx
<ProvenanceProvider client={provenance}>
  <App />
  <ProvenanceDevtools />
</ProvenanceProvider>
```

Then instrument APIs incrementally:

```ts
const customers = await provenance.fetch("customers.list", "/api/customers")
```

Then add UI markers where needed:

```tsx
<AuditMark source="hardcoded" key="ui.emptyState" label="Empty state copy">
  No customers match this filter.
</AuditMark>
```

---

## 2. Repository structure

Use a pnpm workspace and Turborepo-style task graph, following the successful pattern of modern TypeScript SDK monorepos such as UploadThing. UploadThing’s repository includes packages, docs, examples, framework-specific adapters, and a framework-agnostic core package; its package exports demonstrate how one library can offer multiple entrypoints for different environments and frameworks.[^uploadthing-readme][^uploadthing-package]

Recommended structure:

```text
provenancekit/
  package.json
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  eslint.config.js
  vitest.workspace.ts
  .changeset/

  packages/
    core/
      src/
        config/
        model/
        services/
        store/
        resource/
        mode/
        export/
        index.ts
      package.json

    browser/
      src/
        createClient.ts
        storage.ts
        fetch.ts
        route.ts
        globalHook.ts
        index.ts
      package.json

    react/
      src/
        provider/
        hooks/
        devtools/
        components/
        markers/
        capture/
        styles/
        index.ts
      package.json

    msw/
      src/
        worker.ts
        server.ts
        handlers.ts
        cleanup.ts
        unhandled.ts
        scenario.ts
        index.ts
      package.json

    query/
      src/
        react-query.ts
        tanstack.ts
        index.ts
      package.json

    cli/
      src/
        commands/
        audit/
        doctor/
        init/
        report/
        index.ts
      package.json

    agent/
      src/
        manifest.ts
        search.ts
        mcp.ts
        index.ts
      package.json

  examples/
    vite-react-basic/
    vite-react-msw/
    next-app-router/
    tanstack-query/
    cloudflare-worker-spa/

  apps/
    docs/
    playground/
```

### Initial package priorities

Build in this order:

1. `@provenancekit/core`
2. `@provenancekit/browser`
3. `@provenancekit/react`
4. `@provenancekit/msw`
5. `@provenancekit/cli`
6. `@provenancekit/query`
7. `@provenancekit/agent`

---

## 3. Toolchain decisions

| Area | Recommendation | Reason |
| --- | --- | --- |
| Package manager | pnpm | Workspace ergonomics and strict dependency graph. |
| Build orchestration | Turborepo or Lage | Package task graph, docs/examples build separation. |
| Build output | `tsdown`, `tsup`, or `unbuild` | Simple TypeScript library bundling with declarations. UploadThing currently uses `tsdown` in its packages.[^uploadthing-package] |
| Releases | Changesets | Standard open source package versioning. |
| Tests | Vitest + Playwright | Unit tests for core; browser tests for devtools and MSW. |
| Docs | VitePress, Astro, or Mintlify-style docs | Needs examples and recipes more than marketing pages. |
| Runtime baseline | Node `>=20` for tooling, browser packages modern evergreen | Balances modern ESM/tooling with ecosystem compatibility. |
| Module format | Dual ESM/CJS for v1, or ESM-only if intentionally modern | Dual improves compatibility with older test/build systems; ESM-only reduces maintenance. |
| TypeScript | Current stable TypeScript | Needed for package exports, strict type inference, config typing. |

### Recommended package export pattern

Use explicit subpath exports to keep imports stable and tree-shakable:

```json
{
  "name": "@provenancekit/core",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./schema": {
      "types": "./dist/schema.d.ts",
      "import": "./dist/schema.js",
      "require": "./dist/schema.cjs"
    }
  },
  "files": ["dist"],
  "peerDependencies": {},
  "dependencies": {
    "effect": "^3"
  }
}
```

For `@provenancekit/msw`:

```json
{
  "peerDependencies": {
    "msw": ">=2"
  },
  "devDependencies": {
    "msw": ">=2"
  }
}
```

Core must not depend on MSW.

---

## 4. Core domain model

### 4.1 Source taxonomy

```ts
export type SourceKind =
  | "api"
  | "mock"
  | "fallback"
  | "derived"
  | "hardcoded"
  | "authoredFallback"
  | "empty"
  | "unsupported"
  | "error"
  | "unknown"
```

### 4.2 Record status

```ts
export type AuditStatus =
  | "loading"
  | "ready"
  | "warning"
  | "blocked"
  | "error"
  | "unknown"
```

The mapping should be configurable, but defaults should be:

| Source kind | Default status |
| --- | --- |
| `api` | `ready` |
| `mock` | `warning` in live/audit/capture, `ready` in mock mode |
| `fallback` | `warning` |
| `derived` | `warning` unless marked presentation-only |
| `hardcoded` | `warning` |
| `authoredFallback` | `warning` or `blocked` if proof-critical |
| `empty` | `warning` |
| `unsupported` | `blocked` |
| `error` | `error` |
| `unknown` | `unknown` |

### 4.3 Audit record

```ts
export interface AuditRecord {
  readonly id: string
  readonly routePath: string
  readonly routePattern?: string
  readonly sectionId?: string
  readonly resourceKey: string
  readonly label: string
  readonly sourceKind: SourceKind
  readonly status: AuditStatus
  readonly reason?: string
  readonly request?: RequestDescriptor
  readonly operation?: string
  readonly fieldCoverage?: FieldCoverage
  readonly scenario?: ScenarioDescriptor
  readonly sourceLocation?: SourceLocation
  readonly proofCritical?: boolean
  readonly tags?: readonly string[]
  readonly metadata?: Record<string, unknown>
  readonly updatedAt: string
}

export interface RequestDescriptor {
  readonly method?: string
  readonly url?: string
  readonly route?: string
  readonly status?: number
}

export interface FieldCoverage {
  readonly present: number
  readonly total: number
  readonly missing?: readonly string[]
  readonly ratio?: number
}

export interface SourceLocation {
  readonly file?: string
  readonly line?: number
  readonly column?: number
  readonly component?: string
}
```

### 4.4 Resource definition

```ts
export interface ResourceDefinition<A = unknown> {
  readonly key: string
  readonly label: string
  readonly match?: RequestMatcher
  readonly schema?: unknown
  readonly assess?: (data: A, context: AssessContext) => AssessResult | Promise<AssessResult>
  readonly fallback?: (context: FallbackContext) => A | Promise<A>
  readonly criticality?: "proof" | "presentation" | "debug"
  readonly tags?: readonly string[]
}

export interface AssessResult {
  readonly empty?: boolean
  readonly unsupported?: boolean
  readonly reason?: string
  readonly coverage?: FieldCoverage
  readonly metadata?: Record<string, unknown>
}
```

### 4.5 Section definition

```ts
export interface SectionDefinition {
  readonly id: string
  readonly label: string
  readonly route: string | RegExp
  readonly resources: readonly string[]
  readonly criticality?: "proof" | "presentation" | "debug"
}
```

### 4.6 Capture policy

```ts
export interface CapturePolicy {
  readonly route: string | RegExp
  readonly required: readonly CaptureRequirement[]
  readonly allowPresentationSources?: readonly SourceKind[]
  readonly blockOn?: readonly SourceKind[]
  readonly redaction?: RedactionPolicy
}

export interface CaptureRequirement {
  readonly resourceKey: string
  readonly allowedSources?: readonly SourceKind[]
  readonly minCoverage?: number
  readonly proofCritical?: boolean
  readonly requestRoute?: string | RegExp
}
```

---

## 5. Effect architecture

Effect should be used for the package internals because the system is a composition of asynchronous, environment-specific, and failure-prone services. Effect’s documentation highlights type safety, error handling, composability, asynchronicity, resource safety, and observability as core features.[^effect-intro] Its Layer abstraction is explicitly designed to construct services and manage dependency graphs without leaking implementation dependencies into service interfaces.[^effect-layers]

### 5.1 Services

Core services:

| Service | Responsibility |
| --- | --- |
| `AuditStore` | Put, remove, query, subscribe, snapshot, clear records. |
| `ModeStore` | Read/apply selected mode, effective mode, capture state. |
| `ConfigService` | Provide validated config, resource registry, section registry. |
| `RouteService` | Resolve current route path and route pattern. |
| `StorageService` | Persist mode/devtools/scenario state; browser localStorage by default. |
| `ClockService` | Timestamp records; test layer can freeze time. |
| `FallbackService` | Resolve fallback data when policy allows. |
| `ReporterService` | Redact and export records. |
| `TransportService` | Optional start/stop of mock transport adapters. |
| `ScenarioService` | Manage scenario controls separately from source mode. |
| `CaptureService` | Evaluate capture policies against current records. |

### 5.2 Service declarations

Use Effect context tags to make services replaceable:

```ts
import { Context, Effect, Layer } from "effect"

export interface AuditStoreService {
  readonly put: (record: AuditRecord) => Effect.Effect<void>
  readonly remove: (id: string) => Effect.Effect<void>
  readonly snapshot: Effect.Effect<readonly AuditRecord[]>
  readonly subscribe: (listener: () => void) => Effect.Effect<() => void>
}

export const AuditStore = Context.GenericTag<AuditStoreService>(
  "@provenancekit/core/AuditStore",
)
```

### 5.3 Browser store implementation

A simple initial implementation can use an in-memory `Map` plus a `Set` of listeners. Effect should own construction and error paths, but React can still consume it via `useSyncExternalStore`.

```ts
export const makeAuditStore = Effect.sync((): AuditStoreService => {
  const records = new Map<string, AuditRecord>()
  const listeners = new Set<() => void>()

  const notify = () => {
    for (const listener of listeners) listener()
  }

  return {
    put: (record) =>
      Effect.sync(() => {
        records.set(record.id, record)
        notify()
      }),
    remove: (id) =>
      Effect.sync(() => {
        records.delete(id)
        notify()
      }),
    snapshot: Effect.sync(() => Array.from(records.values())),
    subscribe: (listener) =>
      Effect.sync(() => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }),
  }
})

export const AuditStoreLive = Layer.effect(AuditStore, makeAuditStore)
```

This is intentionally boring. The public tool should not start with a complex state manager. It needs reliable snapshots and subscriptions.

### 5.4 Why not Redux/Zustand as core store?

React-specific stores are inappropriate for the core because:

- API clients may run outside React;
- CLI and Node tests need the same model;
- future Vue/Solid/Svelte adapters should not depend on React internals;
- Effect layers give deterministic test replacement.

React can adapt the core store into hooks.

### 5.5 Schema validation

Use `effect/Schema` for config and export validation. Effect Schema is designed to define schemas that validate and transform TypeScript data.[^effect-schema]

Recommended schemas:

- `SourceKindSchema`
- `AuditStatusSchema`
- `AuditRecordSchema`
- `ResourceDefinitionSchema` where possible
- `SectionDefinitionSchema`
- `CapturePolicySchema`
- `ExportManifestSchema`
- `RedactionPolicySchema`

Config functions should validate at startup and return clear typed errors:

```ts
export class InvalidProvenanceConfig extends Error {
  readonly _tag = "InvalidProvenanceConfig"
}
```

Or with Effect tagged errors:

```ts
import { Data } from "effect"

export class InvalidProvenanceConfig extends Data.TaggedError(
  "InvalidProvenanceConfig",
)<{ readonly message: string; readonly path?: string }>() {}
```

### 5.6 Effect-native and Promise facade

Every core operation can have two faces:

```ts
// Effect-native
client.effect.fetch("customers.list", "/api/customers")

// Promise facade
client.fetch("customers.list", "/api/customers")
```

Promise facade implementation:

```ts
const fetch = <A>(key: string, input: RequestInfo, init?: RequestInit): Promise<A> =>
  Effect.runPromise(effect.fetch<A>(key, input, init))
```

Effect’s `runPromise` is the documented bridge for executing effects and returning a Promise for compatibility with Promise-based code.[^effect-runpromise]

---

## 6. Mode model

### 6.1 Default modes

```ts
export type ProvenanceMode = "mock" | "hybrid" | "live" | "audit" | "capture"
```

### 6.2 Mode policy

```ts
export interface ModePolicy {
  readonly mode: ProvenanceMode
  readonly allowMockTransport: boolean
  readonly allowFallback: boolean
  readonly showInlineHighlights: boolean
  readonly blockUnknownCapability: boolean
  readonly requireLiveForCapture: boolean
  readonly requiresReloadOnChange: boolean
}
```

Defaults:

| Mode | Mock transport | Fallback | Highlights | Missing capability | Reload? |
| --- | --- | --- | --- | --- | --- |
| `mock` | yes | no | optional | warning | yes |
| `hybrid` | no | yes | panel warnings | warning | yes if MSW state changes |
| `live` | no | no | no | warning/block configurable | yes if stopping MSW |
| `audit` | no | no | yes | warning/block configurable | yes if stopping MSW |
| `capture` | no | no by default | yes/checklist | block | yes if stopping MSW |

### 6.3 Persistence

Mode state should use a storage adapter:

```ts
export interface StorageService {
  readonly get: (key: string) => Effect.Effect<string | null, StorageError>
  readonly set: (key: string, value: string) => Effect.Effect<void, StorageError>
  readonly remove: (key: string) => Effect.Effect<void, StorageError>
}
```

Browser default: `localStorage`.  
Node default: in-memory or file-backed for CLI.  
Test default: deterministic in-memory.

### 6.4 Multi-tab behavior

MVP can listen for the browser `storage` event and refresh mode/devtools state when another tab changes it. It does not need full multi-tab conflict resolution, but it should avoid silently diverging.

---

## 7. Audited fetch implementation

### 7.1 Goals

The fetch wrapper must:

1. execute live requests unless mock transport intercepts them;
2. validate or parse response data when schema is provided;
3. assess whether data is empty or unsupported;
4. apply fallback only when the current mode allows it and the resource defines it;
5. record an audit record for every outcome;
6. preserve ordinary `fetch` ergonomics;
7. support non-fetch clients through lower-level `recordResource` APIs.

### 7.2 Public API

```ts
const data = await provenance.fetch<CustomerList>("customers.list", "/api/customers")
```

Advanced:

```ts
const data = await provenance.fetch("customers.list", {
  input: "/api/customers",
  init: { headers: { Authorization: `Bearer ${token}` } },
  parse: (response) => response.json(),
  requestRoute: "GET /api/customers",
})
```

### 7.3 Effect flow

```text
fetchResource(resourceKey, request)
  -> resolve resource definition
  -> resolve current route
  -> resolve mode policy
  -> perform fetch
  -> parse body
  -> validate schema if present
  -> assess data if assess function exists
  -> if success and not empty: record api/mock and return data
  -> if empty/unsupported and fallback allowed: load fallback, record fallback, return fallback
  -> if empty and no fallback: record empty, return live payload
  -> if error and fallback allowed: load fallback, record fallback, return fallback
  -> if error and no fallback: record error, throw typed error
```

### 7.4 Source classification

How does the wrapper know whether a successful request was `api` or `mock`?

Use a layered strategy:

1. If MSW adapter tags a response header or side-channel event, classify as `mock`.
2. If current mode is `mock` and mock transport is active, classify matching instrumented requests as `mock`.
3. If no mock signal exists, classify as `api`.
4. If fallback resolver was used, classify as `fallback` regardless of transport.
5. If user explicitly records source metadata, trust it.

Avoid relying only on mode. A mock mode can have unhandled pass-through requests; a live mode can still receive data from a local test server.

### 7.5 Fallback policy

```ts
export interface FallbackDecision {
  readonly allowed: boolean
  readonly reason: string
}

export const shouldUseFallback = ({ mode, resource, error, assessment }: Context): FallbackDecision => {
  if (!mode.allowFallback) return { allowed: false, reason: "Fallback disabled in current mode." }
  if (!resource.fallback) return { allowed: false, reason: "No fallback resolver configured." }
  if (assessment?.empty || assessment?.unsupported || error) {
    return { allowed: true, reason: assessment?.reason ?? error?.message ?? "Live data unavailable." }
  }
  return { allowed: false, reason: "Live data is usable." }
}
```

Fallback must be explicit per resource. Never globally “try fixtures” by URL guessing.

### 7.6 Non-fetch clients

Provide a lower-level function:

```ts
await provenance.recordResource({
  resourceKey: "customer.profile",
  sourceKind: "api",
  status: "ready",
  reason: "Loaded through GraphQL client.",
})
```

For GraphQL:

```ts
const profile = await client.query(...)
await provenance.assess("customer.profile", profile)
```

For tRPC / RPC:

```ts
const data = await provenance.wrap("customer.profile", () => trpc.customer.get.query(id))
```

---

## 8. MSW adapter implementation

### 8.1 Why MSW remains important

MSW’s browser `setupWorker()` prepares a client-worker communication channel for API mocking and returns a worker object with lifecycle and handler-management methods.[^msw-setupworker] The public package should use that existing strength instead of recreating transport interception.

### 8.2 Adapter API

```ts
import { setupProvenanceWorker } from "@provenancekit/msw"
import { http, HttpResponse } from "msw"

export const worker = setupProvenanceWorker({
  provenance,
  handlers: [
    http.get("/api/customers", () => HttpResponse.json({ customers: [] })),
  ],
  critical: ["GET /api/customers"],
})
```

### 8.3 Handler decoration

Offer helpers to attach resource metadata:

```ts
http.get(
  "/api/customers",
  withProvenanceHandler("customers.list", () => HttpResponse.json(customersFixture)),
)
```

The handler wrapper should:

- record `mock` source for the resource;
- attach optional response header like `x-provenance-source: mock` in development;
- include request method/url/status;
- record scenario variant if active;
- catch handler errors and record `error`.

### 8.4 Unhandled critical routes

MSW’s `onUnhandledRequest` can warn or error when no request handler matches.[^msw-unhandled] The adapter should use a custom function:

```ts
worker.start({
  onUnhandledRequest(request) {
    if (isCritical(request)) {
      provenance.recordTransportIssue({
        sourceKind: "unknown",
        status: "blocked",
        reason: "Critical request was not handled by mock transport.",
        request,
      })
    }
  },
})
```

Do not make all unhandled requests fatal by default; many apps load fonts, analytics, icons, and framework assets.

### 8.5 Service-worker cleanup

When switching from `mock` to `live/audit/capture`, stale service workers are a real hazard. Provide opt-in cleanup:

```ts
await cleanupMswWorkers({ scriptName: "/mockServiceWorker.js" })
```

Rules:

- only unregister workers with the configured MSW script path;
- never unregister unrelated app service workers;
- record cleanup result in devtools;
- require reload after transport mode change when necessary.

### 8.6 Node/test support

`@provenancekit/msw/node` should provide `setupProvenanceServer()` for Vitest/Jest tests. Tests can verify that mock, fallback, empty, and unhandled critical states create correct audit records.

---

## 9. React adapter

### 9.1 Provider

```tsx
<ProvenanceProvider client={provenance}>
  {children}
</ProvenanceProvider>
```

Provider responsibilities:

- expose client through React context;
- subscribe to audit store;
- expose route adapter;
- render optional devtools;
- support SSR-safe no-op behavior until browser hydration.

### 9.2 Hooks

```ts
useProvenanceClient()
useProvenanceMode()
useProvenanceRecords(filter?)
useRouteProvenance()
useSectionProvenance(sectionId)
useCaptureStatus(route?)
useScenarioControls()
```

### 9.3 Devtools components

```tsx
<ProvenanceDevtools
  initialIsOpen={false}
  buttonPosition="bottom-left"
  panelPosition="left"
  enableInProduction={false}
/>
```

Follow TanStack’s proven pattern: separate devtools package, floating mode, localStorage-persisted toggle, position options, and development-only defaults.[^tanstack-devtools]

### 9.4 Marker components

```tsx
<AuditMark
  key="ui.customer.scoreDelta"
  source="derived"
  label="Score delta"
  reason="Computed in the browser from latest and previous scores."
>
  +12%
</AuditMark>
```

Implementation behavior:

- always records when mounted;
- removes or marks stale when unmounted;
- only applies visual highlight in `audit` or `capture` mode;
- supports `asChild` pattern to avoid layout wrappers;
- supports data attributes for DOM overlay.

### 9.5 Section components

```tsx
<AuditSection id="customer.summary">
  <CustomerSummary />
</AuditSection>
```

`AuditSection` should not require visual styling unless mode says to highlight. It can connect visible UI to section config and generate section-level records.

### 9.6 SSR and React Server Components

MVP can target client-rendered React. However, the architecture should avoid blocking SSR support.

Plan:

- Browser/client store is the first implementation.
- Server API wrappers can record to a request-scoped store.
- Server records can be serialized into a hydration script.
- Next.js App Router examples should show client-only devtools plus server-side resource recording later.

---

## 10. Devtools UI data model

### 10.1 Route summary

```ts
interface RouteSummary {
  routePath: string
  mode: ProvenanceMode
  status: AuditStatus
  highestRisk: SourceKind
  sourceCounts: Record<SourceKind, number>
  sections: SectionSummary[]
  records: AuditRecord[]
  capture?: CaptureEvaluation
}
```

### 10.2 Section summary

```ts
interface SectionSummary {
  id: string
  label: string
  status: AuditStatus
  highestRisk: SourceKind
  sourceCounts: Record<SourceKind, number>
  proofCriticalCount: number
  warningCount: number
  blockedCount: number
  records: AuditRecord[]
}
```

### 10.3 Risk priority

Default priority:

```ts
const sourceRiskPriority: SourceKind[] = [
  "error",
  "unsupported",
  "unknown",
  "empty",
  "authoredFallback",
  "hardcoded",
  "derived",
  "fallback",
  "mock",
  "api",
]
```

This can be customized per project. Source distribution must always be shown beside highest-risk source.

---

## 11. CLI design

### 11.1 Commands

```sh
provenancekit init
provenancekit doctor
provenancekit audit --routes ./routes.txt --out ./provenance-report
provenancekit audit --base-url http://localhost:5173 --routes /,/customers
provenancekit export --format markdown,json
provenancekit agent-manifest
```

### 11.2 `init`

Creates:

```text
provenance.config.ts
src/provenance/client.ts
src/provenance/msw.ts       # optional
src/provenance/fixtures/    # optional
```

It should detect:

- React/Vite/Next/TanStack Router/React Router;
- existing MSW setup;
- existing fetch wrapper or API client directory;
- TypeScript config.

### 11.3 `doctor`

Checks:

- config is valid;
- duplicate resource keys;
- section references missing resources;
- capture policies reference missing resources;
- MSW worker file exists if MSW mode configured;
- devtools not enabled in production by accident;
- fallback resolvers are explicit;
- redaction policy exists for export.

### 11.4 `audit`

Uses Playwright to visit routes and collect `window.__PROVENANCEKIT__` snapshots.

Flow:

```text
start or connect to app
for each route:
  visit route
  wait for app-ready or configured timeout
  collect provenance snapshot
  collect optional screenshots if configured
  redact values
  write route JSON
write manifest
write Markdown summary
exit non-zero if capture policy fails and --fail-on-capture-fail is set
```

### 11.5 Export files

```text
provenance-report/
  manifest.json
  summary.md
  routes/
    index.json
    customers.json
    customers-123.json
  screenshots/
    customers-123.png
```

### 11.6 Redaction

Exports must default to metadata, not payload values. Where values are included, redaction should be required:

```ts
redaction: {
  default: "metadata-only",
  allowFields: ["fieldCoverage", "sourceKind", "status", "reason"],
  maskPatterns: [/email/i, /token/i, /name/i],
}
```

---

## 12. Agent and Code Mode-inspired design

Cloudflare’s Code Mode work is relevant because it reduces tool-call overhead by presenting many capabilities as a TypeScript API that an LLM can write code against, rather than exposing every operation as a separate direct tool.[^cloudflare-code-mode] Cloudflare’s Codemode docs describe generating TypeScript type definitions from tools and running generated code in a secure isolated Worker sandbox, while marking the capability beta.[^cloudflare-codemode-docs]

ProvenanceKit can apply the same idea later.

### 12.1 Agent manifest

```json
{
  "project": "my-app",
  "resources": [
    { "key": "customers.list", "match": "GET /api/customers", "criticality": "proof" }
  ],
  "sections": [
    { "id": "customers.table", "route": "/customers", "resources": ["customers.list"] }
  ],
  "modes": ["mock", "hybrid", "live", "audit", "capture"]
}
```

### 12.2 Agent API

```ts
export interface ProvenanceAgentApi {
  searchResources(query: string): Promise<ResourceHit[]>
  inspectRoute(route: string): Promise<RouteSummary>
  listUninstrumentedFetches(): Promise<SourceLocation[]>
  suggestResourceDefinitions(file: string): Promise<ResourceDefinitionSuggestion[]>
  suggestAuditMarks(file: string): Promise<AuditMarkSuggestion[]>
  generatePatch(suggestionId: string): Promise<Patch>
}
```

### 12.3 Why this matters

Prototype-driven AI development can create mock debt quickly. An agent integration can help remediate that debt by:

- finding uninstrumented API clients;
- creating resource definitions;
- adding UI markers;
- generating fallback fixtures;
- producing capture policies;
- answering “which routes are still mock-backed?”

This should be a later feature because the core must work first.

---

## 13. Cloudflare and edge runtime considerations

Cloudflare’s current Vite plugin runs Worker code inside `workerd`, aiming to match production behavior closely during development.[^cloudflare-vite] This is conceptually aligned with ProvenanceKit’s goal: reduce the gap between local prototype and production reality.

Practical implications:

1. Do not assume browser-only `window` in core.
2. Provide platform layers for browser, Node, and edge/Worker runtimes.
3. Keep `@provenancekit/browser` separate from `@provenancekit/core`.
4. Support fetch instrumentation in Worker-style runtimes where possible.
5. Make local dev examples for Vite + Workers optional, not MVP-critical.

---

## 14. Configuration API

### 14.1 Base config

```ts
import {
  defineProvenanceConfig,
  defineResource,
  defineSection,
  defineCapturePolicy,
} from "@provenancekit/core"

export default defineProvenanceConfig({
  project: "demo-shop",
  mode: {
    default: "mock",
    storageKey: "demo-shop.provenance.mode",
  },
  resources: [
    defineResource({
      key: "products.list",
      label: "Product list",
      match: { method: "GET", url: "/api/products" },
      assess: (data: { products: unknown[] }) => ({
        empty: data.products.length === 0,
        reason: data.products.length === 0 ? "No products returned." : undefined,
        coverage: { present: data.products.length ? 1 : 0, total: 1 },
      }),
      fallback: () => import("./fixtures/products").then((m) => m.products),
    }),
  ],
  sections: [
    defineSection({
      route: "/products",
      id: "products.grid",
      label: "Product grid",
      resources: ["products.list"],
    }),
  ],
  capture: [
    defineCapturePolicy({
      route: "/products",
      required: [{ resourceKey: "products.list", allowedSources: ["api"] }],
      blockOn: ["mock", "fallback", "unsupported", "error", "unknown"],
    }),
  ],
})
```

### 14.2 Config design rules

- Use stable resource keys.
- Keep labels human-readable.
- Require explicit fallback functions.
- Keep route/section definitions optional but recommended.
- Allow metadata but redact by default in exports.
- Make config serializable enough for CLI/agent manifest.

---

## 15. UI implementation details

### 15.1 Rendering strategy

Use a React component tree for the MVP. Render devtools in a portal to `document.body`. Prefer Shadow DOM for style isolation if feasible, especially for the floating trigger and panel.

### 15.2 Bundle strategy

- The app should import devtools only in development by default.
- Provide production import path for teams that intentionally enable operator mode in staging.
- Split heavy UI code from core hooks.

Pattern:

```tsx
const ProvenanceDevtools = lazy(() => import("@provenancekit/react/devtools"))
```

### 15.3 Accessibility

- Floating button must be keyboard accessible.
- Panel must trap focus when modal-like or behave as a non-modal complementary landmark.
- Source badges must not rely on color alone.
- Inline highlights need labels/tooltips for screen readers.

### 15.4 Visual states

Use text labels and icons in addition to color:

| State | Label |
| --- | --- |
| Ready live | `Live` |
| Mock | `Mock` |
| Hybrid fallback | `Fallback` |
| Derived | `Derived` |
| Hardcoded | `Hardcoded` |
| Empty | `Empty live response` |
| Unsupported | `Unsupported` |
| Error | `Error` |
| Unknown | `Unknown source` |

---

## 16. Testing strategy

### 16.1 Core unit tests

- record creation and identity;
- mode policy evaluation;
- fallback decision logic;
- source risk prioritization;
- section summary distribution;
- capture policy evaluation;
- schema validation;
- redaction behavior.

### 16.2 Browser tests

- localStorage persistence;
- multi-tab storage event update;
- devtools open/close state;
- route changes update current route;
- inline highlights only render in audit/capture mode.

### 16.3 MSW tests

- handler wrapper records `mock`;
- unhandled critical route records blocked/unknown;
- mode switch stops worker or requires reload;
- stale worker cleanup only unregisters configured MSW worker;
- Node server adapter behaves like browser adapter.

### 16.4 React tests

- provider exposes client;
- hooks update on store changes;
- marker registers/unregisters;
- section summaries render source distribution;
- capture preflight blocks unsafe routes.

### 16.5 CLI tests

- `init` produces expected files;
- `doctor` catches invalid config;
- `audit` collects route snapshots from example app;
- redaction masks sensitive fields;
- failing capture policy returns non-zero when configured.

### 16.6 Example app as integration test

The main example should deliberately include every source kind:

- `api`: live route returns useful data;
- `mock`: MSW handler returns fixture;
- `fallback`: live route fails and fixture used in hybrid mode;
- `derived`: browser-computed value;
- `hardcoded`: static empty state;
- `authoredFallback`: fallback narrative copy;
- `empty`: live route returns empty array;
- `unsupported`: route returns 404/501 capability response;
- `error`: route returns invalid JSON or network error;
- `unknown`: uninstrumented fetch.

---

## 17. Roadmap

### Phase 0: research, naming, and skeleton

Deliverables:

- choose name/scope/license;
- create monorepo;
- set up build/test/release tooling;
- create docs skeleton;
- implement core types and schemas;
- build example app shell.

Exit criteria:

- packages build;
- types emit;
- docs app runs;
- example app imports core package.

### Phase 1: core provenance engine

Deliverables:

- `AuditStore` service;
- mode policies;
- resource definitions;
- section summaries;
- capture policy evaluator;
- redaction/export schema;
- Promise facade.

Exit criteria:

- unit tests cover all source kinds;
- route summary shows highest-risk and distribution;
- capture policy can pass/fail from synthetic records.

### Phase 2: browser client and fetch instrumentation

Deliverables:

- browser client factory;
- localStorage mode state;
- route adapter;
- audited fetch;
- fallback resolver support;
- global devtools hook.

Exit criteria:

- example app records live, empty, fallback, error;
- no React required for core browser usage.

### Phase 3: React devtools MVP

Deliverables:

- provider and hooks;
- floating trigger;
- side panel;
- overview, route, resources, UI marks, capture, export tabs;
- `AuditMark`;
- `AuditSection`;
- keyboard shortcut;
- dev-only default.

Exit criteria:

- developer can install and inspect route records in under five minutes;
- marker highlights work only in audit/capture modes;
- source distribution and reasons are visible.

### Phase 4: MSW adapter

Deliverables:

- browser worker wrapper;
- handler provenance wrapper;
- critical route unhandled reporting;
- stale worker cleanup;
- Node server adapter;
- fixture scenario metadata.

Exit criteria:

- mock mode records `mock` resources;
- hybrid mode can fallback without MSW;
- unhandled critical request is visible in devtools.

### Phase 5: CLI audit and reports

Deliverables:

- `init`;
- `doctor`;
- `audit` route runner;
- JSON and Markdown report;
- redaction policy;
- capture-fail CI option.

Exit criteria:

- example app produces route audit report;
- CI can fail on capture policy violation.

### Phase 6: ecosystem adapters

Deliverables:

- TanStack Query adapter;
- Next.js App Router recipe;
- React Router/TanStack Router route adapters;
- Storybook recipe;
- Playwright fixture;
- GraphQL/tRPC wrappers.

Exit criteria:

- docs cover the most common frontend stacks;
- users can integrate without replacing their data-fetching stack.

### Phase 7: static analysis and agent integration

Deliverables:

- ESLint rule for unmarked hardcoded values in configured zones;
- `data-provenance` DOM overlay;
- source location mapping;
- agent manifest;
- Code Mode/MCP-inspired typed agent API.

Exit criteria:

- agent can inspect project provenance config;
- tool can suggest missing instrumentation;
- UI markers become easier to add incrementally.

---

## 18. Implementation risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Too much setup | Low adoption | One-command init, tiny first example, fetch wrapper value before markers. |
| Effect scares users | Low adoption | Hide Effect behind ordinary TypeScript APIs; document Effect-native path separately. |
| MSW lifecycle confusion | False live verification | Adapter-level cleanup, explicit reload prompts, visible transport state. |
| Markers are forgotten | Blind spots | Resource instrumentation first; route summaries; lint/static scanner later. |
| Devtools pollutes app UI | Rejection by design teams | Dev-only default, Shadow DOM, keyboard toggle, no inline highlights unless audit mode. |
| Export leaks sensitive data | Security concern | Metadata-only default, redaction policies, no payload capture unless explicit. |
| Source taxonomy too rigid | Poor fit across domains | Extensible custom tags, but stable defaults. |
| Framework lock-in | Smaller audience | Framework-agnostic core, React first, adapters later. |
| Capture policy over-blocks | Frustration | Criticality levels and route-specific allowlists. |

---

## 19. First implementation milestone checklist

Build this first slice:

1. `@provenancekit/core`
   - source taxonomy;
   - audit record schema;
   - in-memory store;
   - section summary;
   - mode policy;
   - capture evaluator.
2. `@provenancekit/browser`
   - client factory;
   - localStorage mode storage;
   - audited fetch;
   - explicit fallback resolver;
   - global snapshot hook.
3. `@provenancekit/react`
   - provider;
   - records hook;
   - minimal floating devtools;
   - resource table;
   - `AuditMark`.
4. Example app
   - one list route;
   - one detail route;
   - one hardcoded value;
   - one fallback fixture;
   - one empty response;
   - one error state.

Do not build the full CLI, agent integration, or framework adapters before this first slice proves the core interaction.

---

## 20. Technical definition of done for MVP

The MVP is functional when a new React/Vite project can:

1. install the package;
2. add provider/devtools;
3. configure three resources;
4. wrap fetch calls;
5. run in `mock`, `hybrid`, `live`, and `audit` modes;
6. see source distribution for the current route;
7. see fallback reasons;
8. mark one hardcoded UI value;
9. copy audit JSON;
10. switch from MSW mock to live without stale worker confusion.

That MVP directly solves the original problem: during prototyping, the team can see what is real, mock, fallback, hardcoded, or derived while the app is running.

---

## References

[^uploadthing-readme]: pingdotgg/uploadthing README, accessed 2026-05-13. https://github.com/pingdotgg/uploadthing
[^uploadthing-package]: pingdotgg/uploadthing `packages/uploadthing/package.json`, accessed 2026-05-13. https://raw.githubusercontent.com/pingdotgg/uploadthing/main/packages/uploadthing/package.json
[^effect-intro]: Effect Documentation, “Introduction,” accessed 2026-05-13. https://effect.website/docs/getting-started/introduction/
[^effect-layers]: Effect Documentation, “Managing Layers,” accessed 2026-05-13. https://effect.website/docs/requirements-management/layers/
[^effect-schema]: Effect Documentation, “Introduction to Effect Schema,” accessed 2026-05-13. https://effect.website/docs/schema/introduction/
[^effect-runpromise]: Effect Documentation, “Running Effects,” accessed 2026-05-13. https://effect.website/docs/getting-started/running-effects/
[^msw-setupworker]: Mock Service Worker Docs, `setupWorker`, last updated 2026-02-12. https://mswjs.io/docs/api/setup-worker/
[^msw-unhandled]: Mock Service Worker Docs, “Debugging uncaught requests,” accessed 2026-05-13. https://v1.mswjs.io/docs/recipes/debugging-uncaught-requests
[^tanstack-devtools]: TanStack Query React Docs, “Devtools,” accessed 2026-05-13. https://tanstack.com/query/latest/docs/framework/react/devtools
[^cloudflare-code-mode]: Cloudflare Blog, “Code Mode: the better way to use MCP,” 2025-09-26. https://blog.cloudflare.com/code-mode/
[^cloudflare-codemode-docs]: Cloudflare Agents Docs, “Codemode,” accessed 2026-05-13. https://developers.cloudflare.com/agents/api-reference/codemode/
[^cloudflare-vite]: Cloudflare Workers Docs, “Vite plugin,” accessed 2026-05-13. https://developers.cloudflare.com/workers/vite-plugin/
