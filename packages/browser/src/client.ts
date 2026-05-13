import {
  createAuditRecord,
  createMemoryAuditStore,
  defineMockKitConfig,
  evaluateCapture,
  findResource,
  getModePolicy,
  matchesRoute,
  redactRecords,
  statusForSourceKind,
  summariseRoute,
  type AssessResult,
  type AuditRecord,
  type AuditRecordInput,
  type MockKitConfig,
  type MockKitSnapshot,
  type ProvenanceMode,
  type RequestDescriptor,
  type ResourceDefinition,
  type SourceKind,
} from "@mockkit/core"
import { createBrowserStorage, type MockKitStorage } from "./storage"

export interface MockKitFetchOptions<T = unknown> {
  readonly input: RequestInfo | URL
  readonly init?: RequestInit
  readonly parse?: (response: Response) => Promise<T>
  readonly requestRoute?: string
}

export interface RecordResourceInput extends Omit<AuditRecordInput, "routePath" | "updatedAt"> {
  readonly routePath?: string
}

export interface CreateMockKitClientOptions {
  readonly config?: MockKitConfig
  readonly storage?: MockKitStorage
  readonly fetch?: typeof globalThis.fetch
  readonly getRoutePath?: () => string
  readonly now?: () => string
  readonly exposeGlobal?: boolean
}

export interface MockKitClient {
  readonly config: MockKitConfig
  readonly effect: {
    readonly snapshot: () => Promise<MockKitSnapshot>
  }
  readonly fetch: <T = unknown>(
    resourceKey: string,
    input: RequestInfo | URL | MockKitFetchOptions<T>,
    init?: RequestInit,
  ) => Promise<T>
  readonly wrap: <T>(
    resourceKey: string,
    operation: () => Promise<T> | T,
    options?: { readonly sourceKind?: SourceKind; readonly reason?: string },
  ) => Promise<T>
  readonly record: (input: RecordResourceInput) => AuditRecord
  readonly recordUiMark: (input: RecordResourceInput) => AuditRecord
  readonly remove: (id: string) => void
  readonly clear: () => void
  readonly getMode: () => ProvenanceMode
  readonly setMode: (mode: ProvenanceMode) => void
  readonly getRoutePath: () => string
  readonly snapshot: () => MockKitSnapshot
  readonly exportJson: () => string
  readonly subscribe: (listener: () => void) => () => void
}

export class MockKitResourceError extends Error {
  readonly name = "MockKitResourceError"
}

export const createMockKitClient = (
  options: CreateMockKitClientOptions = {},
): MockKitClient => {
  const config =
    options.config ??
    defineMockKitConfig({
      project: "mockkit",
    })
  const storage = options.storage ?? createBrowserStorage()
  const fetchImplementation = options.fetch ?? globalThis.fetch?.bind(globalThis)
  const getRoutePath = options.getRoutePath ?? defaultRoutePath
  const now = options.now ?? (() => new Date().toISOString())
  const store = createMemoryAuditStore()
  const listeners = new Set<() => void>()

  let mode = readStoredMode(storage, config.mode.storageKey, config.mode.default)

  const notify = () => {
    for (const listener of listeners) listener()
  }

  const record = (input: RecordResourceInput): AuditRecord => {
    const resource = findResource(config, input.resourceKey)
    const routePath = input.routePath ?? getRoutePath()
    const section = config.sections.find(
      (candidate) =>
        matchesRoute(candidate.route, routePath) && candidate.resources.includes(input.resourceKey),
    )
    const criticality = resource?.criticality ?? section?.criticality ?? "proof"
    const record = createAuditRecord({
      ...input,
      routePath,
      sectionId: input.sectionId ?? section?.id,
      label: input.label ?? resource?.label ?? input.resourceKey,
      status: input.status ?? statusForSourceKind(input.sourceKind, mode, criticality),
      proofCritical: input.proofCritical ?? criticality === "proof",
      updatedAt: now(),
    })
    store.put(record)
    return record
  }

  const snapshot = (): MockKitSnapshot => {
    const routePath = getRoutePath()
    const records = store.snapshot()
    const capture = evaluateCapture(config, routePath, records)
    const summary = summariseRoute(config, records, routePath, mode, capture)
    return {
      project: config.project,
      mode,
      routePath,
      records,
      summary,
      updatedAt: now(),
    }
  }

  const client: MockKitClient = {
    config,
    effect: {
      snapshot: async () => snapshot(),
    },
    async fetch<T = unknown>(
      resourceKey: string,
      input: RequestInfo | URL | MockKitFetchOptions<T>,
      init?: RequestInit,
    ): Promise<T> {
      if (!fetchImplementation) {
        throw new MockKitResourceError("MockKit fetch requires a fetch implementation.")
      }

      const resource = findResource(config, resourceKey)
      if (!resource) {
        throw new MockKitResourceError(`Unknown MockKit resource "${resourceKey}".`)
      }

      const request = normaliseFetchOptions(input, init)
      const descriptor = requestDescriptor(request)
      const routePath = getRoutePath()
      const policy = getModePolicy(mode)

      try {
        const response = await fetchImplementation(request.input, request.init)
        const parsed = await parseResponse(response, request.parse)
        const assessment = await assess(resource, parsed, routePath, descriptor)

        if ((assessment.empty || assessment.unsupported) && policy.allowFallback && resource.fallback) {
          return resolveFallback<T>(resource, routePath, descriptor, assessment.reason, assessment)
        }

        const sourceKind = classifyResponse(response, mode)
        const finalSource = assessment.unsupported
          ? "unsupported"
          : assessment.empty
            ? "empty"
            : sourceKind

        record({
          resourceKey,
          sourceKind: finalSource,
          status: statusForSourceKind(finalSource, mode, resource.criticality),
          reason:
            assessment.reason ??
            (response.ok ? `Loaded from ${descriptor.route ?? descriptor.url ?? "request"}.` : response.statusText),
          request: { ...descriptor, status: response.status },
          fieldCoverage: assessment.coverage,
          metadata: assessment.metadata,
        })

        return parsed as T
      } catch (error) {
        if (policy.allowFallback && resource.fallback) {
          return resolveFallback<T>(
            resource,
            routePath,
            descriptor,
            error instanceof Error ? error.message : "Live data unavailable.",
            undefined,
            error,
          )
        }

        record({
          resourceKey,
          sourceKind: "error",
          status: "error",
          reason: error instanceof Error ? error.message : "Request failed.",
          request: descriptor,
          metadata: { error },
        })
        throw error
      }
    },
    async wrap<T>(
      resourceKey: string,
      operation: () => Promise<T> | T,
      options?: { readonly sourceKind?: SourceKind; readonly reason?: string },
    ): Promise<T> {
      try {
        const value = await operation()
        record({
          resourceKey,
          sourceKind: options?.sourceKind ?? "api",
          reason: options?.reason ?? "Loaded through wrapped operation.",
        })
        return value
      } catch (error) {
        record({
          resourceKey,
          sourceKind: "error",
          status: "error",
          reason: error instanceof Error ? error.message : "Wrapped operation failed.",
        })
        throw error
      }
    },
    record,
    recordUiMark: record,
    remove(id) {
      store.remove(id)
    },
    clear() {
      store.clear()
    },
    getMode: () => mode,
    setMode(nextMode) {
      mode = nextMode
      storage.set(config.mode.storageKey, nextMode)
      notify()
    },
    getRoutePath,
    snapshot,
    exportJson() {
      const current = snapshot()
      return JSON.stringify(
        {
          ...current,
          records: redactRecords(current.records, config.redaction),
          summary: {
            ...current.summary,
            records: redactRecords(current.summary.records, config.redaction),
          },
        },
        null,
        2,
      )
    },
    subscribe(listener) {
      const removeStoreListener = store.subscribe(listener)
      listeners.add(listener)
      return () => {
        removeStoreListener()
        listeners.delete(listener)
      }
    },
  }

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key === config.mode.storageKey && event.newValue) {
        mode = readStoredMode(storage, config.mode.storageKey, config.mode.default)
        notify()
      }
    })
  }

  if (options.exposeGlobal !== false) exposeMockKitGlobal(client)

  async function resolveFallback<T>(
    resource: ResourceDefinition,
    routePath: string,
    request: RequestDescriptor,
    reason = "Live data unavailable.",
    assessment?: AssessResult,
    error?: unknown,
  ): Promise<T> {
    if (!resource.fallback) {
      throw new MockKitResourceError(`Resource "${resource.key}" has no fallback resolver.`)
    }
    const fallback = await resource.fallback({
      resourceKey: resource.key,
      routePath,
      reason,
      request,
      error,
      assessment,
    })
    record({
      resourceKey: resource.key,
      sourceKind: "fallback",
      status: statusForSourceKind("fallback", mode, resource.criticality),
      reason,
      request,
      metadata: { fallback: true },
    })
    return fallback as T
  }

  return client
}

const normaliseFetchOptions = <T>(
  input: RequestInfo | URL | MockKitFetchOptions<T>,
  init?: RequestInit,
): Required<Pick<MockKitFetchOptions<T>, "input">> &
  Pick<MockKitFetchOptions<T>, "init" | "parse" | "requestRoute"> => {
  if (isFetchOptions(input)) return input
  return { input, ...(init ? { init } : {}) }
}

const isFetchOptions = <T>(input: unknown): input is MockKitFetchOptions<T> =>
  Boolean(input && typeof input === "object" && "input" in input)

const requestDescriptor = <T>(options: MockKitFetchOptions<T>): RequestDescriptor => {
  const method = options.init?.method?.toUpperCase() ?? "GET"
  const url = String(options.input)
  return {
    method,
    url,
    route: options.requestRoute ?? `${method} ${url}`,
  }
}

const parseResponse = async <T>(
  response: Response,
  parser?: (response: Response) => Promise<T>,
): Promise<T | unknown> => {
  if (parser) return parser(response)
  const contentType = response.headers.get("content-type") ?? ""
  if (!response.ok) {
    throw new MockKitResourceError(`Request failed with HTTP ${response.status}.`)
  }
  if (contentType.includes("application/json")) return response.json()
  return response.text()
}

const assess = async (
  resource: ResourceDefinition,
  data: unknown,
  routePath: string,
  request: RequestDescriptor,
): Promise<AssessResult> => {
  if (!resource.assess) return {}
  return resource.assess(data, { resourceKey: resource.key, routePath, request })
}

const classifyResponse = (response: Response, mode: ProvenanceMode): SourceKind => {
  const sourceHeader =
    response.headers.get("x-mockkit-source") ?? response.headers.get("x-provenance-source")
  if (sourceHeader === "mock") return "mock"
  if (mode === "mock") return "mock"
  return "api"
}

const readStoredMode = (
  storage: MockKitStorage,
  key: string,
  fallback: ProvenanceMode,
): ProvenanceMode => {
  const value = storage.get(key)
  if (
    value === "mock" ||
    value === "hybrid" ||
    value === "live" ||
    value === "audit" ||
    value === "capture"
  ) {
    return value
  }
  return fallback
}

const defaultRoutePath = (): string => {
  if (typeof window === "undefined") return "/"
  return `${window.location.pathname}${window.location.search}`
}

const exposeMockKitGlobal = (client: MockKitClient): void => {
  if (typeof window === "undefined") return
  window.__MOCKKIT__ = {
    client,
    snapshot: () => client.snapshot(),
    subscribe: (listener) => client.subscribe(listener),
  }
}

declare global {
  interface Window {
    __MOCKKIT__?: {
      readonly client: MockKitClient
      readonly snapshot: () => MockKitSnapshot
      readonly subscribe: (listener: () => void) => () => void
    }
  }
}
