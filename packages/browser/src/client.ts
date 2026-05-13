import {
  createAuditRecord,
  createRouteAuditExport,
  createMemoryAuditStore,
  defineMockPitConfig,
  evaluateCapture,
  findResource,
  getModePolicy,
  matchesRoute,
  MissingMockPitResource,
  MockPitFallbackError,
  MockPitParseError,
  MockPitSchemaError,
  routeAuditToMarkdown,
  createInitialScenarioState,
  setScenarioVariant,
  statusForSourceKind,
  summariseRoute,
  validateUnknownWithSchema,
  type AssessResult,
  type AuditRecord,
  type AuditRecordInput,
  type ModeTransition,
  type MockPitConfig,
  type MockPitSnapshot,
  type ProvenanceMode,
  type RequestDescriptor,
  type ResourceDefinition,
  type RouteAuditExport,
  type ScenarioState,
  type SourceKind,
  type TransportState,
} from "@mockpit/core"
import { createBrowserStorage, type MockPitStorage } from "./storage"
import { createBrowserRouteAdapter, createManualRouteAdapter, type MockPitRouteAdapter } from "./route"

export const MOCKPIT_BROWSER_VERSION = "0.2.0"

export interface MockPitFetchOptions<T = unknown> {
  readonly input: RequestInfo | URL
  readonly init?: RequestInit
  readonly parse?: (response: Response) => Promise<T>
  readonly requestRoute?: string
}

export interface RecordResourceInput extends Omit<AuditRecordInput, "routePath" | "updatedAt"> {
  readonly routePath?: string
}

export interface CreateMockPitClientOptions {
  readonly config?: MockPitConfig
  readonly storage?: MockPitStorage
  readonly fetch?: typeof globalThis.fetch
  readonly getRoutePath?: () => string
  readonly routeAdapter?: MockPitRouteAdapter
  readonly now?: () => string
  readonly exposeGlobal?: boolean
  readonly cleanupTransport?: () => Promise<{ readonly checked: number; readonly unregistered: number }>
}

export interface MockPitClient {
  readonly config: MockPitConfig
  readonly effect: {
    readonly snapshot: () => Promise<MockPitSnapshot>
  }
  readonly fetch: <T = unknown>(
    resourceKey: string,
    input: RequestInfo | URL | MockPitFetchOptions<T>,
    init?: RequestInit,
  ) => Promise<T>
  readonly wrap: <T>(
    resourceKey: string,
    operation: () => Promise<T> | T,
    options?: { readonly sourceKind?: SourceKind; readonly reason?: string },
  ) => Promise<T>
  readonly record: (input: RecordResourceInput) => AuditRecord
  readonly recordResource: (input: RecordResourceInput) => AuditRecord
  readonly recordUiMark: (input: RecordResourceInput) => AuditRecord
  readonly recordTransportIssue: (input: RecordResourceInput) => AuditRecord
  readonly remove: (id: string) => void
  readonly clear: () => void
  readonly getMode: () => ProvenanceMode
  readonly setMode: (mode: ProvenanceMode) => ModeTransition
  readonly cleanupTransport: () => Promise<void>
  readonly getRoutePath: () => string
  readonly setRoute: (routePath: string, routePattern?: string) => void
  readonly setScenario: (key: string, variant: string) => ScenarioState
  readonly getScenarioState: () => ScenarioState
  readonly getTransportState: () => TransportState
  readonly setTransportState: (state: Partial<TransportState>) => void
  readonly snapshot: () => MockPitSnapshot
  readonly exportRoute: (options?: { readonly routePath?: string }) => RouteAuditExport
  readonly exportMarkdown: (options?: { readonly routePath?: string }) => string
  readonly exportJson: () => string
  readonly subscribe: (listener: () => void) => () => void
}

export class MockPitResourceError extends Error {
  readonly name = "MockPitResourceError"
}

export const createMockPitClient = (
  options: CreateMockPitClientOptions = {},
): MockPitClient => {
  const config =
    options.config ??
    defineMockPitConfig({
      project: "mockpit",
    })
  const storage = options.storage ?? createBrowserStorage()
  const fetchImplementation = options.fetch ?? globalThis.fetch?.bind(globalThis)
  const manualRouteAdapter = createManualRouteAdapter(options.getRoutePath?.() ?? defaultRoutePath())
  const routeAdapter =
    options.routeAdapter ??
    (options.getRoutePath ? { getRoutePath: options.getRoutePath } : createBrowserRouteAdapter())
  const getRoutePath = () => routeOverride?.routePath ?? routeAdapter.getRoutePath()
  const now = options.now ?? (() => new Date().toISOString())
  const store = createMemoryAuditStore()
  const listeners = new Set<() => void>()
  let cachedSnapshot: MockPitSnapshot | undefined

  let mode = readStoredMode(storage, config.mode.storageKey, config.mode.default)
  let routeOverride: { routePath: string; routePattern?: string } | undefined
  let scenarios = readScenarioState(storage, scenarioStorageKey(config), config, now())
  let transport: TransportState = {
    mockTransportActive: mode === "mock",
    cleanupRequired: false,
    requiresReload: false,
  }

  const notify = () => {
    cachedSnapshot = undefined
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
      kind: input.kind ?? "resource",
      routePath,
      routePattern: input.routePattern ?? routeOverride?.routePattern ?? routeAdapter.getRoutePattern?.(),
      sectionId: input.sectionId ?? section?.id,
      label: input.label ?? resource?.label ?? input.resourceKey,
      status: input.status ?? statusForSourceKind(input.sourceKind, mode, criticality),
      proofCritical: input.proofCritical ?? criticality === "proof",
      updatedAt: now(),
    })
    cachedSnapshot = undefined
    store.put(record)
    return record
  }

  const snapshot = (): MockPitSnapshot => {
    if (cachedSnapshot) return cachedSnapshot
    const routePath = getRoutePath()
    const records = store.snapshot()
    const capture = evaluateCapture(config, routePath, records)
    const summary = summariseRoute(config, records, routePath, mode, capture)
    cachedSnapshot = {
      version: MOCKPIT_BROWSER_VERSION,
      project: config.project,
      mode,
      routePath,
      records,
      summary,
      scenarios,
      transport,
      updatedAt: now(),
    }
    return cachedSnapshot
  }

  const client: MockPitClient = {
    config,
    effect: {
      snapshot: async () => snapshot(),
    },
    async fetch<T = unknown>(
      resourceKey: string,
      input: RequestInfo | URL | MockPitFetchOptions<T>,
      init?: RequestInit,
    ): Promise<T> {
      if (!fetchImplementation) {
        throw new MockPitResourceError("MockPit fetch requires a fetch implementation.")
      }

      const resource = findResource(config, resourceKey)
      if (!resource) {
        throw new MissingMockPitResource(resourceKey)
      }

      const request = normaliseFetchOptions(input, init)
      const descriptor = requestDescriptor(request)
      const routePath = getRoutePath()
      const policy = getModePolicy(mode)

      try {
        const response = await fetchImplementation(request.input, request.init)
        const parsed = await parseResponse(response, request.parse)
        const validated = validateResourceData(resource, parsed)
        const assessment = await assess(resource, validated, routePath, descriptor)

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
          remediation: resource.remediation,
        })

        return validated as T
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
          remediation: resource.remediation,
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
          kind: "resource",
          resourceKey,
          sourceKind: options?.sourceKind ?? "api",
          reason: options?.reason ?? "Loaded through wrapped operation.",
        })
        return value
      } catch (error) {
        record({
          kind: "resource",
          resourceKey,
          sourceKind: "error",
          status: "error",
          reason: error instanceof Error ? error.message : "Wrapped operation failed.",
        })
        throw error
      }
    },
    record,
    recordResource: (input) => record({ ...input, kind: "resource" }),
    recordUiMark: (input) => record({ ...input, kind: "uiMark", recordedBy: input.recordedBy ?? "ui" }),
    recordTransportIssue: (input) =>
      record({ ...input, kind: "transport", recordedBy: input.recordedBy ?? "transport" }),
    remove(id) {
      cachedSnapshot = undefined
      store.remove(id)
    },
    clear() {
      cachedSnapshot = undefined
      store.clear()
    },
    getMode: () => mode,
    setMode(nextMode) {
      const previousMode = mode
      mode = nextMode
      storage.set(config.mode.storageKey, nextMode)
      const transition: ModeTransition = {
        previousMode,
        nextMode,
        requiresReload: previousMode !== nextMode && (previousMode === "mock" || nextMode === "mock"),
        transportCleanupRequired:
          previousMode === "mock" && nextMode !== "mock" && transport.mockTransportActive,
        reason:
          previousMode === "mock" && nextMode !== "mock"
            ? "Leaving mock mode may require MSW cleanup and a reload."
            : undefined,
      }
      transport = {
        ...transport,
        mockTransportActive: nextMode === "mock",
        cleanupRequired: transition.transportCleanupRequired,
        requiresReload: transition.requiresReload,
      }
      notify()
      return transition
    },
    async cleanupTransport() {
      if (!options.cleanupTransport) {
        transport = { ...transport, cleanupRequired: false }
        notify()
        return
      }
      const result = await options.cleanupTransport()
      transport = {
        ...transport,
        cleanupRequired: false,
        requiresReload: result.unregistered > 0,
        lastCleanup: { ...result, updatedAt: now() },
      }
      notify()
    },
    getRoutePath,
    setRoute(routePath, routePattern) {
      routeOverride = { routePath, ...(routePattern ? { routePattern } : {}) }
      manualRouteAdapter.setRoute(routePath, routePattern)
      notify()
    },
    setScenario(key, variant) {
      scenarios = setScenarioVariant(scenarios, key, variant, now())
      storage.set(scenarioStorageKey(config), JSON.stringify(scenarios))
      notify()
      return scenarios
    },
    getScenarioState: () => scenarios,
    getTransportState: () => transport,
    setTransportState(state) {
      transport = { ...transport, ...state }
      notify()
    },
    snapshot,
    exportRoute(options) {
      return createRouteAuditExport({
        config,
        routePath: options?.routePath ?? getRoutePath(),
        mode,
        records: store.snapshot(),
        generatedAt: now(),
        scenarios,
        transport,
      })
    },
    exportMarkdown(options) {
      return routeAuditToMarkdown(client.exportRoute(options))
    },
    exportJson() {
      return JSON.stringify(client.exportRoute(), null, 2)
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

  if (options.exposeGlobal !== false) exposeMockPitGlobal(client)

  async function resolveFallback<T>(
    resource: ResourceDefinition,
    routePath: string,
    request: RequestDescriptor,
    reason = "Live data unavailable.",
    assessment?: AssessResult,
    error?: unknown,
  ): Promise<T> {
    if (!resource.fallback) {
      throw new MockPitFallbackError(`Resource "${resource.key}" has no fallback resolver.`)
    }
    let fallback: unknown
    try {
      fallback = await resource.fallback({
        resourceKey: resource.key,
        routePath,
        reason,
        request,
        error,
        assessment,
      })
    } catch (fallbackError) {
      throw new MockPitFallbackError(`Fallback resolver failed for "${resource.key}".`, fallbackError)
    }
    record({
      resourceKey: resource.key,
      sourceKind: "fallback",
      status: statusForSourceKind("fallback", mode, resource.criticality),
      reason,
      request,
      fallbackSource: resource.fallbackSource,
      remediation: resource.remediation,
      metadata: { fallback: true, fallbackSource: resource.fallbackSource },
    })
    return fallback as T
  }

  return client
}

const normaliseFetchOptions = <T>(
  input: RequestInfo | URL | MockPitFetchOptions<T>,
  init?: RequestInit,
): Required<Pick<MockPitFetchOptions<T>, "input">> &
  Pick<MockPitFetchOptions<T>, "init" | "parse" | "requestRoute"> => {
  if (isFetchOptions(input)) return input
  return { input, ...(init ? { init } : {}) }
}

const isFetchOptions = <T>(input: unknown): input is MockPitFetchOptions<T> =>
  Boolean(input && typeof input === "object" && "input" in input)

const requestDescriptor = <T>(options: MockPitFetchOptions<T>): RequestDescriptor => {
  const request = options.input instanceof Request ? options.input : undefined
  const method = (options.init?.method ?? request?.method ?? "GET").toUpperCase()
  const url = request?.url ?? String(options.input)
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
    throw new MockPitParseError(`Request failed with HTTP ${response.status}.`)
  }
  try {
    if (contentType.includes("application/json")) return response.json()
    return response.text()
  } catch (error) {
    throw new MockPitParseError("Response parsing failed.", error)
  }
}

const validateResourceData = <T>(resource: ResourceDefinition, data: unknown): T => {
  if (!resource.schema) return data as T
  try {
    return validateUnknownWithSchema<T>(resource.schema, data)
  } catch (error) {
    throw new MockPitSchemaError(`Schema validation failed for "${resource.key}".`, error)
  }
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
    response.headers.get("x-mockpit-source") ?? response.headers.get("x-provenance-source")
  if (sourceHeader === "mock") return "mock"
  if (mode === "mock") return "mock"
  return "api"
}

const readStoredMode = (
  storage: MockPitStorage,
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

const exposeMockPitGlobal = (client: MockPitClient): void => {
  if (typeof window === "undefined") return
  window.__MOCKPIT__ = {
    version: MOCKPIT_BROWSER_VERSION,
    client,
    snapshot: () => client.snapshot(),
    exportRoute: (options) => client.exportRoute(options),
    subscribe: (listener) => client.subscribe(listener),
  }
}

const scenarioStorageKey = (config: MockPitConfig): string => `${config.project}.mockpit.scenarios`

const readScenarioState = (
  storage: MockPitStorage,
  key: string,
  config: MockPitConfig,
  now: string,
): ScenarioState => {
  const value = storage.get(key)
  if (!value) return createInitialScenarioState(config, now)
  try {
    const parsed = JSON.parse(value) as ScenarioState
    if (parsed && typeof parsed === "object" && parsed.selected) return parsed
  } catch {
    // Ignore invalid stored state and rebuild defaults.
  }
  return createInitialScenarioState(config, now)
}

declare global {
  interface Window {
    __MOCKPIT__?: {
      readonly version: string
      readonly client: MockPitClient
      readonly snapshot: () => MockPitSnapshot
      readonly exportRoute: (options?: { readonly routePath?: string }) => RouteAuditExport
      readonly subscribe: (listener: () => void) => () => void
    }
  }
}
