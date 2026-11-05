/**
 * Parity: how much of the expected shape (from the mock, or from a Schema) the
 * real response satisfies. Extra fields in the real response are reported but
 * never penalised.
 */
import type { LeafType, Parity, ParityDiff, Shape, ShapeField } from "../schema/index.js"
import { parentPath } from "./shape.js"

const PRESENCE_THRESHOLD = 0.5

const compatible = (expected: readonly LeafType[], actual: readonly LeafType[]): boolean => {
  const exp = expected.filter((type) => type !== "null")
  const act = actual.filter((type) => type !== "null")
  if (exp.length === 0 || act.length === 0) return true
  return act.some((type) => exp.includes(type))
}

export const computeParity = (expected: Shape, actual: Shape, against: Parity["against"] = "mock"): Parity => {
  const actualByPath = new Map(actual.fields.map((field) => [field.path, field]))
  const expectedByPath = new Map(expected.fields.map((field) => [field.path, field]))
  const diffs: ParityDiff[] = []
  let total = 0
  let present = 0

  // Only fields the mock reliably produces count towards parity, and only
  // leaves or containers that matter: skip `$` itself.
  const considered = expected.fields.filter((field) => field.path !== "$" && field.presence >= PRESENCE_THRESHOLD)
  const missingContainers = new Set<string>()
  const emptyContainers = new Set<string>()

  for (const field of considered) {
    const parent = parentPath(field.path)
    // Elements of an array that is empty in the real response are reported once, as "empty".
    if (parent && (emptyContainers.has(parent) || emptyContainers.has(parentPath(parent) ?? ""))) {
      if (field.path.endsWith("[]")) emptyContainers.add(field.path)
      continue
    }
    if (parent && missingContainers.has(parent)) {
      missingContainers.add(field.path)
      total += 1
      continue
    }
    total += 1
    const real = actualByPath.get(field.path)
    if (!real || real.presence < PRESENCE_THRESHOLD) {
      missingContainers.add(field.path)
      diffs.push({ kind: "missing", path: field.path, expected: describe(field) })
      continue
    }
    if (!compatible(field.types, real.types)) {
      diffs.push({ kind: "type", path: field.path, expected: describe(field), actual: describe(real) })
      continue
    }
    present += 1
    if (real.types.includes("null") && !field.types.includes("null")) {
      diffs.push({ kind: "nullable", path: field.path, expected: describe(field), actual: describe(real) })
    }
    if (real.emptyArray && !field.emptyArray && field.types.includes("array") && !actualByPath.has(`${field.path}[]`)) {
      diffs.push({ kind: "empty", path: field.path, expected: "array with items", actual: "empty array" })
      emptyContainers.add(field.path)
    }
  }

  for (const field of actual.fields) {
    if (field.path === "$" || expectedByPath.has(field.path)) continue
    const parent = parentPath(field.path)
    if (parent && !expectedByPath.has(parent)) continue
    diffs.push({ kind: "extra", path: field.path, actual: describe(field) })
  }

  const score = total === 0 ? 1 : Math.round((present / total) * 1000) / 1000
  return { score, total, present, against, diffs: sortDiffs(diffs) }
}

const describe = (field: ShapeField): string => field.types.filter((type) => type !== "null").join(" | ") || "null"

const order: Record<ParityDiff["kind"], number> = { missing: 0, type: 1, empty: 2, nullable: 3, extra: 4 }

const sortDiffs = (diffs: ParityDiff[]): ParityDiff[] =>
  diffs.sort((a, b) => order[a.kind] - order[b.kind] || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

export const parityChanged = (left: Parity | undefined, right: Parity | undefined): boolean => {
  if (!left || !right) return left !== right
  return Math.abs(left.score - right.score) >= 0.01 || left.diffs.length !== right.diffs.length || left.against !== right.against
}
