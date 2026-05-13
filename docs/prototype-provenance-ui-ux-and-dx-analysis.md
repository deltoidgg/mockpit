# ProvenanceKit UI, UX, and Developer Experience Analysis

**Date:** 2026-05-13  
**Working project name:** ProvenanceKit  
**Focus:** how users and developers should interact with a prototype provenance tool without turning it into heavy process or intrusive product UI.

---

## 1. Executive summary

The best default user experience is an **in-app floating devtools panel**, not a separate dashboard and not mandatory inline UI indicators.

The public package should feel closer to TanStack Query Devtools than to a monitoring platform. Developers should install it, add one provider, wrap selected API calls, and immediately see what the current route is made from. The panel should show source mix, route sections, resource records, fallback reasons, capture status, and export controls. Inline highlights should be opt-in and mode-gated so teams can inspect hardcoded, derived, or fallback-authored content when they want to, without permanently modifying the product UI.

A self-hosted dashboard is useful later for multi-route reports, CI artifacts, and team review. It should not be the first thing a user must run.

The ideal adoption path is:

1. **Install:** one package install and optional MSW adapter.
2. **Mount:** provider and floating devtools near the app root.
3. **Instrument:** wrap fetch/API clients resource by resource.
4. **Inspect:** use the route panel to understand live/mock/fallback/derived/hardcoded state.
5. **Mark:** add optional UI markers for hardcoded, derived, and authored fallback values.
6. **Gate:** add capture policies when demos or customer-facing proof matter.
7. **Export:** run CLI audit for route reports and CI.

This keeps the first experience low-commitment while creating a path to rigorous provenance.

---

## 2. UX goals

### 2.1 Primary UX question

The UI should answer this question faster than the user can inspect code:

> “What is this screen made of right now?”

### 2.2 Secondary questions

The interface should also answer:

- Which resources on this route are live API data?
- Which resources are mocks?
- Which live resources are empty?
- Which resources fell back to fixture data?
- Which visible values are derived, hardcoded, or authored fallback copy?
- Which backend capabilities are unsupported?
- Which route sections are safe or unsafe to demo?
- Why did a fallback happen?
- Which source records are proof-critical versus presentation-only?
- Can I copy/export this route’s audit state?
- What is the next action to move this route toward production?

### 2.3 Emotional UX target

The tool should make users feel:

- confident that they can prototype quickly;
- safe showing prototypes to others;
- aware of what still needs integration;
- not punished for using mocks;
- not burdened by premature process.

The UX must avoid making prototypes feel “wrong”. It should frame mock/fallback/hardcoded values as visible states, not moral failures.

---

## 3. Personas and workflows

### 3.1 Product engineer

**Goal:** build quickly, then replace mock/fallback data as APIs arrive.

Workflow:

1. Use mock mode to build screens from fixtures.
2. Switch to hybrid mode as live APIs arrive.
3. Open route panel to see fallback usage.
4. Replace fallback fixtures with live API resources.
5. Use audit mode to find hardcoded/derived leftovers.

Most important UI:

- resource table;
- fallback reasons;
- source distribution;
- route section status.

### 3.2 AI-assisted developer

**Goal:** let coding agents generate prototypes without losing track of data truth.

Workflow:

1. Ask agent to build a new flow.
2. Use ProvenanceKit to expose uninstrumented or unknown sources.
3. Ask agent to add resource definitions and UI markers.
4. Run CLI audit to verify route state.

Most important UI:

- unknown/uninstrumented records;
- source location hints;
- exportable JSON;
- future agent manifest.

### 3.3 Design engineer

**Goal:** use realistic prototype data without turning audit indicators into product UI.

Workflow:

1. Keep devtools collapsed during visual work.
2. Open audit mode to inspect specific sections.
3. Use inline highlights only when reviewing data truth.
4. Hide all indicators for normal design review.

Most important UI:

- unobtrusive floating trigger;
- mode-gated inline highlights;
- section outlines that do not alter layout;
- Shadow DOM/style isolation.

### 3.4 Demo operator / PM

**Goal:** know whether a route is safe to narrate or record.

Workflow:

1. Open capture tab.
2. Review route checklist.
3. Confirm proof-critical resources are live.
4. Copy audit JSON for sign-off.
5. Avoid narration of fallback/authored sections.

Most important UI:

- capture go/no-go card;
- blocked reasons;
- source mix summary;
- copy/export action.

### 3.5 Backend engineer

**Goal:** understand which frontend sections depend on missing or incomplete API data.

Workflow:

1. Review route report or devtools resource table.
2. Filter by empty/unsupported/fallback.
3. Read request routes and field coverage.
4. Prioritise backend endpoints or payload fields.

Most important UI:

- request route;
- field coverage;
- unsupported capability records;
- missing fields list.

---

## 4. Should the UI live inside the app?

### Recommendation

Yes. The default UI should live inside the app as a floating devtools trigger and side panel.

### Why this is the best default

1. **Context is immediate.** The user sees provenance for the route they are currently using.
2. **Setup is minimal.** No separate server or dashboard is required.
3. **The pattern is familiar.** TanStack Query Devtools uses a separate package with a floating mode, a corner toggle, localStorage-persisted open state, and development-only defaults.[^tanstack-devtools]
4. **It supports demo operators.** Non-engineers can open the panel without using browser devtools.
5. **It is easier to trust.** The audit is attached to the app state, route, and user interactions that created it.

### Risks

| Risk | Mitigation |
| --- | --- |
| It visually pollutes the app. | Default collapsed trigger; dev-only; keyboard shortcut; configurable position; hide in screenshots unless capture mode. |
| It interferes with layout. | Use fixed portal and Shadow DOM; never reserve app layout space by default. |
| Designers dislike it. | Make inline highlights mode-gated and off by default. |
| Teams forget to remove it from production. | Dev-only default and build-time warning if production enabled. |
| Some apps cannot embed devtools due to CSP or shell constraints. | Provide embedded panel, external dashboard, and browser extension later. |

### UI placement

Default:

- trigger: bottom-left or bottom-right configurable;
- panel: side drawer from left or right;
- width: 420–520px default, resizable later;
- keyboard shortcut: configurable, e.g. `Alt+Shift+P`;
- localStorage key: project-scoped.

---

## 5. Do users need a self-hosted dashboard?

### Recommendation

Not for the MVP daily workflow. Yes for later route audit review and CI artifacts.

### Dashboard use cases

A dashboard is valuable when users need to:

- inspect many routes at once;
- compare route provenance over time;
- review CI-generated audit artifacts;
- share status with backend/product teams;
- analyse source debt across a prototype;
- inspect screenshots and route JSON side by side;
- track progress toward capture readiness.

### Why dashboard-first is wrong

Dashboard-first would create avoidable friction:

- another process to run;
- another URL to open;
- less context about the current route interaction;
- higher security/privacy concern;
- weaker fit for solo prototyping;
- harder onboarding.

### Recommended dashboard model

Build a static/local report viewer, not a SaaS dashboard.

```sh
npx provenancekit audit --routes /,/customers,/customers/123 --out ./provenance-report
npx provenancekit report ./provenance-report
```

The report viewer can read JSON artifacts and render:

- route list;
- source distribution heatmap;
- failed capture policies;
- fallback usage;
- hardcoded/derived markers;
- screenshots;
- remediation checklist.

This respects privacy and open source expectations. Users can host the output themselves if they want.

---

## 6. Should users need inline indicators in the app UI?

### Recommendation

No for basic value. Yes as optional audit-mode enhancement.

### Why not require inline indicators?

Requiring inline indicators would slow adoption. Many teams will reject a tool that forces changes in product components before it proves value. It also risks visual regressions and design friction.

The first value should come from API/resource provenance:

- live API records;
- mock transport records;
- fallback records;
- empty live responses;
- unsupported capabilities;
- errors.

Those can be captured without wrapping every visible element.

### Why inline indicators still matter

Fetch wrappers cannot see values authored directly in components. They cannot reliably know whether a paragraph, label, score, prompt shortcut, or fallback summary is hardcoded or derived.

Inline indicators are the only precise runtime way to connect UI-authored values to visible elements.

### Layered inline strategy

#### Level 1: no inline markers

User only sees route-level and resource-level records in the panel.

Best for:

- first install;
- backend integration work;
- teams not ready to annotate UI.

Limit:

- hardcoded/derived UI values remain invisible unless manually recorded elsewhere.

#### Level 2: section wrappers

```tsx
<AuditSection id="customer.summary">
  <CustomerSummary />
</AuditSection>
```

Best for:

- grouping data sources by visible sections;
- showing section borders in audit mode;
- low-medium code changes.

Limit:

- does not identify individual values.

#### Level 3: value markers

```tsx
<AuditMark source="derived" key="customer.scoreDelta" label="Score delta">
  {scoreDelta}
</AuditMark>
```

Best for:

- precise hardcoded/derived/authored fallback provenance;
- demo-sensitive text;
- proof-critical fields.

Limit:

- requires component changes.

#### Level 4: DOM attributes

```tsx
<span
  data-provenance-key="customer.scoreDelta"
  data-provenance-source="derived"
>
  {scoreDelta}
</span>
```

Best for:

- teams that dislike wrapper components;
- custom component libraries;
- overlay-based highlighting.

Limit:

- still requires annotation.

#### Level 5: lint/static hints

An ESLint rule can flag likely hardcoded values in configured zones:

```text
src/routes/customer/Summary.tsx:42
Possible unmarked hardcoded display string: "Estimated uplift"
```

Best for:

- incremental adoption;
- catching forgotten markers;
- agent-assisted remediation.

Limit:

- cannot know semantic intent perfectly.

#### Level 6: build plugin/source map overlay

Later, a Vite/Babel/SWC plugin can add development-only source metadata to marked nodes and help map UI highlights back to source files.

Best for:

- mature teams;
- large prototypes;
- AI-agent patch suggestions.

Limit:

- more framework/build complexity.

---

## 7. Devtools information architecture

### 7.1 Closed trigger

The closed trigger should show only high-signal information.

Recommended content:

```text
● Live
3 api · 1 fallback
```

or:

```text
● Audit
2 blocked
```

The trigger should not display a long list of resources. It should answer:

- current mode;
- route health;
- source mix or issue count;
- whether capture is blocked.

### 7.2 Open panel tabs

#### Tab 1: Overview

Purpose: tell the user whether the current route is trustworthy.

Fields:

- current mode;
- route path;
- effective policy;
- source distribution;
- highest-risk source;
- capture status;
- active scenario;
- mock transport state;
- last unhandled critical request;
- quick mode switcher.

#### Tab 2: Route

Purpose: connect records to the visible UI.

Fields:

- route sections;
- each section’s status;
- source distribution per section;
- proof-critical resources;
- warning/block reasons;
- “highlight section” action.

#### Tab 3: Resources

Purpose: inspect every data resource.

Columns:

- resource key;
- label;
- source;
- status;
- request route;
- HTTP status;
- coverage;
- updated time;
- reason.

Filters:

- source kind;
- status;
- proof-critical only;
- fallback only;
- empty/unsupported only;
- current route/all routes.

#### Tab 4: UI Marks

Purpose: inspect hardcoded, derived, and authored fallback values.

Fields:

- marker key;
- source kind;
- label;
- reason;
- section;
- component/source location if available;
- visible/mounted state.

Actions:

- highlight on page;
- copy marker JSON;
- open source link later if source mapping exists.

#### Tab 5: Fallbacks

Purpose: explain why fallback happened.

Fields:

- resource;
- reason live data was not used;
- fallback source module;
- whether fallback was due to error, empty, unsupported, or policy;
- whether capture would block it;
- remediation hint.

#### Tab 6: Scenarios

Purpose: keep scenario state separate from data source mode.

Examples:

- selected customer;
- persona;
- density/simple-power view;
- locale;
- fixture variant;
- feature flag group.

Important: this tab must clearly say that scenarios are not equivalent to source provenance.

#### Tab 7: Capture

Purpose: decide whether a route is safe to record or present as live proof.

Fields:

- capture policy name;
- required resources;
- pass/fail per resource;
- source allowlist;
- field coverage threshold;
- blockers;
- export/copy evidence.

#### Tab 8: Export

Purpose: preserve current state.

Actions:

- copy current route JSON;
- download current route JSON;
- copy Markdown summary;
- run CLI audit instructions;
- show redaction status.

---

## 8. Visual language

### 8.1 Source labels

Use clear language, not only internal enum names.

| Enum | UI label | Explanation |
| --- | --- | --- |
| `api` | Live API | Data came from live service response. |
| `mock` | Mock | Data came from mock transport or fixture handler. |
| `fallback` | Fallback | Live data failed or was incomplete, and fixture fallback was substituted. |
| `derived` | Derived | Value was computed locally from other inputs. |
| `hardcoded` | Hardcoded | Value was authored directly in the app. |
| `authoredFallback` | Authored fallback | Human-written fallback copy is displayed because source data is absent. |
| `empty` | Empty live response | Live request succeeded but did not provide usable content. |
| `unsupported` | Unsupported | Backend capability or route is unavailable. |
| `error` | Error | Request, parsing, validation, or handler failure. |
| `unknown` | Unknown | Source could not be classified. |

### 8.2 Status language

Avoid panic language unless capture is blocked.

| Status | Tone |
| --- | --- |
| Ready | “This resource is usable.” |
| Warning | “This is visible but should be understood.” |
| Blocked | “This route should not be recorded/presented as live proof.” |
| Error | “Something failed.” |
| Unknown | “Instrumentation is incomplete.” |

### 8.3 Inline highlight behavior

Inline highlights should:

- appear only in `audit` or `capture` mode;
- avoid layout shifts;
- use outlines/shadows rather than inserted badges where possible;
- show label/source on hover or click;
- support a “highlight one source kind” filter;
- never expose sensitive data in tooltip by default.

### 8.4 Section highlight behavior

Section wrappers should show:

- subtle outline;
- compact badge with highest-risk source;
- source distribution in tooltip;
- click-to-open corresponding panel row.

Example badge:

```text
Fallback · 2 api / 1 fallback / 1 derived
```

---

## 9. Mode switching UX

### 9.1 Mode labels

Use public labels that map to trust posture.

| Mode | Public label | Helper text |
| --- | --- | --- |
| `mock` | Mock prototype | Use fixtures/mock transport for deterministic prototype work. |
| `hybrid` | Live + fallback | Try live APIs first; use explicit fallback only when allowed. |
| `live` | Live only | No fallback substitution; empty stays empty. |
| `audit` | Live audit | Live only with visual provenance highlighting. |
| `capture` | Capture preflight | Strict route checks for recording or customer-facing proof. |

### 9.2 Reload behavior

Transport mode changes may require reload because browser service workers and global fetch state can persist beyond a React state update. The UI should be explicit:

```text
Switching from Mock prototype to Live only requires a reload so mock transport can be stopped safely.
```

But do not ask for confirmation unnecessarily. Provide a one-click mode change that applies the change and reloads.

### 9.3 Capture mode

Capture should feel different from ordinary audit mode:

- shows checklist first;
- blocks fallback by default;
- blocks mock by default;
- can be route-specific;
- has a clear “safe / unsafe” outcome;
- can export proof.

---

## 10. Developer experience goals

### 10.1 Five-minute first value

A developer should be able to see records in five minutes:

```sh
npm i -D @provenancekit/react
```

```tsx
const provenance = createProvenanceClient()

<ProvenanceProvider client={provenance}>
  <App />
  <ProvenanceDevtools />
</ProvenanceProvider>
```

```ts
await provenance.recordResource({
  resourceKey: "hello.world",
  label: "Hello world resource",
  sourceKind: "hardcoded",
  status: "warning",
})
```

Then the docs lead them to fetch instrumentation.

### 10.2 Setup paths

#### Path A: no MSW, live/fallback only

```sh
npm i -D @provenancekit/react
```

Use when:

- project already has API clients;
- team wants to audit live vs fallback/hardcoded;
- no transport mocks are needed.

#### Path B: MSW prototype

```sh
npm i -D @provenancekit/react @provenancekit/msw msw
```

Use when:

- team already uses MSW;
- team wants deterministic fixture-driven prototype mode;
- team wants unhandled critical request detection.

MSW is appropriate because it intercepts browser requests via `setupWorker()` and gives developers worker lifecycle and handler control.[^msw-setupworker] But it should remain an adapter because ProvenanceKit’s broader job is source provenance, not only request mocking.

#### Path C: React Query/TanStack Query

```sh
npm i -D @provenancekit/react @provenancekit/query
```

Use when:

- the app already centralises data through TanStack Query;
- users want query metadata connected to resource provenance.

TanStack’s own devtools are a strong mental model: separate devtools package, floating mode, localStorage toggle state, and development-only default inclusion.[^tanstack-devtools]

#### Path D: CLI report only

```sh
npm i -D @provenancekit/cli
```

Use when:

- team wants route audit exports;
- app has already embedded global provenance hook;
- CI should collect reports.

### 10.3 `init` command

`npx provenancekit init` should ask as few questions as possible and infer:

- framework;
- existing MSW setup;
- app root file;
- TypeScript path aliases;
- likely API client directories.

It should generate:

```text
provenance.config.ts
src/provenance/client.ts
src/provenance/devtools.tsx
```

If MSW is found:

```text
src/provenance/msw.ts
```

### 10.4 Docs structure

Docs should be recipe-driven:

1. Quick start: React without MSW.
2. Quick start: React with MSW.
3. Add your first resource.
4. Add fallback safely.
5. Mark hardcoded UI values.
6. Create route sections.
7. Add capture policy.
8. Export route audit.
9. Integrate with React Query.
10. Integrate with Next.js.
11. Use with AI coding agents.

---

## 11. Developer API design

### 11.1 Create client

```ts
import { createProvenanceClient } from "@provenancekit/browser"
import config from "../provenance.config"

export const provenance = createProvenanceClient({ config })
```

### 11.2 Define resource

```ts
defineResource({
  key: "orders.list",
  label: "Orders list",
  match: { method: "GET", url: "/api/orders" },
  assess: (data: OrdersResponse) => ({
    empty: data.orders.length === 0,
    reason: data.orders.length === 0 ? "No orders returned." : undefined,
    coverage: { present: data.orders.length ? 1 : 0, total: 1 },
  }),
  fallback: () => import("./fixtures/orders").then((m) => m.orders),
})
```

### 11.3 Wrap fetch

```ts
export function listOrders() {
  return provenance.fetch<OrdersResponse>("orders.list", "/api/orders")
}
```

### 11.4 Wrap arbitrary async function

```ts
export function getOrder(id: string) {
  return provenance.wrap("orders.detail", () => orderClient.get(id))
}
```

### 11.5 Manual record

```ts
provenance.record({
  resourceKey: "ui.orders.emptyState",
  label: "Orders empty-state copy",
  sourceKind: "hardcoded",
  status: "warning",
  reason: "Static copy in component.",
})
```

### 11.6 React marker

```tsx
<AuditMark
  key="ui.orders.emptyState"
  label="Orders empty-state copy"
  source="hardcoded"
  reason="Static copy in component."
>
  No orders yet.
</AuditMark>
```

### 11.7 Section

```tsx
<AuditSection id="orders.table">
  <OrdersTable />
</AuditSection>
```

---

## 12. How much should the user modify their code?

### Minimum viable integration

One provider and one devtools component.

Pros:

- fastest setup;
- proves panel works;
- no API changes yet.

Cons:

- no meaningful records unless manually recorded or auto-detected.

### Recommended integration

Provider + fetch/API client wrapper + config resources.

Pros:

- captures most provenance value;
- no visible UI changes;
- API layer is the right boundary for live/mock/fallback classification.

Cons:

- each resource needs a definition;
- “empty” requires domain-specific assessment.

### High-rigor integration

Provider + fetch wrappers + sections + markers + capture policies + CLI audit.

Pros:

- best demo safety;
- strong path to production;
- CI-friendly.

Cons:

- more setup;
- must be introduced gradually.

### Recommended messaging

Do not tell users “wrap everything”. Tell them:

1. “Wrap your riskiest API calls first.”
2. “Add sections for routes you demo.”
3. “Mark hardcoded values only where they could be mistaken for live evidence.”
4. “Add capture policies only for routes you record or show externally.”

---

## 13. What the actual UI should look like

### 13.1 Closed state

A small pill/button:

```text
Provenance · Live · 4 api
```

Warning state:

```text
Provenance · Hybrid · 1 fallback
```

Blocked state:

```text
Provenance · Capture · Blocked
```

### 13.2 Overview tab wireframe

```text
┌──────────────────────────────────────────────┐
│ ProvenanceKit                         Live   │
├──────────────────────────────────────────────┤
│ Route: /customers/123                        │
│ Status: Warning                              │
│ Source mix: 4 Live API · 1 Derived · 1 Empty │
│ Highest risk: Empty live response            │
│ Scenario: Enterprise demo customer           │
│ Mock transport: Off                          │
├──────────────────────────────────────────────┤
│ Mode                                         │
│ [Mock prototype] [Live + fallback] [Live]    │
│ [Audit] [Capture]                            │
├──────────────────────────────────────────────┤
│ Top issues                                   │
│ • customer.evidence: Empty live response     │
│ • ui.scoreDelta: Derived in browser          │
└──────────────────────────────────────────────┘
```

### 13.3 Route tab wireframe

```text
Customer detail
  Summary
    Status: Ready
    Mix: 2 Live API

  Evidence
    Status: Warning
    Mix: 1 Empty · 1 Authored fallback
    Reason: Live evidence endpoint returned no claims.

  Recommendations
    Status: Warning
    Mix: 1 Derived · 1 Hardcoded
```

### 13.4 Resources tab wireframe

```text
Filter: [All sources v] [Current route only ✓]

Resource                 Source       Status    Coverage   Reason
customer.profile          Live API     Ready     8/8        Loaded from /api/customers/123
customer.evidence         Empty        Warning   0/4        No evidence claims returned
ui.evidence.emptyCopy     Authored     Warning   —          Fallback copy in UI
ui.scoreDelta             Derived      Warning   —          Computed from previous score
```

### 13.5 Capture tab wireframe

```text
Capture preflight: /customers/123
Status: Blocked

Required live resources
✓ customer.profile       Live API     8/8 fields
✕ customer.evidence      Empty        0/4 fields

Blocked because:
customer.evidence must be Live API with at least 70% coverage.

Actions
[Copy capture report] [Export JSON]
```

---

## 14. Developer experience: avoiding common adoption failure points

### 14.1 “I do not want another provider”

Mitigation:

- offer vanilla client and global hook;
- provider only needed for React hooks/devtools;
- make provider a thin adapter.

### 14.2 “I do not use MSW”

Mitigation:

- core and React devtools work without MSW;
- MSW package is optional;
- document custom mock adapter interface.

### 14.3 “I do not want to annotate UI”

Mitigation:

- fetch/resource provenance works first;
- markers are optional;
- hardcoded values can be addressed gradually;
- lint/static scanner later.

### 14.4 “I worry about leaking data”

Mitigation:

- no payload capture by default;
- redaction-first exports;
- dev-only default;
- production enablement requires explicit flag;
- clear docs for PII.

### 14.5 “This feels like observability overhead”

Mitigation:

- frame as prototype devtools;
- make first setup small;
- show immediate route value;
- avoid requiring central server/SaaS.

### 14.6 “Effect is too much”

Mitigation:

- ordinary TypeScript APIs;
- Effect-native docs as advanced section;
- no requirement to write `Effect.gen` in app code.

---

## 15. How should users install it?

### 15.1 Best first command

For most React prototypes:

```sh
npm i -D @provenancekit/react
```

Then:

```sh
npx provenancekit init
```

The init flow can recommend MSW if it detects mocks or if the user chooses “fixture-driven prototype”.

### 15.2 MSW path

```sh
npm i -D @provenancekit/react @provenancekit/msw msw
npx msw init public
npx provenancekit init --msw
```

### 15.3 Why dev dependency?

Default devtools should be development/staging tooling. Many teams will not want it in production bundles. If a team intentionally uses operator tooling in staging or internal demos, docs can show explicit dynamic import or production devtools import.

### 15.4 Production/staging enablement

Use explicit flag:

```ts
<ProvenanceDevtools enableInProduction={import.meta.env.VITE_ENABLE_PROVENANCE === "true"} />
```

The package should warn if production enablement has no redaction policy.

---

## 16. What is the best UI for seeing all mock data?

### Answer

The best UI is not a “mock data browser” alone. It is a **source-state explorer** that can filter to mock data.

Mock data is only one part of the problem. Users need to see:

- all mock resources;
- all fallback resources;
- live resources with empty payloads;
- authored fallback UI;
- hardcoded UI;
- derived values;
- unknown/uninstrumented sources.

### Recommended mock/fallback view

A dedicated `Fallbacks` or `Mocks & Fallbacks` tab should include:

- resource key;
- fixture module or handler name;
- scenario variant;
- whether it came from MSW transport or fallback substitution;
- why live data was not used;
- last request route;
- button to copy fixture path;
- remediation hint.

Example:

```text
customers.recommendations
Source: Fallback fixture
Fixture: src/fixtures/recommendations.ts
Reason: Live API returned 404 unsupported.
Scenario: enterprise-customer
Capture: blocked
Next: Implement GET /api/customers/:id/recommendations or mark section presentation-only.
```

---

## 17. Does the user need a dashboard to understand prototype state?

### During daily development

No. The in-app panel is better.

### During team review

Yes, a generated report/dashboard is useful.

### During CI/release

Yes, route audit artifacts are useful.

### Recommended maturity ladder

| Maturity | UI surface |
| --- | --- |
| First prototype | Floating devtools only |
| Partial integration | Floating devtools + route sections |
| Demo readiness | Capture tab + copied report |
| Team audit | CLI-generated dashboard/report |
| Large organization | Browser extension / hosted internal dashboard |

---

## 18. How to make this appealing to prototype-driven AI teams

### 18.1 Phrase around momentum, not compliance

Good:

- “Prototype fast without losing track of what is real.”
- “See mock debt before it becomes product debt.”
- “Keep demos honest while APIs catch up.”

Bad:

- “Enforce data governance in prototypes.”
- “Prevent developers from hardcoding.”
- “Mandate provenance annotations.”

### 18.2 Support agent workflows

The docs should include prompts like:

```text
Use ProvenanceKit conventions. Any API-backed UI section must define a resource key.
Any hardcoded display value that could be mistaken for live customer data must use AuditMark.
Do not use fallback data in capture mode.
```

Later, `@provenancekit/agent` can generate typed instructions and manifest files. Cloudflare’s Code Mode direction is relevant because it shows the value of giving agents a compact TypeScript API rather than overwhelming them with individual tools.[^cloudflare-code-mode][^cloudflare-codemode-docs]

### 18.3 Preserve prototype speed

Do not force teams to define every resource before building. Instead:

- allow `unknown` records;
- show “instrument this” hints;
- support progressive hardening;
- make CI/capture stricter than local prototype mode.

---

## 19. UX metrics

Track product success by whether users can answer source questions faster.

Possible metrics:

| Metric | Meaning |
| --- | --- |
| Time to first record | How long from install to seeing first provenance record. |
| Instrumented resource count | Whether teams are adopting resource definitions. |
| Fallback count over time | Whether prototype is graduating to live APIs. |
| Unknown source count | Instrumentation gaps. |
| Capture pass rate | Demo readiness. |
| CLI report generation | Team-level adoption. |
| Marker coverage on demo routes | Whether hardcoded/derived values are visible where needed. |

Do not track users externally by default. These metrics can be local/project diagnostics.

---

## 20. UX roadmap

### MVP UI

- Floating trigger.
- Side panel.
- Overview tab.
- Resource table.
- Source distribution.
- Mode switcher.
- `AuditMark` highlights.
- Copy current route JSON.

### Beta UI

- Route section tab.
- Capture tab.
- Fallback explanation tab.
- Scenario controls.
- Markdown export.
- DOM attribute overlay.
- Redaction status.

### v1 UI

- CLI report dashboard.
- Source location hints.
- React Query adapter view.
- Route comparison.
- Static/lint issue integration.
- Production/staging operator mode with hardened redaction.

### Later UI

- Browser extension.
- Multi-framework components.
- Agent remediation suggestions.
- Source map click-to-code.
- Hosted internal dashboard template.

---

## 21. Final UX recommendation

Build the MVP around a low-friction in-app devtools surface:

```tsx
<ProvenanceProvider client={provenance}>
  <App />
  <ProvenanceDevtools />
</ProvenanceProvider>
```

Make the first visible value route-level source distribution, not a complex dashboard. Let users add precision gradually through resource definitions, section wrappers, and UI markers. Keep MSW support excellent but optional. Add capture policies only when demos need stricter trust. Add CLI reports when teams need multi-route review.

The UX should communicate one promise:

> You can prototype quickly, but you never have to guess what is real.

---

## References

[^tanstack-devtools]: TanStack Query React Docs, “Devtools,” accessed 2026-05-13. https://tanstack.com/query/latest/docs/framework/react/devtools
[^msw-setupworker]: Mock Service Worker Docs, `setupWorker`, last updated 2026-02-12. https://mswjs.io/docs/api/setup-worker/
[^cloudflare-code-mode]: Cloudflare Blog, “Code Mode: the better way to use MCP,” 2025-09-26. https://blog.cloudflare.com/code-mode/
[^cloudflare-codemode-docs]: Cloudflare Agents Docs, “Codemode,” accessed 2026-05-13. https://developers.cloudflare.com/agents/api-reference/codemode/
