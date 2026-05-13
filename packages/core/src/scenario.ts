import type { MockPitConfig, ScenarioState } from "./model"

export const createInitialScenarioState = (
  config: MockPitConfig,
  now = new Date().toISOString(),
): ScenarioState => ({
  selected: Object.fromEntries(
    config.scenarios.map((scenario) => [
      scenario.key,
      scenario.defaultVariant ?? scenario.variants[0]?.key ?? "default",
    ]),
  ),
  updatedAt: now,
})

export const setScenarioVariant = (
  state: ScenarioState,
  key: string,
  variant: string,
  now = new Date().toISOString(),
): ScenarioState => ({
  selected: {
    ...state.selected,
    [key]: variant,
  },
  updatedAt: now,
})
