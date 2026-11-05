/**
 * The ledger is a fold over observations. Stage is always derived, never an
 * input: it comes from whether a mock exists for the endpoint right now and
 * whether the real backend has ever answered it.
 */
import type { HistoryEntry, Ledger, LedgerEntry, Observation, Parity, Shape, Stage } from "../schema/index.js"
import { computeParity, parityChanged } from "./parity.js"
import { mergeShapes, shapesEqual } from "./shape.js"

export const HISTORY_CAP = 50
export const SCREEN_CAP = 24
export const RETIRE_AFTER_MS = 14 * 24 * 60 * 60 * 1000

export interface FoldContext {
  /** Endpoint keys that currently have a mock (MSW handler, mock Layer). */
  readonly inventory: ReadonlySet<string>
  /** False when no mock source is attached: handler-based transitions are skipped. */
  readonly inventoryKnown: boolean
  readonly sha?: string | undefined
  /** Last time this developer saw each endpoint requested. Local, not committed. */
  readonly lastSeen?: Readonly<Record<string, number>>
  /** Expected shapes derived from Schemas. Preferred over the mock for parity. */
  readonly contracts?: ReadonlyMap<string, Shape>
}

export interface StageInput {
  readonly hasHandler: boolean
  readonly hadHandler: boolean
  readonly realObserved: boolean
  readonly lastSeen?: number | undefined
  readonly now: number
}

export const deriveStage = (input: StageInput): Stage => {
  if (input.hasHandler) return input.realObserved ? "shadowed" : "mocked"
  if (input.hadHandler) {
    if (input.lastSeen !== undefined && input.now - input.lastSeen > RETIRE_AFTER_MS) return "retired"
    return "real"
  }
  return "unmocked"
}

const realish: ReadonlySet<Stage> = new Set(["real", "unmocked", "retired"])
const mockish: ReadonlySet<Stage> = new Set(["mocked", "shadowed"])

export const isRegression = (from: Stage, to: Stage): boolean => realish.has(from) && mockish.has(to)

export interface FoldResult {
  readonly ledger: Ledger
  readonly changed: boolean
  readonly transitions: ReadonlyArray<{ readonly key: string; readonly from: Stage; readonly to: Stage; readonly regression: boolean }>
}

/** Coarsen a shape before persisting so the committed file stays quiet. */
export const stabiliseShape = (shape: Shape | undefined): Shape | undefined => {
  if (!shape) return undefined
  return {
    samples: Math.min(shape.samples, 10),
    fields: shape.fields.map((field) => ({ ...field, presence: Math.round(field.presence * 20) / 20 })),
  }
}

const newEntry = (at: number, hadHandler: boolean): LedgerEntry => ({
  stage: hadHandler ? "mocked" : "unmocked",
  hadHandler,
  firstSeen: at,
  lastChanged: at,
  screens: [],
  history: [{ at, stage: hadHandler ? "mocked" : "unmocked" }],
})

const addScreen = (screens: readonly string[], screen: string): readonly string[] => {
  if (!screen || screens.includes(screen)) return screens
  return [...screens, screen].sort().slice(0, SCREEN_CAP)
}

const recomputeParity = (entry: LedgerEntry, contract?: Shape): Parity | undefined => {
  if (!entry.realShape || entry.realShape.samples === 0) return entry.parity
  if (contract) return computeParity(contract, entry.realShape, "schema")
  if (entry.mockShape && entry.mockShape.samples > 0) return computeParity(entry.mockShape, entry.realShape, "mock")
  return entry.parity
}

/** Apply one observation. Pure: returns a new ledger and what changed. */
export const foldObservation = (ledger: Ledger, observation: Observation, context: FoldContext): FoldResult => {
  const endpoints: Record<string, LedgerEntry> = { ...ledger.endpoints }
  let changed = false
  const touched = new Set<string>()
  const set = (key: string, entry: LedgerEntry) => {
    if (JSON.stringify(endpoints[key]) !== JSON.stringify(entry)) {
      endpoints[key] = entry
      changed = true
    }
    touched.add(key)
  }

  switch (observation._tag) {
    case "InventoryChanged": {
      for (const key of observation.keys) {
        const existing = endpoints[key] ?? newEntry(observation.at, true)
        const label = observation.labels[key]
        set(key, { ...existing, hadHandler: true, ...(label && !existing.label ? { label } : {}) })
      }
      // Every entry may move when the inventory changes.
      for (const key of Object.keys(endpoints)) touched.add(key)
      break
    }
    case "RequestStarted": {
      const existing = endpoints[observation.key] ?? newEntry(observation.at, context.inventory.has(observation.key))
      set(observation.key, { ...existing, screens: addScreen(existing.screens, observation.screen) })
      break
    }
    case "Served": {
      const existing = endpoints[observation.key] ?? newEntry(observation.at, context.inventory.has(observation.key))
      let next: LedgerEntry = { ...existing, screens: addScreen(existing.screens, observation.screen) }
      if (observation.shape) {
        if (observation.servedBy === "mock") {
          const merged = stabiliseShape(mergeShapes(existing.mockShape, observation.shape))
          if (!shapesEqual(merged, existing.mockShape) && merged) next = { ...next, mockShape: merged }
        } else {
          const merged = stabiliseShape(mergeShapes(existing.realShape, observation.shape))
          if (!shapesEqual(merged, existing.realShape) && merged) next = { ...next, realShape: merged }
        }
      } else if (observation.servedBy === "real" && !existing.realShape) {
        next = { ...next, realShape: { samples: 0, fields: [] } }
      }
      const parity = recomputeParity(next, context.contracts?.get(observation.key))
      if (parity && parityChanged(parity, existing.parity)) next = { ...next, parity }
      set(observation.key, next)
      break
    }
    case "Noted": {
      const existing = endpoints[observation.key] ?? newEntry(observation.at, context.inventory.has(observation.key))
      const note = observation.note.trim().slice(0, 200)
      const { note: _previous, ...rest } = existing
      set(observation.key, note ? { ...rest, note } : rest)
      break
    }
    case "Failed":
      return { ledger, changed: false, transitions: [] }
  }

  const transitions: Array<{ key: string; from: Stage; to: Stage; regression: boolean }> = []
  for (const key of touched) {
    const entry = endpoints[key]
    if (!entry) continue
    const realObserved = entry.realShape !== undefined
    const stage = context.inventoryKnown
      ? deriveStage({
          hasHandler: context.inventory.has(key),
          hadHandler: entry.hadHandler,
          realObserved,
          lastSeen: context.lastSeen?.[key],
          now: atOf(observation),
        })
      : entry.hadHandler
        ? entry.stage === "mocked" && realObserved
          ? "shadowed"
          : entry.stage
        : "unmocked"
    const parityMoved = entry.parity !== undefined && lastParity(entry) !== entry.parity.score
    if (stage !== entry.stage || parityMoved) {
      const regression = stage !== entry.stage && isRegression(entry.stage, stage)
      const history: HistoryEntry = {
        at: atOf(observation),
        stage,
        ...(context.sha ? { sha: context.sha } : {}),
        ...(entry.parity ? { parity: entry.parity.score } : {}),
        ...(regression ? { regression: true } : {}),
      }
      if (stage !== entry.stage) transitions.push({ key, from: entry.stage, to: stage, regression })
      endpoints[key] = {
        ...entry,
        stage,
        lastChanged: stage !== entry.stage ? atOf(observation) : entry.lastChanged,
        history: compactHistory([...entry.history, history]),
      }
      changed = true
    }
  }

  return { ledger: changed ? { ...ledger, endpoints: sortRecord(endpoints) } : ledger, changed, transitions }
}

const lastParity = (entry: LedgerEntry): number | undefined => {
  for (let index = entry.history.length - 1; index >= 0; index -= 1) {
    const parity = entry.history[index]?.parity
    if (parity !== undefined) return parity
  }
  return undefined
}

const atOf = (observation: Observation): number => observation.at

const sortRecord = <A>(record: Record<string, A>): Record<string, A> =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

const WEEK = 7 * 24 * 60 * 60 * 1000

/** Keep the latest entries verbatim; older ones collapse to one per week. Regressions always survive. */
export const compactHistory = (history: readonly HistoryEntry[]): HistoryEntry[] => {
  if (history.length <= HISTORY_CAP) return [...history]
  const recent = history.slice(-Math.floor(HISTORY_CAP * 0.8))
  const older = history.slice(0, history.length - recent.length)
  const byWeek = new Map<number, HistoryEntry>()
  const keep: HistoryEntry[] = []
  for (const entry of older) {
    if (entry.regression) keep.push(entry)
    else byWeek.set(Math.floor(entry.at / WEEK), entry)
  }
  const compacted = [...keep, ...byWeek.values()].sort((a, b) => a.at - b.at)
  // Over the cap: drop the oldest non-regression entries first.
  let overflow = compacted.length + recent.length - HISTORY_CAP
  const trimmed = compacted.filter((entry) => {
    if (overflow > 0 && !entry.regression) {
      overflow -= 1
      return false
    }
    return true
  })
  return [...trimmed, ...recent].slice(-HISTORY_CAP)
}

export const foldAll = (ledger: Ledger, observations: readonly Observation[], context: FoldContext): Ledger =>
  observations.reduce((current, observation) => foldObservation(current, observation, context).ledger, ledger)

export interface LedgerSummary {
  readonly total: number
  readonly mocked: number
  readonly shadowed: number
  readonly real: number
  readonly retired: number
  readonly unmocked: number
}

export const summarise = (ledger: Ledger): LedgerSummary => {
  const counts = { total: 0, mocked: 0, shadowed: 0, real: 0, retired: 0, unmocked: 0 }
  for (const entry of Object.values(ledger.endpoints)) {
    counts.total += 1
    counts[entry.stage] += 1
  }
  return counts
}

/** Merge two ledgers (git merge driver): union histories, recompute stage from the newest facts. */
export const mergeLedgers = (ours: Ledger, theirs: Ledger): Ledger => {
  const keys = new Set([...Object.keys(ours.endpoints), ...Object.keys(theirs.endpoints)])
  const endpoints: Record<string, LedgerEntry> = {}
  for (const key of keys) {
    const a = ours.endpoints[key]
    const b = theirs.endpoints[key]
    if (!a || !b) {
      endpoints[key] = (a ?? b)!
      continue
    }
    const newer = a.lastChanged >= b.lastChanged ? a : b
    const history = dedupeHistory([...a.history, ...b.history].sort((x, y) => x.at - y.at))
    const mockShape = stabiliseShape(mergeShapes(a.mockShape, b.mockShape))
    const realShape = stabiliseShape(mergeShapes(a.realShape, b.realShape))
    const merged: LedgerEntry = {
      ...newer,
      hadHandler: a.hadHandler || b.hadHandler,
      firstSeen: Math.min(a.firstSeen, b.firstSeen),
      screens: [...new Set([...a.screens, ...b.screens])].sort().slice(0, SCREEN_CAP),
      history: compactHistory(history),
      ...(mockShape ? { mockShape } : {}),
      ...(realShape ? { realShape } : {}),
    }
    const parity = recomputeParity(merged)
    endpoints[key] = parity ? { ...merged, parity } : merged
  }
  return { ...ours, endpoints: sortRecord(endpoints) }
}

const dedupeHistory = (history: HistoryEntry[]): HistoryEntry[] => {
  const seen = new Set<string>()
  return history.filter((entry) => {
    const id = `${entry.at}:${entry.stage}:${entry.parity ?? ""}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/** Stable JSON for the committed file: sorted keys, two-space indent, trailing newline. */
export const serialiseLedger = (ledger: Ledger): string => `${JSON.stringify(sortDeep(ledger), null, 2)}\n`

const sortDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, sortDeep(child)]),
    )
  }
  return value
}
