import { MockKitClient } from '@mockkit/browser';

interface CleanupMswWorkersOptions {
    readonly scriptName?: string;
}
interface CleanupMswWorkersResult {
    readonly checked: number;
    readonly unregistered: number;
}
declare const cleanupMswWorkers: ({ scriptName, }?: CleanupMswWorkersOptions) => Promise<CleanupMswWorkersResult>;

interface WithMockKitHandlerOptions {
    readonly mockkit?: MockKitClient;
    readonly label?: string;
    readonly scenario?: string;
}
declare const withMockKitHandler: <Args extends readonly unknown[], Result>(resourceKey: string, resolver: (...args: Args) => Result | Promise<Result>, options?: WithMockKitHandlerOptions) => (...args: Args) => Promise<Result>;

interface CriticalRequest {
    readonly method: string;
    readonly url: string;
}
type CriticalMatcher = string | RegExp | ((request: CriticalRequest) => boolean);
interface MockKitMswOptions {
    readonly mockkit?: MockKitClient;
    readonly handlers: readonly unknown[];
    readonly critical?: readonly CriticalMatcher[];
}
interface StartOptions {
    readonly onUnhandledRequest?: unknown;
    readonly [key: string]: unknown;
}
declare const resolveClient: (client: MockKitClient | undefined) => MockKitClient | undefined;
declare const extractRequest: (value: unknown) => CriticalRequest | undefined;
declare const isCriticalRequest: (request: CriticalRequest, critical?: readonly CriticalMatcher[]) => boolean;

interface SetupMockKitServerOptions {
    readonly mockkit?: MockKitClient;
    readonly handlers: readonly unknown[];
    readonly critical?: readonly CriticalMatcher[];
}
declare const setupMockKitServer: ({ mockkit, handlers, critical, }: SetupMockKitServerOptions) => Promise<any>;

interface SetupMockKitWorkerOptions {
    readonly mockkit?: MockKitClient;
    readonly handlers: readonly unknown[];
    readonly critical?: readonly CriticalMatcher[];
}
declare const setupMockKitWorker: ({ mockkit, handlers, critical, }: SetupMockKitWorkerOptions) => Promise<any>;

export { type CleanupMswWorkersOptions, type CleanupMswWorkersResult, type CriticalMatcher, type CriticalRequest, type MockKitMswOptions, type SetupMockKitServerOptions, type SetupMockKitWorkerOptions, type StartOptions, type WithMockKitHandlerOptions, cleanupMswWorkers, extractRequest, isCriticalRequest, resolveClient, setupMockKitServer, setupMockKitWorker, withMockKitHandler };
