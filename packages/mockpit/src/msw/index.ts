/**
 * MSW sensor. Reads the handler inventory, observes every request through the
 * read-only life-cycle events, flips endpoints to the real backend with
 * MockPit-owned overrides, and shadow-compares real responses against what the
 * mock would have returned.
 *
 *   const worker = setupWorker(...handlers)
 *   attach(worker)
 *   await worker.start()
 */
import { bypass, getResponse, http, type RequestHandler } from "msw"

import { type Engine, getEngine } from "../engine/engine.js"
import { graphqlKey, httpKey, normalisePath } from "../engine/key.js"
import { isClaimed } from "../engine/fetch-sensor.js"
import type { LocalPrefs } from "../schema/index.js"

type AnyHandler = object

/** The subset of `SetupWorker` / `SetupServer` MockPit uses. Both satisfy it. */
export interface MswLike {
  listHandlers(): ReadonlyArray<AnyHandler>
  use(...handlers: any[]): void
  resetHandlers(...handlers: any[]): void
  restoreHandlers(): void
  readonly events: {
    on(event: string, listener: (payload: any) => void): void
    removeListener(event: string, listener: (payload: any) => void): void
  }
}

export interface AttachOptions {
  readonly engine?: Engine
  /** Bodies larger than this are not read. Default 256 KB. */
  readonly maxBodyBytes?: number
  /** Decide whether an unhandled request is an API call worth tracking. Defaults to JSON responses. */
  readonly track?: (request: Request, response: Response) => boolean
  /** Mount the overlay when running in a browser. Default true. */
  readonly overlay?: boolean
}

interface HandlerDescriptor {
  readonly key: string
  readonly method: string
  readonly path: string | RegExp
  readonly label: string
  readonly kind: "http" | "graphql"
  readonly handler: AnyHandler
}

interface Pending {
  key: string | undefined
  readonly method: string
  readonly url: string
  readonly started: number
  matched: boolean
  unhandled: boolean
  readonly request: Request
}

const MAX_BODY = 256 * 1024

const describeHandler = (handler: AnyHandler): HandlerDescriptor | undefined => {
  const info = (handler as { readonly info?: Record<string, unknown> }).info
  if (!info) return undefined
  if (typeof info["operationName"] === "string" && info["operationName"]) {
    const name = info["operationName"] as string
    return { key: graphqlKey(name), method: "POST", path: name, label: String(info["header"] ?? name), kind: "graphql", handler }
  }
  if (!("method" in info) || !("path" in info)) return undefined
  const rawMethod = info["method"]
  const method = typeof rawMethod === "string" ? rawMethod.toUpperCase() : "ALL"
  const path = info["path"] as string | RegExp
  const key = path instanceof RegExp ? `${method} ${path.source}` : httpKey(method === "ALL" ? "GET" : method, path)
  return { key: method === "ALL" && typeof path === "string" ? `ALL ${normalisePath(path)}` : key, method, path, label: String(info["header"] ?? key), kind: "http", handler }
}

const isJson = (response: Response) => (response.headers.get("content-type") ?? "").includes("json")

const readJson = async (response: Response, max: number): Promise<unknown> => {
  if (!isJson(response) || response.bodyUsed) return undefined
  const length = Number(response.headers.get("content-length") ?? "0")
  if (length > max) return undefined
  try {
    const text = await response.clone().text()
    if (text.length > max) return undefined
    return text ? JSON.parse(text) : undefined
  } catch {
    return undefined
  }
}

const readGraphqlOperation = async (request: Request): Promise<string | undefined> => {
  try {
    if (request.method === "GET") return new URL(request.url).searchParams.get("operationName") ?? undefined
    const body = (await request.clone().json()) as { operationName?: string; query?: string }
    if (body.operationName) return body.operationName
    return /(?:query|mutation|subscription)\s+(\w+)/.exec(body.query ?? "")?.[1]
  } catch {
    return undefined
  }
}

const httpFactory = (method: string): ((path: string | RegExp, resolver: any) => RequestHandler) => {
  const factories = http as unknown as Record<string, (path: string | RegExp, resolver: any) => RequestHandler>
  return factories[method.toLowerCase()] ?? factories["all"]!
}

/** Attach MockPit to an MSW worker (browser) or server (Node). Returns a detach function. */
export const attach = (instance: MswLike, options: AttachOptions = {}): (() => void) => {
  const engine = options.engine ?? getEngine()
  const maxBody = options.maxBodyBytes ?? MAX_BODY
  const track = options.track ?? ((_request: Request, response: Response) => isJson(response))
  const ours = new WeakSet<object>()
  let initial = new Set<object>(instance.listHandlers() as object[])
  let internal = false
  let descriptors: HandlerDescriptor[] = []
  const outcomes = new Map<string, "real" | "fallback">()
  const pending = new Map<string, Pending>()
  const graphqlInventory = new Set<string>()

  const originals = (): AnyHandler[] => (instance.listHandlers() as AnyHandler[]).filter((handler) => !ours.has(handler))

  const refreshInventory = () => {
    descriptors = originals()
      .map(describeHandler)
      .filter((descriptor): descriptor is HandlerDescriptor => descriptor !== undefined)
    graphqlInventory.clear()
    const labels: Record<string, string> = {}
    for (const descriptor of descriptors) {
      labels[descriptor.key] = descriptor.label
      if (descriptor.kind === "graphql") graphqlInventory.add(descriptor.key)
    }
    engine.setInventory("msw", descriptors.map((descriptor) => descriptor.key), labels)
  }

  const resolveKey = (method: string, url: string): string => {
    // ALL handlers register as `ALL /path`; prefer a concrete method match.
    const key = engine.keys.resolve(method, url)
    if (descriptors.some((descriptor) => descriptor.key === key)) return key
    const all = engine.keys.resolve("ALL", url)
    return descriptors.some((descriptor) => descriptor.key === all) ? all : key
  }

  const handlersFor = (key: string) => descriptors.filter((descriptor) => descriptor.key === key)

  const makeOverride = (descriptor: HandlerDescriptor, prefs: LocalPrefs): RequestHandler => {
    const handler = httpFactory(descriptor.method)(descriptor.path, async ({ request, requestId }: { request: Request; requestId: string }) => {
      const safety = prefs.safetyNet[descriptor.key] ?? false
      try {
        const response = await fetch(bypass(request))
        if (response.status >= 500 && safety) throw new Error(`HTTP ${response.status}`)
        outcomes.set(requestId, "real")
        return response
      } catch (error) {
        engine.failed(descriptor.key, requestId, error instanceof Error ? error.message : String(error))
        if (safety) {
          const fallback = await getResponse(originals() as RequestHandler[], request)
          if (fallback) {
            outcomes.set(requestId, "fallback")
            return fallback
          }
        }
        outcomes.set(requestId, "real")
        return Response.error()
      }
    })
    ours.add(handler)
    return handler
  }

  const apply = (prefs: LocalPrefs) => {
    const appRuntime = (instance.listHandlers() as AnyHandler[]).filter((handler) => !initial.has(handler) && !ours.has(handler))
    const overrides: RequestHandler[] = []
    for (const [key, servedBy] of Object.entries(prefs.overrides)) {
      if (servedBy !== "real") continue
      for (const descriptor of handlersFor(key)) if (descriptor.kind === "http") overrides.push(makeOverride(descriptor, prefs))
    }
    internal = true
    try {
      instance.resetHandlers()
      if (overrides.length + appRuntime.length > 0) instance.use(...overrides, ...appRuntime)
    } finally {
      internal = false
    }
  }

  // Keep the inventory in step with the app's own handler changes.
  const originalUse = instance.use.bind(instance)
  const originalReset = instance.resetHandlers.bind(instance)
  const originalRestore = instance.restoreHandlers.bind(instance)
  instance.use = (...handlers: any[]) => {
    originalUse(...handlers)
    if (!internal) refreshInventory()
  }
  instance.resetHandlers = (...handlers: any[]) => {
    originalReset(...handlers)
    if (internal) return
    if (handlers.length > 0) initial = new Set(handlers)
    refreshInventory()
    apply(engine.getPrefs())
  }
  instance.restoreHandlers = () => {
    originalRestore()
    if (!internal) refreshInventory()
  }

  const onStart = ({ request, requestId }: { request: Request; requestId: string }) => {
    if (isClaimed(request.method, request.url)) return
    const entry: Pending = { key: undefined, method: request.method, url: request.url, started: Date.now(), matched: false, unhandled: false, request }
    pending.set(requestId, entry)
    if (graphqlInventory.size > 0 && (request.headers.get("content-type") ?? "").includes("json")) {
      void readGraphqlOperation(request).then((operation) => {
        if (operation) entry.key = graphqlKey(operation)
      })
    }
  }

  const onMatch = ({ requestId }: { requestId: string }) => {
    const entry = pending.get(requestId)
    if (!entry) return
    entry.matched = true
    entry.key ??= resolveKey(entry.method, entry.url)
    engine.requestStarted(entry.key, requestId, entry.url)
  }

  const onUnhandled = ({ requestId }: { requestId: string }) => {
    const entry = pending.get(requestId)
    if (entry) entry.unhandled = true
  }

  const onMocked = async ({ response, requestId }: { response: Response; requestId: string }) => {
    const entry = pending.get(requestId)
    pending.delete(requestId)
    if (!entry) return
    const key = entry.key ?? resolveKey(entry.method, entry.url)
    const outcome = outcomes.get(requestId)
    outcomes.delete(requestId)
    const body = await readJson(response, maxBody)
    const servedBy = outcome === "real" ? "real" : "mock"
    engine.rememberUrl(entry.url, { key, requestId, servedBy })
    engine.served({
      key,
      requestId,
      servedBy,
      byChoice: outcome !== undefined,
      failing: outcome === "fallback" || response.type === "error",
      status: response.type === "error" ? 0 : response.status,
      body,
      via: "msw",
      latency: Date.now() - entry.started,
    })
    if (servedBy === "real") void shadow(key, entry)
  }

  const onBypass = async ({ response, requestId }: { response: Response; requestId: string }) => {
    const entry = pending.get(requestId)
    pending.delete(requestId)
    if (!entry) return
    if (entry.unhandled && !track(entry.request, response)) return
    const key = entry.key ?? resolveKey(entry.method, entry.url)
    if (entry.unhandled) engine.requestStarted(key, requestId, entry.url)
    const body = await readJson(response, maxBody)
    engine.rememberUrl(entry.url, { key, requestId, servedBy: "real" })
    engine.served({ key, requestId, servedBy: "real", byChoice: entry.matched, status: response.status, body, via: "msw", latency: Date.now() - entry.started })
    if (!entry.unhandled) void shadow(key, entry)
  }

  const shadow = async (key: string, entry: Pending) => {
    if (!engine.shadowEnabled(key)) return
    if (entry.method !== "GET" && entry.method !== "HEAD") return
    const handlers = originals().filter((handler) => describeHandler(handler)?.key === key) as RequestHandler[]
    if (handlers.length === 0) return
    try {
      const mock = await getResponse(handlers, new Request(entry.url, { method: entry.method, headers: entry.request.headers }))
      if (!mock) return
      const body = await readJson(mock, maxBody)
      if (body !== undefined) engine.shadowMock(key, body)
    } catch {
      // A handler that throws outside its own request is not our concern.
    }
  }

  const onException = ({ requestId, error }: { requestId: string; error: unknown }) => {
    const entry = pending.get(requestId)
    pending.delete(requestId)
    if (!entry) return
    engine.failed(entry.key ?? resolveKey(entry.method, entry.url), requestId, error instanceof Error ? error.message : String(error))
  }

  const listeners: Array<[string, (payload: any) => void]> = [
    ["request:start", onStart],
    ["request:match", onMatch],
    ["request:unhandled", onUnhandled],
    ["response:mocked", onMocked],
    ["response:bypass", onBypass],
    ["unhandledException", onException],
  ]
  for (const [event, listener] of listeners) instance.events.on(event, listener)

  refreshInventory()
  apply(engine.getPrefs())
  engine.registerTier("msw")
  const unregister = engine.registerControls({
    id: "msw",
    canControl: (key) => handlersFor(key).some((descriptor) => descriptor.kind === "http"),
    apply,
  })

  if (typeof document !== "undefined" && options.overlay !== false && !options.engine) {
    void import("../start.js").then(({ start }) => start())
  }

  return () => {
    for (const [event, listener] of listeners) instance.events.removeListener(event, listener)
    instance.use = originalUse
    instance.resetHandlers = originalReset
    instance.restoreHandlers = originalRestore
    internal = true
    originalReset()
    internal = false
    engine.removeInventory("msw")
    engine.unregisterTier("msw")
    unregister()
  }
}
