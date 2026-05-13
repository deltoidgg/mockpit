export interface CleanupMswWorkersOptions {
  readonly scriptName?: string
}

export interface CleanupMswWorkersResult {
  readonly checked: number
  readonly unregistered: number
}

export const cleanupMswWorkers = async ({
  scriptName = "/mockServiceWorker.js",
}: CleanupMswWorkersOptions = {}): Promise<CleanupMswWorkersResult> => {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) {
    return { checked: 0, unregistered: 0 }
  }

  const registrations = await navigator.serviceWorker.getRegistrations()
  let unregistered = 0

  for (const registration of registrations) {
    const scriptUrl =
      registration.active?.scriptURL ??
      registration.waiting?.scriptURL ??
      registration.installing?.scriptURL
    if (!scriptUrl) continue
    if (!scriptUrl.endsWith(scriptName)) continue
    const removed = await registration.unregister()
    if (removed) unregistered += 1
  }

  return {
    checked: registrations.length,
    unregistered,
  }
}
