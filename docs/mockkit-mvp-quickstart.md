# MockKit MVP Quickstart

MockKit records runtime provenance for prototype data. The first useful question is:

> What is this screen made of right now?

## Install

No MSW path:

```sh
pnpm add -D @mockkit/core @mockkit/browser @mockkit/devtools
```

MSW path:

```sh
pnpm add -D @mockkit/core @mockkit/browser @mockkit/devtools @mockkit/msw msw
```

## Configure

```ts
import { defineMockKitConfig, defineResource, defineSection } from "@mockkit/core"

export const config = defineMockKitConfig({
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
      fallback: () => import("./fixtures/customers").then((module) => module.customers),
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

## Mount Devtools

```ts
import { createMockKitClient } from "@mockkit/browser"
import { defineAllMockKitElements, mountMockKitDevtools } from "@mockkit/devtools"
import { config } from "./mockkit.config"

export const mockkit = createMockKitClient({ config })

defineAllMockKitElements()
mountMockKitDevtools({ client: mockkit })
```

## Instrument Fetch

```ts
export function listCustomers() {
  return mockkit.fetch("customers.list", "/api/customers")
}
```

## Mark UI-Authored Values

```html
<mockkit-mark
  data-resource-key="ui.customers.emptyState"
  data-source-kind="hardcoded"
  data-label="Customer empty state copy"
>
  No customers match this filter.
</mockkit-mark>
```

## Export Current Route JSON

```ts
const json = mockkit.exportJson()
```

Exports are metadata-only by default. Add a redaction policy before including payload values.
