/**
 * Endpoint keys. An endpoint is the unit of migration: `METHOD /path/:param`
 * for HTTP, `RPC Tag` for Effect RPC procedures, `GRAPHQL OperationName` for
 * GraphQL. Mock handlers give us patterns; real requests give us concrete URLs
 * that we reverse-match onto known patterns or bucket heuristically.
 */

export interface KeyPattern {
  readonly key: string
  readonly method: string
  readonly regex: RegExp
  readonly specificity: number
}

const ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/[^/]+/i

/** Strip origin, query and hash, collapse duplicate slashes, drop trailing slash. */
export const normalisePath = (input: string): string => {
  let path = input.replace(ORIGIN, "")
  path = path.split("#")[0]!.split("?")[0]!
  if (!path.startsWith("/")) path = `/${path}`
  path = path.replace(/\/{2,}/g, "/")
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
  return path
}

export const httpKey = (method: string, path: string): string => `${method.toUpperCase()} ${normalisePath(path)}`

export const rpcKey = (tag: string): string => `RPC ${tag}`

export const graphqlKey = (operationName: string): string => `GRAPHQL ${operationName}`

export const parseKey = (key: string): { readonly method: string; readonly path: string } => {
  const space = key.indexOf(" ")
  if (space === -1) return { method: "GET", path: key }
  return { method: key.slice(0, space), path: key.slice(space + 1) }
}

const escape = (value: string) => value.replace(/[.+?^${}()|[\]\\]/g, "\\$&")

/** Compile an MSW-style path pattern (`/users/:id`, `/files/*`) to a matcher. */
export const compilePattern = (key: string): KeyPattern => {
  const { method, path } = parseKey(key)
  const segments = path.split("/").filter(Boolean)
  let specificity = 0
  const parts = segments.map((segment) => {
    if (segment.startsWith(":")) {
      specificity += 1
      return segment.endsWith("?") ? "(?:[^/]+)?" : "[^/]+"
    }
    if (segment === "*") return ".*"
    specificity += 10
    return escape(segment).replace(/\\\*/g, ".*").replace(/\*/g, ".*")
  })
  const regex = new RegExp(`^/${parts.join("/")}/?$`)
  return { key, method, regex, specificity }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LONG_HEX = /^[0-9a-f]{12,}$/i
const NUMERIC = /^\d+$/
const SLUGGISH_ID = /^(?=.*\d)[A-Za-z0-9_-]{8,}$/

/** Replace segments that look like identifiers with `:id`. */
export const bucketPath = (path: string): string =>
  normalisePath(path)
    .split("/")
    .map((segment) => (NUMERIC.test(segment) || UUID.test(segment) || LONG_HEX.test(segment) || SLUGGISH_ID.test(segment) ? ":id" : segment))
    .join("/")

export class KeyResolver {
  private patterns: KeyPattern[] = []

  constructor(keys: Iterable<string> = []) {
    this.setKeys(keys)
  }

  setKeys(keys: Iterable<string>): void {
    this.patterns = [...new Set(keys)]
      .filter((key) => key.includes("/"))
      .map(compilePattern)
      .sort((a, b) => b.specificity - a.specificity)
  }

  addKey(key: string): void {
    if (this.patterns.some((pattern) => pattern.key === key)) return
    this.setKeys([...this.patterns.map((pattern) => pattern.key), key])
  }

  /** Resolve a concrete request to the most specific known pattern, else bucket it. */
  resolve(method: string, url: string): string {
    const upper = method.toUpperCase()
    const path = normalisePath(url)
    for (const pattern of this.patterns) {
      if ((pattern.method === upper || pattern.method === "ALL") && pattern.regex.test(path)) return pattern.key
    }
    return httpKey(upper, bucketPath(path))
  }
}

/** Route path to a screen pattern: `/customers/42?tab=1` becomes `/customers/:id`. */
export const screenOf = (pathname: string, knownScreens: readonly string[] = []): string => {
  const path = normalisePath(pathname)
  for (const screen of knownScreens) {
    if (compilePattern(`GET ${screen}`).regex.test(path)) return screen
  }
  return bucketPath(path)
}
