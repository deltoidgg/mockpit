import type { MockKitClient } from "@mockkit/browser"
import { extractRequest, isCriticalRequest, type CriticalMatcher, type StartOptions } from "./shared"

export interface SetupMockKitWorkerOptions {
  readonly mockkit?: MockKitClient
  readonly handlers: readonly unknown[]
  readonly critical?: readonly CriticalMatcher[]
}

export const setupMockKitWorker = async ({
  mockkit,
  handlers,
  critical = [],
}: SetupMockKitWorkerOptions): Promise<any> => {
  const { setupWorker } = await import("msw/browser")
  const worker = setupWorker(...(handlers as any[]))
  const originalStart = worker.start.bind(worker)

  return {
    ...worker,
    start(options: StartOptions = {}) {
      return originalStart({
        ...options,
        onUnhandledRequest(request: unknown, print: unknown) {
          const criticalRequest = extractRequest(request)
          if (criticalRequest && isCriticalRequest(criticalRequest, critical)) {
            mockkit?.record({
              resourceKey: `transport.${criticalRequest.method}.${criticalRequest.url}`,
              label: "Unhandled critical mock request",
              sourceKind: "unknown",
              status: "blocked",
              reason: "Critical request was not handled by mock transport.",
              request: {
                method: criticalRequest.method,
                url: criticalRequest.url,
                route: `${criticalRequest.method} ${criticalRequest.url}`,
              },
              metadata: { adapter: "msw" },
            })
          }

          if (typeof options.onUnhandledRequest === "function") {
            return (options.onUnhandledRequest as (request: unknown, print: unknown) => unknown)(
              request,
              print,
            )
          }
          return undefined
        },
      })
    },
  }
}
