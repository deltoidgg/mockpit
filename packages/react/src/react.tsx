import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from "react"
import {
  createMockPitClient,
  type CreateMockPitClientOptions,
  type MockPitClient,
} from "@mockpit/browser"
import { defineAllMockPitElements, mountMockPitDevtools } from "@mockpit/devtools"
import type { AuditRecord, SourceKind } from "@mockpit/core"

const MockPitContext = createContext<MockPitClient | null>(null)

export interface MockPitProviderProps extends PropsWithChildren {
  readonly client?: MockPitClient
  readonly options?: CreateMockPitClientOptions
}

export const MockPitProvider = ({
  client,
  options,
  children,
}: MockPitProviderProps): ReactElement => {
  const stableClient = useMemo(() => client ?? createMockPitClient(options), [client, options])
  return createElement(MockPitContext.Provider, { value: stableClient }, children)
}

export const useMockPitClient = (): MockPitClient => {
  const client = useContext(MockPitContext)
  if (!client) throw new Error("useMockPitClient must be used inside MockPitProvider.")
  return client
}

export const useMockPitSnapshot = () => {
  const client = useMockPitClient()
  return useSyncExternalStore(client.subscribe, client.snapshot, client.snapshot)
}

export const useMockPitMode = () => {
  const client = useMockPitClient()
  const snapshot = useMockPitSnapshot()
  return {
    mode: snapshot.mode,
    setMode: client.setMode,
  }
}

export const useMockPitRecords = (filter?: (record: AuditRecord) => boolean): readonly AuditRecord[] => {
  const snapshot = useMockPitSnapshot()
  return filter ? snapshot.records.filter(filter) : snapshot.records
}

export const useRouteProvenance = () => useMockPitSnapshot().summary

export const useSectionProvenance = (sectionId: string) =>
  useMockPitSnapshot().summary.sections.find((section) => section.id === sectionId)

export const useCaptureStatus = () => useMockPitSnapshot().summary.capture

export const useScenarioControls = () => {
  const client = useMockPitClient()
  const snapshot = useMockPitSnapshot()
  return {
    scenarios: snapshot.scenarios,
    definitions: client.config.scenarios,
    setScenario: client.setScenario,
  }
}

export interface MockPitDevtoolsProps {
  readonly initialIsOpen?: boolean
  readonly position?: "bottom-left" | "bottom-right"
  readonly panelPosition?: "left" | "right"
  readonly enableInProduction?: boolean
}

export const MockPitDevtools = ({
  initialIsOpen,
  position,
  panelPosition,
  enableInProduction = false,
}: MockPitDevtoolsProps): null => {
  const client = useMockPitClient()
  useEffect(() => {
    const production =
      typeof process !== "undefined" && process.env?.NODE_ENV === "production"
    if (production && !enableInProduction) return undefined
    defineAllMockPitElements()
    const element = mountMockPitDevtools({
      client,
      ...(typeof initialIsOpen === "boolean" ? { initialIsOpen } : {}),
      ...(position ? { position } : {}),
      ...(panelPosition ? { panelPosition } : {}),
    })
    return () => element.remove()
  }, [client, enableInProduction, initialIsOpen, panelPosition, position])
  return null
}

export interface AuditMarkProps {
  readonly resourceKey: string
  readonly source: SourceKind
  readonly label?: string
  readonly reason?: string
  readonly sectionId?: string
  readonly children: ReactNode
}

export const AuditMark = ({
  resourceKey,
  source,
  label,
  reason,
  sectionId,
  children,
}: AuditMarkProps): ReactElement => {
  const client = useMockPitClient()
  const recordId = useRef<string | undefined>(undefined)

  useEffect(() => {
    const record = client.recordUiMark({
      resourceKey,
      sourceKind: source,
      label,
      reason,
      sectionId,
      visibility: "mounted",
      recordedBy: "react",
    })
    recordId.current = record.id
    return () => {
      if (!recordId.current) return
      client.recordUiMark({
        id: recordId.current,
        resourceKey,
        sourceKind: source,
        label,
        reason,
        sectionId,
        visibility: "unmounted",
        recordedBy: "react",
      })
    }
  }, [client, label, reason, resourceKey, sectionId, source])

  return createElement(
    "mockpit-mark",
    {
      "data-resource-key": resourceKey,
      "data-source-kind": source,
      "data-label": label,
      "data-reason": reason,
      "data-section-id": sectionId,
    },
    children,
  )
}

export interface AuditSectionProps extends PropsWithChildren {
  readonly id: string
}

export const AuditSection = ({ id, children }: AuditSectionProps): ReactElement =>
  createElement("mockpit-section", { "data-section-id": id }, children)
