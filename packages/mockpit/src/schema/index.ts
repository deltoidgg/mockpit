/**
 * Schemas for everything MockPit persists or sends across a boundary.
 *
 * The ledger is the only artefact that leaves the browser. It holds key paths,
 * types, counts, timestamps, route patterns, endpoint keys and one-line notes.
 * It never holds response values. Review this file before every change to the
 * ledger shape and bump `LEDGER_VERSION` with a migration in `migrateLedger`.
 */
import { Schema } from "effect"

export const LEDGER_VERSION = 1 as const

/** `GET /api/customers/:id`, `RPC Greet`, `GRAPHQL GetCustomer`. */
export const EndpointKey = Schema.String
export type EndpointKey = typeof EndpointKey.Type

export const stages = ["mocked", "shadowed", "real", "retired", "unmocked"] as const
export const Stage = Schema.Literals(stages)
export type Stage = typeof Stage.Type

export const ServedBy = Schema.Literals(["mock", "real"])
export type ServedBy = typeof ServedBy.Type

export const LeafType = Schema.Literals(["string", "number", "boolean", "null", "object", "array", "unknown"])
export type LeafType = typeof LeafType.Type

/**
 * A flattened JSON shape. `path` uses `$.a.b[].c` notation. `presence` is the
 * fraction of samples (array elements or responses) in which the path existed.
 */
export const ShapeField = Schema.Struct({
  path: Schema.String,
  types: Schema.Array(LeafType),
  presence: Schema.Number,
  emptyArray: Schema.optionalKey(Schema.Boolean),
})
export type ShapeField = typeof ShapeField.Type

export const Shape = Schema.Struct({
  samples: Schema.Number,
  fields: Schema.Array(ShapeField),
})
export type Shape = typeof Shape.Type

export const DiffKind = Schema.Literals(["missing", "type", "nullable", "empty", "extra"])
export type DiffKind = typeof DiffKind.Type

export const ParityDiff = Schema.Struct({
  kind: DiffKind,
  path: Schema.String,
  expected: Schema.optionalKey(Schema.String),
  actual: Schema.optionalKey(Schema.String),
})
export type ParityDiff = typeof ParityDiff.Type

export const Parity = Schema.Struct({
  score: Schema.Number,
  total: Schema.Number,
  present: Schema.Number,
  against: Schema.Literals(["mock", "schema"]),
  diffs: Schema.Array(ParityDiff),
})
export type Parity = typeof Parity.Type

export const HistoryEntry = Schema.Struct({
  at: Schema.Number,
  stage: Stage,
  sha: Schema.optionalKey(Schema.String),
  parity: Schema.optionalKey(Schema.Number),
  regression: Schema.optionalKey(Schema.Boolean),
})
export type HistoryEntry = typeof HistoryEntry.Type

export const LedgerEntry = Schema.Struct({
  label: Schema.optionalKey(Schema.String),
  note: Schema.optionalKey(Schema.String),
  stage: Stage,
  hadHandler: Schema.Boolean,
  firstSeen: Schema.Number,
  lastChanged: Schema.Number,
  screens: Schema.Array(Schema.String),
  mockShape: Schema.optionalKey(Shape),
  realShape: Schema.optionalKey(Shape),
  parity: Schema.optionalKey(Parity),
  history: Schema.Array(HistoryEntry),
})
export type LedgerEntry = typeof LedgerEntry.Type

export const Ledger = Schema.Struct({
  version: Schema.Literal(LEDGER_VERSION),
  project: Schema.String,
  endpoints: Schema.Record(EndpointKey, LedgerEntry),
})
export type Ledger = typeof Ledger.Type

export const emptyLedger = (project: string): Ledger => ({ version: LEDGER_VERSION, project, endpoints: {} })

const decodeLedgerUnknown = Schema.decodeUnknownSync(Ledger)

/** Decode a ledger read from disk or IndexedDB, migrating older versions. */
export const migrateLedger = (raw: unknown, project: string): Ledger => {
  if (raw === null || raw === undefined) return emptyLedger(project)
  const candidate = raw as { version?: unknown }
  if (candidate.version === LEDGER_VERSION) return decodeLedgerUnknown(raw)
  throw new Error(`Unsupported mockpit ledger version: ${String(candidate.version)}`)
}

export const decodeLedger = decodeLedgerUnknown

/** Per-developer, never committed. `.mockpit/local.json` and localStorage. */
export const LocalPrefs = Schema.Struct({
  overrides: Schema.Record(EndpointKey, ServedBy),
  shadow: Schema.Record(EndpointKey, Schema.Boolean),
  safetyNet: Schema.Record(EndpointKey, Schema.Boolean),
  pins: Schema.Array(EndpointKey),
  lastSeen: Schema.Record(EndpointKey, Schema.Number),
  overlay: Schema.Boolean,
  drawer: Schema.Literals(["closed", "screen", "ledger", "literals"]),
  dock: Schema.Literals(["bottom", "right"]),
  drawerSize: Schema.Number,
})
export type LocalPrefs = typeof LocalPrefs.Type

export const defaultLocalPrefs = (): LocalPrefs => ({
  overrides: {},
  shadow: {},
  safetyNet: {},
  pins: [],
  lastSeen: {},
  overlay: true,
  drawer: "closed",
  dock: "bottom",
  drawerSize: 0.4,
})

export const decodeLocalPrefs = (raw: unknown): LocalPrefs => {
  try {
    return Schema.decodeUnknownSync(LocalPrefs)({ ...defaultLocalPrefs(), ...(raw as object) })
  } catch {
    return defaultLocalPrefs()
  }
}

/** A string literal in source that renders as visible text. */
export const Literal = Schema.Struct({
  file: Schema.String,
  line: Schema.Number,
  column: Schema.Number,
  component: Schema.optionalKey(Schema.String),
  text: Schema.String,
})
export type Literal = typeof Literal.Type

export const ComponentLocation = Schema.Struct({
  name: Schema.String,
  file: Schema.String,
  line: Schema.Number,
})
export type ComponentLocation = typeof ComponentLocation.Type

export const SourceManifest = Schema.Struct({
  literals: Schema.Array(Literal),
  components: Schema.Array(ComponentLocation),
})
export type SourceManifest = typeof SourceManifest.Type

/** Facts the Vite plugin knows about the environment the app talks to. */
export const DevEnv = Schema.Struct({
  sha: Schema.optionalKey(Schema.String),
  branch: Schema.optionalKey(Schema.String),
  alchemy: Schema.optionalKey(
    Schema.Struct({
      stack: Schema.String,
      stage: Schema.String,
      workers: Schema.Array(Schema.Struct({ fqn: Schema.String, url: Schema.optionalKey(Schema.String) })),
    }),
  ),
})
export type DevEnv = typeof DevEnv.Type

/** Observations are the engine's event log. The ledger is a fold over them. */
export const Observation = Schema.Union([
  Schema.TaggedStruct("RequestStarted", {
    key: EndpointKey,
    requestId: Schema.String,
    screen: Schema.String,
    at: Schema.Number,
  }),
  Schema.TaggedStruct("Served", {
    key: EndpointKey,
    requestId: Schema.String,
    screen: Schema.String,
    servedBy: ServedBy,
    byChoice: Schema.Boolean,
    status: Schema.Number,
    shape: Schema.optionalKey(Shape),
    via: Schema.Literals(["msw", "fetch", "effect", "manual"]),
    at: Schema.Number,
  }),
  Schema.TaggedStruct("Failed", {
    key: EndpointKey,
    requestId: Schema.String,
    screen: Schema.String,
    reason: Schema.String,
    at: Schema.Number,
  }),
  Schema.TaggedStruct("InventoryChanged", {
    keys: Schema.Array(EndpointKey),
    labels: Schema.Record(EndpointKey, Schema.String),
    at: Schema.Number,
  }),
  Schema.TaggedStruct("Noted", { key: EndpointKey, note: Schema.String, at: Schema.Number }),
])
export type Observation = typeof Observation.Type
