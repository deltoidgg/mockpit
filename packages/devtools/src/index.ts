export * from "./devtools"
export * from "./mark"

import { defineMockKitElements } from "./devtools"
import { defineMockKitMarkElement } from "./mark"

export const defineAllMockKitElements = (): void => {
  defineMockKitElements()
  defineMockKitMarkElement()
}
