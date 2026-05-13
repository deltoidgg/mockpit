import { Context, Effect } from "effect"
import type { AuditRecord } from "./model"

export interface AuditStoreService {
  readonly put: (record: AuditRecord) => void
  readonly remove: (id: string) => void
  readonly snapshot: () => readonly AuditRecord[]
  readonly subscribe: (listener: () => void) => () => void
  readonly clear: () => void
}

export const AuditStore = Context.GenericTag<AuditStoreService>("@mockpit/core/AuditStore")

export const createMemoryAuditStore = (): AuditStoreService => {
  const records = new Map<string, AuditRecord>()
  const listeners = new Set<() => void>()

  const notify = () => {
    for (const listener of listeners) listener()
  }

  return {
    put(record) {
      records.set(record.id, record)
      notify()
    },
    remove(id) {
      records.delete(id)
      notify()
    },
    snapshot() {
      return Array.from(records.values()).sort((left, right) =>
        left.updatedAt.localeCompare(right.updatedAt),
      )
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    clear() {
      records.clear()
      notify()
    },
  }
}

export const makeAuditStore = Effect.sync(createMemoryAuditStore)
