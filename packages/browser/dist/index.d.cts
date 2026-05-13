import { MockKitConfig, MockKitSnapshot, SourceKind, AuditRecordInput, AuditRecord, ProvenanceMode } from '@mockkit/core';

interface MockKitStorage {
    readonly get: (key: string) => string | null;
    readonly set: (key: string, value: string) => void;
    readonly remove: (key: string) => void;
}
declare const createMemoryStorage: () => MockKitStorage;
declare const createBrowserStorage: () => MockKitStorage;

interface MockKitFetchOptions<T = unknown> {
    readonly input: RequestInfo | URL;
    readonly init?: RequestInit;
    readonly parse?: (response: Response) => Promise<T>;
    readonly requestRoute?: string;
}
interface RecordResourceInput extends Omit<AuditRecordInput, "routePath" | "updatedAt"> {
    readonly routePath?: string;
}
interface CreateMockKitClientOptions {
    readonly config?: MockKitConfig;
    readonly storage?: MockKitStorage;
    readonly fetch?: typeof globalThis.fetch;
    readonly getRoutePath?: () => string;
    readonly now?: () => string;
    readonly exposeGlobal?: boolean;
}
interface MockKitClient {
    readonly config: MockKitConfig;
    readonly effect: {
        readonly snapshot: () => Promise<MockKitSnapshot>;
    };
    readonly fetch: <T = unknown>(resourceKey: string, input: RequestInfo | URL | MockKitFetchOptions<T>, init?: RequestInit) => Promise<T>;
    readonly wrap: <T>(resourceKey: string, operation: () => Promise<T> | T, options?: {
        readonly sourceKind?: SourceKind;
        readonly reason?: string;
    }) => Promise<T>;
    readonly record: (input: RecordResourceInput) => AuditRecord;
    readonly recordUiMark: (input: RecordResourceInput) => AuditRecord;
    readonly remove: (id: string) => void;
    readonly clear: () => void;
    readonly getMode: () => ProvenanceMode;
    readonly setMode: (mode: ProvenanceMode) => void;
    readonly getRoutePath: () => string;
    readonly snapshot: () => MockKitSnapshot;
    readonly exportJson: () => string;
    readonly subscribe: (listener: () => void) => () => void;
}
declare class MockKitResourceError extends Error {
    readonly name = "MockKitResourceError";
}
declare const createMockKitClient: (options?: CreateMockKitClientOptions) => MockKitClient;
declare global {
    interface Window {
        __MOCKKIT__?: {
            readonly client: MockKitClient;
            readonly snapshot: () => MockKitSnapshot;
            readonly subscribe: (listener: () => void) => () => void;
        };
    }
}

export { type CreateMockKitClientOptions, type MockKitClient, type MockKitFetchOptions, MockKitResourceError, type MockKitStorage, type RecordResourceInput, createBrowserStorage, createMemoryStorage, createMockKitClient };
