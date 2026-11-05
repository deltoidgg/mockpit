/**
 * mockpit: see what is still mock, watch it become real.
 *
 *   import { start } from "mockpit"
 *   import { attach } from "mockpit/msw"
 *   start()
 *   attach(worker)
 */
import { type Engine, getEngine } from "./engine/engine.js"
import type { Ledger, ServedBy } from "./schema/index.js"
import { getOverlay, start } from "./start.js"

export { start, stop, getOverlay, isDevelopment, type StartOptions } from "./start.js"
export { Engine, getEngine, resetEngine, VERSION, type EngineOptions, type EngineState, type SessionEndpoint, type Controls, type ServedInput, type Via } from "./engine/engine.js"
export { installFetchSensor, claimRequests, isClaimed } from "./engine/fetch-sensor.js"
export { KeyResolver, httpKey, rpcKey, graphqlKey, normalisePath, bucketPath, screenOf } from "./engine/key.js"
export { extractShape, collectLeaves, mergeShapes } from "./engine/shape.js"
export { computeParity } from "./engine/parity.js"
export { foldObservation, foldAll, deriveStage, summarise, mergeLedgers, serialiseLedger, isRegression } from "./engine/ledger.js"
export { toMarkdown, diffLedgers, burndown, checkLedger, stillMock } from "./engine/report.js"
export { LedgerStore, memoryLedgerStore, indexedDbLedgerStore, devServerLedgerStore, layeredLedgerStore } from "./engine/store.js"
export { ValueIndex } from "./projection/values.js"
export { Projection, scan, type Region, type Refiner, type RefineInput, type RefineResult, type Attribution } from "./projection/scan.js"
export { cleanWorkers } from "./overlay/mount.js"
export * from "./schema/index.js"

/** A sensor installs itself on the engine and returns a detach function. */
export type Sensor = (engine: Engine) => () => void

/** The facade from the spec. Everything here is also available as a named export. */
export const mockpit = {
  start,
  attach: (sensor: Sensor): (() => void) => sensor(getEngine()),
  flip: (key: string, to: ServedBy): Promise<void> => getEngine().flip(key, to),
  note: async (key: string, text: string): Promise<void> => getEngine().note(key, text),
  ledger: async (): Promise<Ledger> => {
    const engine = getEngine()
    await engine.ready
    return engine.getLedger()
  },
  subscribe: (listener: (ledger: Ledger) => void): (() => void) => getEngine().subscribe((state) => listener(state.ledger)),
  /** Report an observation from a transport MockPit has no sensor for. */
  record: (input: { key: string; servedBy: ServedBy; body?: unknown; status?: number }): void => {
    const engine = getEngine()
    const requestId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    engine.requestStarted(input.key, requestId)
    engine.served({ key: input.key, requestId, servedBy: input.servedBy, status: input.status ?? 200, body: input.body, via: "manual" })
  },
  overlay: {
    show: () => getOverlay()?.show(),
    hide: () => getOverlay()?.hide(),
    inspect: (on: boolean) => getOverlay()?.inspect(on),
  },
}

export default mockpit
