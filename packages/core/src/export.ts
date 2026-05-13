import type {
  AuditRecord,
  ExportManifest,
  MockPitConfig,
  ProvenanceMode,
  RedactionPolicy,
  RouteAuditExport,
  ScenarioState,
  TransportState,
} from "./model"
import { redactRecords } from "./redaction"
import { formatSourceMix, summariseRoute } from "./summary"
import { evaluateCapture } from "./capture"
import { sourceKindLabels, statusLabels } from "./model"

export interface CreateRouteAuditExportOptions {
  readonly config: MockPitConfig
  readonly routePath: string
  readonly mode: ProvenanceMode
  readonly records: readonly AuditRecord[]
  readonly generatedAt?: string
  readonly scenarios?: ScenarioState
  readonly transport?: TransportState
  readonly redaction?: RedactionPolicy
}

export const createRouteAuditExport = ({
  config,
  routePath,
  mode,
  records,
  generatedAt = new Date().toISOString(),
  scenarios,
  transport,
  redaction = config.redaction,
}: CreateRouteAuditExportOptions): RouteAuditExport => {
  const capture = evaluateCapture(config, routePath, records)
  const summary = summariseRoute(config, records, routePath, mode, capture)

  return {
    project: config.project,
    routePath,
    generatedAt,
    summary,
    records: redactRecords(summary.records, redaction),
    ...(scenarios ? { scenarios } : {}),
    ...(transport ? { transport } : {}),
    redaction,
  }
}

export const createExportManifest = (
  config: MockPitConfig,
  exports: readonly RouteAuditExport[],
  generatedAt = new Date().toISOString(),
): ExportManifest => ({
  project: config.project,
  generatedAt,
  routes: exports.map((route) => route.routePath),
  recordCount: exports.reduce((count, route) => count + route.records.length, 0),
  redaction: config.redaction,
  capture: Object.fromEntries(
    exports.map((route) => [route.routePath, route.summary.capture?.status ?? "not-configured"]),
  ),
})

export const routeAuditToMarkdown = (route: RouteAuditExport): string => {
  const lines = [
    `# MockPit Route Audit: ${route.routePath}`,
    "",
    `Project: ${route.project}`,
    `Generated: ${route.generatedAt}`,
    `Status: ${statusLabels[route.summary.status]}`,
    `Highest risk: ${sourceKindLabels[route.summary.highestRisk]}`,
    `Source mix: ${formatSourceMix(route.summary.sourceCounts)}`,
    `Capture: ${route.summary.capture?.status ?? "not-configured"}`,
    "",
    "## Records",
    "",
    "| Resource | Source | Status | Reason |",
    "| --- | --- | --- | --- |",
    ...route.summary.records.map(
      (record) =>
        `| ${record.resourceKey} | ${sourceKindLabels[record.sourceKind]} | ${
          statusLabels[record.status]
        } | ${escapeCell(record.reason ?? "")} |`,
    ),
  ]

  if (route.summary.capture?.blockers.length) {
    lines.push("", "## Capture Blockers", "")
    for (const blocker of route.summary.capture.blockers) lines.push(`- ${blocker}`)
  }

  lines.push("", "## Redaction", "", `Default: ${route.redaction.default ?? "metadata-only"}`)
  return `${lines.join("\n")}\n`
}

const escapeCell = (value: string): string => value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim()
