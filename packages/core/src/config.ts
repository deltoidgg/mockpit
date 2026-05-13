import type {
  CapturePolicy,
  MockKitConfig,
  RedactionPolicy,
  ResourceDefinition,
  SectionDefinition,
} from "./model"

export interface MockKitConfigInput {
  readonly project: string
  readonly mode?: {
    readonly default?: MockKitConfig["mode"]["default"]
    readonly storageKey?: string
  }
  readonly resources?: readonly ResourceDefinition<any>[]
  readonly sections?: readonly SectionDefinition[]
  readonly capture?: readonly CapturePolicy[]
  readonly redaction?: RedactionPolicy
}

export class InvalidMockKitConfig extends Error {
  readonly name = "InvalidMockKitConfig"
}

export const defineResource = <A = unknown>(
  definition: ResourceDefinition<A>,
): ResourceDefinition<A> => definition

export const defineSection = (definition: SectionDefinition): SectionDefinition => definition

export const defineCapturePolicy = (policy: CapturePolicy): CapturePolicy => policy

export const defineRedactionPolicy = (policy: RedactionPolicy): RedactionPolicy => policy

export const defineMockKitConfig = (input: MockKitConfigInput): MockKitConfig => {
  if (!input.project.trim()) {
    throw new InvalidMockKitConfig("MockKit config requires a non-empty project name.")
  }

  const resources = input.resources ?? []
  const sections = input.sections ?? []
  const capture = input.capture ?? []

  assertUnique(
    resources.map((resource) => resource.key),
    "resource key",
  )
  assertUnique(
    sections.map((section) => section.id),
    "section id",
  )

  const resourceKeys = new Set(resources.map((resource) => resource.key))
  for (const section of sections) {
    for (const resourceKey of section.resources) {
      if (!resourceKeys.has(resourceKey)) {
        throw new InvalidMockKitConfig(
          `Section "${section.id}" references missing resource "${resourceKey}".`,
        )
      }
    }
  }

  for (const policy of capture) {
    for (const requirement of policy.required) {
      if (!resourceKeys.has(requirement.resourceKey)) {
        throw new InvalidMockKitConfig(
          `Capture policy references missing resource "${requirement.resourceKey}".`,
        )
      }
    }
  }

  return {
    project: input.project,
    mode: {
      default: input.mode?.default ?? "mock",
      storageKey: input.mode?.storageKey ?? `${input.project}.mockkit.mode`,
    },
    resources,
    sections,
    capture,
    redaction: input.redaction ?? { default: "metadata-only" },
  }
}

export const findResource = (
  config: MockKitConfig,
  resourceKey: string,
): ResourceDefinition<any> | undefined => config.resources.find((resource) => resource.key === resourceKey)

const assertUnique = (values: readonly string[], label: string): void => {
  const seen = new Set<string>()
  for (const value of values) {
    if (!value.trim()) {
      throw new InvalidMockKitConfig(`MockKit ${label} cannot be empty.`)
    }
    if (seen.has(value)) {
      throw new InvalidMockKitConfig(`Duplicate MockKit ${label}: "${value}".`)
    }
    seen.add(value)
  }
}
