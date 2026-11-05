/**
 * React adapter: tier 2 attribution. Parsed JSON responses are tagged by
 * identity at parse time. The projection then finds the component that
 * renders a value, walks its props and hook state for tagged objects, and
 * confirms the endpoint and JSON path exactly, with the component's name and,
 * with the Vite plugin, its file and line.
 *
 *   <MockPit />   // once, anywhere in the tree
 */
import { useEffect, useSyncExternalStore } from "react"
import { type Engine, getEngine } from "../engine/engine.js"
import type { RefineInput, RefineResult, Refiner } from "../projection/scan.js"
import type { ValueRef } from "../projection/values.js"
import type { ServedBy, Stage } from "../schema/index.js"
import { type StartOptions, start } from "../start.js"

interface Tag {
  readonly key: string
  readonly requestId: string
  readonly servedBy: ServedBy
  readonly path: string
}

const tags = new WeakMap<object, Tag>()
const MAX_TAGGED = 5000

/** Tag a parsed body and every nested object with its endpoint and path. */
export const tagBody = (body: unknown, origin: Omit<Tag, "path">): void => {
  let count = 0
  const visit = (value: unknown, path: string, depth: number) => {
    if (!value || typeof value !== "object" || depth > 10 || count > MAX_TAGGED) return
    if (tags.has(value as object)) return
    count += 1
    tags.set(value as object, { ...origin, path })
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1))
    else for (const [key, child] of Object.entries(value as Record<string, unknown>)) visit(child, `${path}.${key}`, depth + 1)
  }
  visit(body, "$", 0)
}

export const tagOf = (value: object): Tag | undefined => tags.get(value)

let parseHookInstalled = false

/** Wrap `Response.prototype.json` in dev so parsed bodies carry their origin. */
export const installParseHook = (engine: Engine): void => {
  if (parseHookInstalled || typeof Response === "undefined") return
  parseHookInstalled = true
  const original = Response.prototype.json
  Response.prototype.json = async function json(this: Response) {
    const body: unknown = await original.call(this)
    const origin = this.url ? engine.lookupUrl(this.url) : undefined
    if (origin) tagBody(body, { key: origin.key, requestId: origin.requestId, servedBy: origin.servedBy ?? "real" })
    return body
  }
}

// Fibers ---------------------------------------------------------------------

interface Fiber {
  tag: number
  type: unknown
  elementType: unknown
  return: Fiber | null
  memoizedProps: unknown
  memoizedState: unknown
}

const COMPONENT_TAGS = new Set([0, 1, 11, 14, 15])

const fiberOf = (element: Element): Fiber | undefined => {
  for (const key in element) {
    if (key.startsWith("__reactFiber$")) return (element as unknown as Record<string, Fiber>)[key]
  }
  return undefined
}

const componentName = (fiber: Fiber): string | undefined => {
  const type = (fiber.type ?? fiber.elementType) as { displayName?: string; name?: string; render?: { name?: string }; type?: { name?: string } } | null
  if (!type || typeof type === "string") return undefined
  return type.displayName ?? type.name ?? type.render?.name ?? type.type?.name ?? undefined
}

/** Collect tags reachable from a value, shallowly. */
const reachableTags = (value: unknown, found: Tag[], depth: number, seen: Set<unknown>) => {
  if (!value || typeof value !== "object" || depth > 3 || seen.has(value) || found.length > 50) return
  seen.add(value)
  const tag = tags.get(value as object)
  if (tag) {
    found.push(tag)
    return
  }
  if ((value as { $$typeof?: unknown }).$$typeof) return
  const entries = Array.isArray(value) ? value.slice(0, 50) : Object.values(value as Record<string, unknown>).slice(0, 50)
  for (const child of entries) reachableTags(child, found, depth + 1, seen)
}

const hookStates = (fiber: Fiber): unknown[] => {
  const states: unknown[] = []
  let hook = fiber.memoizedState as { memoizedState?: unknown; next?: unknown } | null
  for (let index = 0; hook && index < 30; index += 1) {
    states.push(hook.memoizedState)
    hook = (hook.next as typeof hook) ?? null
  }
  return states
}

const covers = (tag: Tag, ref: ValueRef) => tag.key === ref.key && tag.requestId === ref.requestId && (ref.path === tag.path || ref.path.startsWith(`${tag.path}.`) || ref.path.startsWith(`${tag.path}[`))

export const reactRefiner = (engine: Engine): Refiner => ({
  tier: "react",
  refine: ({ node, candidates, best }: RefineInput): RefineResult | undefined => {
    const element = node.nodeType === 3 ? node.parentElement : (node as Element)
    if (!element) return undefined
    let fiber = fiberOf(element)
    let firstComponent: string | undefined
    for (let level = 0; fiber && level < 40; level += 1, fiber = fiber.return ?? undefined) {
      if (!COMPONENT_TAGS.has(fiber.tag)) continue
      const name = componentName(fiber)
      firstComponent ??= name
      const found: Tag[] = []
      const seen = new Set<unknown>()
      reachableTags(fiber.memoizedProps, found, 0, seen)
      for (const state of hookStates(fiber)) reachableTags(state, found, 0, seen)
      if (found.length === 0) continue
      const confirmed = candidates.find((ref) => found.some((tag) => covers(tag, ref)))
      if (confirmed) {
        const location = name ? engine.getState().source?.components.find((component) => component.name === name) : undefined
        return {
          ref: confirmed,
          confidence: 1,
          tier: "react",
          ...(name ? { component: name } : {}),
          ...(location ? { file: location.file, line: location.line } : {}),
        }
      }
    }
    if (best && firstComponent) {
      const location = engine.getState().source?.components.find((component) => component.name === firstComponent)
      return { component: firstComponent, ...(location ? { file: location.file, line: location.line } : {}) }
    }
    return undefined
  },
})

let installed = false

/** Install tier 2: parse hook and fiber refiner. Called by `<MockPit />`. */
export const installReact = (engine: Engine = getEngine()): void => {
  if (installed) return
  installed = true
  installParseHook(engine)
  engine.refiners.push(reactRefiner(engine))
  engine.registerTier("react")
}

export type MockPitProps = StartOptions

/** Start MockPit and enable React attribution. Renders nothing. */
export const MockPit = (props: MockPitProps = {}): null => {
  useEffect(() => {
    const engine = start(props)
    if (engine) installReact(engine)
    // Start options apply once per page, so this effect runs once.
  }, [])
  return null
}

export interface EndpointState {
  readonly stage: Stage | undefined
  readonly servedBy: ServedBy | undefined
  readonly parity: number | undefined
  readonly override: ServedBy | undefined
  readonly flip: (to: ServedBy) => Promise<void>
}

/** Read an endpoint's state in a component, e.g. to label a demo. */
export const useEndpoint = (key: string): EndpointState => {
  const engine = getEngine()
  const state = useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.getState(),
    () => engine.getState(),
  )
  const entry = state.ledger.endpoints[key]
  return {
    stage: entry?.stage,
    servedBy: state.session[key]?.lastServedBy,
    parity: entry?.parity?.score,
    override: state.prefs.overrides[key],
    flip: (to) => engine.flip(key, to),
  }
}

// Early install when imported in a browser, so the parse hook sees the first requests.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  queueMicrotask(() => {
    if (globalThis.__MOCKPIT_ENGINE__) installReact(globalThis.__MOCKPIT_ENGINE__)
  })
}
