export interface MockPitRouteAdapter {
  readonly getRoutePath: () => string
  readonly getRoutePattern?: () => string | undefined
  readonly subscribe?: (listener: () => void) => () => void
}

export const createManualRouteAdapter = (
  initialRoutePath = "/",
  initialRoutePattern?: string,
): MockPitRouteAdapter & {
  readonly setRoute: (routePath: string, routePattern?: string) => void
} => {
  let routePath = initialRoutePath
  let routePattern = initialRoutePattern
  const listeners = new Set<() => void>()

  return {
    getRoutePath: () => routePath,
    getRoutePattern: () => routePattern,
    setRoute(nextRoutePath, nextRoutePattern) {
      routePath = nextRoutePath
      routePattern = nextRoutePattern
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export const createBrowserRouteAdapter = (): MockPitRouteAdapter => {
  const getRoutePath = () => {
    if (typeof window === "undefined") return "/"
    return `${window.location.pathname}${window.location.search}${window.location.hash}`
  }

  return {
    getRoutePath,
    subscribe(listener) {
      if (typeof window === "undefined") return () => undefined
      const notify = () => listener()
      window.addEventListener("popstate", notify)
      window.addEventListener("hashchange", notify)
      return () => {
        window.removeEventListener("popstate", notify)
        window.removeEventListener("hashchange", notify)
      }
    },
  }
}
