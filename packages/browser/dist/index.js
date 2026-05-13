// src/client.ts
import {
  createAuditRecord,
  createRouteAuditExport,
  createMemoryAuditStore,
  defineMockPitConfig,
  evaluateCapture,
  findResource,
  getModePolicy,
  matchesRoute,
  MissingMockPitResource,
  MockPitFallbackError,
  MockPitParseError,
  MockPitSchemaError,
  routeAuditToMarkdown,
  createInitialScenarioState,
  setScenarioVariant,
  statusForSourceKind,
  summariseRoute,
  validateUnknownWithSchema
} from "@mockpit/core";

// src/storage.ts
var createMemoryStorage = () => {
  const values = /* @__PURE__ */ new Map();
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value);
    },
    remove: (key) => {
      values.delete(key);
    }
  };
};
var createBrowserStorage = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return createMemoryStorage();
  }
  return {
    get: (key) => window.localStorage.getItem(key),
    set: (key, value) => window.localStorage.setItem(key, value),
    remove: (key) => window.localStorage.removeItem(key)
  };
};

// src/route.ts
var createManualRouteAdapter = (initialRoutePath = "/", initialRoutePattern) => {
  let routePath = initialRoutePath;
  let routePattern = initialRoutePattern;
  const listeners = /* @__PURE__ */ new Set();
  return {
    getRoutePath: () => routePath,
    getRoutePattern: () => routePattern,
    setRoute(nextRoutePath, nextRoutePattern) {
      routePath = nextRoutePath;
      routePattern = nextRoutePattern;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
};
var createBrowserRouteAdapter = () => {
  const getRoutePath = () => {
    if (typeof window === "undefined") return "/";
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  };
  return {
    getRoutePath,
    subscribe(listener) {
      if (typeof window === "undefined") return () => void 0;
      const notify = () => listener();
      window.addEventListener("popstate", notify);
      window.addEventListener("hashchange", notify);
      return () => {
        window.removeEventListener("popstate", notify);
        window.removeEventListener("hashchange", notify);
      };
    }
  };
};

// src/client.ts
var MOCKPIT_BROWSER_VERSION = "0.2.0";
var MockPitResourceError = class extends Error {
  name = "MockPitResourceError";
};
var createMockPitClient = (options = {}) => {
  const config = options.config ?? defineMockPitConfig({
    project: "mockpit"
  });
  const storage = options.storage ?? createBrowserStorage();
  const fetchImplementation = options.fetch ?? globalThis.fetch?.bind(globalThis);
  const manualRouteAdapter = createManualRouteAdapter(options.getRoutePath?.() ?? defaultRoutePath());
  const routeAdapter = options.routeAdapter ?? (options.getRoutePath ? { getRoutePath: options.getRoutePath } : createBrowserRouteAdapter());
  const getRoutePath = () => routeOverride?.routePath ?? routeAdapter.getRoutePath();
  const now = options.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const store = createMemoryAuditStore();
  const listeners = /* @__PURE__ */ new Set();
  let cachedSnapshot;
  let mode = readStoredMode(storage, config.mode.storageKey, config.mode.default);
  let routeOverride;
  let scenarios = readScenarioState(storage, scenarioStorageKey(config), config, now());
  let transport = {
    mockTransportActive: mode === "mock",
    cleanupRequired: false,
    requiresReload: false
  };
  const notify = () => {
    cachedSnapshot = void 0;
    for (const listener of listeners) listener();
  };
  const record = (input) => {
    const resource = findResource(config, input.resourceKey);
    const routePath = input.routePath ?? getRoutePath();
    const section = config.sections.find(
      (candidate) => matchesRoute(candidate.route, routePath) && candidate.resources.includes(input.resourceKey)
    );
    const criticality = resource?.criticality ?? section?.criticality ?? "proof";
    const record2 = createAuditRecord({
      ...input,
      kind: input.kind ?? "resource",
      routePath,
      routePattern: input.routePattern ?? routeOverride?.routePattern ?? routeAdapter.getRoutePattern?.(),
      sectionId: input.sectionId ?? section?.id,
      label: input.label ?? resource?.label ?? input.resourceKey,
      status: input.status ?? statusForSourceKind(input.sourceKind, mode, criticality),
      proofCritical: input.proofCritical ?? criticality === "proof",
      updatedAt: now()
    });
    cachedSnapshot = void 0;
    store.put(record2);
    return record2;
  };
  const snapshot = () => {
    if (cachedSnapshot) return cachedSnapshot;
    const routePath = getRoutePath();
    const records = store.snapshot();
    const capture = evaluateCapture(config, routePath, records);
    const summary = summariseRoute(config, records, routePath, mode, capture);
    cachedSnapshot = {
      version: MOCKPIT_BROWSER_VERSION,
      project: config.project,
      mode,
      routePath,
      records,
      summary,
      scenarios,
      transport,
      updatedAt: now()
    };
    return cachedSnapshot;
  };
  const client = {
    config,
    effect: {
      snapshot: async () => snapshot()
    },
    async fetch(resourceKey, input, init) {
      if (!fetchImplementation) {
        throw new MockPitResourceError("MockPit fetch requires a fetch implementation.");
      }
      const resource = findResource(config, resourceKey);
      if (!resource) {
        throw new MissingMockPitResource(resourceKey);
      }
      const request = normaliseFetchOptions(input, init);
      const descriptor = requestDescriptor(request);
      const routePath = getRoutePath();
      const policy = getModePolicy(mode);
      try {
        const response = await fetchImplementation(request.input, request.init);
        const parsed = await parseResponse(response, request.parse);
        const validated = validateResourceData(resource, parsed);
        const assessment = await assess(resource, validated, routePath, descriptor);
        if ((assessment.empty || assessment.unsupported) && policy.allowFallback && resource.fallback) {
          return resolveFallback(resource, routePath, descriptor, assessment.reason, assessment);
        }
        const sourceKind = classifyResponse(response, mode);
        const finalSource = assessment.unsupported ? "unsupported" : assessment.empty ? "empty" : sourceKind;
        record({
          resourceKey,
          sourceKind: finalSource,
          status: statusForSourceKind(finalSource, mode, resource.criticality),
          reason: assessment.reason ?? (response.ok ? `Loaded from ${descriptor.route ?? descriptor.url ?? "request"}.` : response.statusText),
          request: { ...descriptor, status: response.status },
          fieldCoverage: assessment.coverage,
          metadata: assessment.metadata,
          remediation: resource.remediation
        });
        return validated;
      } catch (error) {
        if (policy.allowFallback && resource.fallback) {
          return resolveFallback(
            resource,
            routePath,
            descriptor,
            error instanceof Error ? error.message : "Live data unavailable.",
            void 0,
            error
          );
        }
        record({
          resourceKey,
          sourceKind: "error",
          status: "error",
          reason: error instanceof Error ? error.message : "Request failed.",
          request: descriptor,
          remediation: resource.remediation,
          metadata: { error }
        });
        throw error;
      }
    },
    async wrap(resourceKey, operation, options2) {
      try {
        const value = await operation();
        record({
          kind: "resource",
          resourceKey,
          sourceKind: options2?.sourceKind ?? "api",
          reason: options2?.reason ?? "Loaded through wrapped operation."
        });
        return value;
      } catch (error) {
        record({
          kind: "resource",
          resourceKey,
          sourceKind: "error",
          status: "error",
          reason: error instanceof Error ? error.message : "Wrapped operation failed."
        });
        throw error;
      }
    },
    record,
    recordResource: (input) => record({ ...input, kind: "resource" }),
    recordUiMark: (input) => record({ ...input, kind: "uiMark", recordedBy: input.recordedBy ?? "ui" }),
    recordTransportIssue: (input) => record({ ...input, kind: "transport", recordedBy: input.recordedBy ?? "transport" }),
    remove(id) {
      cachedSnapshot = void 0;
      store.remove(id);
    },
    clear() {
      cachedSnapshot = void 0;
      store.clear();
    },
    getMode: () => mode,
    setMode(nextMode) {
      const previousMode = mode;
      mode = nextMode;
      storage.set(config.mode.storageKey, nextMode);
      const transition = {
        previousMode,
        nextMode,
        requiresReload: previousMode !== nextMode && (previousMode === "mock" || nextMode === "mock"),
        transportCleanupRequired: previousMode === "mock" && nextMode !== "mock" && transport.mockTransportActive,
        reason: previousMode === "mock" && nextMode !== "mock" ? "Leaving mock mode may require MSW cleanup and a reload." : void 0
      };
      transport = {
        ...transport,
        mockTransportActive: nextMode === "mock",
        cleanupRequired: transition.transportCleanupRequired,
        requiresReload: transition.requiresReload
      };
      notify();
      return transition;
    },
    async cleanupTransport() {
      if (!options.cleanupTransport) {
        transport = { ...transport, cleanupRequired: false };
        notify();
        return;
      }
      const result = await options.cleanupTransport();
      transport = {
        ...transport,
        cleanupRequired: false,
        requiresReload: result.unregistered > 0,
        lastCleanup: { ...result, updatedAt: now() }
      };
      notify();
    },
    getRoutePath,
    setRoute(routePath, routePattern) {
      routeOverride = { routePath, ...routePattern ? { routePattern } : {} };
      manualRouteAdapter.setRoute(routePath, routePattern);
      notify();
    },
    setScenario(key, variant) {
      scenarios = setScenarioVariant(scenarios, key, variant, now());
      storage.set(scenarioStorageKey(config), JSON.stringify(scenarios));
      notify();
      return scenarios;
    },
    getScenarioState: () => scenarios,
    getTransportState: () => transport,
    setTransportState(state) {
      transport = { ...transport, ...state };
      notify();
    },
    snapshot,
    exportRoute(options2) {
      return createRouteAuditExport({
        config,
        routePath: options2?.routePath ?? getRoutePath(),
        mode,
        records: store.snapshot(),
        generatedAt: now(),
        scenarios,
        transport
      });
    },
    exportMarkdown(options2) {
      return routeAuditToMarkdown(client.exportRoute(options2));
    },
    exportJson() {
      return JSON.stringify(client.exportRoute(), null, 2);
    },
    subscribe(listener) {
      const removeStoreListener = store.subscribe(listener);
      listeners.add(listener);
      return () => {
        removeStoreListener();
        listeners.delete(listener);
      };
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key === config.mode.storageKey && event.newValue) {
        mode = readStoredMode(storage, config.mode.storageKey, config.mode.default);
        notify();
      }
    });
  }
  if (options.exposeGlobal !== false) exposeMockPitGlobal(client);
  async function resolveFallback(resource, routePath, request, reason = "Live data unavailable.", assessment, error) {
    if (!resource.fallback) {
      throw new MockPitFallbackError(`Resource "${resource.key}" has no fallback resolver.`);
    }
    let fallback;
    try {
      fallback = await resource.fallback({
        resourceKey: resource.key,
        routePath,
        reason,
        request,
        error,
        assessment
      });
    } catch (fallbackError) {
      throw new MockPitFallbackError(`Fallback resolver failed for "${resource.key}".`, fallbackError);
    }
    record({
      resourceKey: resource.key,
      sourceKind: "fallback",
      status: statusForSourceKind("fallback", mode, resource.criticality),
      reason,
      request,
      fallbackSource: resource.fallbackSource,
      remediation: resource.remediation,
      metadata: { fallback: true, fallbackSource: resource.fallbackSource }
    });
    return fallback;
  }
  return client;
};
var normaliseFetchOptions = (input, init) => {
  if (isFetchOptions(input)) return input;
  return { input, ...init ? { init } : {} };
};
var isFetchOptions = (input) => Boolean(input && typeof input === "object" && "input" in input);
var requestDescriptor = (options) => {
  const request = options.input instanceof Request ? options.input : void 0;
  const method = (options.init?.method ?? request?.method ?? "GET").toUpperCase();
  const url = request?.url ?? String(options.input);
  return {
    method,
    url,
    route: options.requestRoute ?? `${method} ${url}`
  };
};
var parseResponse = async (response, parser) => {
  if (parser) return parser(response);
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    throw new MockPitParseError(`Request failed with HTTP ${response.status}.`);
  }
  try {
    if (contentType.includes("application/json")) return response.json();
    return response.text();
  } catch (error) {
    throw new MockPitParseError("Response parsing failed.", error);
  }
};
var validateResourceData = (resource, data) => {
  if (!resource.schema) return data;
  try {
    return validateUnknownWithSchema(resource.schema, data);
  } catch (error) {
    throw new MockPitSchemaError(`Schema validation failed for "${resource.key}".`, error);
  }
};
var assess = async (resource, data, routePath, request) => {
  if (!resource.assess) return {};
  return resource.assess(data, { resourceKey: resource.key, routePath, request });
};
var classifyResponse = (response, mode) => {
  const sourceHeader = response.headers.get("x-mockpit-source") ?? response.headers.get("x-provenance-source");
  if (sourceHeader === "mock") return "mock";
  if (mode === "mock") return "mock";
  return "api";
};
var readStoredMode = (storage, key, fallback) => {
  const value = storage.get(key);
  if (value === "mock" || value === "hybrid" || value === "live" || value === "audit" || value === "capture") {
    return value;
  }
  return fallback;
};
var defaultRoutePath = () => {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
};
var exposeMockPitGlobal = (client) => {
  if (typeof window === "undefined") return;
  window.__MOCKPIT__ = {
    version: MOCKPIT_BROWSER_VERSION,
    client,
    snapshot: () => client.snapshot(),
    exportRoute: (options) => client.exportRoute(options),
    subscribe: (listener) => client.subscribe(listener)
  };
};
var scenarioStorageKey = (config) => `${config.project}.mockpit.scenarios`;
var readScenarioState = (storage, key, config, now) => {
  const value = storage.get(key);
  if (!value) return createInitialScenarioState(config, now);
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && parsed.selected) return parsed;
  } catch {
  }
  return createInitialScenarioState(config, now);
};
export {
  MOCKPIT_BROWSER_VERSION,
  MockPitResourceError,
  createBrowserRouteAdapter,
  createBrowserStorage,
  createManualRouteAdapter,
  createMemoryStorage,
  createMockPitClient
};
//# sourceMappingURL=index.js.map