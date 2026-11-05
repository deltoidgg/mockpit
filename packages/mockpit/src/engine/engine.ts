/**
 * The engine: one per page. Sensors push observations in; the overlay and
 * adapters read state out. Persistence goes through the LedgerStore service.
 */
import { Effect, type Layer } from "effect"
import {
  type DevEnv,
  type Ledger,
  type LocalPrefs,
  type Observation,
  type ServedBy,
  type Shape,
  type SourceManifest,
  decodeLocalPrefs,
  defaultLocalPrefs,
  emptyLedger,
} from "../schema/index.js"
import { ValueIndex } from "../projection/values.js"
import type { Refiner } from "../projection/scan.js"
import { KeyResolver, screenOf } from "./key.js"
import { type FoldContext, foldObservation } from "./ledger.js"
import { collectLeaves, extractShape } from "./shape.js"
import {
  DEV_SERVER_BASE,
  type LedgerStore,
  type LedgerStoreShape,
  buildStore,
  defaultLedgerStore,
  hasDevServer,
  hasStoredPrefs,
  readLocalPrefs,
  writeLocalPrefs,
} from "./store.js"

export const VERSION = "0.2.0"

export type Via = "msw" | "fetch" | "effect" | "manual"

export interface SessionEndpoint {
  readonly key: string
  readonly requests: number
  readonly lastStatus?: number
  readonly lastLatency?: number
  readonly lastServedBy?: ServedBy
  readonly lastAt?: number
  readonly failing: boolean
  readonly failure?: string
  readonly via?: Via
  readonly command?: string
}

export interface Controls {
  readonly id: string
  /** Can this sensor flip the endpoint between mock and real? */
  readonly canControl: (key: string) => boolean
  /** Re-apply overrides after a prefs change. */
  readonly apply: (prefs: LocalPrefs) => void | Promise<void>
}

export interface EngineState {
  readonly project: string
  readonly loaded: boolean
  readonly storeName: string
  readonly ledger: Ledger
  readonly screen: string
  readonly screenKeys: Readonly<Record<string, readonly string[]>>
  readonly session: Readonly<Record<string, SessionEndpoint>>
  readonly inventory: readonly string[]
  readonly inventoryKnown: boolean
  readonly controllable: readonly string[]
  readonly prefs: LocalPrefs
  readonly env?: DevEnv
  readonly source?: SourceManifest
  readonly devServer: boolean
  readonly staleWorkers: number
  readonly tiers: readonly string[]
  readonly regressions: readonly string[]
}

export interface EngineOptions {
  readonly project?: string
  readonly store?: Layer.Layer<LedgerStore>
  readonly now?: () => number
  readonly sha?: string
  /** Defaults to `location.pathname`. */
  readonly pathname?: () => string
  /** Debounce for ledger writes, ms. */
  readonly writeDelay?: number
  readonly persistPrefs?: boolean
}

export interface ServedInput {
  readonly key: string
  readonly requestId: string
  readonly servedBy: ServedBy
  readonly byChoice?: boolean
  readonly status: number
  readonly body?: unknown
  readonly via: Via
  readonly latency?: number
  readonly command?: string
  /** The real backend failed and this response is a fallback. */
  readonly failing?: boolean
}

type Listener = (state: EngineState) => void

export class Engine {
  readonly project: string
  readonly values = new ValueIndex()
  readonly keys = new KeyResolver()
  /** Higher-precision attribution (React fibers, Effect lineage). */
  readonly refiners: Refiner[] = []
  private ledger: Ledger
  private loaded = false
  private storeName = "memory"
  private store: LedgerStoreShape | undefined
  private readonly pending: Observation[] = []
  private readonly inventories = new Map<string, { keys: Set<string>; labels: Record<string, string> }>()
  private readonly controls = new Map<string, Controls>()
  private readonly session = new Map<string, SessionEndpoint>()
  private readonly screenKeys = new Map<string, Set<string>>()
  private readonly listeners = new Set<Listener>()
  private readonly requestStarts = new Map<string, number>()
  private readonly recentUrls = new Map<string, { key: string; requestId: string; servedBy?: ServedBy }>()
  private prefs: LocalPrefs
  private screen = "/"
  private env: DevEnv | undefined
  private source: SourceManifest | undefined
  private devServer = false
  private staleWorkers = 0
  private readonly tiers = new Set<string>(["values"])
  private readonly regressions: string[] = []
  private readonly contracts = new Map<string, Shape>()
  private writeTimer: ReturnType<typeof setTimeout> | undefined
  private notifyQueued = false
  private cachedState: EngineState | undefined
  private readonly now: () => number
  private readonly sha: string | undefined
  private readonly pathname: () => string
  private readonly writeDelay: number
  private readonly persistPrefs: boolean
  readonly ready: Promise<void>

  constructor(options: EngineOptions = {}) {
    this.project = options.project ?? inferProject()
    this.now = options.now ?? Date.now
    this.sha = options.sha
    this.pathname = options.pathname ?? (() => (typeof location === "undefined" ? "/" : location.pathname))
    this.writeDelay = options.writeDelay ?? 750
    this.persistPrefs = options.persistPrefs ?? true
    this.ledger = emptyLedger(this.project)
    this.prefs = this.persistPrefs ? readLocalPrefs(this.project) : defaultLocalPrefs()
    this.screen = screenOf(this.pathname())
    this.ready = this.load(options.store)
  }

  private async load(layer: Layer.Layer<LedgerStore> | undefined): Promise<void> {
    try {
      this.devServer = layer ? false : await hasDevServer()
      this.store = await buildStore(layer ?? (await defaultLedgerStore(this.project)))
      this.storeName = this.store.name
      const stored = await this.storeRead()
      if (stored) this.ledger = { ...stored, project: this.project }
      for (const key of Object.keys(this.ledger.endpoints)) this.keys.addKey(key)
      if (this.devServer) {
        await this.loadDevServerExtras()
        await this.restoreLocalPrefs()
      }
    } finally {
      this.loaded = true
      const queued = this.pending.splice(0)
      for (const observation of queued) this.apply(observation)
      this.notify()
    }
  }

  private async storeRead(): Promise<Ledger | undefined> {
    if (!this.store) return undefined
    return Effect.runPromise(this.store.read).catch(() => undefined)
  }

  private async loadDevServerExtras(): Promise<void> {
    const get = async (path: string) => {
      try {
        const response = await fetch(`${DEV_SERVER_BASE}/${path}`)
        return response.ok ? await response.json() : undefined
      } catch {
        return undefined
      }
    }
    const [env, source] = await Promise.all([get("env"), get("source")])
    if (env) this.env = env as DevEnv
    if (source) {
      this.source = source as SourceManifest
      if (this.source.components.length > 0) this.tiers.add("source")
    }
  }

  /** Toggles live in `.mockpit/local.json` too, so they survive cleared site data. */
  private async restoreLocalPrefs(): Promise<void> {
    if (!this.persistPrefs || hasStoredPrefs(this.project)) return
    try {
      const response = await fetch(`${DEV_SERVER_BASE}/local`)
      if (!response.ok) return
      const raw = (await response.json()) as Record<string, unknown>
      if (Object.keys(raw).length === 0) return
      this.prefs = decodeLocalPrefs(raw)
      await Promise.all([...this.controls.values()].map((controls) => controls.apply(this.prefs)))
      writeLocalPrefs(this.project, this.prefs, false)
    } catch {
      // The file is a convenience.
    }
  }

  /** Reload the source manifest, e.g. after HMR. */
  async refreshSource(): Promise<void> {
    if (!this.devServer) return
    await this.loadDevServerExtras()
    this.notify()
  }

  // Inventory ---------------------------------------------------------------

  setInventory(sourceId: string, keys: Iterable<string>, labels: Record<string, string> = {}): void {
    const next = new Set(keys)
    const previous = this.inventories.get(sourceId)
    if (previous && sameSet(previous.keys, next)) return
    this.inventories.set(sourceId, { keys: next, labels })
    for (const key of next) this.keys.addKey(key)
    this.observe({ _tag: "InventoryChanged", keys: [...next].sort(), labels, at: this.now() })
  }

  /** Forget a source without implying its mocks were deleted (detach, HMR). */
  removeInventory(sourceId: string): void {
    if (this.inventories.delete(sourceId)) this.notify()
  }

  /** Add keys to an inventory source without replacing it (mock Layers learn lazily). */
  addToInventory(sourceId: string, key: string): void {
    const current = this.inventories.get(sourceId)
    if (current?.keys.has(key)) return
    this.setInventory(sourceId, [...(current?.keys ?? []), key], current?.labels ?? {})
  }

  get inventory(): Set<string> {
    const all = new Set<string>()
    for (const { keys } of this.inventories.values()) for (const key of keys) all.add(key)
    return all
  }

  registerControls(controls: Controls): () => void {
    this.controls.set(controls.id, controls)
    this.notify()
    return () => {
      this.controls.delete(controls.id)
      this.notify()
    }
  }

  registerTier(tier: string): void {
    if (this.tiers.has(tier)) return
    this.tiers.add(tier)
    this.notify()
  }

  unregisterTier(tier: string): void {
    if (this.tiers.delete(tier)) this.notify()
  }

  // Observation -------------------------------------------------------------

  observe(observation: Observation): void {
    if (!this.loaded) {
      this.pending.push(observation)
      return
    }
    this.apply(observation)
  }

  private context(): FoldContext {
    return {
      inventory: this.inventory,
      inventoryKnown: this.inventories.size > 0,
      sha: this.sha ?? this.env?.sha,
      lastSeen: this.prefs.lastSeen,
      contracts: this.contracts,
    }
  }

  private apply(observation: Observation): void {
    const result = foldObservation(this.ledger, observation, this.context())
    for (const transition of result.transitions) {
      if (transition.regression) this.regressions.push(transition.key)
    }
    if (result.changed) {
      this.ledger = result.ledger
      this.scheduleWrite()
    }
    this.notify()
  }

  requestStarted(key: string, requestId: string, url?: string): void {
    this.requestStarts.set(requestId, this.now())
    this.trackScreen(key)
    if (url) this.rememberUrl(url, { key, requestId })
    this.observe({ _tag: "RequestStarted", key, requestId, screen: this.screen, at: this.now() })
  }

  served(input: ServedInput): void {
    const at = this.now()
    const started = this.requestStarts.get(input.requestId)
    this.requestStarts.delete(input.requestId)
    const latency = input.latency ?? (started !== undefined ? at - started : undefined)
    const previous = this.session.get(input.key)
    const failing = input.failing ?? (input.servedBy === "real" && (input.status >= 500 || input.status === 0))
    this.session.set(input.key, {
      key: input.key,
      requests: (previous?.requests ?? 0) + 1,
      lastStatus: input.status,
      ...(latency !== undefined ? { lastLatency: latency } : {}),
      lastServedBy: input.servedBy,
      lastAt: at,
      failing,
      via: input.via,
      ...(input.command ? { command: input.command } : previous?.command ? { command: previous.command } : {}),
    })
    this.trackScreen(input.key)
    this.prefs = { ...this.prefs, lastSeen: { ...this.prefs.lastSeen, [input.key]: at } }
    this.savePrefsSoon()
    let shape
    if (input.body !== undefined) {
      shape = extractShape(input.body)
      this.values.add(input.key, input.requestId, input.servedBy, collectLeaves(input.body), at)
    }
    this.observe({
      _tag: "Served",
      key: input.key,
      requestId: input.requestId,
      screen: this.screen,
      servedBy: input.servedBy,
      byChoice: input.byChoice ?? false,
      status: input.status,
      ...(shape ? { shape } : {}),
      via: input.via,
      at,
    })
  }

  failed(key: string, requestId: string, reason: string): void {
    const previous = this.session.get(key)
    this.session.set(key, {
      key,
      requests: (previous?.requests ?? 0) + 1,
      lastAt: this.now(),
      ...(previous?.lastServedBy ? { lastServedBy: previous.lastServedBy } : {}),
      failing: true,
      failure: reason,
      ...(previous?.via ? { via: previous.via } : {}),
      ...(previous?.command ? { command: previous.command } : {}),
    })
    this.observe({ _tag: "Failed", key, requestId, screen: this.screen, reason, at: this.now() })
  }

  /** Shadow comparison: a mock response computed for a request the real backend served. */
  shadowMock(key: string, body: unknown): void {
    const shape = extractShape(body)
    this.observe({
      _tag: "Served",
      key,
      requestId: `shadow-${this.now()}`,
      screen: this.screen,
      servedBy: "mock",
      byChoice: false,
      status: 200,
      shape,
      via: "msw",
      at: this.now(),
    })
  }

  /** Register the expected response shape for an endpoint, e.g. from an Effect Schema. */
  setContract(key: string, shape: Shape): void {
    this.contracts.set(key, shape)
    this.keys.addKey(key)
  }

  getContract(key: string): Shape | undefined {
    return this.contracts.get(key)
  }

  /** Attach lineage (a Foldkit Command, an Effect span) to the endpoint's session entry. */
  setCommand(key: string, command: string): void {
    const previous = this.session.get(key)
    this.session.set(key, { ...(previous ?? { key, requests: 0, failing: false }), command })
    this.notify()
  }

  note(key: string, note: string): void {
    this.observe({ _tag: "Noted", key, note, at: this.now() })
  }

  rememberUrl(url: string, value: { key: string; requestId: string; servedBy?: ServedBy }): void {
    this.recentUrls.set(stripHash(url), value)
    if (this.recentUrls.size > 200) {
      const first = this.recentUrls.keys().next().value
      if (first !== undefined) this.recentUrls.delete(first)
    }
  }

  /** The endpoint and request a response URL most recently belonged to. */
  lookupUrl(url: string): { key: string; requestId: string; servedBy?: ServedBy } | undefined {
    return this.recentUrls.get(stripHash(url))
  }

  // Screens -----------------------------------------------------------------

  setScreen(pathname: string): void {
    const next = screenOf(pathname, this.knownScreens())
    if (next === this.screen) return
    this.screen = next
    this.notify()
  }

  private knownScreens(): string[] {
    const screens = new Set<string>()
    for (const entry of Object.values(this.ledger.endpoints)) for (const screen of entry.screens) if (screen.includes(":")) screens.add(screen)
    return [...screens]
  }

  private trackScreen(key: string): void {
    const set = this.screenKeys.get(this.screen) ?? new Set<string>()
    set.add(key)
    this.screenKeys.set(this.screen, set)
  }

  // Controls ----------------------------------------------------------------

  canControl(key: string): boolean {
    for (const controls of this.controls.values()) if (controls.canControl(key)) return true
    return false
  }

  getPrefs(): LocalPrefs {
    return this.prefs
  }

  async setPrefs(update: (prefs: LocalPrefs) => LocalPrefs): Promise<void> {
    this.prefs = update(this.prefs)
    this.savePrefsNow()
    await Promise.all([...this.controls.values()].map((controls) => controls.apply(this.prefs)))
    this.notify()
  }

  async flip(key: string, to: ServedBy): Promise<void> {
    await this.setPrefs((prefs) => {
      const overrides = { ...prefs.overrides }
      if (to === "mock") delete overrides[key]
      else overrides[key] = "real"
      return { ...prefs, overrides }
    })
    this.values.clear(key)
  }

  setShadow(key: string, on: boolean): Promise<void> {
    return this.setPrefs((prefs) => ({ ...prefs, shadow: { ...prefs.shadow, [key]: on } }))
  }

  setSafetyNet(key: string, on: boolean): Promise<void> {
    return this.setPrefs((prefs) => ({ ...prefs, safetyNet: { ...prefs.safetyNet, [key]: on } }))
  }

  togglePin(key: string): Promise<void> {
    return this.setPrefs((prefs) => ({
      ...prefs,
      pins: prefs.pins.includes(key) ? prefs.pins.filter((pin) => pin !== key) : [...prefs.pins, key],
    }))
  }

  shadowEnabled(key: string): boolean {
    return this.prefs.shadow[key] ?? true
  }

  setStaleWorkers(count: number): void {
    this.staleWorkers = count
    this.notify()
  }

  // Persistence -------------------------------------------------------------

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => void this.flush(), this.writeDelay)
  }

  async flush(): Promise<void> {
    await this.ready
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = undefined
    if (!this.store) return
    await Effect.runPromise(this.store.write(this.ledger)).catch(() => undefined)
  }

  private prefsTimer: ReturnType<typeof setTimeout> | undefined

  private savePrefsSoon(): void {
    if (this.prefsTimer) return
    this.prefsTimer = setTimeout(() => {
      this.prefsTimer = undefined
      this.savePrefsNow()
    }, 2000)
  }

  private savePrefsNow(): void {
    if (this.persistPrefs) writeLocalPrefs(this.project, this.prefs, this.devServer)
  }

  // Reading -----------------------------------------------------------------

  getLedger(): Ledger {
    return this.ledger
  }

  getState(): EngineState {
    if (this.cachedState) return this.cachedState
    const controllable = [...this.inventory, ...Object.keys(this.ledger.endpoints)].filter((key) => this.canControl(key))
    this.cachedState = {
      project: this.project,
      loaded: this.loaded,
      storeName: this.storeName,
      ledger: this.ledger,
      screen: this.screen,
      screenKeys: Object.fromEntries([...this.screenKeys].map(([screen, keys]) => [screen, [...keys].sort()])),
      session: Object.fromEntries(this.session),
      inventory: [...this.inventory].sort(),
      inventoryKnown: this.inventories.size > 0,
      controllable: [...new Set(controllable)].sort(),
      prefs: this.prefs,
      ...(this.env ? { env: this.env } : {}),
      ...(this.source ? { source: this.source } : {}),
      devServer: this.devServer,
      staleWorkers: this.staleWorkers,
      tiers: [...this.tiers],
      regressions: [...this.regressions],
    }
    return this.cachedState
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    this.cachedState = undefined
    if (this.notifyQueued) return
    this.notifyQueued = true
    queueMicrotask(() => {
      this.notifyQueued = false
      const state = this.getState()
      for (const listener of this.listeners) listener(state)
    })
  }
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((value) => b.has(value))

const stripHash = (url: string) => url.split("#")[0]!

const inferProject = (): string => {
  if (typeof document !== "undefined" && document.title) return document.title.trim().slice(0, 60) || "app"
  return "app"
}

// Singleton -------------------------------------------------------------------

declare global {
  var __MOCKPIT_ENGINE__: Engine | undefined
  interface Window {
    __MOCKPIT__?: {
      readonly version: string
      readonly engine: Engine
      readonly ledger: () => Ledger
      readonly state: () => EngineState
      readonly flush: () => Promise<void>
    }
  }
}

/** Get or create the page's engine. Options apply only on first call. */
export const getEngine = (options?: EngineOptions): Engine => {
  if (!globalThis.__MOCKPIT_ENGINE__) {
    const engine = new Engine(options)
    globalThis.__MOCKPIT_ENGINE__ = engine
    if (typeof window !== "undefined") {
      window.__MOCKPIT__ = {
        version: VERSION,
        engine,
        ledger: () => engine.getLedger(),
        state: () => engine.getState(),
        flush: () => engine.flush(),
      }
      installNavigationTracking(engine)
      window.addEventListener("pagehide", () => void engine.flush())
    }
  }
  return globalThis.__MOCKPIT_ENGINE__
}

/** Tear down the singleton. Tests and HMR only. */
export const resetEngine = (): void => {
  globalThis.__MOCKPIT_ENGINE__ = undefined
  if (typeof window !== "undefined") delete window.__MOCKPIT__
}

const installNavigationTracking = (engine: Engine): void => {
  const update = () => engine.setScreen(location.pathname)
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method]
    history[method] = function patched(this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args)
      queueMicrotask(update)
      return result
    }
  }
  window.addEventListener("popstate", update)
  window.addEventListener("hashchange", update)
}
