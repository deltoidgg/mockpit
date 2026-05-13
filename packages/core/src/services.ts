import { Context } from "effect"
import type {
  CaptureEvaluation,
  MockPitConfig,
  ProvenanceMode,
  RouteAuditExport,
  ScenarioState,
  TransportState,
} from "./model"

export interface ModeStoreService {
  readonly getMode: () => ProvenanceMode
  readonly setMode: (mode: ProvenanceMode) => void
}

export interface ConfigService {
  readonly getConfig: () => MockPitConfig
}

export interface RouteService {
  readonly getRoutePath: () => string
  readonly setRoute: (routePath: string, routePattern?: string) => void
}

export interface ClockService {
  readonly now: () => string
}

export interface ReporterService {
  readonly exportRoute: (routePath: string) => RouteAuditExport
  readonly exportMarkdown: (routePath: string) => string
}

export interface ScenarioService {
  readonly getScenarioState: () => ScenarioState
  readonly setScenario: (key: string, variant: string) => void
}

export interface CaptureService {
  readonly evaluate: (routePath: string) => CaptureEvaluation
}

export interface TransportService {
  readonly getTransportState: () => TransportState
  readonly setTransportState: (state: Partial<TransportState>) => void
}

export const ModeStore = Context.GenericTag<ModeStoreService>("@mockpit/core/ModeStore")
export const ConfigService = Context.GenericTag<ConfigService>("@mockpit/core/ConfigService")
export const RouteService = Context.GenericTag<RouteService>("@mockpit/core/RouteService")
export const ClockService = Context.GenericTag<ClockService>("@mockpit/core/ClockService")
export const ReporterService = Context.GenericTag<ReporterService>("@mockpit/core/ReporterService")
export const ScenarioService = Context.GenericTag<ScenarioService>("@mockpit/core/ScenarioService")
export const CaptureService = Context.GenericTag<CaptureService>("@mockpit/core/CaptureService")
export const TransportService = Context.GenericTag<TransportService>("@mockpit/core/TransportService")
