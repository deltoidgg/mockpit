/**
 * Projection, tier 1: find DOM text and attributes whose values match leaves
 * of recent responses, score them, and attribute regions to endpoints. Higher
 * tiers plug in as refiners that confirm or correct a candidate.
 */
import type { Literal, ServedBy } from "../schema/index.js"
import type { Engine } from "../engine/engine.js"
import { type ValueIndex, type ValueRef, isStopValue, normaliseString, textKeys } from "./values.js"

export type Tier = "values" | "react" | "effect"

export interface Attribution {
  readonly key: string
  readonly requestId: string
  readonly path: string
  readonly servedBy: ServedBy
  readonly confidence: number
  readonly match: "matched" | "inferred"
  readonly tier: Tier
  readonly component?: string
  readonly file?: string
  readonly line?: number
  readonly command?: string
}

export interface Region extends Attribution {
  readonly id: number
  readonly node: Text | Element
  readonly attribute?: string
}

export interface LiteralHit {
  readonly id: number
  readonly literal: Literal
  readonly node: Text
}

export interface RefineInput {
  readonly node: Text | Element
  readonly candidates: readonly ValueRef[]
  readonly best: ValueRef | undefined
}

export interface RefineResult {
  readonly ref?: ValueRef
  readonly confidence?: number
  readonly tier?: Tier
  readonly component?: string
  readonly file?: string
  readonly line?: number
  readonly command?: string
}

export interface Refiner {
  readonly tier: Tier
  readonly refine: (input: RefineInput) => RefineResult | undefined
}

export const THRESHOLD = 0.5
const MAX_NODES = 20000
const ATTRIBUTES = ["title", "alt", "aria-label", "placeholder"] as const
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"])

let nextId = 1
const ids = new WeakMap<object, Map<string, number>>()
const stableId = (node: object, tag: string): number => {
  let map = ids.get(node)
  if (!map) {
    map = new Map()
    ids.set(node, map)
  }
  let id = map.get(tag)
  if (id === undefined) {
    id = nextId++
    map.set(tag, id)
  }
  return id
}

/** Base score for a single candidate before corroboration. */
export const baseScore = (ref: ValueRef, text: string, contained: boolean): number => {
  if (contained) return 0.6
  const normalised = normaliseString(text)
  if (ref.kind === "boolean") return 0.15
  if (ref.kind === "date") return 0.9
  if (ref.kind === "number") return normalised.replace(/[^\d]/g, "").length >= 4 ? 0.55 : 0.4
  if (isStopValue(normalised)) return 0.2
  if (normalised.length >= 6 || normalised.includes(" ")) return 1
  return 0.4
}

interface Candidate {
  readonly node: Text | Element
  readonly attribute?: string
  readonly text: string
  readonly refs: readonly ValueRef[]
  readonly contained: boolean
}

const elementOf = (node: Text | Element): Element | null => (node.nodeType === 3 ? node.parentElement : (node as Element))

const isIgnored = (element: Element | null, ignore: ReadonlySet<Element>): boolean => {
  for (let current = element; current; current = current.parentElement) {
    if (ignore.has(current) || SKIP_TAGS.has(current.tagName.toUpperCase()) || current.hasAttribute("data-mockpit-ignore")) return true
  }
  return false
}

export interface ScanResult {
  readonly regions: Region[]
  readonly literals: LiteralHit[]
}

export interface ScanOptions {
  readonly root: Element
  readonly index: ValueIndex
  readonly ignore?: ReadonlySet<Element>
  readonly refiners?: readonly Refiner[]
  readonly literals?: readonly Literal[]
}

/** Synchronous full scan. The Projection class slices this across idle time. */
export const scan = (options: ScanOptions): ScanResult => {
  const work = scanner(options)
  let step = work.next()
  while (!step.done) step = work.next()
  return step.value
}

/** A generator so callers can pause between chunks of nodes. */
export function* scanner(options: ScanOptions): Generator<void, ScanResult, void> {
  const { root, index } = options
  const ignore = options.ignore ?? new Set<Element>()
  const refiners = options.refiners ?? []
  const literalByText = new Map<string, Literal>()
  for (const literal of options.literals ?? []) {
    const normalised = normaliseString(literal.text)
    if (normalised.length >= 2 && !literalByText.has(normalised)) literalByText.set(normalised, literal)
  }

  const candidates: Candidate[] = []
  const literalHits: LiteralHit[] = []
  const doc = root.ownerDocument
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */)
  let count = 0
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (++count > MAX_NODES) break
    if (count % 250 === 0) yield
    const text = node.nodeValue ?? ""
    if (!text.trim()) continue
    if (isIgnored(node.parentElement, ignore)) continue
    const refs = textKeys(text).flatMap((key) => index.lookup(key))
    if (refs.length > 0) {
      candidates.push({ node, text, refs, contained: false })
      continue
    }
    const contained = index.contained(normaliseString(text))
    if (contained.length > 0) {
      candidates.push({ node, text, refs: contained, contained: true })
      continue
    }
    const literal = literalByText.get(normaliseString(text))
    if (literal) literalHits.push({ id: stableId(node, "literal"), literal, node })
  }

  yield
  const selector = [...ATTRIBUTES.map((name) => `[${name}]`), "input", "textarea"].join(",")
  for (const element of Array.from(root.querySelectorAll(selector))) {
    if (isIgnored(element, ignore)) continue
    for (const attribute of ATTRIBUTES) {
      const value = element.getAttribute(attribute)
      if (!value?.trim()) continue
      const refs = textKeys(value).flatMap((key) => index.lookup(key))
      if (refs.length > 0) candidates.push({ node: element, attribute, text: value, refs, contained: false })
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const value = element.value
      if (value?.trim() && element.type !== "password") {
        const refs = textKeys(value).flatMap((key) => index.lookup(key))
        if (refs.length > 0) candidates.push({ node: element, attribute: "value", text: value, refs, contained: false })
      }
    }
  }

  yield
  // Corroboration: count, per ancestor up to three levels, which endpoints match beneath it.
  const ancestorKeys = new Map<Element, Map<string, number>>()
  const ancestors = (candidate: Candidate): Element[] => {
    const list: Element[] = []
    let current = elementOf(candidate.node)
    for (let level = 0; current && level < 3; level += 1) {
      // The scan root and <body> contain everything; they corroborate nothing.
      if (current === root || current === doc.body || current === doc.documentElement) break
      list.push(current)
      current = current.parentElement
    }
    return list
  }
  for (const candidate of candidates) {
    const keys = new Set(candidate.refs.map((ref) => ref.key))
    for (const ancestor of ancestors(candidate)) {
      const counts = ancestorKeys.get(ancestor) ?? new Map<string, number>()
      for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
      ancestorKeys.set(ancestor, counts)
    }
  }

  const regions: Region[] = []
  for (const candidate of candidates) {
    let best: { ref: ValueRef; score: number } | undefined
    for (const ref of candidate.refs) {
      let score = baseScore(ref, candidate.text, candidate.contained)
      if (score < 0.9) {
        const corroborated = ancestors(candidate).some((ancestor) => (ancestorKeys.get(ancestor)?.get(ref.key) ?? 0) >= 2)
        if (corroborated) score = score <= 0.2 ? 0.7 : 0.9
      }
      if (!best || score > best.score || (score === best.score && ref.at > best.ref.at)) best = { ref, score }
    }
    let attribution: Attribution | undefined = best
      ? {
          key: best.ref.key,
          requestId: best.ref.requestId,
          path: best.ref.path,
          servedBy: best.ref.servedBy,
          confidence: best.score,
          match: best.score >= 0.9 ? "matched" : "inferred",
          tier: "values",
        }
      : undefined
    for (const refiner of refiners) {
      const refined = refiner.refine({ node: candidate.node, candidates: candidate.refs, best: best?.ref })
      if (!refined) continue
      const ref = refined.ref ?? best?.ref
      if (!ref) continue
      const confidence = refined.confidence ?? attribution?.confidence ?? THRESHOLD
      attribution = {
        key: ref.key,
        requestId: ref.requestId,
        path: ref.path,
        servedBy: ref.servedBy,
        confidence,
        match: confidence >= 0.9 ? "matched" : "inferred",
        tier: refined.tier ?? refiner.tier,
        ...(refined.component ? { component: refined.component } : {}),
        ...(refined.file ? { file: refined.file } : {}),
        ...(refined.line !== undefined ? { line: refined.line } : {}),
        ...(refined.command ? { command: refined.command } : {}),
      }
    }
    if (!attribution || attribution.confidence < THRESHOLD) continue
    regions.push({
      ...attribution,
      id: stableId(candidate.node, `${candidate.attribute ?? "text"}:${attribution.key}`),
      node: candidate.node,
      ...(candidate.attribute ? { attribute: candidate.attribute } : {}),
    })
  }
  return { regions, literals: literalHits }
}

/** Client rects for a region's node, in viewport coordinates. */
export const rectsOf = (node: Text | Element): DOMRect[] => {
  if (node.nodeType === 3) {
    const range = node.ownerDocument!.createRange()
    range.selectNodeContents(node)
    return Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)
  }
  const rect = (node as Element).getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 ? [rect] : []
}

type Listener = () => void

const idle = (callback: (deadline: { timeRemaining: () => number }) => void): void => {
  const ric = (globalThis as { requestIdleCallback?: (cb: (deadline: { timeRemaining: () => number }) => void, options?: { timeout: number }) => number }).requestIdleCallback
  if (ric) ric(callback, { timeout: 500 })
  else setTimeout(() => callback({ timeRemaining: () => 4 }), 16)
}

/** Keeps regions up to date as the DOM and the value index change. */
export class Projection {
  regions: Region[] = []
  literals: LiteralHit[] = []
  private readonly listeners = new Set<Listener>()
  private observer: MutationObserver | undefined
  private queued = false
  private running: Generator<void, ScanResult, void> | undefined
  private indexVersion = -1
  private unsubscribe: (() => void) | undefined

  constructor(
    private readonly engine: Engine,
    private readonly root: Element,
    private readonly ignore: ReadonlySet<Element>,
  ) {}

  start(): void {
    this.observer = new MutationObserver((records) => {
      if (records.every((record) => isIgnored(record.target.nodeType === 3 ? record.target.parentElement : (record.target as Element), this.ignore))) return
      this.schedule()
    })
    this.observer.observe(this.root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRIBUTES, "value"] })
    this.unsubscribe = this.engine.subscribe(() => {
      if (this.engine.values.version !== this.indexVersion) this.schedule()
    })
    this.root.ownerDocument.addEventListener("input", this.onInput, true)
    this.schedule()
  }

  stop(): void {
    this.observer?.disconnect()
    this.unsubscribe?.()
    this.root.ownerDocument.removeEventListener("input", this.onInput, true)
  }

  private readonly onInput = () => this.schedule()

  schedule(): void {
    if (this.queued) return
    this.queued = true
    idle((deadline) => this.run(deadline))
  }

  private run(deadline: { timeRemaining: () => number }): void {
    this.queued = false
    if (!this.running) {
      this.indexVersion = this.engine.values.version
      this.running = scanner({
        root: this.root,
        index: this.engine.values,
        ignore: this.ignore,
        refiners: this.engine.refiners,
        literals: this.engine.getState().source?.literals ?? [],
      })
    }
    const until = Math.min(deadline.timeRemaining(), 4)
    const start = performance.now()
    let step = this.running.next()
    while (!step.done && performance.now() - start < until) step = this.running.next()
    if (step.done) {
      this.running = undefined
      this.regions = step.value.regions
      this.literals = step.value.literals
      for (const listener of this.listeners) listener()
    } else {
      this.queued = true
      idle((next) => this.run(next))
    }
  }

  /** Run a complete scan now. Tests and first paint. */
  scanNow(): void {
    this.running = undefined
    this.indexVersion = this.engine.values.version
    const result = scan({
      root: this.root,
      index: this.engine.values,
      ignore: this.ignore,
      refiners: this.engine.refiners,
      literals: this.engine.getState().source?.literals ?? [],
    })
    this.regions = result.regions
    this.literals = result.literals
    for (const listener of this.listeners) listener()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Region count per endpoint, for the drawer. */
  counts(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const region of this.regions) counts[region.key] = (counts[region.key] ?? 0) + 1
    return counts
  }

  /** The most specific region under a point. */
  regionAt(x: number, y: number): Region | undefined {
    let best: { region: Region; area: number } | undefined
    for (const region of this.regions) {
      for (const rect of rectsOf(region.node)) {
        if (x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2) {
          const area = rect.width * rect.height
          if (!best || area < best.area) best = { region, area }
        }
      }
    }
    return best?.region
  }

  /** A region inside or containing an element, for hovering near text. */
  regionNear(element: Element): Region | undefined {
    for (let current: Element | null = element, level = 0; current && level < 3; current = current.parentElement, level += 1) {
      const inside = this.regions.find((region) => region.node === current || current!.contains(region.node))
      if (inside) return inside
    }
    return undefined
  }
}
