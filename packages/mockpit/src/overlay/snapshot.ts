/**
 * The Ports contract between the engine (host) and the overlay (Foldkit). The
 * overlay never sees the engine; it receives snapshots and inspect cards, and
 * emits actions.
 */
import { Schema } from "effect"
import { ParityDiff, ServedBy, Stage } from "../schema/index.js"
import type { EngineState } from "../engine/engine.js"
import { summarise } from "../engine/ledger.js"
import { burndown } from "../engine/report.js"
import type { LiteralHit } from "../projection/scan.js"

const Nullable = <S extends Schema.Top>(schema: S) => Schema.NullOr(schema)

export const Row = Schema.Struct({
  key: Schema.String,
  label: Nullable(Schema.String),
  stage: Stage,
  served: Nullable(ServedBy),
  override: Nullable(ServedBy),
  controllable: Schema.Boolean,
  parity: Nullable(Schema.Number),
  diffs: Schema.Array(ParityDiff),
  requests: Schema.Number,
  lastAt: Nullable(Schema.Number),
  lastChanged: Schema.Number,
  latency: Nullable(Schema.Number),
  status: Nullable(Schema.Number),
  failing: Schema.Boolean,
  failure: Nullable(Schema.String),
  note: Nullable(Schema.String),
  regression: Schema.Boolean,
  shadow: Schema.Boolean,
  safetyNet: Schema.Boolean,
  regions: Schema.Number,
  pinned: Schema.Boolean,
  via: Nullable(Schema.String),
  command: Nullable(Schema.String),
  screens: Schema.Array(Schema.String),
})
export type Row = typeof Row.Type

export const LiteralRow = Schema.Struct({
  id: Schema.Number,
  text: Schema.String,
  file: Schema.String,
  line: Schema.Number,
  component: Nullable(Schema.String),
})
export type LiteralRow = typeof LiteralRow.Type

export const Summary = Schema.Struct({
  total: Schema.Number,
  mocked: Schema.Number,
  shadowed: Schema.Number,
  real: Schema.Number,
  retired: Schema.Number,
  unmocked: Schema.Number,
})

export const Snapshot = Schema.Struct({
  project: Schema.String,
  screen: Schema.String,
  now: Schema.Number,
  loaded: Schema.Boolean,
  summary: Summary,
  screenRows: Schema.Array(Row),
  ledgerRows: Schema.Array(Row),
  burndown: Schema.Array(Schema.Number),
  burnRegressions: Schema.Array(Schema.Number),
  literals: Schema.Array(LiteralRow),
  literalsAvailable: Schema.Boolean,
  tiers: Schema.Array(Schema.String),
  stage: Nullable(Schema.String),
  sha: Nullable(Schema.String),
  staleWorkers: Schema.Number,
  overlayOn: Schema.Boolean,
  store: Schema.String,
  sensors: Schema.Boolean,
})
export type Snapshot = typeof Snapshot.Type

export const emptySnapshot: Snapshot = {
  project: "",
  screen: "/",
  now: 0,
  loaded: false,
  summary: { total: 0, mocked: 0, shadowed: 0, real: 0, retired: 0, unmocked: 0 },
  screenRows: [],
  ledgerRows: [],
  burndown: [],
  burnRegressions: [],
  literals: [],
  literalsAvailable: false,
  tiers: [],
  stage: null,
  sha: null,
  staleWorkers: 0,
  overlayOn: true,
  store: "memory",
  sensors: false,
}

export const Inspect = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  key: Schema.String,
  stage: Stage,
  servedBy: ServedBy,
  path: Schema.String,
  match: Schema.Literals(["matched", "inferred"]),
  tier: Schema.String,
  component: Nullable(Schema.String),
  file: Nullable(Schema.String),
  line: Nullable(Schema.Number),
  command: Nullable(Schema.String),
  controllable: Schema.Boolean,
  override: Nullable(ServedBy),
  pinned: Schema.Boolean,
})
export type Inspect = typeof Inspect.Type

export const View = Schema.Literals(["closed", "screen", "ledger", "literals"])
export type View = typeof View.Type
export const Dock = Schema.Literals(["bottom", "right"])
export type Dock = typeof Dock.Type

export const HostCommand = Schema.Union([
  Schema.TaggedStruct("ToggleDrawer", {}),
  Schema.TaggedStruct("ToggleOverlay", {}),
  Schema.TaggedStruct("Escape", {}),
  Schema.TaggedStruct("Copied", {}),
  Schema.TaggedStruct("Restore", { view: View, dock: Dock, size: Schema.Number }),
])
export type HostCommand = typeof HostCommand.Type

export const Action = Schema.Union([
  Schema.TaggedStruct("Flip", { key: Schema.String, to: ServedBy }),
  Schema.TaggedStruct("Shadow", { key: Schema.String, on: Schema.Boolean }),
  Schema.TaggedStruct("SafetyNet", { key: Schema.String, on: Schema.Boolean }),
  Schema.TaggedStruct("Note", { key: Schema.String, text: Schema.String }),
  Schema.TaggedStruct("Pin", { key: Schema.String }),
  Schema.TaggedStruct("Highlight", { key: Nullable(Schema.String) }),
  Schema.TaggedStruct("SetOverlay", { on: Schema.Boolean }),
  Schema.TaggedStruct("SetUi", { view: View, dock: Dock, size: Schema.Number }),
  Schema.TaggedStruct("CopyMarkdown", {}),
  Schema.TaggedStruct("OpenFile", { file: Schema.String, line: Schema.Number }),
  Schema.TaggedStruct("CleanWorkers", {}),
  Schema.TaggedStruct("CloseInspect", {}),
])
export type Action = typeof Action.Type

const stageOrder: Record<Stage, number> = { mocked: 0, shadowed: 1, unmocked: 2, real: 3, retired: 4 }

export interface SnapshotInput {
  readonly state: EngineState
  readonly regionCounts: Readonly<Record<string, number>>
  readonly literals: readonly LiteralHit[]
  readonly now: number
}

export const buildSnapshot = ({ state, regionCounts, literals, now }: SnapshotInput): Snapshot => {
  const { ledger, prefs, session } = state
  const controllable = new Set(state.controllable)
  const regressions = new Set(state.regressions)
  const allKeys = new Set([...Object.keys(ledger.endpoints), ...Object.keys(session)])
  const row = (key: string): Row => {
    const entry = ledger.endpoints[key]
    const live = session[key]
    return {
      key,
      label: entry?.label ?? null,
      stage: entry?.stage ?? "unmocked",
      served: live?.lastServedBy ?? null,
      override: prefs.overrides[key] ?? null,
      controllable: controllable.has(key),
      parity: entry?.parity?.score ?? null,
      diffs: entry?.parity?.diffs ?? [],
      requests: live?.requests ?? 0,
      lastAt: live?.lastAt ?? prefs.lastSeen[key] ?? null,
      lastChanged: entry?.lastChanged ?? 0,
      latency: live?.lastLatency ?? null,
      status: live?.lastStatus ?? null,
      failing: live?.failing ?? false,
      failure: live?.failure ?? null,
      note: entry?.note ?? null,
      regression: regressions.has(key) || (entry?.history.at(-1)?.regression ?? false),
      shadow: prefs.shadow[key] ?? true,
      safetyNet: prefs.safetyNet[key] ?? false,
      regions: regionCounts[key] ?? 0,
      pinned: prefs.pins.includes(key),
      via: live?.via ?? null,
      command: live?.command ?? null,
      screens: entry?.screens ?? [],
    }
  }
  const sortRows = (rows: Row[]) => rows.sort((a, b) => stageOrder[a.stage] - stageOrder[b.stage] || (a.key < b.key ? -1 : 1))
  const onScreen = new Set<string>(state.screenKeys[state.screen] ?? [])
  for (const key of allKeys) if (ledger.endpoints[key]?.screens.includes(state.screen)) onScreen.add(key)
  const points = burndown(ledger)
  const seen = new Set<string>()
  const literalRows: LiteralRow[] = []
  for (const hit of literals) {
    const id = `${hit.literal.file}:${hit.literal.line}:${hit.literal.column}`
    if (seen.has(id)) continue
    seen.add(id)
    literalRows.push({ id: hit.id, text: hit.literal.text, file: hit.literal.file, line: hit.literal.line, component: hit.literal.component ?? null })
  }
  return {
    project: state.project,
    screen: state.screen,
    now,
    loaded: state.loaded,
    summary: summarise(ledger),
    screenRows: sortRows([...onScreen].map(row)),
    ledgerRows: sortRows([...allKeys].map(row)),
    burndown: points.map((point) => point.mocked),
    burnRegressions: points.flatMap((point, index) => (point.regression ? [index] : [])),
    literals: literalRows,
    literalsAvailable: state.source !== undefined,
    tiers: [...state.tiers],
    stage: state.env?.alchemy ? state.env.alchemy.stage : null,
    sha: state.env?.sha ?? null,
    staleWorkers: state.staleWorkers,
    overlayOn: prefs.overlay,
    store: state.storeName,
    sensors: state.inventoryKnown || Object.keys(session).length > 0,
  }
}
