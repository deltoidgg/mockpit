import { Schema } from "effect"
import { auditStatuses, provenanceModes, sourceKinds } from "./model"

export const SourceKindSchema = Schema.Literal(...sourceKinds)
export const AuditStatusSchema = Schema.Literal(...auditStatuses)
export const ProvenanceModeSchema = Schema.Literal(...provenanceModes)
export const AuditRecordKindSchema = Schema.Literal("resource", "uiMark", "section", "transport")
export const AuditRecordVisibilitySchema = Schema.Literal("mounted", "stale", "unmounted")

export const FieldCoverageSchema = Schema.Struct({
  present: Schema.Number,
  total: Schema.Number,
  missing: Schema.optional(Schema.Array(Schema.String)),
  ratio: Schema.optional(Schema.Number),
})

export const RequestDescriptorSchema = Schema.Struct({
  method: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  route: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Number),
})

export const AuditRecordSchema = Schema.Struct({
  id: Schema.String,
  kind: Schema.optional(AuditRecordKindSchema),
  visibility: Schema.optional(AuditRecordVisibilitySchema),
  routePath: Schema.String,
  routePattern: Schema.optional(Schema.String),
  sectionId: Schema.optional(Schema.String),
  resourceKey: Schema.String,
  label: Schema.String,
  sourceKind: SourceKindSchema,
  status: AuditStatusSchema,
  reason: Schema.optional(Schema.String),
  request: Schema.optional(RequestDescriptorSchema),
  operation: Schema.optional(Schema.String),
  fieldCoverage: Schema.optional(FieldCoverageSchema),
  fallbackSource: Schema.optional(Schema.String),
  remediation: Schema.optional(Schema.String),
  recordedBy: Schema.optional(Schema.String),
  proofCritical: Schema.optional(Schema.Boolean),
  tags: Schema.optional(Schema.Array(Schema.String)),
  updatedAt: Schema.String,
})

export const ScenarioDefinitionSchema = Schema.Struct({
  key: Schema.String,
  label: Schema.String,
  variants: Schema.Array(
    Schema.Struct({
      key: Schema.String,
      label: Schema.String,
      description: Schema.optional(Schema.String),
    }),
  ),
  defaultVariant: Schema.optional(Schema.String),
})

export const RedactionPolicySchema = Schema.Struct({
  default: Schema.optional(Schema.Literal("metadata-only", "include-values")),
  allowFields: Schema.optional(Schema.Array(Schema.String)),
})

export const ExportManifestSchema = Schema.Struct({
  project: Schema.String,
  generatedAt: Schema.String,
  routes: Schema.Array(Schema.String),
  recordCount: Schema.Number,
  redaction: RedactionPolicySchema,
})

export const validateUnknownWithSchema = <A>(schema: unknown, value: unknown): A => {
  if (!schema) return value as A
  return Schema.decodeUnknownSync(schema as Schema.Schema<A>)(value)
}
