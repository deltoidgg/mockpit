export interface MockKitStorage {
  readonly get: (key: string) => string | null
  readonly set: (key: string, value: string) => void
  readonly remove: (key: string) => void
}

export const createMemoryStorage = (): MockKitStorage => {
  const values = new Map<string, string>()
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value)
    },
    remove: (key) => {
      values.delete(key)
    },
  }
}

export const createBrowserStorage = (): MockKitStorage => {
  if (typeof window === "undefined" || !window.localStorage) {
    return createMemoryStorage()
  }

  return {
    get: (key) => window.localStorage.getItem(key),
    set: (key, value) => window.localStorage.setItem(key, value),
    remove: (key) => window.localStorage.removeItem(key),
  }
}
