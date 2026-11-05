/**
 * Mounts the overlay: a shadow root holding the paint layer and the Foldkit
 * app. Wires the engine and projection to the app through Ports, and handles
 * the host-only concerns: keyboard shortcuts, Alt-hover inspect, clipboard,
 * open-in-editor, stale service workers.
 */
import { Runtime } from "foldkit"
import type { Engine } from "../engine/engine.js"
import { toMarkdown } from "../engine/report.js"
import { Painter } from "../projection/paint.js"
import { Projection, type Region } from "../projection/scan.js"
import { makeOverlayApp } from "./app.js"
import { type Action, type Inspect, buildSnapshot } from "./snapshot.js"
import { styles } from "./styles.js"

export interface OverlayHandle {
  readonly host: HTMLElement
  readonly projection: Projection
  readonly painter: Painter
  readonly show: () => void
  readonly hide: () => void
  readonly inspect: (on: boolean) => void
  readonly destroy: () => void
}

const HOST_TAG = "mockpit-overlay"

/** Unregister mock service worker registrations left behind by earlier sessions. */
export const cleanWorkers = async (scriptName = "mockServiceWorker.js"): Promise<number> => {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return 0
  let removed = 0
  for (const registration of await navigator.serviceWorker.getRegistrations()) {
    const url = registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? registration.installing?.scriptURL ?? ""
    if (url.endsWith(scriptName) && (await registration.unregister())) removed += 1
  }
  return removed
}

const countStaleWorkers = async (engine: Engine): Promise<number> => {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return 0
  const registrations = await navigator.serviceWorker.getRegistrations()
  const mock = registrations.filter((registration) => (registration.active?.scriptURL ?? "").endsWith("mockServiceWorker.js"))
  // With MSW attached, one registration is expected. Without it, any is stale.
  return engine.getState().tiers.includes("msw") ? Math.max(0, mock.length - 1) : mock.length
}

export const mountOverlay = (engine: Engine): OverlayHandle => {
  const doc = document
  const host = doc.createElement(HOST_TAG)
  host.setAttribute("data-mockpit-ignore", "")
  const shadow = host.attachShadow({ mode: "open" })
  const style = doc.createElement("style")
  style.textContent = styles
  shadow.append(style)
  const painter = new Painter(shadow)
  const container = doc.createElement("div")
  container.id = `mockpit-${Math.random().toString(36).slice(2, 10)}`
  shadow.append(container)
  doc.body.append(host)

  const handle = Runtime.embed(makeOverlayApp(container))
  const projection = new Projection(engine, doc.body, new Set([host]))

  let highlight: string | undefined
  let inspecting = false
  let pinnedCard: Inspect | null = null
  let destroyed = false

  const prefs = engine.getPrefs()
  handle.ports.host.send({ _tag: "Restore", view: prefs.drawer, dock: prefs.dock, size: prefs.drawerSize })

  let frame = 0
  const sync = () => {
    if (frame || destroyed) return
    frame = requestAnimationFrame(() => {
      frame = 0
      const state = engine.getState()
      handle.ports.snapshot.send(buildSnapshot({ state, regionCounts: projection.counts(), literals: projection.literals, now: Date.now() }))
      painter.set({
        regions: projection.regions,
        inventory: new Set(state.inventory),
        overlayOn: state.prefs.overlay,
        highlight,
        pins: state.prefs.pins,
        literals: projection.literals,
        showLiterals: state.prefs.drawer === "literals",
      })
    })
  }

  const unsubscribeEngine = engine.subscribe(sync)
  const unsubscribeProjection = projection.subscribe(sync)
  projection.start()
  sync()

  const cardFor = (region: Region, x: number, y: number, pinned: boolean): Inspect => {
    const state = engine.getState()
    const entry = state.ledger.endpoints[region.key]
    return {
      x: Math.max(8, Math.min(x + 12, innerWidth - 292)),
      y: Math.max(8, Math.min(y + 12, innerHeight - 220)),
      key: region.key,
      stage: entry?.stage ?? "unmocked",
      servedBy: region.servedBy,
      path: region.path,
      match: region.match,
      tier: region.tier,
      component: region.component ?? null,
      file: region.file ?? null,
      line: region.line ?? null,
      command: region.command ?? state.session[region.key]?.command ?? null,
      controllable: state.controllable.includes(region.key),
      override: state.prefs.overrides[region.key] ?? null,
      pinned,
    }
  }

  const regionUnder = (event: MouseEvent): Region | undefined => {
    const exact = projection.regionAt(event.clientX, event.clientY)
    if (exact) return exact
    const target = doc.elementFromPoint(event.clientX, event.clientY)
    return target && !host.contains(target) ? projection.regionNear(target) : undefined
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!inspecting || pinnedCard) return
    const region = regionUnder(event)
    handle.ports.inspect.send(region ? cardFor(region, event.clientX, event.clientY, false) : null)
    const nextHighlight = region?.key
    if (nextHighlight !== highlight) {
      highlight = nextHighlight
      sync()
    }
  }

  const onClick = (event: MouseEvent) => {
    if (!event.altKey || event.composedPath().includes(host)) return
    const region = regionUnder(event)
    if (!region) return
    event.preventDefault()
    event.stopPropagation()
    pinnedCard = cardFor(region, event.clientX, event.clientY, true)
    handle.ports.inspect.send(pinnedCard)
  }

  const stopInspecting = () => {
    inspecting = false
    if (!pinnedCard) {
      handle.ports.inspect.send(null)
      if (highlight) {
        highlight = undefined
        sync()
      }
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey && event.code === "KeyM") {
      event.preventDefault()
      handle.ports.host.send({ _tag: "ToggleDrawer" })
      return
    }
    if (event.altKey && event.code === "KeyX") {
      event.preventDefault()
      handle.ports.host.send({ _tag: "ToggleOverlay" })
      return
    }
    if (event.key === "Escape" && (pinnedCard || engine.getPrefs().drawer !== "closed")) {
      pinnedCard = null
      handle.ports.host.send({ _tag: "Escape" })
      return
    }
    if (event.key === "Alt" && !event.repeat) inspecting = true
  }

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === "Alt") stopInspecting()
  }

  const onBlur = () => stopInspecting()

  window.addEventListener("keydown", onKeyDown, true)
  window.addEventListener("keyup", onKeyUp, true)
  window.addEventListener("blur", onBlur)
  window.addEventListener("pointermove", onPointerMove, { passive: true })
  window.addEventListener("click", onClick, true)

  const onAction = (action: Action) => {
    switch (action._tag) {
      case "Flip":
        void engine.flip(action.key, action.to)
        if (pinnedCard?.key === action.key) {
          pinnedCard = { ...pinnedCard, override: action.to === "real" ? "real" : null }
          handle.ports.inspect.send(pinnedCard)
        }
        return
      case "Shadow":
        void engine.setShadow(action.key, action.on)
        return
      case "SafetyNet":
        void engine.setSafetyNet(action.key, action.on)
        return
      case "Note":
        engine.note(action.key, action.text)
        return
      case "Pin":
        void engine.togglePin(action.key)
        return
      case "Highlight":
        highlight = action.key ?? undefined
        sync()
        return
      case "SetOverlay":
        void engine.setPrefs((prefs) => ({ ...prefs, overlay: action.on }))
        return
      case "SetUi":
        void engine.setPrefs((prefs) => ({ ...prefs, drawer: action.view, dock: action.dock, drawerSize: action.size }))
        return
      case "CopyMarkdown": {
        const text = toMarkdown(engine.getLedger())
        void navigator.clipboard?.writeText(text).then(
          () => handle.ports.host.send({ _tag: "Copied" }),
          () => undefined,
        )
        return
      }
      case "OpenFile":
        void fetch(`/__open-in-editor?file=${encodeURIComponent(`${action.file}:${action.line}`)}`).catch(() => undefined)
        return
      case "CleanWorkers":
        void cleanWorkers().then(() => engine.setStaleWorkers(0))
        return
      case "CloseInspect":
        pinnedCard = null
        handle.ports.inspect.send(null)
        return
    }
  }
  const unsubscribeActions = handle.ports.action.subscribe(onAction)

  // Some apps replace <body> children wholesale; put the host back.
  const reattach = new MutationObserver(() => {
    if (!host.isConnected && !destroyed) doc.body.append(host)
  })
  reattach.observe(doc.body, { childList: true })

  const staleTimer = setTimeout(() => {
    void countStaleWorkers(engine).then((count) => engine.setStaleWorkers(count))
  }, 2500)

  const destroy = () => {
    destroyed = true
    clearTimeout(staleTimer)
    reattach.disconnect()
    unsubscribeEngine()
    unsubscribeProjection()
    unsubscribeActions()
    projection.stop()
    painter.destroy()
    window.removeEventListener("keydown", onKeyDown, true)
    window.removeEventListener("keyup", onKeyUp, true)
    window.removeEventListener("blur", onBlur)
    window.removeEventListener("pointermove", onPointerMove)
    window.removeEventListener("click", onClick, true)
    handle.dispose()
    host.remove()
  }

  return {
    host,
    projection,
    painter,
    show: () => void engine.setPrefs((prefs) => ({ ...prefs, overlay: true })),
    hide: () => void engine.setPrefs((prefs) => ({ ...prefs, overlay: false })),
    inspect: (on) => {
      inspecting = on
      if (!on) stopInspecting()
    },
    destroy,
  }
}
