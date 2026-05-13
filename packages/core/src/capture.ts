import type {
  AuditRecord,
  CaptureEvaluation,
  CapturePolicy,
  CaptureRequirement,
  MockKitConfig,
} from "./model"
import { coverageRatio } from "./model"
import { matchesRoute } from "./route"

export const evaluateCapture = (
  config: MockKitConfig,
  routePath: string,
  records: readonly AuditRecord[],
): CaptureEvaluation => {
  const policy = config.capture.find((candidate) => matchesRoute(candidate.route, routePath))
  if (!policy) {
    return {
      routePath,
      policyName: "No capture policy",
      status: "not-configured",
      blockers: [],
      resources: [],
    }
  }

  const routeRecords = records.filter((record) => record.routePath === routePath)
  const resourceEvaluations = policy.required.map((requirement) =>
    evaluateRequirement(policy, requirement, routeRecords),
  )
  const sourceBlockers = routeRecords
    .filter((record) => policy.blockOn?.includes(record.sourceKind))
    .map((record) => `${record.resourceKey} is ${record.sourceKind}.`)
  const blockers = [
    ...resourceEvaluations.filter((result) => !result.passed).map((result) => result.reason),
    ...sourceBlockers,
  ]

  return {
    routePath,
    policyName: policy.name ?? String(policy.route),
    status: blockers.length > 0 ? "blocked" : "safe",
    blockers,
    resources: resourceEvaluations,
  }
}

const evaluateRequirement = (
  policy: CapturePolicy,
  requirement: CaptureRequirement,
  records: readonly AuditRecord[],
): CaptureEvaluation["resources"][number] => {
  const record = [...records]
    .reverse()
    .find(
      (candidate) =>
        candidate.resourceKey === requirement.resourceKey &&
        (!requirement.requestRoute ||
          (candidate.request?.route && matchesRoute(requirement.requestRoute, candidate.request.route))),
    )

  if (!record) {
    return {
      resourceKey: requirement.resourceKey,
      passed: false,
      reason: `${requirement.resourceKey} has no record on this route.`,
    }
  }

  const allowedSources = requirement.allowedSources ?? ["api"]
  if (!allowedSources.includes(record.sourceKind)) {
    return {
      resourceKey: requirement.resourceKey,
      passed: false,
      reason: `${requirement.resourceKey} must be ${allowedSources.join(" or ")}; got ${record.sourceKind}.`,
      record,
    }
  }

  const minimumCoverage = requirement.minCoverage
  const actualCoverage = coverageRatio(record.fieldCoverage)
  if (
    typeof minimumCoverage === "number" &&
    typeof actualCoverage === "number" &&
    actualCoverage < minimumCoverage
  ) {
    return {
      resourceKey: requirement.resourceKey,
      passed: false,
      reason: `${requirement.resourceKey} needs ${Math.round(
        minimumCoverage * 100,
      )}% coverage; got ${Math.round(actualCoverage * 100)}%.`,
      record,
    }
  }

  if (
    requirement.proofCritical &&
    policy.allowPresentationSources?.includes(record.sourceKind)
  ) {
    return {
      resourceKey: requirement.resourceKey,
      passed: false,
      reason: `${requirement.resourceKey} is proof-critical and cannot use presentation-only source ${record.sourceKind}.`,
      record,
    }
  }

  return {
    resourceKey: requirement.resourceKey,
    passed: true,
    reason: `${requirement.resourceKey} passed capture policy.`,
    record,
  }
}
