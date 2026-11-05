/**
 * Persistence, as Effect services. The ledger is read once at start and
 * written (debounced) on change. With the Vite plugin the repo file is the
 * source of truth; IndexedDB keeps it across reloads without the plugin.
 */
import { Context, Effect, Layer } from "effect"
import { type Ledger, type LocalPrefs, decodeLocalPrefs, defaultLocalPrefs, migrateLedger } from "../schema/index.js"

export interface LedgerStoreShape {
  readonly name: string
  readonly read: Effect.Effect<Ledger | undefined>
  readonly write: (ledger: Ledger) => Effect.Effect<void>
}

export class LedgerStore extends Context.Service<LedgerStore, LedgerStoreShape>()("mockpit/LedgerStore") {}

export const memoryLedgerStore = (initial?: Ledger): Layer.Layer<LedgerStore> => {
  let current = initial
  return Layer.succeed(LedgerStore, {
    name: "memory",
    read: Effect.sync(() => current),
    write: (ledger) =>
      Effect.sync(() => {
        current = ledger
      }),
  })
}

const DB_NAME = "mockpit"
const DB_STORE = "ledger"

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const idbRequest = <A>(run: (store: IDBObjectStore) => IDBRequest<A>, mode: IDBTransactionMode): Promise<A> =>
  openDb().then(
    (db) =>
      new Promise<A>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, mode)
        const request = run(tx.objectStore(DB_STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        tx.oncomplete = () => db.close()
      }),
  )

export const indexedDbLedgerStore = (project: string): Layer.Layer<LedgerStore> => {
  const id = `${project}@${typeof location === "undefined" ? "" : location.origin}`
  return Layer.succeed(LedgerStore, {
    name: "indexeddb",
    read: Effect.promise(() => idbRequest((store) => store.get(id), "readonly")).pipe(
      Effect.map((raw) => (raw ? migrateLedger(raw, project) : undefined)),
      Effect.catchCause(() => Effect.succeed(undefined)),
    ),
    write: (ledger) =>
      Effect.promise(() => idbRequest((store) => store.put(ledger, id), "readwrite")).pipe(
        Effect.asVoid,
        Effect.catchCause(() => Effect.void),
      ),
  })
}

export const DEV_SERVER_BASE = "/__mockpit"

/** Talks to the Vite plugin, which owns `.mockpit/ledger.json`. */
export const devServerLedgerStore = (project: string, base = DEV_SERVER_BASE): Layer.Layer<LedgerStore> =>
  Layer.succeed(LedgerStore, {
    name: "dev-server",
    read: Effect.promise(async () => {
      const response = await fetch(`${base}/ledger`, { headers: { accept: "application/json" } })
      if (response.status === 204) return undefined
      if (!response.ok) throw new Error(`ledger read ${response.status}`)
      return migrateLedger(await response.json(), project)
    }),
    write: (ledger) =>
      Effect.promise(() => {
        const body = JSON.stringify(ledger)
        // keepalive lets the last write survive navigation; browsers cap it at 64 KB.
        return fetch(`${base}/ledger`, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: body.length < 60_000 })
      }).pipe(Effect.asVoid, Effect.catchCause(() => Effect.void)),
  })

/** Read from the first store that has a ledger; write to all of them. */
export const layeredLedgerStore = (stores: ReadonlyArray<LedgerStoreShape>): Layer.Layer<LedgerStore> =>
  Layer.succeed(LedgerStore, {
    name: stores.map((store) => store.name).join("+"),
    read: Effect.gen(function* () {
      for (const store of stores) {
        const ledger = yield* store.read.pipe(Effect.catchCause(() => Effect.succeed(undefined)))
        if (ledger) return ledger
      }
      return undefined
    }),
    write: (ledger) => Effect.forEach(stores, (store) => store.write(ledger), { concurrency: "unbounded", discard: true }),
  })

export const buildStore = (layer: Layer.Layer<LedgerStore>): Promise<LedgerStoreShape> =>
  Effect.runPromise(Effect.provide(Effect.gen(function* () { return yield* LedgerStore }), layer))

/** Detect the Vite plugin. Resolves false quickly when it is absent. */
export const hasDevServer = async (base = DEV_SERVER_BASE): Promise<boolean> => {
  if (typeof fetch === "undefined" || typeof location === "undefined") return false
  try {
    const response = await fetch(`${base}/ping`, { headers: { accept: "application/json" } })
    return response.ok && (await response.text()).includes("mockpit")
  } catch {
    return false
  }
}

export const defaultLedgerStore = async (project: string): Promise<Layer.Layer<LedgerStore>> => {
  const stores: LedgerStoreShape[] = []
  if (await hasDevServer()) stores.push(await buildStore(devServerLedgerStore(project)))
  if (typeof indexedDB !== "undefined") stores.push(await buildStore(indexedDbLedgerStore(project)))
  if (stores.length === 0) return memoryLedgerStore()
  return layeredLedgerStore(stores)
}

const PREFS_KEY = (project: string) => `mockpit:${project}:local`

export const hasStoredPrefs = (project: string): boolean => {
  try {
    return typeof window !== "undefined" && typeof localStorage !== "undefined" && localStorage.getItem(PREFS_KEY(project)) !== null
  } catch {
    return false
  }
}

/** Local prefs are read synchronously so overrides apply before the first request. */
export const readLocalPrefs = (project: string): LocalPrefs => {
  try {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return defaultLocalPrefs()
    const raw = localStorage.getItem(PREFS_KEY(project))
    return raw ? decodeLocalPrefs(JSON.parse(raw)) : defaultLocalPrefs()
  } catch {
    return defaultLocalPrefs()
  }
}

export const writeLocalPrefs = (project: string, prefs: LocalPrefs, devServer: boolean): void => {
  try {
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") localStorage.setItem(PREFS_KEY(project), JSON.stringify(prefs))
  } catch {
    // Storage may be full or disabled; prefs are a convenience.
  }
  if (devServer && typeof fetch !== "undefined") {
    void fetch(`${DEV_SERVER_BASE}/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(prefs) }).catch(
      () => undefined,
    )
  }
}
