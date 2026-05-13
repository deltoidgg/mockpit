import { MockKitClient } from '@mockkit/browser';

interface MountMockKitDevtoolsOptions {
    readonly client?: MockKitClient;
    readonly initialIsOpen?: boolean;
    readonly position?: "bottom-left" | "bottom-right";
    readonly panelPosition?: "left" | "right";
}
declare class MockKitDevtoolsElement extends HTMLElement {
    client: MockKitClient | undefined;
    private isOpen;
    private selectedTab;
    private position;
    private panelPosition;
    private unsubscribe;
    private readonly keyHandler;
    connectedCallback(): void;
    disconnectedCallback(): void;
    setClient(client: MockKitClient): void;
    private setOpen;
    private render;
    private renderTrigger;
    private renderPanel;
    private renderTab;
    private bindEvents;
    private readOpenState;
    private writeOpenState;
    private openStateKey;
}
declare const defineMockKitElements: () => void;
declare const mountMockKitDevtools: (options?: MountMockKitDevtoolsOptions) => MockKitDevtoolsElement;

declare class MockKitMarkElement extends HTMLElement {
    client: MockKitClient | undefined;
    private recordId;
    private unsubscribe;
    connectedCallback(): void;
    disconnectedCallback(): void;
    private record;
    private applyHighlight;
}
declare const defineMockKitMarkElement: () => void;

declare const defineAllMockKitElements: () => void;

export { MockKitDevtoolsElement, MockKitMarkElement, type MountMockKitDevtoolsOptions, defineAllMockKitElements, defineMockKitElements, defineMockKitMarkElement, mountMockKitDevtools };
