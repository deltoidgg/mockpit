/**
 * Shapes and leaves. Responses are reduced to a shape (paths and types) for the
 * ledger and a leaf list (path and display value) for the DOM projection, then
 * the values are dropped. Nothing here keeps a reference to the input.
 */
import type { LeafType, Shape, ShapeField } from "../schema/index.js"

export const MAX_ARRAY_SAMPLE = 25
const MAX_DEPTH = 12
const MAX_LEAVES = 4000

const typeOf = (value: unknown): LeafType => {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  switch (typeof value) {
    case "string":
      return "string"
    case "number":
      return "number"
    case "boolean":
      return "boolean"
    case "object":
      return "object"
    default:
      return "unknown"
  }
}

interface Acc {
  seen: number
  types: Set<LeafType>
  emptyArray: boolean
}

/**
 * Extract a shape from one JSON value. Array elements are sampled (first 25)
 * and contribute per-field presence ratios under `path[]`.
 */
export const extractShape = (value: unknown): Shape => {
  const acc = new Map<string, Acc>()
  const touch = (path: string, type: LeafType) => {
    let entry = acc.get(path)
    if (!entry) {
      entry = { seen: 0, types: new Set(), emptyArray: false }
      acc.set(path, entry)
    }
    entry.seen += 1
    entry.types.add(type)
    return entry
  }
  const visit = (node: unknown, path: string, depth: number) => {
    const type = typeOf(node)
    const entry = touch(path, type)
    if (depth > MAX_DEPTH) return
    if (type === "array") {
      const items = (node as unknown[]).slice(0, MAX_ARRAY_SAMPLE)
      if (items.length === 0) entry.emptyArray = true
      for (const item of items) visit(item, `${path}[]`, depth + 1)
    } else if (type === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        if (child !== undefined) visit(child, `${path}.${key}`, depth + 1)
      }
    }
  }
  visit(value, "$", 0)
  return finalise(acc, 1)
}

const finalise = (acc: Map<string, Acc>, samples: number): Shape => {
  // Presence is local: how often the path appears per occurrence of its parent.
  const fields: ShapeField[] = []
  for (const [path, entry] of [...acc].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const parent = parentPath(path)
    const parentSeen = parent ? (acc.get(parent)?.seen ?? 1) : 1
    const presence = parent ? Math.min(1, entry.seen / Math.max(1, parentSeen)) : 1
    fields.push({
      path,
      types: [...entry.types].sort(),
      presence: round(presence),
      ...(entry.emptyArray ? { emptyArray: true } : {}),
    })
  }
  return { samples, fields }
}

export const parentPath = (path: string): string | undefined => {
  if (path === "$") return undefined
  if (path.endsWith("[]")) return path.slice(0, -2)
  const dot = path.lastIndexOf(".")
  return dot === -1 ? undefined : path.slice(0, dot)
}

const round = (value: number) => Math.round(value * 1000) / 1000

/**
 * Merge two shapes from different samples of the same endpoint. Presence is a
 * sample-weighted average. A field absent from one shape counts as absent in
 * that shape's samples, unless its parent was also absent there.
 */
export const mergeShapes = (left: Shape | undefined, right: Shape | undefined): Shape | undefined => {
  if (!left) return right
  if (!right) return left
  const byPath = new Map<string, { l?: ShapeField; r?: ShapeField }>()
  for (const field of left.fields) byPath.set(field.path, { l: field })
  for (const field of right.fields) byPath.set(field.path, { ...byPath.get(field.path), r: field })
  const total = left.samples + right.samples
  const fields: ShapeField[] = []
  for (const [path, { l, r }] of [...byPath].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const types = new Set<LeafType>([...(l?.types ?? []), ...(r?.types ?? [])])
    const presence = ((l?.presence ?? 0) * left.samples + (r?.presence ?? 0) * right.samples) / total
    const emptyArray = (l?.emptyArray ?? false) || (r?.emptyArray ?? false)
    fields.push({ path, types: [...types].sort(), presence: round(presence), ...(emptyArray ? { emptyArray: true } : {}) })
  }
  return { samples: Math.min(total, 1000), fields }
}

export const shapesEqual = (left: Shape | undefined, right: Shape | undefined): boolean =>
  JSON.stringify(left?.fields ?? null) === JSON.stringify(right?.fields ?? null)

export interface Leaf {
  readonly path: string
  readonly value: string | number | boolean
}

/** Collect primitive leaves for the projection index. Bounded in count and depth. */
export const collectLeaves = (value: unknown): Leaf[] => {
  const leaves: Leaf[] = []
  const visit = (node: unknown, path: string, depth: number) => {
    if (leaves.length >= MAX_LEAVES || depth > MAX_DEPTH) return
    if (node === null || node === undefined) return
    if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
      leaves.push({ path, value: node })
      return
    }
    if (Array.isArray(node)) {
      node.slice(0, MAX_ARRAY_SAMPLE * 4).forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1))
      return
    }
    if (typeof node === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) visit(child, `${path}.${key}`, depth + 1)
    }
  }
  visit(value, "$", 0)
  return leaves
}

/** `$.customers[3].name` to the shape path `$.customers[].name`. */
export const toShapePath = (leafPath: string): string => leafPath.replace(/\[\d+\]/g, "[]")
