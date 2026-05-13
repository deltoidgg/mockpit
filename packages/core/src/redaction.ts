import type { AuditRecord, RedactionPolicy } from "./model"

const metadataOnlyFields = new Set([
  "id",
  "routePath",
  "routePattern",
  "sectionId",
  "resourceKey",
  "label",
  "sourceKind",
  "status",
  "reason",
  "request",
  "operation",
  "fieldCoverage",
  "scenario",
  "sourceLocation",
  "kind",
  "visibility",
  "fallbackSource",
  "remediation",
  "recordedBy",
  "proofCritical",
  "tags",
  "updatedAt",
])

export const redactRecord = (
  record: AuditRecord,
  policy: RedactionPolicy = { default: "metadata-only" },
): Partial<AuditRecord> => {
  const allowed = new Set(policy.allowFields ?? metadataOnlyFields)
  const output: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(record)) {
    if (policy.default !== "include-values" && !allowed.has(key)) continue
    output[key] = maskValue(value, policy.maskPatterns ?? [])
  }

  return output as Partial<AuditRecord>
}

export const redactRecords = (
  records: readonly AuditRecord[],
  policy: RedactionPolicy = { default: "metadata-only" },
): readonly Partial<AuditRecord>[] => records.map((record) => redactRecord(record, policy))

const maskValue = (value: unknown, patterns: readonly RegExp[]): unknown => {
  if (typeof value === "string") {
    return patterns.some((pattern) => pattern.test(value)) ? "[redacted]" : value
  }
  if (Array.isArray(value)) return value.map((entry) => maskValue(entry, patterns))
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        patterns.some((pattern) => pattern.test(key)) ? "[redacted]" : maskValue(entry, patterns),
      ]),
    )
  }
  return value
}
