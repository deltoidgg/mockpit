"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AuditRecordSchema: () => AuditRecordSchema,
  AuditStatusSchema: () => AuditStatusSchema,
  AuditStore: () => AuditStore,
  FieldCoverageSchema: () => FieldCoverageSchema,
  InvalidMockKitConfig: () => InvalidMockKitConfig,
  ProvenanceModeSchema: () => ProvenanceModeSchema,
  RequestDescriptorSchema: () => RequestDescriptorSchema,
  SourceKindSchema: () => SourceKindSchema,
  auditStatuses: () => auditStatuses,
  countSources: () => countSources,
  coverageRatio: () => coverageRatio,
  createAuditRecord: () => createAuditRecord,
  createMemoryAuditStore: () => createMemoryAuditStore,
  defaultSourceCounts: () => defaultSourceCounts,
  defineCapturePolicy: () => defineCapturePolicy,
  defineMockKitConfig: () => defineMockKitConfig,
  defineRedactionPolicy: () => defineRedactionPolicy,
  defineResource: () => defineResource,
  defineSection: () => defineSection,
  evaluateCapture: () => evaluateCapture,
  findResource: () => findResource,
  formatSourceMix: () => formatSourceMix,
  getModePolicy: () => getModePolicy,
  highestRiskSource: () => highestRiskSource,
  highestStatus: () => highestStatus,
  makeAuditStore: () => makeAuditStore,
  matchesRoute: () => matchesRoute,
  modePolicies: () => modePolicies,
  provenanceModes: () => provenanceModes,
  redactRecord: () => redactRecord,
  redactRecords: () => redactRecords,
  sourceKindLabels: () => sourceKindLabels,
  sourceKinds: () => sourceKinds,
  sourceRiskPriority: () => sourceRiskPriority,
  statusForSourceKind: () => statusForSourceKind,
  statusLabels: () => statusLabels,
  summariseRoute: () => summariseRoute,
  summariseSection: () => summariseSection
});
module.exports = __toCommonJS(index_exports);

// src/model.ts
var sourceKinds = [
  "api",
  "mock",
  "fallback",
  "derived",
  "hardcoded",
  "authoredFallback",
  "empty",
  "unsupported",
  "error",
  "unknown"
];
var auditStatuses = [
  "loading",
  "ready",
  "warning",
  "blocked",
  "error",
  "unknown"
];
var provenanceModes = ["mock", "hybrid", "live", "audit", "capture"];
var sourceKindLabels = {
  api: "Live API",
  mock: "Mock",
  fallback: "Fallback",
  derived: "Derived",
  hardcoded: "Hardcoded",
  authoredFallback: "Authored fallback",
  empty: "Empty live response",
  unsupported: "Unsupported",
  error: "Error",
  unknown: "Unknown"
};
var statusLabels = {
  loading: "Loading",
  ready: "Ready",
  warning: "Warning",
  blocked: "Blocked",
  error: "Error",
  unknown: "Unknown"
};
var defaultSourceCounts = () => Object.fromEntries(sourceKinds.map((kind) => [kind, 0]));
var coverageRatio = (coverage) => {
  if (!coverage) return void 0;
  if (typeof coverage.ratio === "number") return coverage.ratio;
  if (coverage.total === 0) return 1;
  return coverage.present / coverage.total;
};
var createAuditRecord = (input) => {
  const now = input.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const routePath = input.routePath ?? "/";
  const label = input.label ?? input.resourceKey;
  const id = input.id ?? [
    routePath,
    input.sectionId ?? "route",
    input.resourceKey,
    input.operation ?? input.request?.route ?? input.sourceKind
  ].join("::");
  return {
    id,
    routePath,
    resourceKey: input.resourceKey,
    label,
    sourceKind: input.sourceKind,
    status: input.status ?? "unknown",
    updatedAt: now,
    ...input.routePattern ? { routePattern: input.routePattern } : {},
    ...input.sectionId ? { sectionId: input.sectionId } : {},
    ...input.reason ? { reason: input.reason } : {},
    ...input.request ? { request: input.request } : {},
    ...input.operation ? { operation: input.operation } : {},
    ...input.fieldCoverage ? { fieldCoverage: input.fieldCoverage } : {},
    ...input.scenario ? { scenario: input.scenario } : {},
    ...input.sourceLocation ? { sourceLocation: input.sourceLocation } : {},
    ...typeof input.proofCritical === "boolean" ? { proofCritical: input.proofCritical } : {},
    ...input.tags ? { tags: input.tags } : {},
    ...input.metadata ? { metadata: input.metadata } : {}
  };
};

// src/route.ts
var matchesRoute = (pattern, routePath) => {
  if (pattern instanceof RegExp) return pattern.test(routePath);
  if (pattern === routePath) return true;
  const expression = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\:([A-Za-z0-9_]+)/g, "[^/]+");
  return new RegExp(`^${expression}$`).test(routePath);
};

// src/capture.ts
var evaluateCapture = (config, routePath, records) => {
  const policy = config.capture.find((candidate) => matchesRoute(candidate.route, routePath));
  if (!policy) {
    return {
      routePath,
      policyName: "No capture policy",
      status: "not-configured",
      blockers: [],
      resources: []
    };
  }
  const routeRecords = records.filter((record) => record.routePath === routePath);
  const resourceEvaluations = policy.required.map(
    (requirement) => evaluateRequirement(policy, requirement, routeRecords)
  );
  const sourceBlockers = routeRecords.filter((record) => policy.blockOn?.includes(record.sourceKind)).map((record) => `${record.resourceKey} is ${record.sourceKind}.`);
  const blockers = [
    ...resourceEvaluations.filter((result) => !result.passed).map((result) => result.reason),
    ...sourceBlockers
  ];
  return {
    routePath,
    policyName: policy.name ?? String(policy.route),
    status: blockers.length > 0 ? "blocked" : "safe",
    blockers,
    resources: resourceEvaluations
  };
};
var evaluateRequirement = (policy, requirement, records) => {
  const record = [...records].reverse().find(
    (candidate) => candidate.resourceKey === requirement.resourceKey && (!requirement.requestRoute || candidate.request?.route && matchesRoute(requirement.requestRoute, candidate.request.route))
  );
  if (!record) {
    return {
      resourceKey: requirement.resourceKey,
      passed: false,
      reason: `${requirement.resourceKey} has no record on this route.`
    };
  }
  const allowedSources = requirement.allowedSources ?? ["api"];
  if (!allowedSources.includes(record.sourceKind)) {
    return {
      resourceKey: requirement.resourceKey,
      passed: false,
      reason: `${requirement.resourceKey} must be ${allowedSources.join(" or ")}; got ${record.sourceKind}.`,
      record
    };
  }
  const minimumCoverage = requirement.minCoverage;
  const actualCoverage = coverageRatio(record.fieldCoverage);
  if (typeof minimumCoverage === "number" && typeof actualCoverage === "number" && actualCoverage < minimumCoverage) {
    return {
      resourceKey: requirement.resourceKey,
      passed: false,
      reason: `${requirement.resourceKey} needs ${Math.round(
        minimumCoverage * 100
      )}% coverage; got ${Math.round(actualCoverage * 100)}%.`,
      record
    };
  }
  if (requirement.proofCritical && policy.allowPresentationSources?.includes(record.sourceKind)) {
    return {
      resourceKey: requirement.resourceKey,
      passed: false,
      reason: `${requirement.resourceKey} is proof-critical and cannot use presentation-only source ${record.sourceKind}.`,
      record
    };
  }
  return {
    resourceKey: requirement.resourceKey,
    passed: true,
    reason: `${requirement.resourceKey} passed capture policy.`,
    record
  };
};

// src/config.ts
var InvalidMockKitConfig = class extends Error {
  name = "InvalidMockKitConfig";
};
var defineResource = (definition) => definition;
var defineSection = (definition) => definition;
var defineCapturePolicy = (policy) => policy;
var defineRedactionPolicy = (policy) => policy;
var defineMockKitConfig = (input) => {
  if (!input.project.trim()) {
    throw new InvalidMockKitConfig("MockKit config requires a non-empty project name.");
  }
  const resources = input.resources ?? [];
  const sections = input.sections ?? [];
  const capture = input.capture ?? [];
  assertUnique(
    resources.map((resource) => resource.key),
    "resource key"
  );
  assertUnique(
    sections.map((section) => section.id),
    "section id"
  );
  const resourceKeys = new Set(resources.map((resource) => resource.key));
  for (const section of sections) {
    for (const resourceKey of section.resources) {
      if (!resourceKeys.has(resourceKey)) {
        throw new InvalidMockKitConfig(
          `Section "${section.id}" references missing resource "${resourceKey}".`
        );
      }
    }
  }
  for (const policy of capture) {
    for (const requirement of policy.required) {
      if (!resourceKeys.has(requirement.resourceKey)) {
        throw new InvalidMockKitConfig(
          `Capture policy references missing resource "${requirement.resourceKey}".`
        );
      }
    }
  }
  return {
    project: input.project,
    mode: {
      default: input.mode?.default ?? "mock",
      storageKey: input.mode?.storageKey ?? `${input.project}.mockkit.mode`
    },
    resources,
    sections,
    capture,
    redaction: input.redaction ?? { default: "metadata-only" }
  };
};
var findResource = (config, resourceKey) => config.resources.find((resource) => resource.key === resourceKey);
var assertUnique = (values, label) => {
  const seen = /* @__PURE__ */ new Set();
  for (const value of values) {
    if (!value.trim()) {
      throw new InvalidMockKitConfig(`MockKit ${label} cannot be empty.`);
    }
    if (seen.has(value)) {
      throw new InvalidMockKitConfig(`Duplicate MockKit ${label}: "${value}".`);
    }
    seen.add(value);
  }
};

// src/mode.ts
var modePolicies = {
  mock: {
    mode: "mock",
    allowMockTransport: true,
    allowFallback: false,
    showInlineHighlights: false,
    blockUnknownCapability: false,
    requireLiveForCapture: false,
    requiresReloadOnChange: true
  },
  hybrid: {
    mode: "hybrid",
    allowMockTransport: false,
    allowFallback: true,
    showInlineHighlights: false,
    blockUnknownCapability: false,
    requireLiveForCapture: false,
    requiresReloadOnChange: true
  },
  live: {
    mode: "live",
    allowMockTransport: false,
    allowFallback: false,
    showInlineHighlights: false,
    blockUnknownCapability: false,
    requireLiveForCapture: false,
    requiresReloadOnChange: true
  },
  audit: {
    mode: "audit",
    allowMockTransport: false,
    allowFallback: false,
    showInlineHighlights: true,
    blockUnknownCapability: false,
    requireLiveForCapture: false,
    requiresReloadOnChange: true
  },
  capture: {
    mode: "capture",
    allowMockTransport: false,
    allowFallback: false,
    showInlineHighlights: true,
    blockUnknownCapability: true,
    requireLiveForCapture: true,
    requiresReloadOnChange: true
  }
};
var getModePolicy = (mode) => modePolicies[mode];
var statusForSourceKind = (sourceKind, mode, criticality = "proof") => {
  if (sourceKind === "api") return "ready";
  if (sourceKind === "mock") return mode === "mock" ? "ready" : "warning";
  if (sourceKind === "unsupported") return "blocked";
  if (sourceKind === "error") return "error";
  if (sourceKind === "unknown") return mode === "capture" ? "blocked" : "unknown";
  if (sourceKind === "authoredFallback" && criticality === "proof") {
    return mode === "capture" ? "blocked" : "warning";
  }
  return "warning";
};

// src/redaction.ts
var metadataOnlyFields = /* @__PURE__ */ new Set([
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
  "proofCritical",
  "tags",
  "updatedAt"
]);
var redactRecord = (record, policy = { default: "metadata-only" }) => {
  const allowed = new Set(policy.allowFields ?? metadataOnlyFields);
  const output = {};
  for (const [key, value] of Object.entries(record)) {
    if (policy.default !== "include-values" && !allowed.has(key)) continue;
    output[key] = maskValue(value, policy.maskPatterns ?? []);
  }
  return output;
};
var redactRecords = (records, policy = { default: "metadata-only" }) => records.map((record) => redactRecord(record, policy));
var maskValue = (value, patterns) => {
  if (typeof value === "string") {
    return patterns.some((pattern) => pattern.test(value)) ? "[redacted]" : value;
  }
  if (Array.isArray(value)) return value.map((entry) => maskValue(entry, patterns));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        patterns.some((pattern) => pattern.test(key)) ? "[redacted]" : maskValue(entry, patterns)
      ])
    );
  }
  return value;
};

// src/schema.ts
var import_effect = require("effect");
var SourceKindSchema = import_effect.Schema.Literal(...sourceKinds);
var AuditStatusSchema = import_effect.Schema.Literal(...auditStatuses);
var ProvenanceModeSchema = import_effect.Schema.Literal(...provenanceModes);
var FieldCoverageSchema = import_effect.Schema.Struct({
  present: import_effect.Schema.Number,
  total: import_effect.Schema.Number,
  missing: import_effect.Schema.optional(import_effect.Schema.Array(import_effect.Schema.String)),
  ratio: import_effect.Schema.optional(import_effect.Schema.Number)
});
var RequestDescriptorSchema = import_effect.Schema.Struct({
  method: import_effect.Schema.optional(import_effect.Schema.String),
  url: import_effect.Schema.optional(import_effect.Schema.String),
  route: import_effect.Schema.optional(import_effect.Schema.String),
  status: import_effect.Schema.optional(import_effect.Schema.Number)
});
var AuditRecordSchema = import_effect.Schema.Struct({
  id: import_effect.Schema.String,
  routePath: import_effect.Schema.String,
  routePattern: import_effect.Schema.optional(import_effect.Schema.String),
  sectionId: import_effect.Schema.optional(import_effect.Schema.String),
  resourceKey: import_effect.Schema.String,
  label: import_effect.Schema.String,
  sourceKind: SourceKindSchema,
  status: AuditStatusSchema,
  reason: import_effect.Schema.optional(import_effect.Schema.String),
  request: import_effect.Schema.optional(RequestDescriptorSchema),
  operation: import_effect.Schema.optional(import_effect.Schema.String),
  fieldCoverage: import_effect.Schema.optional(FieldCoverageSchema),
  proofCritical: import_effect.Schema.optional(import_effect.Schema.Boolean),
  tags: import_effect.Schema.optional(import_effect.Schema.Array(import_effect.Schema.String)),
  updatedAt: import_effect.Schema.String
});

// src/store.ts
var import_effect2 = require("effect");
var AuditStore = import_effect2.Context.GenericTag("@mockkit/core/AuditStore");
var createMemoryAuditStore = () => {
  const records = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    put(record) {
      records.set(record.id, record);
      notify();
    },
    remove(id) {
      records.delete(id);
      notify();
    },
    snapshot() {
      return Array.from(records.values()).sort(
        (left, right) => left.updatedAt.localeCompare(right.updatedAt)
      );
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      records.clear();
      notify();
    }
  };
};
var makeAuditStore = import_effect2.Effect.sync(createMemoryAuditStore);

// src/summary.ts
var sourceRiskPriority = [
  "error",
  "unsupported",
  "unknown",
  "empty",
  "authoredFallback",
  "hardcoded",
  "derived",
  "fallback",
  "mock",
  "api"
];
var statusPriority = [
  "error",
  "blocked",
  "unknown",
  "warning",
  "loading",
  "ready"
];
var countSources = (records) => {
  const counts = defaultSourceCounts();
  for (const record of records) {
    counts[record.sourceKind] += 1;
  }
  return counts;
};
var highestRiskSource = (records) => {
  if (records.length === 0) return "unknown";
  return [...records].sort(
    (left, right) => sourceRiskPriority.indexOf(left.sourceKind) - sourceRiskPriority.indexOf(right.sourceKind)
  )[0]?.sourceKind ?? "unknown";
};
var highestStatus = (records) => {
  if (records.length === 0) return "unknown";
  return [...records].sort(
    (left, right) => statusPriority.indexOf(left.status) - statusPriority.indexOf(right.status)
  )[0]?.status ?? "unknown";
};
var summariseSection = (id, label, records) => ({
  id,
  label,
  records,
  status: highestStatus(records),
  highestRisk: highestRiskSource(records),
  sourceCounts: countSources(records),
  proofCriticalCount: records.filter((record) => record.proofCritical).length,
  warningCount: records.filter((record) => record.status === "warning").length,
  blockedCount: records.filter((record) => record.status === "blocked").length
});
var summariseRoute = (config, records, routePath, mode, capture) => {
  const routeRecords = records.filter((record) => record.routePath === routePath);
  const sections = config.sections.filter((section) => matchesRoute(section.route, routePath)).map((section) => {
    const sectionRecords = routeRecords.filter(
      (record) => record.sectionId === section.id || section.resources.includes(record.resourceKey)
    );
    return summariseSection(section.id, section.label, sectionRecords);
  });
  return {
    routePath,
    mode,
    status: highestStatus(routeRecords),
    highestRisk: highestRiskSource(routeRecords),
    sourceCounts: countSources(routeRecords),
    sections,
    records: routeRecords,
    ...capture ? { capture } : {}
  };
};
var formatSourceMix = (counts) => sourceKinds.filter((sourceKind) => counts[sourceKind] > 0).map((sourceKind) => `${counts[sourceKind]} ${sourceKind}`).join(" \xB7 ") || "No records";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AuditRecordSchema,
  AuditStatusSchema,
  AuditStore,
  FieldCoverageSchema,
  InvalidMockKitConfig,
  ProvenanceModeSchema,
  RequestDescriptorSchema,
  SourceKindSchema,
  auditStatuses,
  countSources,
  coverageRatio,
  createAuditRecord,
  createMemoryAuditStore,
  defaultSourceCounts,
  defineCapturePolicy,
  defineMockKitConfig,
  defineRedactionPolicy,
  defineResource,
  defineSection,
  evaluateCapture,
  findResource,
  formatSourceMix,
  getModePolicy,
  highestRiskSource,
  highestStatus,
  makeAuditStore,
  matchesRoute,
  modePolicies,
  provenanceModes,
  redactRecord,
  redactRecords,
  sourceKindLabels,
  sourceKinds,
  sourceRiskPriority,
  statusForSourceKind,
  statusLabels,
  summariseRoute,
  summariseSection
});
//# sourceMappingURL=index.cjs.map