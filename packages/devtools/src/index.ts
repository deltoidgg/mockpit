export * from "./devtools"
export * from "./mark"
export * from "./section"

import { defineMockPitElements } from "./devtools"
import { defineMockPitMarkElement, registerAttributeMarks } from "./mark"
import { defineMockPitSectionElement } from "./section"

export const defineAllMockPitElements = (): void => {
  defineMockPitElements()
  defineMockPitMarkElement()
  defineMockPitSectionElement()
  queueMicrotask(() => registerAttributeMarks())
}
