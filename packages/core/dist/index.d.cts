import { Schema, Context, Effect } from 'effect';

declare const sourceKinds: readonly ["api", "mock", "fallback", "derived", "hardcoded", "authoredFallback", "empty", "unsupported", "error", "unknown"];
type SourceKind = (typeof sourceKinds)[number];
declare const auditStatuses: readonly ["loading", "ready", "warning", "blocked", "error", "unknown"];
type AuditStatus = (typeof auditStatuses)[number];
declare const provenanceModes: readonly ["mock", "hybrid", "live", "audit", "capture"];
type ProvenanceMode = (typeof provenanceModes)[number];
type Criticality = "proof" | "presentation" | "debug";
type AuditRecordKind = "resource" | "uiMark" | "section" | "transport";
type AuditRecordVisibility = "mounted" | "stale" | "unmounted";
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
interface ScenarioDefinition {
    readonly key: string;
    readonly label: string;
    readonly variants: readonly ScenarioVariant[];
    readonly defaultVariant?: string;
}
interface ScenarioVariant {
    readonly key: string;
    readonly label: string;
    readonly description?: string;
}
interface ScenarioState {
    readonly selected: Record<string, string>;
    readonly updatedAt: string;
}
interface TransportState {
    readonly mockTransportActive: boolean;
    readonly cleanupRequired: boolean;
    readonly requiresReload: boolean;
    readonly lastCleanup?: {
        readonly checked: number;
        readonly unregistered: number;
        readonly updatedAt: string;
    };
    readonly handlers?: readonly TransportHandlerDescriptor[];
    readonly issues?: readonly AuditRecord[];
}
interface TransportHandlerDescriptor {
    readonly resourceKey?: string | undefined;
    readonly method?: string | undefined;
    readonly url?: string | undefined;
    readonly label?: string | undefined;
    readonly scenario?: string | undefined;
}
interface ModeTransition {
    readonly previousMode: ProvenanceMode;
    readonly nextMode: ProvenanceMode;
    readonly requiresReload: boolean;
    readonly transportCleanupRequired: boolean;
    readonly reason?: string | undefined;
}
interface SourceLocation {
    readonly file?: string;
    readonly line?: number;
    readonly column?: number;
    readonly component?: string;
}
interface AuditRecord {
    readonly id: string;
    readonly kind?: AuditRecordKind;
    readonly visibility?: AuditRecordVisibility;
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
    readonly fallbackSource?: string;
    readonly remediation?: string;
    readonly recordedBy?: string;
    readonly proofCritical?: boolean;
    readonly tags?: readonly string[];
    readonly metadata?: Record<string, unknown>;
    readonly updatedAt: string;
}
interface AuditRecordInput {
    readonly id?: string | undefined;
    readonly kind?: AuditRecordKind | undefined;
    readonly visibility?: AuditRecordVisibility | undefined;
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
    readonly fallbackSource?: string | undefined;
    readonly remediation?: string | undefined;
    readonly recordedBy?: string | undefined;
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
    readonly fallbackSource?: string;
    readonly remediation?: string;
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
interface MockPitConfig {
    readonly project: string;
    readonly mode: Required<ModeConfig>;
    readonly resources: readonly ResourceDefinition<any>[];
    readonly sections: readonly SectionDefinition[];
    readonly capture: readonly CapturePolicy[];
    readonly scenarios: readonly ScenarioDefinition[];
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
interface MockPitSnapshot {
    readonly version?: string;
    readonly project: string;
    readonly mode: ProvenanceMode;
    readonly routePath: string;
    readonly records: readonly AuditRecord[];
    readonly summary: RouteSummary;
    readonly scenarios?: ScenarioState;
    readonly transport?: TransportState;
    readonly updatedAt: string;
}
interface ExportManifest {
    readonly project: string;
    readonly generatedAt: string;
    readonly routes: readonly string[];
    readonly recordCount: number;
    readonly redaction: RedactionPolicy;
    readonly capture: Record<string, CaptureEvaluation["status"]>;
}
interface RouteAuditExport {
    readonly project: string;
    readonly routePath: string;
    readonly generatedAt: string;
    readonly summary: RouteSummary;
    readonly records: readonly Partial<AuditRecord>[];
    readonly scenarios?: ScenarioState;
    readonly transport?: TransportState;
    readonly redaction: RedactionPolicy;
}
declare const sourceKindLabels: Record<SourceKind, string>;
declare const statusLabels: Record<AuditStatus, string>;
declare const defaultSourceCounts: () => Record<SourceKind, number>;
declare const coverageRatio: (coverage: FieldCoverage | undefined) => number | undefined;
declare const createAuditRecord: (input: AuditRecordInput) => AuditRecord;

declare const evaluateCapture: (config: MockPitConfig, routePath: string, records: readonly AuditRecord[]) => CaptureEvaluation;

interface MockPitConfigInput {
    readonly project: string;
    readonly mode?: {
        readonly default?: MockPitConfig["mode"]["default"];
        readonly storageKey?: string;
    };
    readonly resources?: readonly ResourceDefinition<any>[];
    readonly sections?: readonly SectionDefinition[];
    readonly capture?: readonly CapturePolicy[];
    readonly scenarios?: readonly ScenarioDefinition[];
    readonly redaction?: RedactionPolicy;
}
declare class InvalidMockPitConfig extends Error {
    readonly name = "InvalidMockPitConfig";
}
declare const defineResource: <A = unknown>(definition: ResourceDefinition<A>) => ResourceDefinition<A>;
declare const defineSection: (definition: SectionDefinition) => SectionDefinition;
declare const defineCapturePolicy: (policy: CapturePolicy) => CapturePolicy;
declare const defineRedactionPolicy: (policy: RedactionPolicy) => RedactionPolicy;
declare const defineScenario: (definition: ScenarioDefinition) => ScenarioDefinition;
declare const defineMockPitConfig: (input: MockPitConfigInput) => MockPitConfig;
declare const findResource: (config: MockPitConfig, resourceKey: string) => ResourceDefinition<any> | undefined;

declare class MockPitError extends Error {
    readonly code: string;
    readonly cause?: unknown | undefined;
    constructor(message: string, code: string, cause?: unknown | undefined);
}
declare class MissingMockPitResource extends MockPitError {
    constructor(resourceKey: string);
}
declare class MockPitParseError extends MockPitError {
    constructor(message: string, cause?: unknown);
}
declare class MockPitSchemaError extends MockPitError {
    constructor(message: string, cause?: unknown);
}
declare class MockPitFallbackError extends MockPitError {
    constructor(message: string, cause?: unknown);
}
declare class MockPitStorageError extends MockPitError {
    constructor(message: string, cause?: unknown);
}
declare class MockPitExportError extends MockPitError {
    constructor(message: string, cause?: unknown);
}

interface CreateRouteAuditExportOptions {
    readonly config: MockPitConfig;
    readonly routePath: string;
    readonly mode: ProvenanceMode;
    readonly records: readonly AuditRecord[];
    readonly generatedAt?: string;
    readonly scenarios?: ScenarioState;
    readonly transport?: TransportState;
    readonly redaction?: RedactionPolicy;
}
declare const createRouteAuditExport: ({ config, routePath, mode, records, generatedAt, scenarios, transport, redaction, }: CreateRouteAuditExportOptions) => RouteAuditExport;
declare const createExportManifest: (config: MockPitConfig, exports: readonly RouteAuditExport[], generatedAt?: string) => ExportManifest;
declare const routeAuditToMarkdown: (route: RouteAuditExport) => string;

declare const modePolicies: Record<ProvenanceMode, ModePolicy>;
declare const getModePolicy: (mode: ProvenanceMode) => ModePolicy;
declare const statusForSourceKind: (sourceKind: SourceKind, mode: ProvenanceMode, criticality?: Criticality) => AuditStatus;

declare const redactRecord: (record: AuditRecord, policy?: RedactionPolicy) => Partial<AuditRecord>;
declare const redactRecords: (records: readonly AuditRecord[], policy?: RedactionPolicy) => readonly Partial<AuditRecord>[];

declare const matchesRoute: (pattern: string | RegExp, routePath: string) => boolean;

declare const createInitialScenarioState: (config: MockPitConfig, now?: string) => ScenarioState;
declare const setScenarioVariant: (state: ScenarioState, key: string, variant: string, now?: string) => ScenarioState;

declare const SourceKindSchema: Schema.Literal<["api", "mock", "fallback", "derived", "hardcoded", "authoredFallback", "empty", "unsupported", "error", "unknown"]>;
declare const AuditStatusSchema: Schema.Literal<["loading", "ready", "warning", "blocked", "error", "unknown"]>;
declare const ProvenanceModeSchema: Schema.Literal<["mock", "hybrid", "live", "audit", "capture"]>;
declare const AuditRecordKindSchema: Schema.Literal<["resource", "uiMark", "section", "transport"]>;
declare const AuditRecordVisibilitySchema: Schema.Literal<["mounted", "stale", "unmounted"]>;
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
    kind: Schema.optional<Schema.Literal<["resource", "uiMark", "section", "transport"]>>;
    visibility: Schema.optional<Schema.Literal<["mounted", "stale", "unmounted"]>>;
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
    fallbackSource: Schema.optional<typeof Schema.String>;
    remediation: Schema.optional<typeof Schema.String>;
    recordedBy: Schema.optional<typeof Schema.String>;
    proofCritical: Schema.optional<typeof Schema.Boolean>;
    tags: Schema.optional<Schema.Array$<typeof Schema.String>>;
    updatedAt: typeof Schema.String;
}>;
declare const ScenarioDefinitionSchema: Schema.Struct<{
    key: typeof Schema.String;
    label: typeof Schema.String;
    variants: Schema.Array$<Schema.Struct<{
        key: typeof Schema.String;
        label: typeof Schema.String;
        description: Schema.optional<typeof Schema.String>;
    }>>;
    defaultVariant: Schema.optional<typeof Schema.String>;
}>;
declare const RedactionPolicySchema: Schema.Struct<{
    default: Schema.optional<Schema.Literal<["metadata-only", "include-values"]>>;
    allowFields: Schema.optional<Schema.Array$<typeof Schema.String>>;
}>;
declare const ExportManifestSchema: Schema.Struct<{
    project: typeof Schema.String;
    generatedAt: typeof Schema.String;
    routes: Schema.Array$<typeof Schema.String>;
    recordCount: typeof Schema.Number;
    redaction: Schema.Struct<{
        default: Schema.optional<Schema.Literal<["metadata-only", "include-values"]>>;
        allowFields: Schema.optional<Schema.Array$<typeof Schema.String>>;
    }>;
}>;
declare const validateUnknownWithSchema: <A>(schema: unknown, value: unknown) => A;

interface ModeStoreService {
    readonly getMode: () => ProvenanceMode;
    readonly setMode: (mode: ProvenanceMode) => void;
}
declare const ModeStore: Context.Tag<ModeStoreService, ModeStoreService>;
interface ConfigService {
    readonly getConfig: () => MockPitConfig;
}
declare const ConfigService: Context.Tag<ConfigService, ConfigService>;
interface RouteService {
    readonly getRoutePath: () => string;
    readonly setRoute: (routePath: string, routePattern?: string) => void;
}
declare const RouteService: Context.Tag<RouteService, RouteService>;
interface ClockService {
    readonly now: () => string;
}
declare const ClockService: Context.Tag<ClockService, ClockService>;
interface ReporterService {
    readonly exportRoute: (routePath: string) => RouteAuditExport;
    readonly exportMarkdown: (routePath: string) => string;
}
declare const ReporterService: Context.Tag<ReporterService, ReporterService>;
interface ScenarioService {
    readonly getScenarioState: () => ScenarioState;
    readonly setScenario: (key: string, variant: string) => void;
}
declare const ScenarioService: Context.Tag<ScenarioService, ScenarioService>;
interface CaptureService {
    readonly evaluate: (routePath: string) => CaptureEvaluation;
}
declare const CaptureService: Context.Tag<CaptureService, CaptureService>;
interface TransportService {
    readonly getTransportState: () => TransportState;
    readonly setTransportState: (state: Partial<TransportState>) => void;
}
declare const TransportService: Context.Tag<TransportService, TransportService>;

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
declare const summariseRoute: (config: MockPitConfig, records: readonly AuditRecord[], routePath: string, mode: ProvenanceMode, capture?: CaptureEvaluation) => RouteSummary;
declare const formatSourceMix: (counts: Record<SourceKind, number>) => string;

export { type AssessContext, type AssessResult, type AuditRecord, type AuditRecordInput, type AuditRecordKind, AuditRecordKindSchema, AuditRecordSchema, type AuditRecordVisibility, AuditRecordVisibilitySchema, type AuditStatus, AuditStatusSchema, AuditStore, type AuditStoreService, type CaptureEvaluation, type CapturePolicy, type CaptureRequirement, type CaptureResourceEvaluation, CaptureService, ClockService, ConfigService, type CreateRouteAuditExportOptions, type Criticality, type ExportManifest, ExportManifestSchema, type FallbackContext, type FieldCoverage, FieldCoverageSchema, InvalidMockPitConfig, MissingMockPitResource, type MockPitConfig, type MockPitConfigInput, MockPitError, MockPitExportError, MockPitFallbackError, MockPitParseError, MockPitSchemaError, type MockPitSnapshot, MockPitStorageError, type ModeConfig, type ModePolicy, ModeStore, type ModeStoreService, type ModeTransition, type ProvenanceMode, ProvenanceModeSchema, type RedactionPolicy, RedactionPolicySchema, ReporterService, type RequestDescriptor, RequestDescriptorSchema, type RequestMatcher, type ResourceDefinition, type RouteAuditExport, RouteService, type RouteSummary, type ScenarioDefinition, ScenarioDefinitionSchema, type ScenarioDescriptor, ScenarioService, type ScenarioState, type ScenarioVariant, type SectionDefinition, type SectionSummary, type SourceKind, SourceKindSchema, type SourceLocation, type TransportHandlerDescriptor, TransportService, type TransportState, auditStatuses, countSources, coverageRatio, createAuditRecord, createExportManifest, createInitialScenarioState, createMemoryAuditStore, createRouteAuditExport, defaultSourceCounts, defineCapturePolicy, defineMockPitConfig, defineRedactionPolicy, defineResource, defineScenario, defineSection, evaluateCapture, findResource, formatSourceMix, getModePolicy, highestRiskSource, highestStatus, makeAuditStore, matchesRoute, modePolicies, provenanceModes, redactRecord, redactRecords, routeAuditToMarkdown, setScenarioVariant, sourceKindLabels, sourceKinds, sourceRiskPriority, statusForSourceKind, statusLabels, summariseRoute, summariseSection, validateUnknownWithSchema };
