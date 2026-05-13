import type { AuditStatus, Criticality, ModePolicy, ProvenanceMode, SourceKind } from "./model"

export const modePolicies: Record<ProvenanceMode, ModePolicy> = {
  mock: {
    mode: "mock",
    allowMockTransport: true,
    allowFallback: false,
    showInlineHighlights: false,
    blockUnknownCapability: false,
    requireLiveForCapture: false,
    requiresReloadOnChange: true,
  },
  hybrid: {
    mode: "hybrid",
    allowMockTransport: false,
    allowFallback: true,
    showInlineHighlights: false,
    blockUnknownCapability: false,
    requireLiveForCapture: false,
    requiresReloadOnChange: true,
  },
  live: {
    mode: "live",
    allowMockTransport: false,
    allowFallback: false,
    showInlineHighlights: false,
    blockUnknownCapability: false,
    requireLiveForCapture: false,
    requiresReloadOnChange: true,
  },
  audit: {
    mode: "audit",
    allowMockTransport: false,
    allowFallback: false,
    showInlineHighlights: true,
    blockUnknownCapability: false,
    requireLiveForCapture: false,
    requiresReloadOnChange: true,
  },
  capture: {
    mode: "capture",
    allowMockTransport: false,
    allowFallback: false,
    showInlineHighlights: true,
    blockUnknownCapability: true,
    requireLiveForCapture: true,
    requiresReloadOnChange: true,
  },
}

export const getModePolicy = (mode: ProvenanceMode): ModePolicy => modePolicies[mode]

export const statusForSourceKind = (
  sourceKind: SourceKind,
  mode: ProvenanceMode,
  criticality: Criticality = "proof",
): AuditStatus => {
  if (sourceKind === "api") return "ready"
  if (sourceKind === "mock") return mode === "mock" ? "ready" : "warning"
  if (sourceKind === "unsupported") return "blocked"
  if (sourceKind === "error") return "error"
  if (sourceKind === "unknown") return mode === "capture" ? "blocked" : "unknown"
  if (sourceKind === "authoredFallback" && criticality === "proof") {
    return mode === "capture" ? "blocked" : "warning"
  }
  return "warning"
}
