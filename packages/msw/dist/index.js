// src/cleanup.ts
var cleanupMswWorkers = async ({
  scriptName = "/mockServiceWorker.js"
} = {}) => {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) {
    return { checked: 0, unregistered: 0 };
  }
  const registrations = await navigator.serviceWorker.getRegistrations();
  let unregistered = 0;
  for (const registration of registrations) {
    const scriptUrl = registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? registration.installing?.scriptURL;
    if (!scriptUrl) continue;
    if (!scriptUrl.endsWith(scriptName)) continue;
    const removed = await registration.unregister();
    if (removed) unregistered += 1;
  }
  return {
    checked: registrations.length,
    unregistered
  };
};

// src/shared.ts
var resolveClient = (client) => {
  if (client) return client;
  if (typeof window === "undefined") return void 0;
  return window.__MOCKKIT__?.client;
};
var extractRequest = (value) => {
  const candidate = value;
  const request = candidate?.request ?? (value instanceof Request ? value : void 0);
  if (request) {
    return {
      method: request.method.toUpperCase(),
      url: request.url
    };
  }
  if (candidate?.method && candidate.url) {
    return {
      method: candidate.method.toUpperCase(),
      url: candidate.url
    };
  }
  return void 0;
};
var isCriticalRequest = (request, critical = []) => {
  const pathname = safePathname(request.url);
  const route = `${request.method} ${pathname}`;
  const fullRoute = `${request.method} ${request.url}`;
  return critical.some((matcher) => {
    if (typeof matcher === "function") return matcher(request);
    if (matcher instanceof RegExp) return matcher.test(route) || matcher.test(fullRoute);
    return matcher === route || matcher === fullRoute;
  });
};
var safePathname = (url) => {
  try {
    return new URL(url, "http://mockkit.local").pathname;
  } catch {
    return url;
  }
};

// src/handlers.ts
var withMockKitHandler = (resourceKey, resolver, options = {}) => async (...args) => {
  const client = resolveClient(options.mockkit);
  try {
    const result = await resolver(...args);
    const request = extractRequest(args[0]);
    client?.record({
      resourceKey,
      label: options.label,
      sourceKind: "mock",
      reason: "Served by MSW handler.",
      request: request ? {
        method: request.method,
        url: request.url,
        route: `${request.method} ${safePathname2(request.url)}`
      } : void 0,
      metadata: {
        adapter: "msw",
        ...options.scenario ? { scenario: options.scenario } : {}
      }
    });
    return result;
  } catch (error) {
    client?.record({
      resourceKey,
      label: options.label,
      sourceKind: "error",
      status: "error",
      reason: error instanceof Error ? error.message : "MSW handler failed.",
      metadata: { adapter: "msw", error }
    });
    throw error;
  }
};
var safePathname2 = (url) => {
  try {
    return new URL(url, "http://mockkit.local").pathname;
  } catch {
    return url;
  }
};

// src/server.ts
var setupMockKitServer = async ({
  mockkit,
  handlers,
  critical = []
}) => {
  const { setupServer } = await import("msw/node");
  const server = setupServer(...handlers);
  const originalListen = server.listen.bind(server);
  return {
    ...server,
    listen(options = {}) {
      return originalListen({
        ...options,
        onUnhandledRequest(request, print) {
          const criticalRequest = extractRequest(request);
          if (criticalRequest && isCriticalRequest(criticalRequest, critical)) {
            mockkit?.record({
              resourceKey: `transport.${criticalRequest.method}.${criticalRequest.url}`,
              label: "Unhandled critical mock request",
              sourceKind: "unknown",
              status: "blocked",
              reason: "Critical request was not handled by mock transport.",
              request: {
                method: criticalRequest.method,
                url: criticalRequest.url,
                route: `${criticalRequest.method} ${criticalRequest.url}`
              },
              metadata: { adapter: "msw" }
            });
          }
          if (typeof options.onUnhandledRequest === "function") {
            return options.onUnhandledRequest(
              request,
              print
            );
          }
          return void 0;
        }
      });
    }
  };
};

// src/worker.ts
var setupMockKitWorker = async ({
  mockkit,
  handlers,
  critical = []
}) => {
  const { setupWorker } = await import("msw/browser");
  const worker = setupWorker(...handlers);
  const originalStart = worker.start.bind(worker);
  return {
    ...worker,
    start(options = {}) {
      return originalStart({
        ...options,
        onUnhandledRequest(request, print) {
          const criticalRequest = extractRequest(request);
          if (criticalRequest && isCriticalRequest(criticalRequest, critical)) {
            mockkit?.record({
              resourceKey: `transport.${criticalRequest.method}.${criticalRequest.url}`,
              label: "Unhandled critical mock request",
              sourceKind: "unknown",
              status: "blocked",
              reason: "Critical request was not handled by mock transport.",
              request: {
                method: criticalRequest.method,
                url: criticalRequest.url,
                route: `${criticalRequest.method} ${criticalRequest.url}`
              },
              metadata: { adapter: "msw" }
            });
          }
          if (typeof options.onUnhandledRequest === "function") {
            return options.onUnhandledRequest(
              request,
              print
            );
          }
          return void 0;
        }
      });
    }
  };
};
export {
  cleanupMswWorkers,
  extractRequest,
  isCriticalRequest,
  resolveClient,
  setupMockKitServer,
  setupMockKitWorker,
  withMockKitHandler
};
//# sourceMappingURL=index.js.map