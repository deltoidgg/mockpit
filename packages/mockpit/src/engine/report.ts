/**
 * Reports shared by the drawer, the CLI and the GitHub Action: a markdown
 * table, a ledger diff between two points, a burndown series, and CI checks.
 */
import type { Ledger, LedgerEntry, Stage } from "../schema/index.js"
import { isRegression, summarise } from "./ledger.js"

export const stillMock = (stage: Stage): boolean => stage === "mocked" || stage === "shadowed"

export interface StageChange {
  readonly key: string
  readonly from: Stage | undefined
  readonly to: Stage | undefined
  readonly parityFrom: number | undefined
  readonly parityTo: number | undefined
  readonly regression: boolean
}

export const diffLedgers = (base: Ledger | undefined, head: Ledger): StageChange[] => {
  const keys = new Set([...Object.keys(base?.endpoints ?? {}), ...Object.keys(head.endpoints)])
  const changes: StageChange[] = []
  for (const key of [...keys].sort()) {
    const before = base?.endpoints[key]
    const after = head.endpoints[key]
    const parityFrom = before?.parity?.score
    const parityTo = after?.parity?.score
    if (before?.stage === after?.stage && round(parityFrom) === round(parityTo)) continue
    changes.push({
      key,
      from: before?.stage,
      to: after?.stage,
      parityFrom,
      parityTo,
      regression: before && after ? isRegression(before.stage, after.stage) : false,
    })
  }
  return changes
}

const round = (value: number | undefined) => (value === undefined ? undefined : Math.round(value * 100))

const percent = (value: number | undefined) => (value === undefined ? "–" : `${Math.round(value * 100)}%`)

const describeChange = (change: StageChange | undefined): string => {
  if (!change) return ""
  if (change.from === undefined) return "new"
  if (change.to === undefined) return "removed"
  if (change.from !== change.to) return `${change.from} → ${change.to}${change.regression ? " (regression)" : ""}`
  if (change.parityFrom !== undefined && change.parityTo !== undefined) {
    const delta = Math.round((change.parityTo - change.parityFrom) * 100)
    return `${delta >= 0 ? "+" : ""}${delta}%`
  }
  return ""
}

const order: Record<Stage, number> = { mocked: 0, shadowed: 1, unmocked: 2, real: 3, retired: 4 }

const escapeCell = (value: string) => value.replaceAll("|", "\\|")

/** Markdown summary for a PR description or comment. */
export const toMarkdown = (ledger: Ledger, options: { readonly base?: Ledger; readonly baseLabel?: string; readonly onlyChanged?: boolean } = {}): string => {
  const summary = summarise(ledger)
  const changes = options.base ? diffLedgers(options.base, ledger) : []
  const byKey = new Map(changes.map((change) => [change.key, change]))
  const keys = Object.keys(ledger.endpoints)
    .filter((key) => !options.onlyChanged || byKey.has(key))
    .sort((a, b) => order[ledger.endpoints[a]!.stage] - order[ledger.endpoints[b]!.stage] || (a < b ? -1 : 1))
  const lines = [
    `**mockpit** · ${ledger.project} · ${summary.total} endpoints · ${summary.real + summary.unmocked} real · ${summary.shadowed} shadowed · ${summary.mocked} mocked`,
    "",
  ]
  if (options.base) {
    const regressions = changes.filter((change) => change.regression)
    const promoted = changes.filter((change) => change.from && change.to && stillMock(change.from) && !stillMock(change.to))
    lines.push(`Since ${options.baseLabel ?? "base"}: ${promoted.length} promoted to real, ${regressions.length} regressed.`, "")
  }
  if (keys.length === 0) {
    lines.push(options.onlyChanged ? "No endpoint changed stage or parity." : "No endpoints recorded yet.")
    return `${lines.join("\n")}\n`
  }
  const header = options.base ? "| Endpoint | Stage | Parity | Change |" : "| Endpoint | Stage | Parity | Note |"
  lines.push(header, "| --- | --- | ---: | --- |")
  for (const key of keys) {
    const entry = ledger.endpoints[key]!
    const last = options.base ? describeChange(byKey.get(key)) : (entry.note ?? "")
    lines.push(`| \`${escapeCell(key)}\` | ${entry.stage} | ${percent(entry.parity?.score)} | ${escapeCell(last)} |`)
  }
  const removed = changes.filter((change) => change.to === undefined)
  for (const change of removed) lines.push(`| \`${escapeCell(change.key)}\` | removed | – | was ${change.from} |`)
  return `${lines.join("\n")}\n`
}

export interface BurndownPoint {
  readonly label: string
  readonly at: number
  readonly mocked: number
  readonly regression: boolean
}

/**
 * Still-mock count (mocked plus shadowed) after each commit, replayed from
 * history. Without a SHA, points group by day.
 */
export const burndown = (ledger: Ledger): BurndownPoint[] => {
  const events: Array<{ key: string; at: number; stage: Stage; sha?: string; regression?: boolean }> = []
  for (const [key, entry] of Object.entries(ledger.endpoints)) {
    for (const item of entry.history) events.push({ key, ...item })
  }
  events.sort((a, b) => a.at - b.at)
  const current = new Map<string, Stage>()
  const points: BurndownPoint[] = []
  let group: string | undefined
  let regression = false
  for (const event of events) {
    const label = event.sha ?? new Date(event.at).toISOString().slice(0, 10)
    if (group !== undefined && label !== group) {
      points.push({ label: group, at: points.length, mocked: countMock(current), regression })
      regression = false
    }
    group = label
    current.set(event.key, event.stage)
    if (event.regression) regression = true
  }
  if (group !== undefined) points.push({ label: group, at: points.length, mocked: countMock(current), regression })
  return points.slice(-60)
}

const countMock = (stages: Map<string, Stage>) => [...stages.values()].filter(stillMock).length

export interface CheckOptions {
  readonly noRegressions?: boolean
  readonly maxMocked?: number
  readonly minParity?: number
}

export interface CheckResult {
  readonly ok: boolean
  readonly failures: readonly string[]
}

export const checkLedger = (ledger: Ledger, base: Ledger | undefined, options: CheckOptions): CheckResult => {
  const failures: string[] = []
  if (options.noRegressions ?? true) {
    if (base) {
      for (const change of diffLedgers(base, ledger)) if (change.regression) failures.push(`${change.key} regressed: ${change.from} → ${change.to}`)
    } else {
      for (const [key, entry] of Object.entries(ledger.endpoints)) {
        const last = entry.history.at(-1)
        if (last?.regression) failures.push(`${key} regressed to ${entry.stage}`)
      }
    }
  }
  const summary = summarise(ledger)
  if (options.maxMocked !== undefined && summary.mocked + summary.shadowed > options.maxMocked) {
    failures.push(`${summary.mocked + summary.shadowed} endpoints still mock-backed; the limit is ${options.maxMocked}`)
  }
  if (options.minParity !== undefined) {
    for (const [key, entry] of Object.entries(ledger.endpoints) as Array<[string, LedgerEntry]>) {
      if (entry.stage === "shadowed" && entry.parity && entry.parity.score < options.minParity) {
        failures.push(`${key} parity ${percent(entry.parity.score)} is below ${percent(options.minParity)}`)
      }
    }
  }
  return { ok: failures.length === 0, failures }
}
