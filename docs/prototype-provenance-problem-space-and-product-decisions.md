# Prototype Provenance: Problem Space and Product Decision Record

**Date:** 2026-05-13  
**Working project name:** ProvenanceKit  
**Proposed package scope:** `@provenancekit/*`  
**Primary thesis:** the project should not be a “mock mode toggle”. It should be a provenance cockpit for teams moving from prototype data to real integration.

---

## 1. Executive summary

Prototype-driven development is powerful because it lets teams discover product shape by building the product. In AI-assisted development, this is especially important: agents can help teams generate screens, flows, fixtures, and partial backends very quickly. The weakness is that the resulting prototype can become visually convincing before its data sources are trustworthy.

The original internal feature solved this problem by moving from “mock enabled / mock disabled” to runtime provenance. It tracked whether visible route content came from live APIs, MSW mocks, fallback fixtures, hardcoded text, authored fallback copy, browser-derived values, unsupported backend capability, empty live responses, or errors. The public open source rebuild should preserve that conceptual breakthrough while removing domain assumptions.

The exact solution recommended here is:

> Build **ProvenanceKit**, an open source TypeScript + Effect npm package family that records, visualises, exports, and gates runtime data provenance during prototype-to-production transitions.

The product should ship with:

1. A **framework-agnostic core** built with Effect services, layers, schemas, typed errors, and observable state.
2. A **React-first devtools package** with a TanStack-style floating trigger, side panel, route audit, source distribution, capture checklist, and optional inline highlights.
3. An **MSW adapter**, not an MSW-dependent core. MSW should be first-class for HTTP mocking, but the provenance engine must work with any fetch layer, backend, router, or mocking strategy.
4. A **fetch/resource instrumentation API** that lets users classify live, mock, fallback, empty, unsupported, and errored resources without rewriting their whole app.
5. Optional **UI provenance markers** for hardcoded, derived, and authored fallback UI content, plus lower-friction alternatives such as DOM attributes, section wrappers, lint hints, and route-level summaries.
6. A **CLI audit exporter** that can visit routes, collect provenance records, redact values, and produce reviewable JSON/Markdown reports.
7. A later **agent-facing manifest / Code Mode-inspired API** that lets coding agents inspect the project’s resource map and add provenance instrumentation without being flooded with every route and record as separate tools.

The public project should be framed as a tool for prototype-driven teams, not as an opponent to spec-driven development. Its role is to make exploratory prototypes honest and governable. It gives prototype-driven work a path to production by making the prototype’s data truth visible.

---

## 2. The problem space

### 2.1 Prototype-driven development produces valuable ambiguity

During early product exploration, teams often do not know exactly what they are building. They need to sketch flows, test interaction models, show stakeholders possible futures, and learn which data actually matters. This makes prototype-driven development valuable: it keeps feedback cycles short and makes abstract requirements concrete.

AI-assisted development intensifies this pattern. A team can now ask an agent to produce a working interface with mocked data, iterate visually, and then gradually wire it into real APIs. This can be faster than writing a full specification up front.

The problem is not that prototypes are messy. The problem is that the mess becomes invisible.

A single screen can contain:

- hardcoded sample values added in the first hour;
- fixture data served through MSW;
- live API data for one section;
- fallback mock data because a live route is missing;
- UI-authored fallback copy because a payload field is empty;
- derived values calculated in the browser;
- unsupported workflow sections hidden behind polished copy;
- stale service-worker mocks still intercepting requests after a mode switch.

When that screen looks polished, people assume it is more real than it is.

### 2.2 The current AI development debate changes the framing

The industry is actively discussing “vibe coding”, prototype-first workflows, and spec-driven development. GitHub’s Spec Kit launch framed spec-driven development as a way to turn specifications into living source-of-truth artifacts for AI agents, while acknowledging that quick “vibe-coding” can produce code that appears right but misses intent.[^github-speckit] Thoughtworks similarly describes spec-driven development as an emerging AI-assisted engineering practice, while noting disagreement about whether specs or executable code should be the ultimate source of truth.[^thoughtworks-sdd]

This project should not try to “win” that debate by declaring one method superior. Instead, it should address a gap on the prototype-driven side:

> Prototype-driven teams need runtime truth boundaries. They need to know which parts of their prototype are real, mocked, derived, hardcoded, unsupported, or fallback-backed without slowing exploration to a halt.

That is a distinct product category. It is not requirements management. It is not contract testing. It is not observability for production incidents. It is **prototype provenance**.

### 2.3 The trust failure is social as much as technical

The biggest risk is not only that engineers misunderstand their own code. The bigger risk is that polished prototypes create false confidence across the team.

Typical failure modes:

| Failure mode | What happens | Why it matters |
| --- | --- | --- |
| Demo misrepresentation | A presenter narrates fixture or authored fallback content as if it came from a live system. | Stakeholders make decisions based on false evidence. |
| Integration blind spot | A team believes an API route exists because the UI has always rendered with fallback data. | Backend work is missed until late. |
| Prototype calcification | Hardcoded values survive into later builds because nobody remembers they were placeholders. | Quality debt becomes product debt. |
| Mock leakage | A service worker or mock layer remains active after switching to “live”. | Live verification becomes invalid. |
| Derived-value confusion | A browser-computed summary looks like a source-of-record answer. | Users over-trust local transformations. |
| Agent compounding | An AI coding agent adds more UI around existing mock assumptions. | Mock debt scales faster than humans can inspect it. |

The tool must therefore serve both engineers and non-engineer operators. It needs to be visible enough for product demos and precise enough for implementation planning.

---

## 3. What the original feature proved

The uploaded feature study shows that the old system evolved from an MSW prototype setup into a broader runtime provenance system. The final shape combined transport-level MSW mocks, live-only operation, explicit fallback behavior, live highlighting, route-level audit records, and capture preflight checks.

The most important transferable ideas are:

1. **Source taxonomy:** classify records as live API, mock, fallback, derived, hardcoded, authored fallback, empty, unsupported, or error.
2. **Mode semantics:** separate full mock, live, fallback, and live-highlight modes.
3. **Audited resource boundary:** wrap API calls so each resource records origin, status, request route, reason, and field coverage.
4. **UI-authored markers:** let components register hardcoded, derived, and fallback copy that cannot be discovered from fetches alone.
5. **Route section summaries:** group resource records into user-facing route sections.
6. **Operator panel:** make mode, state, and current-route records visible from the running app.
7. **Capture preflight:** define stricter go/no-go policies for recording or customer-facing demos.
8. **Audit export:** turn runtime state into JSON/Markdown artifacts.
9. **Service-worker cleanup:** explicitly remove stale MSW workers when leaving mock mode.

The public version should keep those ideas but remove:

- RM banking domain names;
- hardcoded demo spotlight logic;
- React/Vite-only assumptions in the core;
- manual-only route audit export hidden inside a test;
- MSW as the unavoidable foundation;
- a worst-source-only section summary with insufficient source distribution.

---

## 4. Product principles

### Principle 1: provenance is a runtime product surface

The tool should not only log data-source information. It should show that information inside the running app, in CI reports, and in demo preflight flows.

The main question it answers is:

> “What is this screen made of right now?”

That means records must be route-aware, resource-aware, source-aware, and visible.

### Principle 2: transport mocking and data provenance are different concerns

MSW can answer: “Was this HTTP request intercepted?”

It cannot fully answer:

- Was the live payload useful?
- Did we substitute fallback fixture data?
- Is this copy hardcoded?
- Is this value derived in the browser?
- Is this backend capability unsupported?
- Is this screen safe to record?

The package must model those questions separately.

### Principle 3: adoption must start with low commitment

Many developers will not adopt a tool that requires them to wrap every piece of UI. The MVP path must work with minimal code:

1. add the provider/devtools;
2. wrap fetch or selected API clients;
3. optionally configure MSW;
4. optionally mark UI-authored values later.

The tool should become more valuable as teams add markers and route sections, but it must provide value before full instrumentation.

### Principle 4: visibility must be opt-in but difficult to ignore when enabled

Inline highlights should not be permanent UI design elements. They should appear only in audit modes. The app should remain visually clean in ordinary dev and demo modes, but audit mode should make provenance hard to miss.

### Principle 5: scenarios are not mocks

A selected customer, persona, demo path, locale, feature flag, or prompt mode is not the same as data source provenance. Scenario controls should be first-class but separate from source modes.

### Principle 6: the source taxonomy must be small and extensible

The default taxonomy should be understandable in one minute:

- `api`
- `mock`
- `fallback`
- `derived`
- `hardcoded`
- `authoredFallback`
- `empty`
- `unsupported`
- `error`
- `unknown`

Projects can add custom tags, but the default UI and capture policies should work with these.

### Principle 7: the tool should help teams graduate prototypes

The project’s value is not only demo safety. It should help teams plan the path from prototype to live system by showing which resources remain mock, fallback, empty, unsupported, or hardcoded.

---

## 5. Decision: build a package family, not a single package

### Decision

Use a package family under one npm scope:

| Package | Responsibility | MVP? |
| --- | --- | --- |
| `@provenancekit/core` | Source taxonomy, Effect services, record store, resource definitions, fallback policy, mode state, schemas. | Yes |
| `@provenancekit/browser` | Browser storage, global hook, fetch wrapper, route/location adapters, dev-only bootstrap. | Yes |
| `@provenancekit/react` | Provider, hooks, floating devtools, audit markers, audit sections, capture preflight UI. | Yes |
| `@provenancekit/msw` | MSW setup helpers, handler decorators, unhandled critical request reporting, service-worker cleanup. | Yes |
| `@provenancekit/query` | React Query / TanStack Query helpers and query metadata adapters. | Beta |
| `@provenancekit/cli` | `init`, `doctor`, route audit export, Markdown report generation, redaction. | Beta |
| `@provenancekit/agent` | Agent manifest, typed API for coding agents, optional MCP / Code Mode style integration. | Later |
| `@provenancekit/devtools-extension` | Browser extension or standalone devtools bridge. | Later |

### Rationale

UploadThing is a useful structural reference: its repository is a pnpm/turbo monorepo with docs, examples, framework packages, and a framework-agnostic `uploadthing` package for server/client logic.[^uploadthing-readme] Its package exports show multiple environment/framework entrypoints, including `server`, `client`, `next`, `express`, `fastify`, `h3`, `remix`, and an `effect-platform` export.[^uploadthing-package]

ProvenanceKit should follow the same general shape: one core mental model, multiple integration surfaces.

### Consequences

Pros:

- users install only what they need;
- the core can remain framework-neutral;
- React can move quickly without blocking Vue/Solid/Svelte adapters;
- MSW does not become mandatory;
- CLI and agent features can evolve independently.

Cons:

- more package maintenance;
- stricter version coordination;
- documentation must explain which package to install;
- examples become essential.

### Mitigation

Start with a small set of packages and a single starter path:

```sh
npm i -D @provenancekit/react @provenancekit/msw msw
```

Then document a no-MSW path:

```sh
npm i -D @provenancekit/react
```

---

## 6. Decision: use Effect in the core, but do not force users to write Effect code

### Decision

Use Effect internally for core services, dependency injection, typed errors, schema validation, async workflows, and test layers. Expose both Effect-native APIs and Promise/React-friendly facades.

### Rationale

Effect is designed for complex synchronous and asynchronous TypeScript programs, with built-in support for type safety, error handling, concurrency, composability, resource safety, and observability.[^effect-intro] Its layer model is directly relevant because the package needs injectable services for storage, clock, route resolution, resource registry, fallback loading, transport adapters, and audit exporting; Effect’s Layer abstraction is intended to construct service dependency graphs without leaking implementation details into service interfaces.[^effect-layers]

The project should take advantage of Effect where it is strongest:

- typed failures instead of stringly runtime errors;
- replaceable services for browser, Node, test, and worker runtimes;
- resource-safe start/stop flows for MSW and devtools bridges;
- schema-backed config and export parsing;
- test layers that make mode, storage, clock, and route state deterministic.

But most users will not want to learn Effect just to add a prototype devtool. Therefore the public API should look like ordinary TypeScript.

### Consequences

The core can offer:

```ts
// Effect-native
const program = auditResource(resource, request)

// Promise facade
const data = await provenance.fetch(resource, request)

// React hook
const records = useProvenanceRecords()
```

This keeps the package attractive to Effect users without making Effect a barrier for everyone else.

---

## 7. Decision: MSW should be a first-class adapter, not the root abstraction

### Decision

Do not make the core depend on MSW. Provide `@provenancekit/msw` as a first-class adapter with excellent ergonomics.

### Rationale

MSW is still the right default for browser HTTP mocking because it intercepts network requests through a service worker and lets app code keep making real `fetch` calls. Its browser `setupWorker()` API creates a worker instance that can start, stop, add handlers, reset handlers, restore handlers, and list handlers.[^msw-setupworker] MSW also has built-in handling for unhandled requests through `onUnhandledRequest`, which is highly relevant for detecting critical routes missing from a full mock setup.[^msw-unhandled]

However, the old feature’s main value was broader than MSW:

- live payload quality assessment;
- fallback substitution;
- UI-authored provenance;
- route-level capture policy;
- exportable audit artifacts;
- hardcoded/derived indicators.

Many projects also use non-MSW approaches: server fixtures, Storybook loaders, Playwright route interception, Mirage, custom SDK mocks, local database seeds, edge workers, or test-only HTTP servers. Core provenance must support all of them.

### Exact MSW integration strategy

`@provenancekit/msw` should provide:

1. `createProvenanceWorker()` wrapper around `setupWorker`.
2. `withProvenanceHandler()` to tag handler responses as `mock` with request metadata.
3. Critical route matchers and `onUnhandledRequest` reporting.
4. Safe stale-worker cleanup for `/mockServiceWorker.js`, opt-in and scoped.
5. Node test adapter using MSW’s server APIs.
6. Scenario support for fixture variants.
7. A devtools view listing active handlers and unhandled critical requests.

### Package dependency decision

- `@provenancekit/core`: no MSW dependency.
- `@provenancekit/msw`: `msw` as a peer dependency and dev dependency for tests.
- End-user install path: `npm i -D @provenancekit/msw msw`.

This is the best compromise: MSW is easy for teams that want it, but not mandatory for teams that only need provenance around live/fallback/hardcoded data.

---

## 8. Decision: default UI should be in-app devtools, not a self-hosted dashboard

### Decision

The MVP UI should be an in-app floating trigger with a side panel, similar in spirit to TanStack Query Devtools. A self-hosted dashboard should exist later for route audits, CI artifacts, and multi-route review, but it should not be the default first install.

### Rationale

TanStack Query Devtools provides a strong precedent. It is installed as a separate devtools package, defaults to development-only inclusion, and supports a floating mode that mounts a fixed UI with a corner toggle whose open/closed state is persisted in localStorage.[^tanstack-devtools]

That model fits ProvenanceKit because:

- the audit is most useful in the context of the current screen;
- setup is low-friction;
- no separate server is needed;
- users can inspect route records while interacting with the app;
- a floating trigger is lower commitment than asking teams to build a custom control surface.

A self-hosted dashboard has value, but a dashboard-first product has disadvantages:

- more setup;
- more privacy/security review;
- context switching away from the app;
- harder local development story;
- weaker immediate feedback while changing UI.

### Recommended UI stack

Ship three UI surfaces:

| Surface | Purpose | Release |
| --- | --- | --- |
| Floating in-app devtools | Daily development, demos, route inspection, mode switching. | MVP |
| Export report dashboard | Review JSON/Markdown audit artifacts, compare routes, share status. | Beta |
| Browser extension / external panel | Inspect apps without embedding UI; useful for larger organisations. | Later |

### Exact MVP behavior

The React package should expose:

```tsx
<ProvenanceProvider client={provenance}>
  <App />
  <ProvenanceDevtools initialIsOpen={false} />
</ProvenanceProvider>
```

The devtools should:

- mount only in development unless explicitly enabled;
- support a keyboard shortcut;
- persist open state and selected tab;
- use Shadow DOM or strong style isolation where possible;
- show a compact state pill when closed;
- avoid blocking the app UI unless capture mode says the route is unsafe.

---

## 9. Decision: inline UI indicators should be optional, layered, and mode-gated

### Decision

Do not require users to modify every component to get value. Provide optional UI markers and section wrappers, but make route/resource auditing useful without them.

### Why this matters

The concern is real: many users will not want to add special highlight wrappers around product UI. Even adding a toggle can feel intrusive. A tool that demands too much annotation will be seen as “process” rather than leverage.

### Layered approach

| Layer | Requires code changes? | What it catches | MVP? |
| --- | ---: | --- | --- |
| Resource/fetch instrumentation | Low | API, mock, fallback, empty, unsupported, error. | Yes |
| Route section config | Low/medium | Groups resources into screen sections. | Yes |
| Floating panel | One provider/devtools insertion | Current route state and source mix. | Yes |
| Optional `AuditMark` wrapper | Medium | Hardcoded, derived, authored fallback UI. | Yes |
| Optional `data-provenance-*` attributes | Medium | DOM-level highlights without component wrapper styling. | Beta |
| ESLint/static scanner | Low after setup | Candidate hardcoded strings and literals. | Beta |
| Compiler/Babel/Vite plugin | Low after setup | Automatic hints, source locations, dev-only annotations. | Later |
| Browser extension overlay | No app UI changes after install | Visual overlays and inspection. | Later |

### Honest limitation

No runtime library can perfectly infer that a displayed string is hardcoded, derived, or source-backed without either:

1. seeing the fetch/resource lineage;
2. receiving a marker from the component;
3. reading source code through a build-time plugin or lint rule;
4. using unreliable heuristics.

Therefore the product should be honest: automatic resource provenance comes first; UI-authored provenance gets better as teams add markers or static tooling.

### Exact recommendation

Use this progression:

1. **MVP:** `AuditMark` and `AuditSection` components, visual only in `audit` mode.
2. **Beta:** `data-provenance` attributes and DOM overlay so users can mark elements without changing visual component structure.
3. **Beta:** ESLint rule that flags suspicious unmarked literals in configured directories.
4. **Later:** Vite/TypeScript plugin that maps highlighted DOM nodes back to source locations.

---

## 10. Decision: the tool needs modes, but modes must be named around trust

### Decision

Use default modes that describe trust posture rather than implementation details.

Recommended defaults:

| Mode | Transport | Fallback | Highlighting | Intended use |
| --- | --- | --- | --- | --- |
| `mock` | Mock transport allowed, MSW adapter may run. | Not needed because transport is mocked. | Optional. | Fixture-driven prototyping and deterministic demos. |
| `hybrid` | Live transport first. | Explicit fallback allowed. | Shows warnings in panel. | Partial backend integration. |
| `live` | Live transport only. | No fallback. | No inline highlights by default. | Honest integration testing. |
| `audit` | Live transport only by default. | No fallback by default. | Highlights mock/fallback/derived/hardcoded/empty/unsupported/error. | Visual source review. |
| `capture` | Live transport only unless policy overrides. | Blocked by default. | Preflight checklist. | Recorded demos, customer proof, release review. |

The old names `fallback` and `liveHighlight` are technically clear but not always product-friendly. `hybrid` and `audit` may land better for public users.

### Important distinction

Modes are not feature flags. They are trust policies.

A mode should define:

- whether mock transport can run;
- whether fallback substitution can happen;
- whether UI highlights are shown;
- whether missing capability is warning or blocking;
- whether capture/export is allowed;
- whether the selected mode requires page reload.

---

## 11. Decision: route-level audit should show both worst source and distribution

### Decision

Keep the conservative “worst source wins” summary, but add source distribution to avoid hiding mixed-health routes.

### Rationale

Worst-source summaries are good for demo safety: one unsupported or fallback resource can make a section risky. But they are weak for planning because they hide that 90% of a section is live and one secondary value is hardcoded.

The UI should show:

- section status: `ready`, `warning`, `blocked`, `unknown`;
- highest-risk source kind;
- source distribution: e.g. `4 api · 1 derived · 1 hardcoded`;
- proof-critical resources vs presentation-only resources;
- reasons and remediation hints.

### Example

```text
Customer Overview
Status: Warning
Highest risk: authoredFallback
Source mix: 3 api · 1 derived · 1 authoredFallback
Reason: The summary paragraph is authored because the live payload has no narrative field.
Next action: Add backend summary field or mark this section as presentation-only.
```

---

## 12. Decision: capture mode should be a policy system, not a hardcoded mode

### Decision

Implement capture as route-specific policy on top of modes.

### Rationale

The old implementation had a strict capture preflight: required records had to be ready live API records. That is a valuable pattern, but public users need route-specific definitions.

A release-note page may be safe with some authored copy. A customer proof page may require every proof-critical resource to be live. A design prototype may only need to block unknown sources.

### Exact policy model

Capture policy should define:

- route pattern;
- required resource keys;
- optional source-kind allowlist;
- optional field coverage threshold;
- proof-critical vs presentation-only labels;
- redaction rules for export;
- operator-facing blocked reasons.

Example:

```ts
defineCapturePolicy({
  route: "/customers/:id/proof",
  required: [
    { resourceKey: "customer.profile", sourceKind: ["api"], minCoverage: 0.8 },
    { resourceKey: "customer.evidence", sourceKind: ["api"], minCoverage: 0.7 },
  ],
  allowedPresentationSources: ["derived", "hardcoded"],
  blockOn: ["mock", "fallback", "unsupported", "error", "unknown"],
})
```

---

## 13. Decision: support Code Mode ideas through an agent manifest, not as an early dependency

### Decision

Do not depend on Cloudflare Code Mode in the MVP. Learn from its architecture: expose a compact typed API that lets agents inspect and act on a large surface area without receiving every individual operation as a separate tool.

### Rationale

Cloudflare’s Code Mode work argues that, for large APIs, it can be better to convert tools into a TypeScript API and let an LLM write code against that API than to expose every operation as direct tool calls.[^cloudflare-code-mode] Cloudflare’s Codemode docs describe a package that generates TypeScript type definitions from tools and executes generated JavaScript in a secure Worker sandbox; it is currently marked beta.[^cloudflare-codemode-docs]

For ProvenanceKit, the parallel is strong:

- a real app may have hundreds of resource definitions;
- an agent integrating the tool should not need every record in context;
- an agent can work better from a typed manifest and search API;
- provenance remediation often requires multi-step logic.

### Proposed later feature

`@provenancekit/agent` should generate:

1. `provenance.manifest.json` with routes, resources, source taxonomy, capture policies, and marker conventions.
2. `provenance.agent.d.ts` with a compact typed API.
3. Optional MCP server exposing “search” and “execute” style operations.
4. Guidance files for coding agents: `AGENTS.md`, `.cursor/rules`, `.github/copilot-instructions.md`.

Agent-facing operations:

```ts
await provenance.searchResources("customer proof empty fallback")
await provenance.inspectRoute("/customers/123/proof")
await provenance.findUnmarkedLiterals({ route: "/customers/:id" })
await provenance.suggestInstrumentation("src/api/customer.ts")
await provenance.generateAuditMarkPatch("src/components/CustomerSummary.tsx")
```

This would make the project especially strong for AI-assisted prototype-driven development.

---

## 14. Product positioning

### Category

**Prototype provenance devtools**

### Tagline options

- “Know what your prototype is really made of.”
- “A provenance cockpit for mock-to-live transitions.”
- “Devtools for honest prototypes.”
- “Track live, mock, fallback, hardcoded, and derived data as your prototype grows up.”

### Primary users

| Persona | Job to be done |
| --- | --- |
| Prototype-heavy product engineer | Move fast with fixtures while knowing what still needs live integration. |
| AI-assisted developer | Let agents build quickly without losing track of data truth. |
| Design engineer | Show rich interactive prototypes without accidentally implying live data. |
| Backend/API engineer | See which frontend sections depend on missing or empty API resources. |
| Demo operator / PM | Verify whether a route is safe to narrate or record. |
| QA / release engineer | Export route provenance and catch fallback/mock leakage before review. |

### Differentiation

| Adjacent tool | What it does | Why ProvenanceKit is different |
| --- | --- | --- |
| MSW | Mocks network requests. | ProvenanceKit records visible source truth across live, mock, fallback, hardcoded, derived, empty, unsupported, and error states. |
| React Query Devtools | Shows query cache and mutations. | ProvenanceKit explains trust and origin, not just cache state. |
| Storybook | Develops components and scenarios. | ProvenanceKit inspects runtime app routes and source provenance. |
| OpenAPI/spec tooling | Defines service contracts. | ProvenanceKit observes what the running prototype actually used. |
| Observability tools | Monitor production systems. | ProvenanceKit focuses on development/demo trust boundaries. |
| Feature flags | Enable or disable behavior. | ProvenanceKit classifies data truth and source quality. |

---

## 15. The exact solution

Build ProvenanceKit with this MVP contract:

### 15.1 User installation

```sh
npm i -D @provenancekit/react @provenancekit/msw msw
```

No-MSW path:

```sh
npm i -D @provenancekit/react
```

### 15.2 User configuration

```ts
// provenance.config.ts
import { defineProvenanceConfig, defineResource, defineSection } from "@provenancekit/core"

export default defineProvenanceConfig({
  project: "my-app",
  modes: "default",
  resources: [
    defineResource({
      key: "customers.list",
      label: "Customer list",
      match: { method: "GET", url: "/api/customers" },
      assess: (data: { customers: unknown[] }) => ({
        empty: data.customers.length === 0,
        reason: data.customers.length === 0 ? "No customers returned." : undefined,
        coverage: { present: data.customers.length > 0 ? 1 : 0, total: 1 },
      }),
      fallback: () => import("./fixtures/customers").then((m) => m.customersFixture),
    }),
  ],
  sections: [
    defineSection({
      route: "/customers",
      id: "customers.table",
      label: "Customer table",
      resources: ["customers.list", "ui.customers.emptyState"],
    }),
  ],
})
```

### 15.3 User app setup

```tsx
import { createProvenanceClient } from "@provenancekit/browser"
import { ProvenanceProvider, ProvenanceDevtools } from "@provenancekit/react"
import config from "../provenance.config"

const provenance = createProvenanceClient({ config })

export function Root() {
  return (
    <ProvenanceProvider client={provenance}>
      <App />
      <ProvenanceDevtools />
    </ProvenanceProvider>
  )
}
```

### 15.4 User API instrumentation

```ts
export async function listCustomers() {
  return provenance.fetch("customers.list", "/api/customers")
}
```

Or an Effect-native path:

```ts
const customers = yield* provenance.effect.fetch("customers.list", "/api/customers")
```

### 15.5 Optional UI markers

```tsx
<AuditMark
  key="ui.customers.emptyState"
  source="hardcoded"
  label="Customer empty state copy"
  reason="Authored UI copy shown when no customers match the current filter."
>
  No customers match this filter.
</AuditMark>
```

### 15.6 MSW integration

```ts
import { setupProvenanceWorker } from "@provenancekit/msw"
import { handlers } from "./mocks/handlers"
import config from "../provenance.config"

export const worker = setupProvenanceWorker({
  config,
  handlers,
  critical: ["GET /api/customers", "GET /api/customers/:id"],
})
```

### 15.7 Devtools MVP tabs

1. **Overview:** current mode, source mix, route status, scenario state.
2. **Route:** section summaries and route-level capture state.
3. **Resources:** records table, status, source, reason, coverage, request route.
4. **UI Marks:** hardcoded, derived, authored fallback markers.
5. **Fallbacks:** fallback usage, missing live data reasons, fixture source.
6. **Capture:** route policy and go/no-go checklist.
7. **Export:** copy JSON, download report, redaction status.

### 15.8 CLI MVP

```sh
npx provenancekit init
npx provenancekit doctor
npx provenancekit audit --routes /,/customers,/customers/123 --out provenance-report
```

---

## 16. Why this is likely to land well with users

The design respects developer psychology.

Users get value immediately from a single provider and fetch/resource wrapper. They are not forced to redesign product UI. MSW users get a better mock cockpit. Non-MSW users still get live/fallback/hardcoded provenance. Product operators get a clear route status. Teams can gradually add capture policies and UI markers as the prototype becomes more important.

The in-app devtools pattern is familiar from TanStack Query Devtools, while the package structure is familiar from modern multi-adapter TypeScript libraries like UploadThing. Effect gives the project a strong internal architecture without imposing a functional-programming learning curve on all users.

The result is an open source project with a clear reason to exist:

> It makes prototype-driven development safer, more honest, and easier to graduate into production.

---

## 17. Recommended next decisions before implementation

1. Choose the public name and npm scope.
2. Decide whether to support React only in MVP or include a vanilla web component panel.
3. Decide Node baseline: recommended `>=20` for the project toolchain, with runtime packages tested against current LTS.
4. Decide whether the first release is ESM-only or dual ESM/CJS; dual output improves compatibility but adds maintenance.
5. Define the exact default source taxonomy and mode names.
6. Build one reference example app showing all states: api, mock, fallback, empty, unsupported, error, derived, hardcoded, authored fallback.
7. Write the first public README around “What is this screen made of?” rather than “Mock mode”.

---

## References

[^github-speckit]: GitHub Blog, “Spec-driven development with AI: Get started with a new open source toolkit,” 2025-09-02. https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/
[^thoughtworks-sdd]: Thoughtworks, “Spec-driven development: Unpacking one of 2025’s key new AI-assisted engineering practices,” 2025-12-04. https://www.thoughtworks.com/en-gb/insights/blog/agile-engineering-practices/spec-driven-development-unpacking-2025-new-engineering-practices
[^uploadthing-readme]: pingdotgg/uploadthing README, accessed 2026-05-13. https://github.com/pingdotgg/uploadthing
[^uploadthing-package]: pingdotgg/uploadthing `packages/uploadthing/package.json`, accessed 2026-05-13. https://raw.githubusercontent.com/pingdotgg/uploadthing/main/packages/uploadthing/package.json
[^effect-intro]: Effect Documentation, “Introduction,” accessed 2026-05-13. https://effect.website/docs/getting-started/introduction/
[^effect-layers]: Effect Documentation, “Managing Layers,” accessed 2026-05-13. https://effect.website/docs/requirements-management/layers/
[^msw-setupworker]: Mock Service Worker Docs, `setupWorker`, last updated 2026-02-12. https://mswjs.io/docs/api/setup-worker/
[^msw-unhandled]: Mock Service Worker Docs, “Debugging uncaught requests,” accessed 2026-05-13. https://v1.mswjs.io/docs/recipes/debugging-uncaught-requests
[^tanstack-devtools]: TanStack Query React Docs, “Devtools,” accessed 2026-05-13. https://tanstack.com/query/latest/docs/framework/react/devtools
[^cloudflare-code-mode]: Cloudflare Blog, “Code Mode: the better way to use MCP,” 2025-09-26. https://blog.cloudflare.com/code-mode/
[^cloudflare-codemode-docs]: Cloudflare Agents Docs, “Codemode,” accessed 2026-05-13. https://developers.cloudflare.com/agents/api-reference/codemode/
