import type { MockPitClient } from "@mockpit/browser"
import type { AnyHandler } from "msw"
import type { SetupWorker, StartOptions } from "msw/browser"
import {
  extractRequest,
  isCriticalRequest,
  recordCriticalUnhandledRequest,
  type CriticalMatcher,
} from "./shared"

export interface SetupMockPitWorkerOptions {
  readonly mockpit?: MockPitClient
  readonly handlers: readonly AnyHandler[]
  readonly critical?: readonly CriticalMatcher[]
}

export const setupMockPitWorker = async ({
  mockpit,
  handlers,
  critical = [],
}: SetupMockPitWorkerOptions): Promise<SetupWorker> => {
  const { setupWorker } = await import("msw/browser")
  const worker = setupWorker(...handlers)
  const originalStart = worker.start.bind(worker)
  const originalStop = worker.stop?.bind(worker)

  return {
    ...worker,
    start(options?: StartOptions) {
      const startOptions = options ?? {}
      mockpit?.setTransportState({
        mockTransportActive: true,
        cleanupRequired: false,
        requiresReload: false,
      })
      return originalStart({
        ...startOptions,
        onUnhandledRequest(request, print) {
          const criticalRequest = extractRequest(request)
          if (criticalRequest && isCriticalRequest(criticalRequest, critical)) {
            recordCriticalUnhandledRequest(mockpit, criticalRequest)
          }

          if (typeof startOptions.onUnhandledRequest === "function") {
            return startOptions.onUnhandledRequest(request, print)
          }
          if (startOptions.onUnhandledRequest === "error") print.error()
          if (startOptions.onUnhandledRequest === "warn" || !startOptions.onUnhandledRequest) {
            print.warning()
          }
          return undefined
        },
      })
    },
    stop() {
      mockpit?.setTransportState({
        mockTransportActive: false,
        cleanupRequired: true,
        requiresReload: true,
      })
      return originalStop?.()
    },
  }
}
