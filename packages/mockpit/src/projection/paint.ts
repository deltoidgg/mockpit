/**
 * The paint layer: a fixed SVG above the app, pointer-events none, that
 * hatches regions served by a mock and outlines regions served by the real
 * backend while a mock still exists. Real is silent. The app's DOM and styles
 * are never touched.
 */
import { type Region, rectsOf } from "./scan.js"

const SVG = "http://www.w3.org/2000/svg"
const PAD = 2

export interface PaintState {
  readonly regions: readonly Region[]
  /** Endpoint keys that currently have a mock. */
  readonly inventory: ReadonlySet<string>
  readonly overlayOn: boolean
  readonly highlight: string | undefined
  readonly pins: readonly string[]
  readonly literals: readonly { readonly id: number; readonly node: Text }[]
  readonly showLiterals: boolean
}

type Kind = "mock" | "shadow" | "real"

const kindOf = (region: Region, inventory: ReadonlySet<string>): Kind => {
  if (region.servedBy === "mock") return "mock"
  return inventory.has(region.key) ? "shadow" : "real"
}

export class Painter {
  readonly svg: SVGSVGElement
  private readonly layer: SVGGElement
  private readonly groups = new Map<string, SVGGElement>()
  private state: PaintState = { regions: [], inventory: new Set(), overlayOn: true, highlight: undefined, pins: [], literals: [], showLiterals: false }
  private frame = 0
  private readonly onScroll = () => this.request()

  constructor(parent: ShadowRoot | Element) {
    const doc = (parent as ShadowRoot).ownerDocument ?? (parent as Element).ownerDocument
    this.svg = doc.createElementNS(SVG, "svg")
    this.svg.setAttribute("class", "mp-paint")
    this.svg.setAttribute("aria-hidden", "true")
    this.svg.innerHTML = `<defs>
      <pattern id="mp-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
        <rect width="6" height="6" class="mp-hatch-tint"/>
        <line x1="0" y1="0" x2="0" y2="6" class="mp-hatch-line"/>
      </pattern>
    </defs>`
    this.layer = doc.createElementNS(SVG, "g")
    this.svg.append(this.layer)
    parent.append(this.svg)
    const win = doc.defaultView
    win?.addEventListener("scroll", this.onScroll, { capture: true, passive: true })
    win?.addEventListener("resize", this.onScroll, { passive: true })
  }

  destroy(): void {
    const win = this.svg.ownerDocument.defaultView
    win?.removeEventListener("scroll", this.onScroll, { capture: true })
    win?.removeEventListener("resize", this.onScroll)
    if (this.frame) cancelAnimationFrame(this.frame)
    this.svg.remove()
  }

  set(state: PaintState): void {
    this.state = state
    this.request()
  }

  request(): void {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.paint()
    })
  }

  /** Paint synchronously. */
  paint(): void {
    const { regions, inventory, overlayOn, highlight, pins, literals, showLiterals } = this.state
    const seen = new Set<string>()
    const pinned = new Set(pins)
    const viewport = { width: innerWidth, height: innerHeight }

    for (const region of regions) {
      const kind = kindOf(region, inventory)
      const isHighlight = highlight === region.key
      const isPinned = pinned.has(region.key)
      const visible = (overlayOn && kind !== "real") || isHighlight || isPinned
      if (!visible) continue
      const rects = rectsOf(region.node).filter((rect) => rect.bottom >= 0 && rect.top <= viewport.height && rect.right >= 0 && rect.left <= viewport.width)
      if (rects.length === 0) continue
      const id = `r${region.id}`
      seen.add(id)
      const group = this.group(id)
      const classes = ["mp-region", `mp-${kind}`]
      if (isHighlight) classes.push("mp-highlight")
      if (isPinned) classes.push("mp-pinned")
      group.setAttribute("class", classes.join(" "))
      group.dataset["key"] = region.key
      this.drawRects(group, rects)
      if (isPinned) this.drawLabel(group, rects[0]!, region.key)
      else group.querySelector("text")?.remove()
    }

    if (showLiterals) {
      for (const literal of literals) {
        const rects = rectsOf(literal.node)
        if (rects.length === 0) continue
        const id = `l${literal.id}`
        seen.add(id)
        const group = this.group(id)
        group.setAttribute("class", "mp-region mp-literal")
        this.drawRects(group, rects)
      }
    }

    for (const [id, group] of this.groups) {
      if (!seen.has(id)) {
        group.remove()
        this.groups.delete(id)
      }
    }
  }

  private group(id: string): SVGGElement {
    let group = this.groups.get(id)
    if (!group) {
      group = this.svg.ownerDocument.createElementNS(SVG, "g")
      group.classList.add("mp-new")
      this.layer.append(group)
      this.groups.set(id, group)
    }
    return group
  }

  private drawRects(group: SVGGElement, rects: readonly DOMRect[]): void {
    const existing = Array.from(group.querySelectorAll("rect"))
    rects.forEach((rect, index) => {
      let element = existing[index]
      if (!element) {
        element = this.svg.ownerDocument.createElementNS(SVG, "rect")
        group.prepend(element)
      }
      element.setAttribute("x", String(Math.round(rect.left - PAD)))
      element.setAttribute("y", String(Math.round(rect.top - PAD)))
      element.setAttribute("width", String(Math.round(rect.width + PAD * 2)))
      element.setAttribute("height", String(Math.round(rect.height + PAD * 2)))
    })
    for (const extra of existing.slice(rects.length)) extra.remove()
  }

  private drawLabel(group: SVGGElement, rect: DOMRect, key: string): void {
    let text = group.querySelector("text")
    if (!text) {
      text = this.svg.ownerDocument.createElementNS(SVG, "text")
      text.setAttribute("class", "mp-pin-label")
      group.append(text)
    }
    text.textContent = key
    text.setAttribute("x", String(Math.round(rect.left - PAD)))
    text.setAttribute("y", String(Math.max(10, Math.round(rect.top - PAD - 4))))
  }
}
