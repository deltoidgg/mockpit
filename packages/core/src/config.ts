import type {
  CapturePolicy,
  MockPitConfig,
  RedactionPolicy,
  ResourceDefinition,
  ScenarioDefinition,
  SectionDefinition,
} from "./model"

export interface MockPitConfigInput {
  readonly project: string
  readonly mode?: {
    readonly default?: MockPitConfig["mode"]["default"]
    readonly storageKey?: string
  }
  readonly resources?: readonly ResourceDefinition<any>[]
  readonly sections?: readonly SectionDefinition[]
  readonly capture?: readonly CapturePolicy[]
  readonly scenarios?: readonly ScenarioDefinition[]
  readonly redaction?: RedactionPolicy
}

export class InvalidMockPitConfig extends Error {
  readonly name = "InvalidMockPitConfig"
}

export const defineResource = <A = unknown>(
  definition: ResourceDefinition<A>,
): ResourceDefinition<A> => definition

export const defineSection = (definition: SectionDefinition): SectionDefinition => definition

export const defineCapturePolicy = (policy: CapturePolicy): CapturePolicy => policy

export const defineRedactionPolicy = (policy: RedactionPolicy): RedactionPolicy => policy

export const defineScenario = (definition: ScenarioDefinition): ScenarioDefinition => definition

export const defineMockPitConfig = (input: MockPitConfigInput): MockPitConfig => {
  if (!input.project.trim()) {
    throw new InvalidMockPitConfig("MockPit config requires a non-empty project name.")
  }

  const resources = input.resources ?? []
  const sections = input.sections ?? []
  const capture = input.capture ?? []
  const scenarios = input.scenarios ?? []

  assertUnique(
    resources.map((resource) => resource.key),
    "resource key",
  )
  assertUnique(
    sections.map((section) => section.id),
    "section id",
  )
  assertUnique(
    scenarios.map((scenario) => scenario.key),
    "scenario key",
  )

  const resourceKeys = new Set(resources.map((resource) => resource.key))
  for (const section of sections) {
    for (const resourceKey of section.resources) {
      if (!resourceKeys.has(resourceKey)) {
        throw new InvalidMockPitConfig(
          `Section "${section.id}" references missing resource "${resourceKey}".`,
        )
      }
    }
  }

  for (const policy of capture) {
    for (const requirement of policy.required) {
      if (!resourceKeys.has(requirement.resourceKey)) {
        throw new InvalidMockPitConfig(
          `Capture policy references missing resource "${requirement.resourceKey}".`,
        )
      }
    }
  }

  for (const scenario of scenarios) {
    assertUnique(
      scenario.variants.map((variant) => variant.key),
      `variant key for scenario "${scenario.key}"`,
    )
    if (scenario.defaultVariant && !scenario.variants.some((variant) => variant.key === scenario.defaultVariant)) {
      throw new InvalidMockPitConfig(
        `Scenario "${scenario.key}" default variant "${scenario.defaultVariant}" is not declared.`,
      )
    }
  }

  return {
    project: input.project,
    mode: {
      default: input.mode?.default ?? "mock",
      storageKey: input.mode?.storageKey ?? `${input.project}.mockpit.mode`,
    },
    resources,
    sections,
    capture,
    scenarios,
    redaction: input.redaction ?? { default: "metadata-only" },
  }
}

export const findResource = (
  config: MockPitConfig,
  resourceKey: string,
): ResourceDefinition<any> | undefined => config.resources.find((resource) => resource.key === resourceKey)

const assertUnique = (values: readonly string[], label: string): void => {
  const seen = new Set<string>()
  for (const value of values) {
    if (!value.trim()) {
      throw new InvalidMockPitConfig(`MockPit ${label} cannot be empty.`)
    }
    if (seen.has(value)) {
      throw new InvalidMockPitConfig(`Duplicate MockPit ${label}: "${value}".`)
    }
    seen.add(value)
  }
}
