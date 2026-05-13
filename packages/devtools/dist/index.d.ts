import { MockPitClient } from '@mockpit/browser';

interface MountMockPitDevtoolsOptions {
    readonly client?: MockPitClient;
    readonly initialIsOpen?: boolean;
    readonly position?: "bottom-left" | "bottom-right";
    readonly panelPosition?: "left" | "right";
}
declare class MockPitDevtoolsElement extends HTMLElement {
    client: MockPitClient | undefined;
    private isOpen;
    private selectedTab;
    private position;
    private panelPosition;
    private filters;
    private unsubscribe;
    private previousMode;
    private readonly keyHandler;
    connectedCallback(): void;
    disconnectedCallback(): void;
    setClient(client: MockPitClient): void;
    private handleClientUpdate;
    private setOpen;
    private render;
    private renderTrigger;
    private renderPanel;
    private renderTab;
    private bindEvents;
    private applyHighlightFilter;
    private focusTab;
    private readState;
    private writeState;
    private statePrefix;
}
declare const defineMockPitElements: () => void;
declare const mountMockPitDevtools: (options?: MountMockPitDevtoolsOptions) => MockPitDevtoolsElement;

declare class MockPitMarkElement extends HTMLElement {
    client: MockPitClient | undefined;
    private recordId;
    private unsubscribe;
    connectedCallback(): void;
    disconnectedCallback(): void;
    private record;
    private applyHighlight;
}
declare const defineMockPitMarkElement: () => void;
declare const registerAttributeMarks: (client?: MockPitClient) => void;

declare class MockPitSectionElement extends HTMLElement {
    client: MockPitClient | undefined;
    private unsubscribe;
    connectedCallback(): void;
    disconnectedCallback(): void;
    private applyHighlight;
}
declare const defineMockPitSectionElement: () => void;

declare const defineAllMockPitElements: () => void;

export { MockPitDevtoolsElement, MockPitMarkElement, MockPitSectionElement, type MountMockPitDevtoolsOptions, defineAllMockPitElements, defineMockPitElements, defineMockPitMarkElement, defineMockPitSectionElement, mountMockPitDevtools, registerAttributeMarks };
