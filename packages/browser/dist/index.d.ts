import { MockPitConfig, MockPitSnapshot, SourceKind, AuditRecordInput, AuditRecord, ProvenanceMode, ModeTransition, ScenarioState, TransportState, RouteAuditExport } from '@mockpit/core';

interface MockPitStorage {
    readonly get: (key: string) => string | null;
    readonly set: (key: string, value: string) => void;
    readonly remove: (key: string) => void;
}
declare const createMemoryStorage: () => MockPitStorage;
declare const createBrowserStorage: () => MockPitStorage;

interface MockPitRouteAdapter {
    readonly getRoutePath: () => string;
    readonly getRoutePattern?: () => string | undefined;
    readonly subscribe?: (listener: () => void) => () => void;
}
declare const createManualRouteAdapter: (initialRoutePath?: string, initialRoutePattern?: string) => MockPitRouteAdapter & {
    readonly setRoute: (routePath: string, routePattern?: string) => void;
};
declare const createBrowserRouteAdapter: () => MockPitRouteAdapter;

declare const MOCKPIT_BROWSER_VERSION = "0.2.0";
interface MockPitFetchOptions<T = unknown> {
    readonly input: RequestInfo | URL;
    readonly init?: RequestInit;
    readonly parse?: (response: Response) => Promise<T>;
    readonly requestRoute?: string;
}
interface RecordResourceInput extends Omit<AuditRecordInput, "routePath" | "updatedAt"> {
    readonly routePath?: string;
}
interface CreateMockPitClientOptions {
    readonly config?: MockPitConfig;
    readonly storage?: MockPitStorage;
    readonly fetch?: typeof globalThis.fetch;
    readonly getRoutePath?: () => string;
    readonly routeAdapter?: MockPitRouteAdapter;
    readonly now?: () => string;
    readonly exposeGlobal?: boolean;
    readonly cleanupTransport?: () => Promise<{
        readonly checked: number;
        readonly unregistered: number;
    }>;
}
interface MockPitClient {
    readonly config: MockPitConfig;
    readonly effect: {
        readonly snapshot: () => Promise<MockPitSnapshot>;
    };
    readonly fetch: <T = unknown>(resourceKey: string, input: RequestInfo | URL | MockPitFetchOptions<T>, init?: RequestInit) => Promise<T>;
    readonly wrap: <T>(resourceKey: string, operation: () => Promise<T> | T, options?: {
        readonly sourceKind?: SourceKind;
        readonly reason?: string;
    }) => Promise<T>;
    readonly record: (input: RecordResourceInput) => AuditRecord;
    readonly recordResource: (input: RecordResourceInput) => AuditRecord;
    readonly recordUiMark: (input: RecordResourceInput) => AuditRecord;
    readonly recordTransportIssue: (input: RecordResourceInput) => AuditRecord;
    readonly remove: (id: string) => void;
    readonly clear: () => void;
    readonly getMode: () => ProvenanceMode;
    readonly setMode: (mode: ProvenanceMode) => ModeTransition;
    readonly cleanupTransport: () => Promise<void>;
    readonly getRoutePath: () => string;
    readonly setRoute: (routePath: string, routePattern?: string) => void;
    readonly setScenario: (key: string, variant: string) => ScenarioState;
    readonly getScenarioState: () => ScenarioState;
    readonly getTransportState: () => TransportState;
    readonly setTransportState: (state: Partial<TransportState>) => void;
    readonly snapshot: () => MockPitSnapshot;
    readonly exportRoute: (options?: {
        readonly routePath?: string;
    }) => RouteAuditExport;
    readonly exportMarkdown: (options?: {
        readonly routePath?: string;
    }) => string;
    readonly exportJson: () => string;
    readonly subscribe: (listener: () => void) => () => void;
}
declare class MockPitResourceError extends Error {
    readonly name = "MockPitResourceError";
}
declare const createMockPitClient: (options?: CreateMockPitClientOptions) => MockPitClient;
declare global {
    interface Window {
        __MOCKPIT__?: {
            readonly version: string;
            readonly client: MockPitClient;
            readonly snapshot: () => MockPitSnapshot;
            readonly exportRoute: (options?: {
                readonly routePath?: string;
            }) => RouteAuditExport;
            readonly subscribe: (listener: () => void) => () => void;
        };
    }
}

export { type CreateMockPitClientOptions, MOCKPIT_BROWSER_VERSION, type MockPitClient, type MockPitFetchOptions, MockPitResourceError, type MockPitRouteAdapter, type MockPitStorage, type RecordResourceInput, createBrowserRouteAdapter, createBrowserStorage, createManualRouteAdapter, createMemoryStorage, createMockPitClient };
