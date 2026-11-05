/**
 * Fallback sensor for apps without MSW: wraps `fetch` and `XMLHttpRequest` in
 * dev so the ledger still learns what each screen loads. With no inventory
 * every endpoint is `unmocked`. When the MSW sensor is attached it owns
 * observation and this sensor stands aside.
 */
import type { Engine } from "./engine.js"

export type Claim = (method: string, url: string) => boolean

const claims = new Set<Claim>()

/** Let an adapter (Effect RPC) take over observation of matching requests. */
export const claimRequests = (claim: Claim): (() => void) => {
  claims.add(claim)
  return () => claims.delete(claim)
}

export const isClaimed = (method: string, url: string): boolean => {
  for (const claim of claims) if (claim(method, url)) return true
  return false
}

const IGNORED = /\/(?:@vite|@id|@fs|node_modules|__mockpit|src)\/|mockServiceWorker\.js|\.(?:m?js|tsx?|css|map|svg|png|jpe?g|gif|webp|ico|woff2?)(?:\?|$)/

const MAX = 256 * 1024
let counter = 0
const nextId = () => `f${Date.now().toString(36)}${(counter++).toString(36)}`

const readBody = async (response: Response): Promise<unknown> => {
  if (!(response.headers.get("content-type") ?? "").includes("json")) return undefined
  try {
    const text = await response.clone().text()
    return text && text.length <= MAX ? JSON.parse(text) : undefined
  } catch {
    return undefined
  }
}

export const installFetchSensor = (engine: Engine): (() => void) => {
  if (typeof globalThis.fetch !== "function") return () => undefined
  const mswActive = () => engine.getState().tiers.includes("msw")
  const original = globalThis.fetch
  const wrapped: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : undefined
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
    const url = request?.url ?? String(input instanceof URL ? input.href : input)
    if (IGNORED.test(url) || isClaimed(method, url) || mswActive()) return original(input, init)
    const requestId = nextId()
    const started = Date.now()
    const key = engine.keys.resolve(method, url)
    try {
      const response = await original(input, init)
      if ((response.headers.get("content-type") ?? "").includes("json")) {
        engine.requestStarted(key, requestId, absolute(url))
        const body = await readBody(response)
        engine.served({ key, requestId, servedBy: sourceOf(response), status: response.status, body, via: "fetch", latency: Date.now() - started })
      }
      return response
    } catch (error) {
      engine.failed(key, requestId, error instanceof Error ? error.message : String(error))
      throw error
    }
  }
  globalThis.fetch = wrapped

  const uninstallXhr = installXhrSensor(engine, mswActive)
  return () => {
    if (globalThis.fetch === wrapped) globalThis.fetch = original
    uninstallXhr()
  }
}

/** Responses from tools that mark themselves (`x-mockpit-source: mock`) count as mock. */
const sourceOf = (response: Response) => (response.headers.get("x-mockpit-source") === "mock" ? "mock" : "real")

const absolute = (url: string) => {
  try {
    return new URL(url, typeof location === "undefined" ? "http://localhost" : location.href).href
  } catch {
    return url
  }
}

const installXhrSensor = (engine: Engine, mswActive: () => boolean): (() => void) => {
  if (typeof XMLHttpRequest === "undefined") return () => undefined
  const proto = XMLHttpRequest.prototype
  const open = proto.open
  const send = proto.send
  const meta = new WeakMap<XMLHttpRequest, { method: string; url: string }>()
  proto.open = function patchedOpen(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    meta.set(this, { method: method.toUpperCase(), url: String(url) })
    return (open as (...args: unknown[]) => void).call(this, method, url, ...rest)
  } as typeof proto.open
  proto.send = function patchedSend(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const info = meta.get(this)
    if (info && !IGNORED.test(info.url) && !isClaimed(info.method, info.url) && !mswActive()) {
      const requestId = nextId()
      const started = Date.now()
      const key = engine.keys.resolve(info.method, info.url)
      this.addEventListener("loadend", () => {
        if (this.status === 0) {
          engine.failed(key, requestId, "network error")
          return
        }
        if (!(this.getResponseHeader("content-type") ?? "").includes("json")) return
        let parsed: unknown
        try {
          parsed = this.responseType === "json" ? this.response : this.responseType === "" || this.responseType === "text" ? JSON.parse(this.responseText) : undefined
        } catch {
          parsed = undefined
        }
        engine.requestStarted(key, requestId, absolute(info.url))
        engine.served({
          key,
          requestId,
          servedBy: this.getResponseHeader("x-mockpit-source") === "mock" ? "mock" : "real",
          status: this.status,
          body: parsed,
          via: "fetch",
          latency: Date.now() - started,
        })
      })
    }
    return send.call(this, body)
  }
  return () => {
    proto.open = open
    proto.send = send
  }
}
