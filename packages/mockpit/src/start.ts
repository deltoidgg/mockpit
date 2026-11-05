/**
 * Start MockPit in the browser: engine, fallback fetch sensor and overlay.
 * Idempotent. In production builds it does nothing unless `enable: true`.
 */
import { type Engine, type EngineOptions, getEngine } from "./engine/engine.js"
import { installFetchSensor } from "./engine/fetch-sensor.js"
import { type OverlayHandle, mountOverlay } from "./overlay/mount.js"

export interface StartOptions extends EngineOptions {
  /** Force on (or off). Defaults to on in development builds. */
  readonly enable?: boolean
  /** Mount the strip, drawer and paint layer. Default true. */
  readonly overlay?: boolean
  /** Wrap fetch and XHR when no MSW worker is attached. Default true. */
  readonly fetchSensor?: boolean
}

export const isDevelopment = (): boolean => {
  const env = (import.meta as unknown as { env?: { DEV?: boolean; PROD?: boolean } }).env
  if (env && typeof env.DEV === "boolean") return env.DEV
  const node = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.["NODE_ENV"]
  return node !== "production"
}

let overlay: OverlayHandle | undefined
let uninstallFetch: (() => void) | undefined

export const start = (options: StartOptions = {}): Engine | undefined => {
  if (!(options.enable ?? isDevelopment())) return undefined
  const engine = getEngine(options)
  if (typeof window === "undefined") return engine
  if ((options.fetchSensor ?? true) && !uninstallFetch) uninstallFetch = installFetchSensor(engine)
  if ((options.overlay ?? true) && !overlay) {
    const mount = () => {
      if (!overlay) overlay = mountOverlay(engine)
    }
    if (document.body) mount()
    else document.addEventListener("DOMContentLoaded", mount, { once: true })
  }
  return engine
}

export const getOverlay = (): OverlayHandle | undefined => overlay

/** Remove the overlay and sensors. Tests and HMR. */
export const stop = (): void => {
  overlay?.destroy()
  overlay = undefined
  uninstallFetch?.()
  uninstallFetch = undefined
}
