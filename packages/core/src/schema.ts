import { Schema } from "effect"
import { auditStatuses, provenanceModes, sourceKinds } from "./model"

export const SourceKindSchema = Schema.Literal(...sourceKinds)
export const AuditStatusSchema = Schema.Literal(...auditStatuses)
export const ProvenanceModeSchema = Schema.Literal(...provenanceModes)

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
  proofCritical: Schema.optional(Schema.Boolean),
  tags: Schema.optional(Schema.Array(Schema.String)),
  updatedAt: Schema.String,
})
