import type { MockKitClient } from "@mockkit/browser"

export interface CriticalRequest {
  readonly method: string
  readonly url: string
}

export type CriticalMatcher = string | RegExp | ((request: CriticalRequest) => boolean)

export interface MockKitMswOptions {
  readonly mockkit?: MockKitClient
  readonly handlers: readonly unknown[]
  readonly critical?: readonly CriticalMatcher[]
}

export interface StartOptions {
  readonly onUnhandledRequest?: unknown
  readonly [key: string]: unknown
}

export const resolveClient = (client: MockKitClient | undefined): MockKitClient | undefined => {
  if (client) return client
  if (typeof window === "undefined") return undefined
  return window.__MOCKKIT__?.client
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

const safePathname = (url: string): string => {
  try {
    return new URL(url, "http://mockkit.local").pathname
  } catch {
    return url
  }
}
