/**
 * The overlay UI as a Foldkit program: strip, drawer and inspect card. It
 * knows nothing about the engine. Snapshots, inspect cards and host commands
 * come in through inbound Ports; every user action goes out as one Action.
 */
import { Effect, Option, Schema, Stream } from "effect"
import { Command, Port, Runtime, Subscription } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { ServedBy } from "../schema/index.js"
import { Action, Dock, HostCommand, Inspect, type Row, Snapshot, View, emptySnapshot } from "./snapshot.js"

// PORTS

export const ports = {
  inbound: {
    snapshot: Port.inbound(Snapshot),
    inspect: Port.inbound(Schema.NullOr(Inspect)),
    host: Port.inbound(HostCommand),
  },
  outbound: {
    action: Port.outbound(Action),
  },
}

// MODEL

export const Sort = Schema.Literals(["stage", "parity", "changed", "key"])
export type Sort = typeof Sort.Type

export const Model = Schema.Struct({
  snapshot: Snapshot,
  view: View,
  dock: Dock,
  size: Schema.Number,
  expanded: Schema.NullOr(Schema.String),
  active: Schema.Number,
  inspect: Schema.NullOr(Inspect),
  noteKey: Schema.NullOr(Schema.String),
  noteText: Schema.String,
  sort: Sort,
  copied: Schema.Boolean,
  resizing: Schema.Boolean,
})
export type Model = typeof Model.Type

export const initialModel: Model = {
  snapshot: emptySnapshot,
  view: "closed",
  dock: "bottom",
  size: 0.4,
  expanded: null,
  active: 0,
  inspect: null,
  noteKey: null,
  noteText: "",
  sort: "stage",
  copied: false,
  resizing: false,
}

// MESSAGE

export const Message = defineMessageUnion({
  GotSnapshot: { snapshot: Snapshot },
  GotInspect: { inspect: Schema.NullOr(Inspect) },
  GotHost: { command: HostCommand },
  ClickedStrip: {},
  ClickedView: { view: View },
  ClickedClose: {},
  ClickedDock: {},
  HoveredRow: { key: Schema.String },
  LeftRow: {},
  ClickedRow: { key: Schema.String, index: Schema.Number },
  PressedListKey: { key: Schema.String },
  ClickedFlip: { key: Schema.String, to: ServedBy },
  ClickedShadow: { key: Schema.String, on: Schema.Boolean },
  ClickedSafety: { key: Schema.String, on: Schema.Boolean },
  ClickedPin: { key: Schema.String },
  ClickedNote: { key: Schema.String },
  ChangedNote: { text: Schema.String },
  SubmittedNote: {},
  CancelledNote: {},
  ClickedSort: { sort: Sort },
  ClickedCopy: {},
  ClickedOpen: { file: Schema.String, line: Schema.Number },
  ClickedCleanWorkers: {},
  ClickedCloseInspect: {},
  ClickedOverlay: {},
  StartedResize: {},
  Resized: { fraction: Schema.Number },
  EndedResize: {},
  Sent: {},
  ResetCopied: {},
  Ignored: {},
})
export type Message = typeof Message.Type

// COMMANDS

const Send = Command.define("Send", {
  args: { action: Action },
  messages: [Message.Sent],
  execute: ({ action }) => Port.emit(ports.outbound.action, action).pipe(Effect.as(Message.Sent())),
})

const WaitCopied = Command.define("WaitCopied", {
  messages: [Message.ResetCopied],
  execute: Effect.sleep("1500 millis").pipe(Effect.as(Message.ResetCopied())),
})

const send = (action: Action) => Send({ action })

// UPDATE

const rowsFor = (model: Model): readonly Row[] => {
  const rows = model.view === "ledger" ? model.snapshot.ledgerRows : model.snapshot.screenRows
  if (model.view !== "ledger" || model.sort === "stage") return rows
  const sorted = [...rows]
  if (model.sort === "parity") sorted.sort((a, b) => (a.parity ?? 2) - (b.parity ?? 2))
  if (model.sort === "changed") sorted.sort((a, b) => b.lastChanged - a.lastChanged)
  if (model.sort === "key") sorted.sort((a, b) => (a.key < b.key ? -1 : 1))
  return sorted
}

const ui = (model: Model) => send({ _tag: "SetUi", view: model.view, dock: model.dock, size: model.size })

type Return = { model: Model; commands?: ReadonlyArray<ReturnType<typeof Send> | ReturnType<typeof WaitCopied>> }

const flipTarget = (row: Row): ServedBy => (row.override === "real" ? "mock" : "real")

export const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    GotSnapshot: ({ snapshot }) => ({ model: { ...model, snapshot } }),
    GotInspect: ({ inspect }) => ({ model: { ...model, inspect } }),
    GotHost: ({ command }) => {
      switch (command._tag) {
        case "ToggleDrawer": {
          const next = { ...model, view: model.view === "closed" ? ("screen" as const) : ("closed" as const) }
          return { model: next, commands: [ui(next)] }
        }
        case "ToggleOverlay":
          return { model, commands: [send({ _tag: "SetOverlay", on: !model.snapshot.overlayOn })] }
        case "Escape": {
          if (model.inspect) return { model: { ...model, inspect: null }, commands: [send({ _tag: "CloseInspect" })] }
          if (model.noteKey) return { model: { ...model, noteKey: null, noteText: "" } }
          if (model.view !== "closed") {
            const next = { ...model, view: "closed" as const }
            return { model: next, commands: [ui(next)] }
          }
          return { model }
        }
        case "Copied":
          return { model: { ...model, copied: true }, commands: [WaitCopied()] }
        case "Restore":
          return { model: { ...model, view: command.view, dock: command.dock, size: command.size } }
      }
    },
    ClickedStrip: () => {
      const next = { ...model, view: model.view === "closed" ? ("screen" as const) : ("closed" as const) }
      return { model: next, commands: [ui(next)] }
    },
    ClickedView: ({ view }) => {
      const next = { ...model, view, expanded: null, active: 0 }
      return { model: next, commands: [ui(next)] }
    },
    ClickedClose: () => {
      const next = { ...model, view: "closed" as const }
      return { model: next, commands: [ui(next)] }
    },
    ClickedDock: () => {
      const next = { ...model, dock: model.dock === "bottom" ? ("right" as const) : ("bottom" as const) }
      return { model: next, commands: [ui(next)] }
    },
    HoveredRow: ({ key }) => ({ model, commands: [send({ _tag: "Highlight", key })] }),
    LeftRow: () => ({ model, commands: [send({ _tag: "Highlight", key: null })] }),
    ClickedRow: ({ key, index }) => ({ model: { ...model, expanded: model.expanded === key ? null : key, active: index } }),
    PressedListKey: ({ key }) => {
      const rows = rowsFor(model)
      if (rows.length === 0) return { model }
      const active = Math.min(model.active, rows.length - 1)
      const row = rows[active]!
      if (key === "ArrowDown" || key === "ArrowUp") {
        const next = key === "ArrowDown" ? Math.min(rows.length - 1, active + 1) : Math.max(0, active - 1)
        return { model: { ...model, active: next }, commands: [send({ _tag: "Highlight", key: rows[next]!.key })] }
      }
      if (key === "Enter" || key === " ") return { model: { ...model, expanded: model.expanded === row.key ? null : row.key } }
      if ((key === "f" || key === "F") && row.controllable) return { model, commands: [send({ _tag: "Flip", key: row.key, to: flipTarget(row) })] }
      if (key === "p" || key === "P") return { model, commands: [send({ _tag: "Pin", key: row.key })] }
      return { model }
    },
    ClickedFlip: ({ key, to }) => ({ model, commands: [send({ _tag: "Flip", key, to })] }),
    ClickedShadow: ({ key, on }) => ({ model, commands: [send({ _tag: "Shadow", key, on })] }),
    ClickedSafety: ({ key, on }) => ({ model, commands: [send({ _tag: "SafetyNet", key, on })] }),
    ClickedPin: ({ key }) => ({ model, commands: [send({ _tag: "Pin", key })] }),
    ClickedNote: ({ key }) => {
      const row = model.snapshot.ledgerRows.find((candidate) => candidate.key === key)
      return { model: { ...model, noteKey: key, noteText: row?.note ?? "" } }
    },
    ChangedNote: ({ text }) => ({ model: { ...model, noteText: text.slice(0, 200) } }),
    SubmittedNote: () =>
      model.noteKey
        ? { model: { ...model, noteKey: null, noteText: "" }, commands: [send({ _tag: "Note", key: model.noteKey, text: model.noteText })] }
        : { model },
    CancelledNote: () => ({ model: { ...model, noteKey: null, noteText: "" } }),
    ClickedSort: ({ sort }) => ({ model: { ...model, sort } }),
    ClickedCopy: () => ({ model, commands: [send({ _tag: "CopyMarkdown" })] }),
    ClickedOpen: ({ file, line }) => ({ model, commands: [send({ _tag: "OpenFile", file, line })] }),
    ClickedCleanWorkers: () => ({ model, commands: [send({ _tag: "CleanWorkers" })] }),
    ClickedCloseInspect: () => ({ model: { ...model, inspect: null }, commands: [send({ _tag: "CloseInspect" })] }),
    ClickedOverlay: () => ({ model, commands: [send({ _tag: "SetOverlay", on: !model.snapshot.overlayOn })] }),
    StartedResize: () => ({ model: { ...model, resizing: true } }),
    Resized: ({ fraction }) => ({ model: { ...model, size: Math.min(0.85, Math.max(0.18, fraction)) } }),
    EndedResize: () => {
      const next = { ...model, resizing: false }
      return { model: next, commands: [ui(next)] }
    },
    Sent: () => ({ model }),
    ResetCopied: () => ({ model: { ...model, copied: false } }),
    Ignored: () => ({ model }),
  })

// SUBSCRIPTIONS

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  snapshot: Port.subscriptionEntry(ports.inbound.snapshot, (snapshot) => Message.GotSnapshot({ snapshot })),
  inspect: Port.subscriptionEntry(ports.inbound.inspect, (inspect) => Message.GotInspect({ inspect })),
  host: Port.subscriptionEntry(ports.inbound.host, (command) => Message.GotHost({ command })),
  resize: entry(
    { resizing: Schema.Boolean, dock: Dock },
    {
      modelToDependencies: (model) => ({ resizing: model.resizing, dock: model.dock }),
      dependenciesToStream: ({ resizing, dock }) =>
        resizing
          ? Stream.merge(
              Stream.fromEventListener<PointerEvent>(window as never, "pointermove").pipe(
                Stream.map((event) =>
                  Message.Resized({ fraction: dock === "bottom" ? 1 - event.clientY / window.innerHeight : 1 - event.clientX / window.innerWidth }),
                ),
              ),
              Stream.fromEventListener(window as never, "pointerup").pipe(Stream.map(() => Message.EndedResize())),
            )
          : Stream.empty,
    },
  ),
}))

// VIEW

const STAGE_TEXT: Record<Row["stage"], string> = {
  mocked: "mocked",
  shadowed: "shadowed",
  real: "real",
  retired: "retired",
  unmocked: "unmocked",
}

export const relativeTime = (now: number, at: number | null): string => {
  if (at === null || at === 0) return "never"
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 45) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 36) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

const percent = (value: number | null) => (value === null ? "–" : `${Math.round(value * 100)}%`)

const glyph = (h: HtmlBuilder<Message>, stage: Row["stage"]): Html => h.span([h.Class(`mp-glyph mp-glyph-${stage}`), h.AriaHidden(true)], [])

const parityBar = (h: HtmlBuilder<Message>, value: number | null): Html =>
  h.span([h.Class("mp-parity")], [
    h.span([h.Class("mp-num")], [percent(value)]),
    value === null ? h.span([h.Class("mp-pbar mp-pbar-none"), h.AriaHidden(true)], []) : h.span([h.Class("mp-pbar"), h.AriaHidden(true)], [h.span([h.Class("mp-pfill"), h.Style({ width: `${Math.round(value * 100)}%` })], [])]),
  ])

const textButton = (h: HtmlBuilder<Message>, label: string, message: Message, extra = ""): Html =>
  h.button([h.Type("button"), h.Class(`mp-text-button ${extra}`.trim()), h.OnClick(message)], [label])

const servedLabel = (row: Row): string => {
  if (row.served === null) return ""
  if (row.failing) return "failing"
  return row.served === "mock" ? "served by mock" : "served by real"
}

const rowView = (h: HtmlBuilder<Message>, model: Model, row: Row, index: number, showScreens: boolean): Html => {
  const expanded = model.expanded === row.key
  const active = model.active === index
  return h.li(
    [
      h.Key(row.key),
      h.Id(`mp-row-${index}`),
      h.Role("option"),
      h.AriaSelected(active),
      h.Class(`mp-row${expanded ? " mp-expanded" : ""}${active ? " mp-active" : ""}${row.regression ? " mp-regressed" : ""}`),
      h.OnMouseEnter(Message.HoveredRow({ key: row.key })),
      h.OnMouseLeave(Message.LeftRow()),
    ],
    [
      h.div([h.Class("mp-line"), h.OnClick(Message.ClickedRow({ key: row.key, index }))], [
        glyph(h, row.stage),
        h.span([h.Class("mp-key"), h.Title(row.label ?? row.key)], [row.key]),
        h.span([h.Class(`mp-stage mp-stage-${row.stage}`)], [row.regression ? `${STAGE_TEXT[row.stage]}, regressed` : STAGE_TEXT[row.stage]]),
        parityBar(h, row.parity),
        h.span([h.Class("mp-num mp-dim")], [`${row.requests} req`]),
        h.span([h.Class("mp-dim mp-when")], [relativeTime(model.snapshot.now, row.lastAt)]),
      ]),
      row.note && !expanded ? h.div([h.Class("mp-note")], [row.note]) : h.empty,
      expanded ? detailView(h, model, row, showScreens) : h.empty,
    ],
  )
}

const detailView = (h: HtmlBuilder<Message>, model: Model, row: Row, showScreens: boolean): Html => {
  const facts: string[] = []
  const served = servedLabel(row)
  if (served) facts.push(served)
  if (row.override === "real") facts.push("flipped to real here")
  if (row.status !== null) facts.push(`HTTP ${row.status}`)
  if (row.latency !== null) facts.push(`${row.latency} ms`)
  if (row.regions > 0) facts.push(`${row.regions} region${row.regions === 1 ? "" : "s"} on screen`)
  if (row.command) facts.push(`command ${row.command}`)
  if (row.via) facts.push(`via ${row.via}`)
  const editing = model.noteKey === row.key
  return h.div([h.Class("mp-detail")], [
    h.div([h.Class("mp-facts mp-dim")], [facts.join(" · ") || "no requests this session"]),
    row.failure ? h.div([h.Class("mp-failure")], [row.failure]) : h.empty,
    row.diffs.length > 0
      ? h.table([h.Class("mp-diff")], [
          h.tbody(
            [],
            row.diffs.map((diff) =>
              h.tr([h.Class(`mp-diff-${diff.kind}`)], [
                h.td([h.Class("mp-diff-kind")], [diff.kind]),
                h.td([h.Class("mp-mono")], [diff.path]),
                h.td([h.Class("mp-mono mp-dim")], [diff.kind === "extra" ? (diff.actual ?? "") : diff.kind === "missing" ? (diff.expected ?? "") : `${diff.expected ?? ""} → ${diff.actual ?? ""}`]),
              ]),
            ),
          ),
        ])
      : row.parity !== null
        ? h.div([h.Class("mp-dim")], ["The real response has every field the mock has."])
        : row.stage === "mocked"
          ? h.div([h.Class("mp-dim")], [row.controllable ? "Flip to real to compare the backend against this mock." : "No real response seen yet."])
          : h.empty,
    showScreens && row.screens.length > 0 ? h.div([h.Class("mp-dim mp-mono")], [`used on ${row.screens.join(", ")}`]) : h.empty,
    editing
      ? h.div([h.Class("mp-note-edit")], [
          h.input([
            h.Class("mp-input"),
            h.Type("text"),
            h.Value(model.noteText),
            h.AriaLabel(`Note for ${row.key}`),
            h.Placeholder("One line, e.g. blocked on auth service"),
            h.OnInput((text) => Message.ChangedNote({ text })),
            h.OnKeyDown((key) => (key === "Enter" ? Message.SubmittedNote() : key === "Escape" ? Message.CancelledNote() : Message.Ignored())),
          ]),
          textButton(h, "Save", Message.SubmittedNote()),
          textButton(h, "Cancel", Message.CancelledNote()),
        ])
      : row.note
        ? h.div([h.Class("mp-note")], [row.note])
        : h.empty,
    h.div([h.Class("mp-actions")], [
      row.controllable ? textButton(h, row.override === "real" ? "Flip to mock" : "Flip to real", Message.ClickedFlip({ key: row.key, to: flipTarget(row) }), "mp-primary") : h.empty,
      row.controllable && row.override === "real" ? textButton(h, row.shadow ? "Shadow compare on" : "Shadow compare off", Message.ClickedShadow({ key: row.key, on: !row.shadow })) : h.empty,
      row.controllable && row.override === "real" ? textButton(h, row.safetyNet ? "Safety net on" : "Safety net off", Message.ClickedSafety({ key: row.key, on: !row.safetyNet })) : h.empty,
      textButton(h, row.pinned ? "Unpin" : "Pin", Message.ClickedPin({ key: row.key })),
      editing ? h.empty : textButton(h, row.note ? "Edit note" : "Note", Message.ClickedNote({ key: row.key })),
    ]),
  ])
}

const listView = (h: HtmlBuilder<Message>, model: Model, rows: readonly Row[], empty: string, showScreens: boolean): Html =>
  rows.length === 0
    ? h.p([h.Class("mp-empty")], [empty])
    : h.ul(
        [
          h.Class("mp-list"),
          h.Role("listbox"),
          h.Tabindex(0),
          h.AriaLabel("Endpoints"),
          h.Attribute("aria-activedescendant", `mp-row-${Math.min(model.active, rows.length - 1)}`),
          h.OnKeyDown((key) => Message.PressedListKey({ key })),
        ],
        rows.map((row, index) => rowView(h, model, row, index, showScreens)),
      )

const burndownView = (h: HtmlBuilder<Message>, values: readonly number[], regressions: readonly number[]): Html => {
  if (values.length < 2) return h.empty
  const width = 600
  const height = 32
  const max = Math.max(1, ...values)
  const x = (index: number) => (index / (values.length - 1)) * width
  const y = (value: number) => 2 + (1 - value / max) * (height - 4)
  const points = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ")
  return h.div([h.Class("mp-burn")], [
    h.span([h.Class("mp-num mp-dim")], [String(values[0])]),
    h.svg(
      [h.Class("mp-burn-svg"), h.Attribute("viewBox", `0 0 ${width} ${height}`), h.Attribute("preserveAspectRatio", "none"), h.AriaHidden(true)],
      [
        h.polyline([h.Attribute("points", points), h.Class("mp-burn-line")], []),
        ...regressions.map((index) =>
          h.line([h.Class("mp-burn-tick"), h.Attribute("x1", x(index).toFixed(1)), h.Attribute("x2", x(index).toFixed(1)), h.Attribute("y1", "0"), h.Attribute("y2", String(height))], []),
        ),
      ],
    ),
    h.span([h.Class("mp-num mp-dim")], [String(values[values.length - 1])]),
  ])
}

const summaryText = (snapshot: Model["snapshot"]) => {
  const { summary } = snapshot
  return `${summary.real + summary.unmocked} real · ${summary.shadowed} shadowed · ${summary.mocked} mocked`
}

const screenView = (h: HtmlBuilder<Message>, model: Model): Html =>
  listView(
    h,
    model,
    model.snapshot.screenRows,
    model.snapshot.sensors ? "Nothing on this screen has loaded data yet." : "No sensor attached. Call attach(worker) from mockpit/msw, or add the Vite plugin.",
    false,
  )

const ledgerView = (h: HtmlBuilder<Message>, model: Model): Html => {
  const { snapshot } = model
  return h.div([h.Class("mp-ledger")], [
    h.div([h.Class("mp-ledger-head")], [
      h.span([], [`${snapshot.summary.total} endpoints · ${summaryText(snapshot)}`]),
      h.span([h.Class("mp-spacer")], []),
      textButton(h, model.copied ? "Copied" : "Copy markdown", Message.ClickedCopy()),
    ]),
    burndownView(h, snapshot.burndown, snapshot.burnRegressions),
    h.div([h.Class("mp-sort mp-dim")], [
      "Sort",
      ...(["stage", "parity", "changed", "key"] as const).map((sort) =>
        h.button([h.Type("button"), h.Class(`mp-text-button${model.sort === sort ? " mp-current" : ""}`), h.AriaPressed(String(model.sort === sort)), h.OnClick(Message.ClickedSort({ sort }))], [sort]),
      ),
    ]),
    listView(h, model, rowsFor(model), "The ledger is empty. Load a screen that fetches data.", true),
  ])
}

const literalsView = (h: HtmlBuilder<Message>, model: Model): Html => {
  const { snapshot } = model
  if (!snapshot.literalsAvailable) return h.p([h.Class("mp-empty")], ["Literal detection needs the mockpit Vite plugin."])
  if (snapshot.literals.length === 0) return h.p([h.Class("mp-empty")], ["No hardcoded text from source is visible on this screen."])
  const groups = new Map<string, typeof snapshot.literals>()
  for (const literal of snapshot.literals) {
    const group = literal.component ?? literal.file
    groups.set(group, [...(groups.get(group) ?? []), literal])
  }
  return h.div(
    [h.Class("mp-literals")],
    [...groups].map(([group, literals]) =>
      h.section([h.Class("mp-literal-group")], [
        h.div([h.Class("mp-literal-head")], [h.span([], [group]), h.span([h.Class("mp-dim mp-mono")], [shortFile(literals[0]!.file)])]),
        h.ul(
          [h.Class("mp-literal-list")],
          literals.map((literal) =>
            h.li([h.Key(String(literal.id))], [
              h.span([h.Class("mp-literal-text")], [`"${literal.text}"`]),
              h.button([h.Type("button"), h.Class("mp-text-button mp-mono"), h.OnClick(Message.ClickedOpen({ file: literal.file, line: literal.line }))], [`line ${literal.line}`]),
            ]),
          ),
        ),
      ]),
    ),
  )
}

const shortFile = (file: string) => {
  const parts = file.split("/")
  return parts.slice(-3).join("/")
}

const tab = (h: HtmlBuilder<Message>, model: Model, view: Exclude<Model["view"], "closed">, label: string): Html =>
  h.button(
    [h.Type("button"), h.Role("tab"), h.AriaSelected(model.view === view), h.Class(`mp-tab${model.view === view ? " mp-current" : ""}`), h.OnClick(Message.ClickedView({ view }))],
    [label],
  )

const drawerView = (h: HtmlBuilder<Message>, model: Model): Html => {
  const { snapshot } = model
  const style = model.dock === "bottom" ? { height: `${Math.round(model.size * 100)}vh` } : { width: `${Math.round(model.size * 100)}vw` }
  const context = [snapshot.screen, snapshot.stage ? `stage ${snapshot.stage}` : "", snapshot.sha ? snapshot.sha.slice(0, 7) : ""].filter(Boolean).join(" · ")
  return h.section([h.Class(`mp-drawer mp-dock-${model.dock}`), h.Role("complementary"), h.AriaLabel("mockpit"), h.Style(style)], [
    h.div([h.Class("mp-handle"), h.OnPointerDown(() => Option.some(Message.StartedResize()))], []),
    h.header([h.Class("mp-head")], [
      h.span([h.Class("mp-project")], [snapshot.project || "mockpit"]),
      h.span([h.Class("mp-dim mp-mono mp-context")], [context]),
      h.nav([h.Class("mp-tabs"), h.Role("tablist")], [tab(h, model, "screen", "Screen"), tab(h, model, "ledger", "Ledger"), tab(h, model, "literals", "Literals")]),
      h.span([h.Class("mp-spacer")], []),
      textButton(h, snapshot.overlayOn ? "X-ray on" : "X-ray off", Message.ClickedOverlay()),
      textButton(h, model.dock === "bottom" ? "Dock right" : "Dock bottom", Message.ClickedDock()),
      textButton(h, "Close", Message.ClickedClose()),
    ]),
    snapshot.staleWorkers > 0
      ? h.div([h.Class("mp-warning")], [
          `${snapshot.staleWorkers} stale mock service worker registration${snapshot.staleWorkers === 1 ? "" : "s"} may still intercept requests.`,
          textButton(h, "Unregister", Message.ClickedCleanWorkers()),
        ])
      : h.empty,
    h.div([h.Class("mp-body")], [model.view === "screen" ? screenView(h, model) : model.view === "ledger" ? ledgerView(h, model) : literalsView(h, model)]),
  ])
}

const stripView = (h: HtmlBuilder<Message>, model: Model): Html => {
  const { summary } = model.snapshot
  const real = summary.real + summary.unmocked
  const total = Math.max(1, real + summary.shadowed + summary.mocked)
  const width = (count: number) => `${(count / total) * 100}%`
  return h.button(
    [
      h.Type("button"),
      h.Class("mp-strip"),
      h.AriaLabel(`mockpit: ${summaryText(model.snapshot)}. ${model.view === "closed" ? "Open" : "Close"} the drawer.`),
      h.AriaPressed(String(model.view !== "closed")),
      h.Title(`${model.snapshot.screen}  ·  Alt+M drawer, Alt+X x-ray, hold Alt to inspect`),
      h.OnClick(Message.ClickedStrip()),
    ],
    [
      h.span([h.Class("mp-bar"), h.AriaHidden(true)], [
        h.span([h.Class("mp-seg mp-seg-real"), h.Style({ width: width(real) })], []),
        h.span([h.Class("mp-seg mp-seg-shadowed"), h.Style({ width: width(summary.shadowed) })], []),
        h.span([h.Class("mp-seg mp-seg-mocked"), h.Style({ width: width(summary.mocked) })], []),
      ]),
      h.span([h.Class("mp-num")], [model.snapshot.loaded ? summaryText(model.snapshot) : "loading ledger"]),
    ],
  )
}

const inspectView = (h: HtmlBuilder<Message>, model: Model): Html => {
  const card = model.inspect
  if (!card) return h.empty
  const where = card.file ? `${shortFile(card.file)}${card.line !== null ? `:${card.line}` : ""}` : null
  return h.div([h.Class(`mp-card${card.pinned ? " mp-card-pinned" : ""}`), h.Role("dialog"), h.AriaLabel(`Attribution for ${card.key}`), h.Style({ left: `${card.x}px`, top: `${card.y}px` })], [
    h.div([h.Class("mp-mono mp-card-key")], [card.key]),
    h.div([], [`${card.stage}${card.servedBy === "mock" ? ", served by mock" : ", served by real"}`]),
    h.div([h.Class("mp-mono mp-dim")], [card.path]),
    card.component || where
      ? h.div([h.Class("mp-card-source")], [
          card.component ? h.span([], [card.component]) : h.empty,
          where && card.file ? h.button([h.Type("button"), h.Class("mp-text-button mp-mono"), h.OnClick(Message.ClickedOpen({ file: card.file, line: card.line ?? 1 }))], [where]) : h.empty,
        ])
      : h.empty,
    card.command ? h.div([h.Class("mp-dim")], [`command ${card.command}`]) : h.empty,
    h.div([h.Class("mp-dim")], [card.match]),
    card.pinned
      ? h.div([h.Class("mp-actions")], [
          card.controllable ? textButton(h, card.override === "real" ? "Flip to mock" : "Flip to real", Message.ClickedFlip({ key: card.key, to: card.override === "real" ? "mock" : "real" }), "mp-primary") : h.empty,
          textButton(h, "Pin", Message.ClickedPin({ key: card.key })),
          textButton(h, "Close", Message.ClickedCloseInspect()),
        ])
      : h.div([h.Class("mp-dim mp-hint")], ["click to pin"]),
  ])
}

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class(`mp-root mp-dock-${model.dock}${model.resizing ? " mp-resizing" : ""}`)], [
    model.view === "closed" ? h.empty : drawerView(h, model),
    stripView(h, model),
    inspectView(h, model),
  ])

export const makeOverlayApp = (container: HTMLElement) =>
  Runtime.makeElement({
    Model,
    init: () => ({ model: initialModel }),
    update,
    view,
    subscriptions,
    container,
    ports,
    devTools: false,
  })
