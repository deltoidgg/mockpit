/**
 * Effect adapter. Precision that MSW cannot give an Effect-native app:
 *
 * - Keys Effect RPC traffic by procedure (`RPC GetCustomer`), not by the one
 *   `POST /api/rpc` URL every procedure shares.
 * - Treats mock Layers as mocks: `mockLayer(Tag, Memory)` registers the
 *   service's procedures as mocked and reports every call, with no network.
 * - Follows spans: a MockPit Tracer records span parents, so an RPC call is
 *   traced back to the Foldkit Command (or any named span) that made it.
 * - Uses Schemas as contracts: parity against the declared success Schema,
 *   with or without a mock.
 */
import { Context, Effect, Layer, Option, Schema, Tracer } from "effect"
import { FetchHttpClient } from "effect/http"
import { type Engine, getEngine } from "../engine/engine.js"
import { claimRequests } from "../engine/fetch-sensor.js"
import { rpcKey } from "../engine/key.js"
import type { ServedBy, Shape, ShapeField } from "../schema/index.js"

// Lineage --------------------------------------------------------------------

interface SpanRecord {
  readonly name: string
  readonly parentId: string | undefined
}

const SPAN_CAP = 4000
const spans = new Map<string, SpanRecord>()

const remember = (span: Tracer.Span) => {
  const parent = Option.getOrUndefined(span.parent)
  spans.set(span.spanId, { name: span.name, parentId: parent?.spanId })
  if (spans.size > SPAN_CAP) {
    const first = spans.keys().next().value
    if (first !== undefined) spans.delete(first)
  }
}

/** A Tracer that records span names and parents so requests can be traced to their cause. */
export const tracer: Tracer.Tracer = Tracer.make({
  span(options) {
    const span = new Tracer.NativeSpan(options)
    remember(span)
    return span
  },
})

/** Provide the lineage tracer. Merge into Foldkit `resources` or your app Layer. */
export const tracerLayer: Layer.Layer<never> = Layer.succeed(Tracer.Tracer, tracer)

/** Span names from the root down to `spanId`. */
export const lineage = (spanId: string | undefined): string[] => {
  const names: string[] = []
  for (let id = spanId, guard = 0; id && guard < 64; guard += 1) {
    const record = spans.get(id)
    if (!record) break
    names.unshift(record.name)
    id = record.parentId
  }
  return names
}

const LIBRARY_SPAN = /^(?:http\.|Rpc|rpc\.|RpcClient|RpcServer|mockpit|effect\.|Http)/

/**
 * The nearest named cause: a Foldkit Command name or your own `withSpan`.
 * PascalCase names win, which matches Foldkit's Command naming.
 */
export const causeOf = (names: readonly string[], exclude?: string): string | undefined => {
  const candidates = names.filter((name) => !LIBRARY_SPAN.test(name) && name !== exclude && !name.endsWith(`.${exclude}`))
  for (let index = candidates.length - 1; index >= 0; index -= 1) if (/^[A-Z][A-Za-z0-9]+$/.test(candidates[index]!)) return candidates[index]
  return candidates.at(-1)
}

const currentCause = (exclude?: string): Effect.Effect<string | undefined> =>
  Effect.currentSpan.pipe(
    Effect.map((span) => causeOf([...lineage(span.spanId), span.name], exclude)),
    Effect.catchCause(() => Effect.succeed(undefined)),
  )

// RPC over HTTP --------------------------------------------------------------

export interface FetchOptions {
  readonly engine?: Engine
  /** Requests to this path carry Effect RPC messages. Default: paths ending in `/rpc`. */
  readonly rpcPath?: string | RegExp
  /** The fetch to delegate to. Default `globalThis.fetch` at call time. */
  readonly fetch?: typeof fetch
}

interface RpcRequestMessage {
  readonly _tag: "Request"
  readonly id: string | number
  readonly tag: string
  readonly spanId?: string
}

interface RpcExitMessage {
  readonly _tag: "Exit"
  readonly requestId: string | number
  readonly exit: { readonly _tag: "Success"; readonly value: unknown } | { readonly _tag: "Failure"; readonly cause: unknown }
}

const isRpcPath = (pattern: string | RegExp | undefined, url: string): boolean => {
  let path: string
  try {
    path = new URL(url, "http://localhost").pathname
  } catch {
    return false
  }
  if (pattern instanceof RegExp) return pattern.test(path)
  if (typeof pattern === "string") return path.replace(/\/$/, "") === pattern.replace(/\/$/, "")
  return /\/rpc\/?$/.test(path)
}

const parseMessages = <A>(text: string): A[] => {
  const trimmed = text.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed) as A | A[]
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    // NDJSON
    return trimmed
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as A]
        } catch {
          return []
        }
      })
  }
}

const toPlain = (value: unknown): unknown => {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return undefined
  }
}

let rpcCounter = 0

/**
 * A `fetch` that understands Effect RPC over HTTP. Each procedure call is
 * reported under its own endpoint key, traced to its cause. Other requests
 * pass through untouched (MSW or the fetch sensor see them).
 */
export const makeFetch = (options: FetchOptions = {}): typeof fetch => {
  const engine = () => options.engine ?? getEngine()
  claimRequests((method, url) => method === "POST" && isRpcPath(options.rpcPath, url))
  return async (input, init) => {
    const base = options.fetch ?? globalThis.fetch
    const request = new Request(input, init)
    if (request.method !== "POST" || !isRpcPath(options.rpcPath, request.url)) return base(request)
    const messages = parseMessages<RpcRequestMessage>(await request.clone().text()).filter((message) => message?._tag === "Request")
    const calls = new Map<string, { key: string; requestId: string; started: number }>()
    for (const message of messages) {
      const key = rpcKey(message.tag)
      const requestId = `rpc${Date.now().toString(36)}${(rpcCounter++).toString(36)}`
      calls.set(String(message.id), { key, requestId, started: Date.now() })
      engine().requestStarted(key, requestId, request.url)
      const cause = causeOf(lineage(message.spanId), message.tag)
      if (cause) engine().setCommand(key, cause)
    }
    let response: Response
    try {
      response = await base(request)
    } catch (error) {
      for (const call of calls.values()) engine().failed(call.key, call.requestId, error instanceof Error ? error.message : String(error))
      throw error
    }
    const servedBy: ServedBy = response.headers.get("x-mockpit-source") === "mock" ? "mock" : "real"
    // Read before returning so the report lands before the client decodes.
    const text = await response
      .clone()
      .text()
      .catch(() => "")
    for (const exit of parseMessages<RpcExitMessage>(text)) {
      if (exit?._tag !== "Exit") continue
      const call = calls.get(String(exit.requestId))
      if (!call) continue
      if (exit.exit._tag === "Success") {
        engine().served({ key: call.key, requestId: call.requestId, servedBy, status: response.status, body: exit.exit.value, via: "effect", latency: Date.now() - call.started })
      } else {
        engine().failed(call.key, call.requestId, JSON.stringify(exit.exit.cause).slice(0, 200))
      }
    }
    return response
  }
}

/** `FetchHttpClient.layer` with the RPC-aware fetch. Provides `HttpClient`. */
export const layer = (options: FetchOptions = {}) =>
  FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, makeFetch(options))))

/** Just the fetch override, for apps that build their own HttpClient Layer. */
export const fetchLayer = (options: FetchOptions = {}) => Layer.succeed(FetchHttpClient.Fetch, makeFetch(options))

// Layers as provenance -------------------------------------------------------

export interface TagOptions {
  readonly engine?: Engine
  /** Map a service method to an endpoint key. Default: PascalCase methods are RPC procedures. */
  readonly key?: (method: string) => string
  /** Prefix for non-RPC method keys. Defaults to the service key. */
  readonly label?: string
  /** Register these keys as mocked as soon as the Layer is defined. */
  readonly keys?: readonly string[]
  /** An RpcGroup whose procedures this Layer implements; registers its keys and contracts. */
  readonly group?: RpcGroupLike
}

export interface RpcGroupLike {
  readonly requests: ReadonlyMap<string, { readonly successSchema: Schema.Top }>
}

let layerCounter = 0

const defaultKey = (label: string) => (method: string) => (/^[A-Z]/.test(method) ? rpcKey(method) : `${label}.${method}`)

const wrapService = <S extends object>(service: S, servedBy: ServedBy, keyOf: (method: string) => string, engine: () => Engine, inventoryId: string): S => {
  const methods: string[] = []
  const wrapped: Record<string, unknown> = {}
  const source = service as Record<string, unknown>
  const prototype = Object.getPrototypeOf(service) as object | null
  const inherited = prototype && prototype !== Object.prototype ? Object.getOwnPropertyNames(prototype) : []
  const names = new Set<string>([...Object.keys(source), ...inherited])
  for (const name of names) {
    if (name === "constructor" || name.startsWith("__")) continue
    const value = source[name]
    if (typeof value !== "function") {
      wrapped[name] = value
      continue
    }
    methods.push(name)
    const key = keyOf(name)
    wrapped[name] = (...args: unknown[]) => {
      const result = (value as (...a: unknown[]) => unknown).apply(service, args)
      if (!Effect.isEffect(result)) return result
      const requestId = `${servedBy}${Date.now().toString(36)}${(layerCounter++).toString(36)}`
      return Effect.gen(function* () {
        const started = Date.now()
        const cause = yield* currentCause(name)
        // If a network sensor (the RPC-aware fetch) reports this call, it has the
        // raw response; the Layer only reports what nothing else saw.
        const before = engine().getState().session[key]?.requests ?? 0
        engine().requestStarted(key, requestId)
        if (cause) engine().setCommand(key, cause)
        yield* Effect.annotateCurrentSpan("mockpit.servedBy", servedBy)
        const value = yield* (result as Effect.Effect<unknown, unknown, never>).pipe(
          Effect.tapCause((failure) => Effect.sync(() => engine().failed(key, requestId, String(failure).slice(0, 200)))),
        )
        const observed = (engine().getState().session[key]?.requests ?? 0) > before
        if (!observed) engine().served({ key, requestId, servedBy, status: 200, body: toPlain(value), via: "effect", latency: Date.now() - started })
        return value
      })
    }
  }
  if (servedBy === "mock") engine().setInventory(inventoryId, methods.map(keyOf))
  engine().registerTier("effect")
  return wrapped as S
}

/**
 * Wrap a Layer so every call on the service it provides is reported as served
 * by `servedBy`. Use it on in-memory Layers (mock) and on production Layers
 * (real) alike; the ledger then tracks the switch.
 */
export const tagLayer = <I, S extends object, E, R>(
  tag: Context.Key<I, S>,
  source: Layer.Layer<I, E, R>,
  servedBy: ServedBy,
  options: TagOptions = {},
): Layer.Layer<I, E, R> => {
  const engine = () => options.engine ?? getEngine()
  const label = options.label ?? (tag as unknown as { key?: string }).key ?? `service${layerCounter++}`
  const keyOf = options.key ?? defaultKey(label)
  const inventoryId = `effect:${label}`
  if (options.group) {
    for (const [tagName, rpc] of options.group.requests) {
      try {
        engine().setContract(rpcKey(tagName), shapeOfSchema(rpc.successSchema))
      } catch {
        // Schemas that cannot be described as JSON are skipped.
      }
    }
  }
  if (servedBy === "mock") {
    const declared = [...(options.keys ?? []), ...(options.group ? [...options.group.requests.keys()].map(rpcKey) : [])]
    if (declared.length > 0) engine().setInventory(inventoryId, declared)
  }
  return Layer.effect(
    tag,
    Effect.gen(function* () {
      const service = yield* tag
      return wrapService(service, servedBy, keyOf, engine, inventoryId)
    }),
  ).pipe(Layer.provide(source)) as unknown as Layer.Layer<I, E, R>
}

export const mockLayer = <I, S extends object, E, R>(tag: Context.Key<I, S>, source: Layer.Layer<I, E, R>, options?: TagOptions) =>
  tagLayer(tag, source, "mock", options)

export const realLayer = <I, S extends object, E, R>(tag: Context.Key<I, S>, source: Layer.Layer<I, E, R>, options?: TagOptions) =>
  tagLayer(tag, source, "real", options)

export interface SwitchOptions extends TagOptions {
  /** Serve the mock when the real Layer fails and the safety net is on. Default: the engine's per-endpoint setting. */
  readonly safetyNet?: boolean
}

/**
 * Provide both implementations and let MockPit choose per endpoint at call
 * time: the drawer's Flip control routes one procedure to the real Layer
 * while the rest stay on the mock. The mock counts as inventory, so the
 * ledger shows shadowed until the mock Layer is deleted.
 */
export const switchLayer = <I, S extends object, E1, R1, E2, R2>(
  tag: Context.Key<I, S>,
  layers: { readonly mock: Layer.Layer<I, E1, R1>; readonly real: Layer.Layer<I, E2, R2> },
  options: SwitchOptions = {},
): Layer.Layer<I, E1 | E2, R1 | R2> => {
  const engine = () => options.engine ?? getEngine()
  const label = options.label ?? (tag as unknown as { key?: string }).key ?? `service${layerCounter++}`
  const keyOf = options.key ?? defaultKey(label)
  const inventoryId = `effect:${label}`
  if (options.group) contracts(options.group, engine())
  const declared = [...(options.keys ?? []), ...(options.group ? [...options.group.requests.keys()].map(rpcKey) : [])]
  if (declared.length > 0) engine().setInventory(inventoryId, declared)
  const build = Effect.gen(function* () {
    const mock = yield* Layer.build(layers.mock).pipe(Effect.map((context) => Context.get(context, tag as never) as S))
    const real = yield* Layer.build(layers.real).pipe(Effect.map((context) => Context.get(context, tag as never) as S))
    const mockWrapped = wrapService(mock, "mock", keyOf, engine, inventoryId)
    const realWrapped = wrapService(real, "real", keyOf, engine, `${inventoryId}:real`)
    const keys = new Set(Object.keys(mockWrapped).filter((name) => typeof (mockWrapped as Record<string, unknown>)[name] === "function").map(keyOf))
    engine().registerControls({ id: inventoryId, canControl: (key) => keys.has(key), apply: () => undefined })
    const routed: Record<string, unknown> = {}
    for (const name of Object.keys(mockWrapped)) {
      const mockMethod = (mockWrapped as Record<string, unknown>)[name]
      const realMethod = (realWrapped as Record<string, unknown>)[name]
      if (typeof mockMethod !== "function" || typeof realMethod !== "function") {
        routed[name] = mockMethod
        continue
      }
      const key = keyOf(name)
      routed[name] = (...args: unknown[]) => {
        const prefs = engine().getPrefs()
        if (prefs.overrides[key] !== "real") return (mockMethod as (...a: unknown[]) => unknown)(...args)
        const result = (realMethod as (...a: unknown[]) => unknown)(...args)
        const safety = options.safetyNet ?? prefs.safetyNet[key] ?? false
        if (!safety || !Effect.isEffect(result)) return result
        return (result as Effect.Effect<unknown, unknown, never>).pipe(
          Effect.catchCause(() => (mockMethod as (...a: unknown[]) => Effect.Effect<unknown, unknown, never>)(...args)),
        )
      }
    }
    return routed as S
  })
  return Layer.effect(tag, build) as unknown as Layer.Layer<I, E1 | E2, R1 | R2>
}

// Schemas as contracts -------------------------------------------------------

type JsonSchema = {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema | JsonSchema[]
  prefixItems?: JsonSchema[]
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  allOf?: JsonSchema[]
  $ref?: string
  enum?: unknown[]
  const?: unknown
}

const typeNames = (schema: JsonSchema, resolve: (ref: string) => JsonSchema | undefined, depth = 0): string[] => {
  if (depth > 8) return ["unknown"]
  if (schema.$ref) {
    const target = resolve(schema.$ref)
    return target ? typeNames(target, resolve, depth + 1) : ["unknown"]
  }
  const union = schema.anyOf ?? schema.oneOf
  if (union) return [...new Set(union.flatMap((member) => typeNames(member, resolve, depth + 1)))]
  if (schema.allOf?.[0]) return typeNames(schema.allOf[0], resolve, depth + 1)
  if (schema.const !== undefined) return [schema.const === null ? "null" : typeof schema.const]
  if (schema.enum) return [...new Set(schema.enum.map((value) => (value === null ? "null" : typeof value)))]
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : ["unknown"]
  return types.map((type) => (type === "integer" ? "number" : type))
}

/** Describe a Schema's encoded side as a Shape, for parity. Optional keys are not required. */
export const shapeOfSchema = (schema: Schema.Top): Shape => {
  const document = Schema.toJsonSchemaDocument(schema) as unknown as { schema: JsonSchema; definitions?: Record<string, JsonSchema> }
  const definitions = document.definitions ?? {}
  const resolve = (ref: string) => definitions[ref.split("/").at(-1) ?? ""]
  const fields: ShapeField[] = []
  const visit = (node: JsonSchema, path: string, presence: number, depth: number) => {
    if (depth > 10) return
    const target = node.$ref ? (resolve(node.$ref) ?? node) : node
    const types = typeNames(target, resolve) as ShapeField["types"][number][]
    fields.push({ path, types: [...new Set(types)].sort(), presence })
    const members = target.anyOf ?? target.oneOf ?? [target]
    for (const member of members) {
      const resolved = member.$ref ? (resolve(member.$ref) ?? member) : member
      if (resolved.properties) {
        const required = new Set(resolved.required ?? [])
        for (const [key, child] of Object.entries(resolved.properties)) visit(child, `${path}.${key}`, required.has(key) ? 1 : 0.25, depth + 1)
      }
      const items = resolved.items ?? resolved.prefixItems
      if (items) {
        const first = Array.isArray(items) ? items[0] : items
        if (first) visit(first, `${path}[]`, 1, depth + 1)
      }
    }
  }
  visit(document.schema, "$", 1, 0)
  const merged = new Map<string, ShapeField>()
  for (const field of fields) {
    const existing = merged.get(field.path)
    merged.set(
      field.path,
      existing ? { ...existing, types: [...new Set([...existing.types, ...field.types])].sort(), presence: Math.max(existing.presence, field.presence) } : field,
    )
  }
  return { samples: 1, fields: [...merged.values()].sort((a, b) => (a.path < b.path ? -1 : 1)) }
}

/** Register a Schema as the contract for an endpoint key. */
export const contract = (key: string, schema: Schema.Top, engine: Engine = getEngine()): void => engine.setContract(key, shapeOfSchema(schema))

/** Register every procedure of an RpcGroup as a contract. */
export const contracts = (group: RpcGroupLike, engine: Engine = getEngine()): void => {
  for (const [tag, rpc] of group.requests) {
    try {
      engine.setContract(rpcKey(tag), shapeOfSchema(rpc.successSchema))
    } catch {
      // Not describable as JSON Schema.
    }
  }
}

/** Everything an Effect app needs: the RPC-aware HttpClient and the lineage tracer. */
export const live = (options: FetchOptions = {}) => Layer.mergeAll(layer(options), tracerLayer)

/** Mark the engine tier so the drawer shows lineage is available. */
export const register = (engine: Engine = getEngine()): void => engine.registerTier("effect")

export { rpcKey }
