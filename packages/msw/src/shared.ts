import type { MockPitClient } from "@mockpit/browser"
import type { AnyHandler } from "msw"

export interface CriticalRequest {
  readonly method: string
  readonly url: string
}

export type CriticalMatcher = string | RegExp | ((request: CriticalRequest) => boolean)

export interface MockPitMswOptions {
  readonly mockpit?: MockPitClient
  readonly handlers: readonly AnyHandler[]
  readonly critical?: readonly CriticalMatcher[]
}

export const resolveClient = (client: MockPitClient | undefined): MockPitClient | undefined => {
  if (client) return client
  if (typeof window === "undefined") return undefined
  return window.__MOCKPIT__?.client
}

export const extractRequest = (value: unknown): CriticalRequest | undefined => {
  const candidate = value as { request?: Request; method?: string; url?: string } | undefined
  const request = candidate?.request ?? (value instanceof Request ? value : undefined)
  if (request) {
    return {
      method: request.method.toUpperCase(),
      url: request.url,
    }
  }
  if (candidate?.method && candidate.url) {
    return {
      method: candidate.method.toUpperCase(),
      url: candidate.url,
    }
  }
  return undefined
}

export const isCriticalRequest = (
  request: CriticalRequest,
  critical: readonly CriticalMatcher[] = [],
): boolean => {
  const pathname = safePathname(request.url)
  const route = `${request.method} ${pathname}`
  const fullRoute = `${request.method} ${request.url}`

  return critical.some((matcher) => {
    if (typeof matcher === "function") return matcher(request)
    if (matcher instanceof RegExp) return matcher.test(route) || matcher.test(fullRoute)
    return matcher === route || matcher === fullRoute
  })
}

export const recordCriticalUnhandledRequest = (
  mockpit: MockPitClient | undefined,
  request: CriticalRequest,
): void => {
  const record = mockpit?.recordTransportIssue({
    resourceKey: `transport.${request.method}.${request.url}`,
    label: "Unhandled critical mock request",
    sourceKind: "unknown",
    status: "blocked",
    reason: "Critical request was not handled by mock transport.",
    request: {
      method: request.method,
      url: request.url,
      route: `${request.method} ${request.url}`,
    },
    metadata: { adapter: "msw" },
  })
  if (!record || !mockpit) return
  mockpit.setTransportState({
    issues: [...(mockpit.getTransportState().issues ?? []), record],
  })
}

const safePathname = (url: string): string => {
  try {
    return new URL(url, "http://mockpit.local").pathname
  } catch {
    return url
  }
}
