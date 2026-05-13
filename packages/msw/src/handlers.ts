import type { MockKitClient } from "@mockkit/browser"
import { extractRequest, resolveClient } from "./shared"

export interface WithMockKitHandlerOptions {
  readonly mockkit?: MockKitClient
  readonly label?: string
  readonly scenario?: string
}

export const withMockKitHandler =
  <Args extends readonly unknown[], Result>(
    resourceKey: string,
    resolver: (...args: Args) => Result | Promise<Result>,
    options: WithMockKitHandlerOptions = {},
  ) =>
  async (...args: Args): Promise<Result> => {
    const client = resolveClient(options.mockkit)
    try {
      const result = await resolver(...args)
      const request = extractRequest(args[0])
      client?.record({
        resourceKey,
        label: options.label,
        sourceKind: "mock",
        reason: "Served by MSW handler.",
        request: request
          ? {
              method: request.method,
              url: request.url,
              route: `${request.method} ${safePathname(request.url)}`,
            }
          : undefined,
        metadata: {
          adapter: "msw",
          ...(options.scenario ? { scenario: options.scenario } : {}),
        },
      })
      return result
    } catch (error) {
      client?.record({
        resourceKey,
        label: options.label,
        sourceKind: "error",
        status: "error",
        reason: error instanceof Error ? error.message : "MSW handler failed.",
        metadata: { adapter: "msw", error },
      })
      throw error
    }
  }

const safePathname = (url: string): string => {
  try {
    return new URL(url, "http://mockkit.local").pathname
  } catch {
    return url
  }
}
