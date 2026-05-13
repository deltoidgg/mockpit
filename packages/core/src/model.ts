export const sourceKinds = [
  "api",
  "mock",
  "fallback",
  "derived",
  "hardcoded",
  "authoredFallback",
  "empty",
  "unsupported",
  "error",
  "unknown",
] as const

export type SourceKind = (typeof sourceKinds)[number]

export const auditStatuses = [
  "loading",
  "ready",
  "warning",
  "blocked",
  "error",
  "unknown",
] as const

export type AuditStatus = (typeof auditStatuses)[number]

export const provenanceModes = ["mock", "hybrid", "live", "audit", "capture"] as const

export type ProvenanceMode = (typeof provenanceModes)[number]

export type Criticality = "proof" | "presentation" | "debug"

export type AuditRecordKind = "resource" | "uiMark" | "section" | "transport"

export type AuditRecordVisibility = "mounted" | "stale" | "unmounted"

export interface RequestDescriptor {
  readonly method?: string
  readonly url?: string
  readonly route?: string
  readonly status?: number
}

export interface FieldCoverage {
  readonly present: number
  readonly total: number
  readonly missing?: readonly string[]
  readonly ratio?: number
}

export interface ScenarioDescriptor {
  readonly key: string
  readonly label?: string
  readonly variant?: string
}

export interface ScenarioDefinition {
  readonly key: string
  readonly label: string
  readonly variants: readonly ScenarioVariant[]
  readonly defaultVariant?: string
}

export interface ScenarioVariant {
  readonly key: string
  readonly label: string
  readonly description?: string
}

export interface ScenarioState {
  readonly selected: Record<string, string>
  readonly updatedAt: string
}

export interface TransportState {
  readonly mockTransportActive: boolean
  readonly cleanupRequired: boolean
  readonly requiresReload: boolean
  readonly lastCleanup?: {
    readonly checked: number
    readonly unregistered: number
    readonly updatedAt: string
  }
  readonly handlers?: readonly TransportHandlerDescriptor[]
  readonly issues?: readonly AuditRecord[]
}

export interface TransportHandlerDescriptor {
  readonly resourceKey?: string | undefined
  readonly method?: string | undefined
  readonly url?: string | undefined
  readonly label?: string | undefined
  readonly scenario?: string | undefined
}

export interface ModeTransition {
  readonly previousMode: ProvenanceMode
  readonly nextMode: ProvenanceMode
  readonly requiresReload: boolean
  readonly transportCleanupRequired: boolean
  readonly reason?: string | undefined
}

export interface SourceLocation {
  readonly file?: string
  readonly line?: number
  readonly column?: number
  readonly component?: string
}

export interface AuditRecord {
  readonly id: string
  readonly kind?: AuditRecordKind
  readonly visibility?: AuditRecordVisibility
  readonly routePath: string
  readonly routePattern?: string
  readonly sectionId?: string
  readonly resourceKey: string
  readonly label: string
  readonly sourceKind: SourceKind
  readonly status: AuditStatus
  readonly reason?: string
  readonly request?: RequestDescriptor
  readonly operation?: string
  readonly fieldCoverage?: FieldCoverage
  readonly scenario?: ScenarioDescriptor
  readonly sourceLocation?: SourceLocation
  readonly fallbackSource?: string
  readonly remediation?: string
  readonly recordedBy?: string
  readonly proofCritical?: boolean
  readonly tags?: readonly string[]
  readonly metadata?: Record<string, unknown>
  readonly updatedAt: string
}

export interface AuditRecordInput {
  readonly id?: string | undefined
  readonly kind?: AuditRecordKind | undefined
  readonly visibility?: AuditRecordVisibility | undefined
  readonly routePath?: string | undefined
  readonly routePattern?: string | undefined
  readonly sectionId?: string | undefined
  readonly resourceKey: string
  readonly label?: string | undefined
  readonly sourceKind: SourceKind
  readonly status?: AuditStatus | undefined
  readonly reason?: string | undefined
  readonly request?: RequestDescriptor | undefined
  readonly operation?: string | undefined
  readonly fieldCoverage?: FieldCoverage | undefined
  readonly scenario?: ScenarioDescriptor | undefined
  readonly sourceLocation?: SourceLocation | undefined
  readonly fallbackSource?: string | undefined
  readonly remediation?: string | undefined
  readonly recordedBy?: string | undefined
  readonly proofCritical?: boolean | undefined
  readonly tags?: readonly string[] | undefined
  readonly metadata?: Record<string, unknown> | undefined
  readonly updatedAt?: string | undefined
}

export interface RequestMatcher {
  readonly method?: string
  readonly url?: string | RegExp
}

export interface AssessContext {
  readonly resourceKey: string
  readonly routePath: string
  readonly request?: RequestDescriptor
}

export interface AssessResult {
  readonly empty?: boolean | undefined
  readonly unsupported?: boolean | undefined
  readonly reason?: string | undefined
  readonly coverage?: FieldCoverage | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export interface FallbackContext {
  readonly resourceKey: string
  readonly routePath: string
  readonly reason: string
  readonly request?: RequestDescriptor | undefined
  readonly error?: unknown
  readonly assessment?: AssessResult | undefined
}

export interface ResourceDefinition<A = unknown> {
  readonly key: string
  readonly label: string
  readonly match?: RequestMatcher
  readonly schema?: unknown
  readonly assess?: (data: A, context: AssessContext) => AssessResult | Promise<AssessResult>
  readonly fallback?: (context: FallbackContext) => A | Promise<A>
  readonly fallbackSource?: string
  readonly remediation?: string
  readonly criticality?: Criticality
  readonly tags?: readonly string[]
}

export interface SectionDefinition {
  readonly id: string
  readonly label: string
  readonly route: string | RegExp
  readonly resources: readonly string[]
  readonly criticality?: Criticality
}

export interface CaptureRequirement {
  readonly resourceKey: string
  readonly allowedSources?: readonly SourceKind[]
  readonly minCoverage?: number
  readonly proofCritical?: boolean
  readonly requestRoute?: string | RegExp
}

export interface RedactionPolicy {
  readonly default?: "metadata-only" | "include-values"
  readonly allowFields?: readonly string[]
  readonly maskPatterns?: readonly RegExp[]
}

export interface CapturePolicy {
  readonly route: string | RegExp
  readonly name?: string
  readonly required: readonly CaptureRequirement[]
  readonly allowPresentationSources?: readonly SourceKind[]
  readonly blockOn?: readonly SourceKind[]
  readonly redaction?: RedactionPolicy
}

export interface ModePolicy {
  readonly mode: ProvenanceMode
  readonly allowMockTransport: boolean
  readonly allowFallback: boolean
  readonly showInlineHighlights: boolean
  readonly blockUnknownCapability: boolean
  readonly requireLiveForCapture: boolean
  readonly requiresReloadOnChange: boolean
}

export interface ModeConfig {
  readonly default?: ProvenanceMode
  readonly storageKey?: string
}

export interface MockPitConfig {
  readonly project: string
  readonly mode: Required<ModeConfig>
  readonly resources: readonly ResourceDefinition<any>[]
  readonly sections: readonly SectionDefinition[]
  readonly capture: readonly CapturePolicy[]
  readonly scenarios: readonly ScenarioDefinition[]
  readonly redaction: RedactionPolicy
}

export interface RouteSummary {
  readonly routePath: string
  readonly mode: ProvenanceMode
  readonly status: AuditStatus
  readonly highestRisk: SourceKind
  readonly sourceCounts: Record<SourceKind, number>
  readonly sections: readonly SectionSummary[]
  readonly records: readonly AuditRecord[]
  readonly capture?: CaptureEvaluation
}

export interface SectionSummary {
  readonly id: string
  readonly label: string
  readonly status: AuditStatus
  readonly highestRisk: SourceKind
  readonly sourceCounts: Record<SourceKind, number>
  readonly proofCriticalCount: number
  readonly warningCount: number
  readonly blockedCount: number
  readonly records: readonly AuditRecord[]
}

export interface CaptureResourceEvaluation {
  readonly resourceKey: string
  readonly passed: boolean
  readonly reason: string
  readonly record?: AuditRecord
}

export interface CaptureEvaluation {
  readonly routePath: string
  readonly policyName: string
  readonly status: "safe" | "blocked" | "not-configured"
  readonly blockers: readonly string[]
  readonly resources: readonly CaptureResourceEvaluation[]
}

export interface MockPitSnapshot {
  readonly version?: string
  readonly project: string
  readonly mode: ProvenanceMode
  readonly routePath: string
  readonly records: readonly AuditRecord[]
  readonly summary: RouteSummary
  readonly scenarios?: ScenarioState
  readonly transport?: TransportState
  readonly updatedAt: string
}

export interface ExportManifest {
  readonly project: string
  readonly generatedAt: string
  readonly routes: readonly string[]
  readonly recordCount: number
  readonly redaction: RedactionPolicy
  readonly capture: Record<string, CaptureEvaluation["status"]>
}

export interface RouteAuditExport {
  readonly project: string
  readonly routePath: string
  readonly generatedAt: string
  readonly summary: RouteSummary
  readonly records: readonly Partial<AuditRecord>[]
  readonly scenarios?: ScenarioState
  readonly transport?: TransportState
  readonly redaction: RedactionPolicy
}

export const sourceKindLabels: Record<SourceKind, string> = {
  api: "Live API",
  mock: "Mock",
  fallback: "Fallback",
  derived: "Derived",
  hardcoded: "Hardcoded",
  authoredFallback: "Authored fallback",
  empty: "Empty live response",
  unsupported: "Unsupported",
  error: "Error",
  unknown: "Unknown",
}

export const statusLabels: Record<AuditStatus, string> = {
  loading: "Loading",
  ready: "Ready",
  warning: "Warning",
  blocked: "Blocked",
  error: "Error",
  unknown: "Unknown",
}

export const defaultSourceCounts = (): Record<SourceKind, number> =>
  Object.fromEntries(sourceKinds.map((kind) => [kind, 0])) as Record<SourceKind, number>

export const coverageRatio = (coverage: FieldCoverage | undefined): number | undefined => {
  if (!coverage) return undefined
  if (typeof coverage.ratio === "number") return coverage.ratio
  if (coverage.total === 0) return 1
  return coverage.present / coverage.total
}

export const createAuditRecord = (input: AuditRecordInput): AuditRecord => {
  const now = input.updatedAt ?? new Date().toISOString()
  const routePath = input.routePath ?? "/"
  const label = input.label ?? input.resourceKey
  const id =
    input.id ??
    [
      routePath,
      input.sectionId ?? "route",
      input.resourceKey,
      input.operation ?? input.request?.route ?? input.sourceKind,
    ].join("::")

  return {
    id,
    kind: input.kind ?? "resource",
    visibility: input.visibility ?? "mounted",
    routePath,
    resourceKey: input.resourceKey,
    label,
    sourceKind: input.sourceKind,
    status: input.status ?? "unknown",
    updatedAt: now,
    ...(input.routePattern ? { routePattern: input.routePattern } : {}),
    ...(input.sectionId ? { sectionId: input.sectionId } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.request ? { request: input.request } : {}),
    ...(input.operation ? { operation: input.operation } : {}),
    ...(input.fieldCoverage ? { fieldCoverage: input.fieldCoverage } : {}),
    ...(input.scenario ? { scenario: input.scenario } : {}),
    ...(input.sourceLocation ? { sourceLocation: input.sourceLocation } : {}),
    ...(input.fallbackSource ? { fallbackSource: input.fallbackSource } : {}),
    ...(input.remediation ? { remediation: input.remediation } : {}),
    ...(input.recordedBy ? { recordedBy: input.recordedBy } : {}),
    ...(typeof input.proofCritical === "boolean" ? { proofCritical: input.proofCritical } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }
}
