// src/client.ts
import {
  createAuditRecord,
  createMemoryAuditStore,
  defineMockKitConfig,
  evaluateCapture,
  findResource,
  getModePolicy,
  matchesRoute,
  redactRecords,
  statusForSourceKind,
  summariseRoute
} from "@mockkit/core";

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

// src/client.ts
var MockKitResourceError = class extends Error {
  name = "MockKitResourceError";
};
var createMockKitClient = (options = {}) => {
  const config = options.config ?? defineMockKitConfig({
    project: "mockkit"
  });
  const storage = options.storage ?? createBrowserStorage();
  const fetchImplementation = options.fetch ?? globalThis.fetch?.bind(globalThis);
  const getRoutePath = options.getRoutePath ?? defaultRoutePath;
  const now = options.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const store = createMemoryAuditStore();
  const listeners = /* @__PURE__ */ new Set();
  let mode = readStoredMode(storage, config.mode.storageKey, config.mode.default);
  const notify = () => {
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
      routePath,
      sectionId: input.sectionId ?? section?.id,
      label: input.label ?? resource?.label ?? input.resourceKey,
      status: input.status ?? statusForSourceKind(input.sourceKind, mode, criticality),
      proofCritical: input.proofCritical ?? criticality === "proof",
      updatedAt: now()
    });
    store.put(record2);
    return record2;
  };
  const snapshot = () => {
    const routePath = getRoutePath();
    const records = store.snapshot();
    const capture = evaluateCapture(config, routePath, records);
    const summary = summariseRoute(config, records, routePath, mode, capture);
    return {
      project: config.project,
      mode,
      routePath,
      records,
      summary,
      updatedAt: now()
    };
  };
  const client = {
    config,
    effect: {
      snapshot: async () => snapshot()
    },
    async fetch(resourceKey, input, init) {
      if (!fetchImplementation) {
        throw new MockKitResourceError("MockKit fetch requires a fetch implementation.");
      }
      const resource = findResource(config, resourceKey);
      if (!resource) {
        throw new MockKitResourceError(`Unknown MockKit resource "${resourceKey}".`);
      }
      const request = normaliseFetchOptions(input, init);
      const descriptor = requestDescriptor(request);
      const routePath = getRoutePath();
      const policy = getModePolicy(mode);
      try {
        const response = await fetchImplementation(request.input, request.init);
        const parsed = await parseResponse(response, request.parse);
        const assessment = await assess(resource, parsed, routePath, descriptor);
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
          metadata: assessment.metadata
        });
        return parsed;
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
          metadata: { error }
        });
        throw error;
      }
    },
    async wrap(resourceKey, operation, options2) {
      try {
        const value = await operation();
        record({
          resourceKey,
          sourceKind: options2?.sourceKind ?? "api",
          reason: options2?.reason ?? "Loaded through wrapped operation."
        });
        return value;
      } catch (error) {
        record({
          resourceKey,
          sourceKind: "error",
          status: "error",
          reason: error instanceof Error ? error.message : "Wrapped operation failed."
        });
        throw error;
      }
    },
    record,
    recordUiMark: record,
    remove(id) {
      store.remove(id);
    },
    clear() {
      store.clear();
    },
    getMode: () => mode,
    setMode(nextMode) {
      mode = nextMode;
      storage.set(config.mode.storageKey, nextMode);
      notify();
    },
    getRoutePath,
    snapshot,
    exportJson() {
      const current = snapshot();
      return JSON.stringify(
        {
          ...current,
          records: redactRecords(current.records, config.redaction),
          summary: {
            ...current.summary,
            records: redactRecords(current.summary.records, config.redaction)
          }
        },
        null,
        2
      );
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
  if (options.exposeGlobal !== false) exposeMockKitGlobal(client);
  async function resolveFallback(resource, routePath, request, reason = "Live data unavailable.", assessment, error) {
    if (!resource.fallback) {
      throw new MockKitResourceError(`Resource "${resource.key}" has no fallback resolver.`);
    }
    const fallback = await resource.fallback({
      resourceKey: resource.key,
      routePath,
      reason,
      request,
      error,
      assessment
    });
    record({
      resourceKey: resource.key,
      sourceKind: "fallback",
      status: statusForSourceKind("fallback", mode, resource.criticality),
      reason,
      request,
      metadata: { fallback: true }
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
  const method = options.init?.method?.toUpperCase() ?? "GET";
  const url = String(options.input);
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
    throw new MockKitResourceError(`Request failed with HTTP ${response.status}.`);
  }
  if (contentType.includes("application/json")) return response.json();
  return response.text();
};
var assess = async (resource, data, routePath, request) => {
  if (!resource.assess) return {};
  return resource.assess(data, { resourceKey: resource.key, routePath, request });
};
var classifyResponse = (response, mode) => {
  const sourceHeader = response.headers.get("x-mockkit-source") ?? response.headers.get("x-provenance-source");
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
var exposeMockKitGlobal = (client) => {
  if (typeof window === "undefined") return;
  window.__MOCKKIT__ = {
    client,
    snapshot: () => client.snapshot(),
    subscribe: (listener) => client.subscribe(listener)
  };
};
export {
  MockKitResourceError,
  createBrowserStorage,
  createMemoryStorage,
  createMockKitClient
};
//# sourceMappingURL=index.js.map