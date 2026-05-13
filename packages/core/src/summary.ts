import type {
  AuditRecord,
  AuditStatus,
  CaptureEvaluation,
  MockKitConfig,
  ProvenanceMode,
  RouteSummary,
  SectionSummary,
  SourceKind,
} from "./model"
import { defaultSourceCounts, sourceKinds } from "./model"
import { matchesRoute } from "./route"

export const sourceRiskPriority: readonly SourceKind[] = [
  "error",
  "unsupported",
  "unknown",
  "empty",
  "authoredFallback",
  "hardcoded",
  "derived",
  "fallback",
  "mock",
  "api",
]

const statusPriority: readonly AuditStatus[] = [
  "error",
  "blocked",
  "unknown",
  "warning",
  "loading",
  "ready",
]

export const countSources = (records: readonly AuditRecord[]): Record<SourceKind, number> => {
  const counts = defaultSourceCounts()
  for (const record of records) {
    counts[record.sourceKind] += 1
  }
  return counts
}

export const highestRiskSource = (records: readonly AuditRecord[]): SourceKind => {
  if (records.length === 0) return "unknown"
  return [...records].sort(
    (left, right) =>
      sourceRiskPriority.indexOf(left.sourceKind) - sourceRiskPriority.indexOf(right.sourceKind),
  )[0]?.sourceKind ?? "unknown"
}

export const highestStatus = (records: readonly AuditRecord[]): AuditStatus => {
  if (records.length === 0) return "unknown"
  return [...records].sort(
    (left, right) => statusPriority.indexOf(left.status) - statusPriority.indexOf(right.status),
  )[0]?.status ?? "unknown"
}

export const summariseSection = (
  id: string,
  label: string,
  records: readonly AuditRecord[],
): SectionSummary => ({
  id,
  label,
  records,
  status: highestStatus(records),
  highestRisk: highestRiskSource(records),
  sourceCounts: countSources(records),
  proofCriticalCount: records.filter((record) => record.proofCritical).length,
  warningCount: records.filter((record) => record.status === "warning").length,
  blockedCount: records.filter((record) => record.status === "blocked").length,
})

export const summariseRoute = (
  config: MockKitConfig,
  records: readonly AuditRecord[],
  routePath: string,
  mode: ProvenanceMode,
  capture?: CaptureEvaluation,
): RouteSummary => {
  const routeRecords = records.filter((record) => record.routePath === routePath)
  const sections = config.sections
    .filter((section) => matchesRoute(section.route, routePath))
    .map((section) => {
      const sectionRecords = routeRecords.filter(
        (record) =>
          record.sectionId === section.id || section.resources.includes(record.resourceKey),
      )
      return summariseSection(section.id, section.label, sectionRecords)
    })

  return {
    routePath,
    mode,
    status: highestStatus(routeRecords),
    highestRisk: highestRiskSource(routeRecords),
    sourceCounts: countSources(routeRecords),
    sections,
    records: routeRecords,
    ...(capture ? { capture } : {}),
  }
}

export const formatSourceMix = (counts: Record<SourceKind, number>): string =>
  sourceKinds
    .filter((sourceKind) => counts[sourceKind] > 0)
    .map((sourceKind) => `${counts[sourceKind]} ${sourceKind}`)
    .join(" · ") || "No records"
