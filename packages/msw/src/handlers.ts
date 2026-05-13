import type { MockPitClient } from "@mockpit/browser"
import { extractRequest, resolveClient } from "./shared"

export interface WithMockPitHandlerOptions {
  readonly mockpit?: MockPitClient
  readonly label?: string
  readonly scenario?: string
  readonly method?: string
  readonly url?: string
}

export const withMockPitHandler =
  <Args extends readonly unknown[], Result>(
    resourceKey: string,
    resolver: (...args: Args) => Result | Promise<Result>,
    options: WithMockPitHandlerOptions = {},
  ) =>
  async (...args: Args): Promise<Result> => {
    const client = resolveClient(options.mockpit)
    try {
      const result = await resolver(...args)
      const request = extractRequest(args[0])
      client?.record({
        resourceKey,
        label: options.label,
        sourceKind: "mock",
        reason: "Served by MSW handler.",
        recordedBy: "msw",
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
      client?.setTransportState({
        mockTransportActive: true,
        handlers: [
          ...(client.getTransportState().handlers ?? []),
          {
            resourceKey,
            method: options.method ?? request?.method,
            url: options.url ?? request?.url,
            label: options.label,
            scenario: options.scenario,
          },
        ],
      })
      return tagMockResponse(result)
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
    return new URL(url, "http://mockpit.local").pathname
  } catch {
    return url
  }
}

const tagMockResponse = <Result>(result: Result): Result => {
  if (typeof Response === "undefined" || !(result instanceof Response)) return result
  const headers = new Headers(result.headers)
  headers.set("x-mockpit-source", "mock")
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers,
  }) as Result
}
