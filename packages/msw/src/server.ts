import type { MockPitClient } from "@mockpit/browser"
import type { AnyHandler } from "msw"
import type { SetupServer } from "msw/node"
import {
  extractRequest,
  isCriticalRequest,
  recordCriticalUnhandledRequest,
  type CriticalMatcher,
} from "./shared"

export interface SetupMockPitServerOptions {
  readonly mockpit?: MockPitClient
  readonly handlers: readonly AnyHandler[]
  readonly critical?: readonly CriticalMatcher[]
}

type ListenOptions = NonNullable<Parameters<SetupServer["listen"]>[0]>

export const setupMockPitServer = async ({
  mockpit,
  handlers,
  critical = [],
}: SetupMockPitServerOptions): Promise<SetupServer> => {
  const { setupServer } = await import("msw/node")
  const server = setupServer(...handlers)
  const originalListen = server.listen.bind(server)
  const originalClose = server.close.bind(server)

  return {
    ...server,
    listen(options?: ListenOptions) {
      const listenOptions = options ?? {}
      mockpit?.setTransportState({
        mockTransportActive: true,
        cleanupRequired: false,
        requiresReload: false,
      })
      return originalListen({
        ...listenOptions,
        onUnhandledRequest(request, print) {
          const criticalRequest = extractRequest(request)
          if (criticalRequest && isCriticalRequest(criticalRequest, critical)) {
            recordCriticalUnhandledRequest(mockpit, criticalRequest)
          }

          if (typeof listenOptions.onUnhandledRequest === "function") {
            return listenOptions.onUnhandledRequest(request, print)
          }
          if (listenOptions.onUnhandledRequest === "error") print.error()
          if (listenOptions.onUnhandledRequest === "warn" || !listenOptions.onUnhandledRequest) {
            print.warning()
          }
          return undefined
        },
      })
    },
    close() {
      mockpit?.setTransportState({
        mockTransportActive: false,
        cleanupRequired: false,
        requiresReload: false,
      })
      return originalClose()
    },
  }
}
