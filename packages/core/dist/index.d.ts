import { Schema, Context, Effect } from 'effect';

declare const sourceKinds: readonly ["api", "mock", "fallback", "derived", "hardcoded", "authoredFallback", "empty", "unsupported", "error", "unknown"];
type SourceKind = (typeof sourceKinds)[number];
declare const auditStatuses: readonly ["loading", "ready", "warning", "blocked", "error", "unknown"];
type AuditStatus = (typeof auditStatuses)[number];
declare const provenanceModes: readonly ["mock", "hybrid", "live", "audit", "capture"];
type ProvenanceMode = (typeof provenanceModes)[number];
type Criticality = "proof" | "presentation" | "debug";
interface RequestDescriptor {
    readonly method?: string;
    readonly url?: string;
    readonly route?: string;
    readonly status?: number;
}
interface FieldCoverage {
    readonly present: number;
    readonly total: number;
    readonly missing?: readonly string[];
    readonly ratio?: number;
}
interface ScenarioDescriptor {
    readonly key: string;
    readonly label?: string;
    readonly variant?: string;
}
interface SourceLocation {
    readonly file?: string;
    readonly line?: number;
    readonly column?: number;
    readonly component?: string;
}
interface AuditRecord {
    readonly id: string;
    readonly routePath: string;
    readonly routePattern?: string;
    readonly sectionId?: string;
    readonly resourceKey: string;
    readonly label: string;
    readonly sourceKind: SourceKind;
    readonly status: AuditStatus;
    readonly reason?: string;
    readonly request?: RequestDescriptor;
    readonly operation?: string;
    readonly fieldCoverage?: FieldCoverage;
    readonly scenario?: ScenarioDescriptor;
    readonly sourceLocation?: SourceLocation;
    readonly proofCritical?: boolean;
    readonly tags?: readonly string[];
    readonly metadata?: Record<string, unknown>;
    readonly updatedAt: string;
}
interface AuditRecordInput {
    readonly id?: string | undefined;
    readonly routePath?: string | undefined;
    readonly routePattern?: string | undefined;
    readonly sectionId?: string | undefined;
    readonly resourceKey: string;
    readonly label?: string | undefined;
    readonly sourceKind: SourceKind;
    readonly status?: AuditStatus | undefined;
    readonly reason?: string | undefined;
    readonly request?: RequestDescriptor | undefined;
    readonly operation?: string | undefined;
    readonly fieldCoverage?: FieldCoverage | undefined;
    readonly scenario?: ScenarioDescriptor | undefined;
    readonly sourceLocation?: SourceLocation | undefined;
    readonly proofCritical?: boolean | undefined;
    readonly tags?: readonly string[] | undefined;
    readonly metadata?: Record<string, unknown> | undefined;
    readonly updatedAt?: string | undefined;
}
interface RequestMatcher {
    readonly method?: string;
    readonly url?: string | RegExp;
}
interface AssessContext {
    readonly resourceKey: string;
    readonly routePath: string;
    readonly request?: RequestDescriptor;
}
interface AssessResult {
    readonly empty?: boolean | undefined;
    readonly unsupported?: boolean | undefined;
    readonly reason?: string | undefined;
    readonly coverage?: FieldCoverage | undefined;
    readonly metadata?: Record<string, unknown> | undefined;
}
interface FallbackContext {
    readonly resourceKey: string;
    readonly routePath: string;
    readonly reason: string;
    readonly request?: RequestDescriptor | undefined;
    readonly error?: unknown;
    readonly assessment?: AssessResult | undefined;
}
interface ResourceDefinition<A = unknown> {
    readonly key: string;
    readonly label: string;
    readonly match?: RequestMatcher;
    readonly schema?: unknown;
    readonly assess?: (data: A, context: AssessContext) => AssessResult | Promise<AssessResult>;
    readonly fallback?: (context: FallbackContext) => A | Promise<A>;
    readonly criticality?: Criticality;
    readonly tags?: readonly string[];
}
interface SectionDefinition {
    readonly id: string;
    readonly label: string;
    readonly route: string | RegExp;
    readonly resources: readonly string[];
    readonly criticality?: Criticality;
}
interface CaptureRequirement {
    readonly resourceKey: string;
    readonly allowedSources?: readonly SourceKind[];
    readonly minCoverage?: number;
    readonly proofCritical?: boolean;
    readonly requestRoute?: string | RegExp;
}
interface RedactionPolicy {
    readonly default?: "metadata-only" | "include-values";
    readonly allowFields?: readonly string[];
    readonly maskPatterns?: readonly RegExp[];
}
interface CapturePolicy {
    readonly route: string | RegExp;
    readonly name?: string;
    readonly required: readonly CaptureRequirement[];
    readonly allowPresentationSources?: readonly SourceKind[];
    readonly blockOn?: readonly SourceKind[];
    readonly redaction?: RedactionPolicy;
}
interface ModePolicy {
    readonly mode: ProvenanceMode;
    readonly allowMockTransport: boolean;
    readonly allowFallback: boolean;
    readonly showInlineHighlights: boolean;
    readonly blockUnknownCapability: boolean;
    readonly requireLiveForCapture: boolean;
    readonly requiresReloadOnChange: boolean;
}
interface ModeConfig {
    readonly default?: ProvenanceMode;
    readonly storageKey?: string;
}
interface MockKitConfig {
    readonly project: string;
    readonly mode: Required<ModeConfig>;
    readonly resources: readonly ResourceDefinition<any>[];
    readonly sections: readonly SectionDefinition[];
    readonly capture: readonly CapturePolicy[];
    readonly redaction: RedactionPolicy;
}
interface RouteSummary {
    readonly routePath: string;
    readonly mode: ProvenanceMode;
    readonly status: AuditStatus;
    readonly highestRisk: SourceKind;
    readonly sourceCounts: Record<SourceKind, number>;
    readonly sections: readonly SectionSummary[];
    readonly records: readonly AuditRecord[];
    readonly capture?: CaptureEvaluation;
}
interface SectionSummary {
    readonly id: string;
    readonly label: string;
    readonly status: AuditStatus;
    readonly highestRisk: SourceKind;
    readonly sourceCounts: Record<SourceKind, number>;
    readonly proofCriticalCount: number;
    readonly warningCount: number;
    readonly blockedCount: number;
    readonly records: readonly AuditRecord[];
}
interface CaptureResourceEvaluation {
    readonly resourceKey: string;
    readonly passed: boolean;
    readonly reason: string;
    readonly record?: AuditRecord;
}
interface CaptureEvaluation {
    readonly routePath: string;
    readonly policyName: string;
    readonly status: "safe" | "blocked" | "not-configured";
    readonly blockers: readonly string[];
    readonly resources: readonly CaptureResourceEvaluation[];
}
interface MockKitSnapshot {
    readonly project: string;
    readonly mode: ProvenanceMode;
    readonly routePath: string;
    readonly records: readonly AuditRecord[];
    readonly summary: RouteSummary;
    readonly updatedAt: string;
}
declare const sourceKindLabels: Record<SourceKind, string>;
declare const statusLabels: Record<AuditStatus, string>;
declare const defaultSourceCounts: () => Record<SourceKind, number>;
declare const coverageRatio: (coverage: FieldCoverage | undefined) => number | undefined;
declare const createAuditRecord: (input: AuditRecordInput) => AuditRecord;

declare const evaluateCapture: (config: MockKitConfig, routePath: string, records: readonly AuditRecord[]) => CaptureEvaluation;

interface MockKitConfigInput {
    readonly project: string;
    readonly mode?: {
        readonly default?: MockKitConfig["mode"]["default"];
        readonly storageKey?: string;
    };
    readonly resources?: readonly ResourceDefinition<any>[];
    readonly sections?: readonly SectionDefinition[];
    readonly capture?: readonly CapturePolicy[];
    readonly redaction?: RedactionPolicy;
}
declare class InvalidMockKitConfig extends Error {
    readonly name = "InvalidMockKitConfig";
}
declare const defineResource: <A = unknown>(definition: ResourceDefinition<A>) => ResourceDefinition<A>;
declare const defineSection: (definition: SectionDefinition) => SectionDefinition;
declare const defineCapturePolicy: (policy: CapturePolicy) => CapturePolicy;
declare const defineRedactionPolicy: (policy: RedactionPolicy) => RedactionPolicy;
declare const defineMockKitConfig: (input: MockKitConfigInput) => MockKitConfig;
declare const findResource: (config: MockKitConfig, resourceKey: string) => ResourceDefinition<any> | undefined;

declare const modePolicies: Record<ProvenanceMode, ModePolicy>;
declare const getModePolicy: (mode: ProvenanceMode) => ModePolicy;
declare const statusForSourceKind: (sourceKind: SourceKind, mode: ProvenanceMode, criticality?: Criticality) => AuditStatus;

declare const redactRecord: (record: AuditRecord, policy?: RedactionPolicy) => Partial<AuditRecord>;
declare const redactRecords: (records: readonly AuditRecord[], policy?: RedactionPolicy) => readonly Partial<AuditRecord>[];

declare const matchesRoute: (pattern: string | RegExp, routePath: string) => boolean;

declare const SourceKindSchema: Schema.Literal<["api", "mock", "fallback", "derived", "hardcoded", "authoredFallback", "empty", "unsupported", "error", "unknown"]>;
declare const AuditStatusSchema: Schema.Literal<["loading", "ready", "warning", "blocked", "error", "unknown"]>;
declare const ProvenanceModeSchema: Schema.Literal<["mock", "hybrid", "live", "audit", "capture"]>;
declare const FieldCoverageSchema: Schema.Struct<{
    present: typeof Schema.Number;
    total: typeof Schema.Number;
    missing: Schema.optional<Schema.Array$<typeof Schema.String>>;
    ratio: Schema.optional<typeof Schema.Number>;
}>;
declare const RequestDescriptorSchema: Schema.Struct<{
    method: Schema.optional<typeof Schema.String>;
    url: Schema.optional<typeof Schema.String>;
    route: Schema.optional<typeof Schema.String>;
    status: Schema.optional<typeof Schema.Number>;
}>;
declare const AuditRecordSchema: Schema.Struct<{
    id: typeof Schema.String;
    routePath: typeof Schema.String;
    routePattern: Schema.optional<typeof Schema.String>;
    sectionId: Schema.optional<typeof Schema.String>;
    resourceKey: typeof Schema.String;
    label: typeof Schema.String;
    sourceKind: Schema.Literal<["api", "mock", "fallback", "derived", "hardcoded", "authoredFallback", "empty", "unsupported", "error", "unknown"]>;
    status: Schema.Literal<["loading", "ready", "warning", "blocked", "error", "unknown"]>;
    reason: Schema.optional<typeof Schema.String>;
    request: Schema.optional<Schema.Struct<{
        method: Schema.optional<typeof Schema.String>;
        url: Schema.optional<typeof Schema.String>;
        route: Schema.optional<typeof Schema.String>;
        status: Schema.optional<typeof Schema.Number>;
    }>>;
    operation: Schema.optional<typeof Schema.String>;
    fieldCoverage: Schema.optional<Schema.Struct<{
        present: typeof Schema.Number;
        total: typeof Schema.Number;
        missing: Schema.optional<Schema.Array$<typeof Schema.String>>;
        ratio: Schema.optional<typeof Schema.Number>;
    }>>;
    proofCritical: Schema.optional<typeof Schema.Boolean>;
    tags: Schema.optional<Schema.Array$<typeof Schema.String>>;
    updatedAt: typeof Schema.String;
}>;

interface AuditStoreService {
    readonly put: (record: AuditRecord) => void;
    readonly remove: (id: string) => void;
    readonly snapshot: () => readonly AuditRecord[];
    readonly subscribe: (listener: () => void) => () => void;
    readonly clear: () => void;
}
declare const AuditStore: Context.Tag<AuditStoreService, AuditStoreService>;
declare const createMemoryAuditStore: () => AuditStoreService;
declare const makeAuditStore: Effect.Effect<AuditStoreService, never, never>;

declare const sourceRiskPriority: readonly SourceKind[];
declare const countSources: (records: readonly AuditRecord[]) => Record<SourceKind, number>;
declare const highestRiskSource: (records: readonly AuditRecord[]) => SourceKind;
declare const highestStatus: (records: readonly AuditRecord[]) => AuditStatus;
declare const summariseSection: (id: string, label: string, records: readonly AuditRecord[]) => SectionSummary;
declare const summariseRoute: (config: MockKitConfig, records: readonly AuditRecord[], routePath: string, mode: ProvenanceMode, capture?: CaptureEvaluation) => RouteSummary;
declare const formatSourceMix: (counts: Record<SourceKind, number>) => string;

export { type AssessContext, type AssessResult, type AuditRecord, type AuditRecordInput, AuditRecordSchema, type AuditStatus, AuditStatusSchema, AuditStore, type AuditStoreService, type CaptureEvaluation, type CapturePolicy, type CaptureRequirement, type CaptureResourceEvaluation, type Criticality, type FallbackContext, type FieldCoverage, FieldCoverageSchema, InvalidMockKitConfig, type MockKitConfig, type MockKitConfigInput, type MockKitSnapshot, type ModeConfig, type ModePolicy, type ProvenanceMode, ProvenanceModeSchema, type RedactionPolicy, type RequestDescriptor, RequestDescriptorSchema, type RequestMatcher, type ResourceDefinition, type RouteSummary, type ScenarioDescriptor, type SectionDefinition, type SectionSummary, type SourceKind, SourceKindSchema, type SourceLocation, auditStatuses, countSources, coverageRatio, createAuditRecord, createMemoryAuditStore, defaultSourceCounts, defineCapturePolicy, defineMockKitConfig, defineRedactionPolicy, defineResource, defineSection, evaluateCapture, findResource, formatSourceMix, getModePolicy, highestRiskSource, highestStatus, makeAuditStore, matchesRoute, modePolicies, provenanceModes, redactRecord, redactRecords, sourceKindLabels, sourceKinds, sourceRiskPriority, statusForSourceKind, statusLabels, summariseRoute, summariseSection };
