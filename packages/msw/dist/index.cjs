"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  cleanupMswWorkers: () => cleanupMswWorkers,
  extractRequest: () => extractRequest,
  isCriticalRequest: () => isCriticalRequest,
  recordCriticalUnhandledRequest: () => recordCriticalUnhandledRequest,
  resolveClient: () => resolveClient,
  setupMockPitServer: () => setupMockPitServer,
  setupMockPitWorker: () => setupMockPitWorker,
  withMockPitHandler: () => withMockPitHandler
});
module.exports = __toCommonJS(index_exports);

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
  return window.__MOCKPIT__?.client;
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
var recordCriticalUnhandledRequest = (mockpit, request) => {
  const record = mockpit?.recordTransportIssue({
    resourceKey: `transport.${request.method}.${request.url}`,
    label: "Unhandled critical mock request",
    sourceKind: "unknown",
    status: "blocked",
    reason: "Critical request was not handled by mock transport.",
    request: {
      method: request.method,
      url: request.url,
      route: `${request.method} ${request.url}`
    },
    metadata: { adapter: "msw" }
  });
  if (!record || !mockpit) return;
  mockpit.setTransportState({
    issues: [...mockpit.getTransportState().issues ?? [], record]
  });
};
var safePathname = (url) => {
  try {
    return new URL(url, "http://mockpit.local").pathname;
  } catch {
    return url;
  }
};

// src/handlers.ts
var withMockPitHandler = (resourceKey, resolver, options = {}) => async (...args) => {
  const client = resolveClient(options.mockpit);
  try {
    const result = await resolver(...args);
    const request = extractRequest(args[0]);
    client?.record({
      resourceKey,
      label: options.label,
      sourceKind: "mock",
      reason: "Served by MSW handler.",
      recordedBy: "msw",
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
    client?.setTransportState({
      mockTransportActive: true,
      handlers: [
        ...client.getTransportState().handlers ?? [],
        {
          resourceKey,
          method: options.method ?? request?.method,
          url: options.url ?? request?.url,
          label: options.label,
          scenario: options.scenario
        }
      ]
    });
    return tagMockResponse(result);
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
    return new URL(url, "http://mockpit.local").pathname;
  } catch {
    return url;
  }
};
var tagMockResponse = (result) => {
  if (typeof Response === "undefined" || !(result instanceof Response)) return result;
  const headers = new Headers(result.headers);
  headers.set("x-mockpit-source", "mock");
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers
  });
};

// src/server.ts
var setupMockPitServer = async ({
  mockpit,
  handlers,
  critical = []
}) => {
  const { setupServer } = await import("msw/node");
  const server = setupServer(...handlers);
  const originalListen = server.listen.bind(server);
  const originalClose = server.close.bind(server);
  return {
    ...server,
    listen(options) {
      const listenOptions = options ?? {};
      mockpit?.setTransportState({
        mockTransportActive: true,
        cleanupRequired: false,
        requiresReload: false
      });
      return originalListen({
        ...listenOptions,
        onUnhandledRequest(request, print) {
          const criticalRequest = extractRequest(request);
          if (criticalRequest && isCriticalRequest(criticalRequest, critical)) {
            recordCriticalUnhandledRequest(mockpit, criticalRequest);
          }
          if (typeof listenOptions.onUnhandledRequest === "function") {
            return listenOptions.onUnhandledRequest(request, print);
          }
          if (listenOptions.onUnhandledRequest === "error") print.error();
          if (listenOptions.onUnhandledRequest === "warn" || !listenOptions.onUnhandledRequest) {
            print.warning();
          }
          return void 0;
        }
      });
    },
    close() {
      mockpit?.setTransportState({
        mockTransportActive: false,
        cleanupRequired: false,
        requiresReload: false
      });
      return originalClose();
    }
  };
};

// src/worker.ts
var setupMockPitWorker = async ({
  mockpit,
  handlers,
  critical = []
}) => {
  const { setupWorker } = await import("msw/browser");
  const worker = setupWorker(...handlers);
  const originalStart = worker.start.bind(worker);
  const originalStop = worker.stop?.bind(worker);
  return {
    ...worker,
    start(options) {
      const startOptions = options ?? {};
      mockpit?.setTransportState({
        mockTransportActive: true,
        cleanupRequired: false,
        requiresReload: false
      });
      return originalStart({
        ...startOptions,
        onUnhandledRequest(request, print) {
          const criticalRequest = extractRequest(request);
          if (criticalRequest && isCriticalRequest(criticalRequest, critical)) {
            recordCriticalUnhandledRequest(mockpit, criticalRequest);
          }
          if (typeof startOptions.onUnhandledRequest === "function") {
            return startOptions.onUnhandledRequest(request, print);
          }
          if (startOptions.onUnhandledRequest === "error") print.error();
          if (startOptions.onUnhandledRequest === "warn" || !startOptions.onUnhandledRequest) {
            print.warning();
          }
          return void 0;
        }
      });
    },
    stop() {
      mockpit?.setTransportState({
        mockTransportActive: false,
        cleanupRequired: true,
        requiresReload: true
      });
      return originalStop?.();
    }
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cleanupMswWorkers,
  extractRequest,
  isCriticalRequest,
  recordCriticalUnhandledRequest,
  resolveClient,
  setupMockPitServer,
  setupMockPitWorker,
  withMockPitHandler
});
//# sourceMappingURL=index.cjs.map