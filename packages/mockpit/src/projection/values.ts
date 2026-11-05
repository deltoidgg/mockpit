/**
 * The value index maps display values back to the responses they came from.
 * It is rebuilt from recent responses only and never persisted.
 */
import type { ServedBy } from "../schema/index.js"
import type { Leaf } from "../engine/shape.js"

export interface ValueRef {
  readonly key: string
  readonly requestId: string
  readonly path: string
  readonly servedBy: ServedBy
  readonly at: number
  /** Raw kind of the leaf, used for scoring. */
  readonly kind: "string" | "number" | "boolean" | "date"
  readonly length: number
}

const RESPONSES_PER_KEY = 3
const STOP = new Set(["0", "1", "true", "false", "yes", "no", "active", "inactive", "-", "n/a", "none", "null", "ok", "on", "off", "new"])

export const normaliseString = (value: string): string => value.replace(/\s+/g, " ").trim().toLowerCase()

export const isStopValue = (normalised: string): boolean => normalised.length < 3 || STOP.has(normalised)

const numberKey = (value: number): string => `n:${Math.round(value * 100) / 100}`

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/

const dateFormats = (() => {
  const formats: Intl.DateTimeFormat[] = []
  const locales = [undefined, "en-US", "en-GB"]
  for (const locale of locales) {
    for (const dateStyle of ["short", "medium", "long", "full"] as const) {
      try {
        formats.push(new Intl.DateTimeFormat(locale, { dateStyle, timeZone: "UTC" }))
      } catch {
        // Locale data may be missing in some runtimes.
      }
    }
  }
  return formats
})()

/** All index keys a leaf value can be found under. */
export const leafKeys = (value: string | number | boolean): Array<{ key: string; kind: ValueRef["kind"] }> => {
  if (typeof value === "number") return [{ key: numberKey(value), kind: "number" }]
  if (typeof value === "boolean") return [{ key: `b:${value}`, kind: "boolean" }]
  const keys: Array<{ key: string; kind: ValueRef["kind"] }> = []
  const normalised = normaliseString(value)
  if (normalised) keys.push({ key: `s:${normalised}`, kind: "string" })
  if (ISO_DATE.test(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      for (const format of dateFormats) keys.push({ key: `s:${normaliseString(format.format(date))}`, kind: "date" })
      keys.push({ key: `s:${value.slice(0, 10)}`, kind: "date" })
    }
  }
  const asNumber = Number(value)
  if (value.trim() !== "" && Number.isFinite(asNumber)) keys.push({ key: numberKey(asNumber), kind: "number" })
  return keys
}

const NUMERIC_TEXT = /^[^\d-]{0,4}-?[\d.,\s]+(?:[kKmM%]|[^\d]{0,4})$/

/** Index keys for a piece of visible text. */
export const textKeys = (text: string): string[] => {
  const normalised = normaliseString(text)
  if (!normalised) return []
  const keys = [`s:${normalised}`]
  if (NUMERIC_TEXT.test(normalised)) {
    const percent = normalised.endsWith("%")
    const digits = normalised.replace(/[^\d.,-]/g, "")
    // Treat `1,234.5` and `1.234,5` both; prefer the dot-decimal reading.
    const candidates = new Set<number>()
    const dotDecimal = Number(digits.replace(/,/g, ""))
    if (Number.isFinite(dotDecimal)) candidates.add(dotDecimal)
    const commaDecimal = Number(digits.replace(/\./g, "").replace(",", "."))
    if (Number.isFinite(commaDecimal)) candidates.add(commaDecimal)
    for (const candidate of candidates) {
      keys.push(numberKey(candidate))
      if (percent) keys.push(numberKey(candidate / 100))
    }
  }
  return keys
}

interface ResponseEntry {
  readonly requestId: string
  readonly servedBy: ServedBy
  readonly at: number
  readonly refs: Array<{ indexKey: string; ref: ValueRef }>
}

export class ValueIndex {
  private readonly byKey = new Map<string, ValueRef[]>()
  private readonly responses = new Map<string, ResponseEntry[]>()
  private readonly longStrings = new Map<string, ValueRef[]>()
  version = 0

  add(key: string, requestId: string, servedBy: ServedBy, leaves: readonly Leaf[], at: number): void {
    const refs: Array<{ indexKey: string; ref: ValueRef }> = []
    for (const leaf of leaves) {
      for (const { key: indexKey, kind } of leafKeys(leaf.value)) {
        refs.push({
          indexKey,
          ref: { key, requestId, path: leaf.path, servedBy, at, kind, length: String(leaf.value).length },
        })
      }
    }
    const list = this.responses.get(key) ?? []
    list.push({ requestId, servedBy, at, refs })
    while (list.length > RESPONSES_PER_KEY) list.shift()
    this.responses.set(key, list)
    this.rebuild()
  }

  /** Forget responses for an endpoint, e.g. after it flips. */
  clear(key?: string): void {
    if (key) this.responses.delete(key)
    else this.responses.clear()
    this.rebuild()
  }

  private rebuild(): void {
    this.byKey.clear()
    this.longStrings.clear()
    for (const list of this.responses.values()) {
      for (const response of list) {
        for (const { indexKey, ref } of response.refs) {
          const bucket = this.byKey.get(indexKey)
          if (bucket) bucket.push(ref)
          else this.byKey.set(indexKey, [ref])
          if (ref.kind === "string" && ref.length >= 6 && indexKey.startsWith("s:")) {
            const long = this.longStrings.get(indexKey.slice(2))
            if (long) long.push(ref)
            else this.longStrings.set(indexKey.slice(2), [ref])
          }
        }
      }
    }
    this.version += 1
  }

  lookup(indexKey: string): readonly ValueRef[] {
    return this.byKey.get(indexKey) ?? []
  }

  /** Long string leaves contained in a larger text node. Bounded. */
  contained(normalisedText: string, limit = 3): ValueRef[] {
    if (normalisedText.length < 8 || normalisedText.length > 400) return []
    const found: ValueRef[] = []
    for (const [needle, refs] of this.longStrings) {
      if (needle.length < normalisedText.length && normalisedText.includes(needle)) {
        found.push(...refs)
        if (found.length >= limit) break
      }
    }
    return found
  }

  get size(): number {
    return this.byKey.size
  }

  keys(): string[] {
    return [...this.responses.keys()]
  }
}
