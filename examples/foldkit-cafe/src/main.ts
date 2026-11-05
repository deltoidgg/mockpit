/**
 * Fold and Grind: a CAFE-shaped Foldkit app. The Cafe service is provided
 * through `resources`, with mockpit's lineage tracer, so every Command that
 * reads the menu is traced and every value it renders can be attributed.
 */
import { Effect, Layer, Schema } from "effect"
import { Command, Runtime } from "foldkit"
import type { Document, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { tracerLayer } from "mockpit/effect"
import { Hours, MenuItem, Special } from "./api"
import { Cafe, CafeLive } from "./cafe"

// MODEL

const Remote = <S extends Schema.Top>(value: S) =>
  Schema.Union([Schema.TaggedStruct("Loading", {}), Schema.TaggedStruct("Loaded", { value }), Schema.TaggedStruct("Failed", { reason: Schema.String })])

export const Model = Schema.Struct({
  menu: Remote(Schema.Array(MenuItem)),
  special: Remote(Special),
  hours: Remote(Hours),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  GotMenu: { menu: Schema.Array(MenuItem) },
  GotSpecial: { special: Special },
  GotHours: { hours: Hours },
  FailedToLoad: { part: Schema.Literals(["menu", "special", "hours"]), reason: Schema.String },
  ClickedReload: {},
})
export type Message = typeof Message.Type

// COMMANDS

const failed = (part: "menu" | "special" | "hours") => () => Effect.succeed(Message.FailedToLoad({ part, reason: "unavailable" }))

const FetchMenu = Command.define("FetchMenu", {
  messages: [Message.GotMenu, Message.FailedToLoad],
  execute: Effect.gen(function* () {
    const cafe = yield* Cafe
    return Message.GotMenu({ menu: yield* cafe.ListMenu() })
  }).pipe(Effect.withSpan("FetchMenu"), Effect.catchCause(failed("menu"))),
})

const FetchSpecial = Command.define("FetchSpecial", {
  messages: [Message.GotSpecial, Message.FailedToLoad],
  execute: Effect.gen(function* () {
    const cafe = yield* Cafe
    return Message.GotSpecial({ special: yield* cafe.GetSpecial() })
  }).pipe(Effect.withSpan("FetchSpecial"), Effect.catchCause(failed("special"))),
})

const FetchHours = Command.define("FetchHours", {
  messages: [Message.GotHours, Message.FailedToLoad],
  execute: Effect.gen(function* () {
    const cafe = yield* Cafe
    return Message.GotHours({ hours: yield* cafe.GetHours() })
  }).pipe(Effect.withSpan("FetchHours"), Effect.catchCause(failed("hours"))),
})

// UPDATE

type Return = { model: Model; commands?: ReadonlyArray<ReturnType<typeof FetchMenu> | ReturnType<typeof FetchSpecial> | ReturnType<typeof FetchHours>> }

const loading = { _tag: "Loading" } as const

export const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    GotMenu: ({ menu }) => ({ model: { ...model, menu: { _tag: "Loaded", value: menu } } }),
    GotSpecial: ({ special }) => ({ model: { ...model, special: { _tag: "Loaded", value: special } } }),
    GotHours: ({ hours }) => ({ model: { ...model, hours: { _tag: "Loaded", value: hours } } }),
    FailedToLoad: ({ part, reason }) => ({ model: { ...model, [part]: { _tag: "Failed", reason } } }),
    ClickedReload: () => ({ model: { menu: loading, special: loading, hours: loading }, commands: [FetchMenu(), FetchSpecial(), FetchHours()] }),
  })

// VIEW

const price = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value)

const menuView = (h: HtmlBuilder<Message>, model: Model) => {
  if (model.menu._tag === "Loading") return h.p([h.Class("quiet")], ["Brewing"])
  if (model.menu._tag === "Failed") return h.p([h.Class("quiet")], ["The menu is unavailable right now."])
  return h.ul(
    [h.Class("menu")],
    model.menu.value.map((item) =>
      h.li([h.Key(item.id)], [
        h.div([h.Class("item-head")], [h.span([h.Class("item-name")], [item.name]), h.span([h.Class("price")], [price(item.price)])]),
        h.p([h.Class("quiet")], [item.description]),
        item.allergens && item.allergens.length > 0 ? h.p([h.Class("allergens")], [`Contains ${item.allergens.join(", ")}`]) : h.empty,
      ]),
    ),
  )
}

const specialView = (h: HtmlBuilder<Message>, model: Model) => {
  if (model.special._tag !== "Loaded") return h.empty
  const special = model.special.value
  return h.aside([h.Class("special")], [
    h.h2([], ["Today at the counter"]),
    h.div([h.Class("item-head")], [h.span([h.Class("item-name")], [special.name]), h.span([h.Class("price")], [price(special.price)])]),
    h.p([h.Class("quiet")], [special.description]),
    special.pairing ? h.p([], [`Pairs with ${special.pairing}`]) : h.empty,
  ])
}

const hoursView = (h: HtmlBuilder<Message>, model: Model) =>
  model.hours._tag === "Loaded" ? h.p([h.Class("hours")], [`Open ${model.hours.value.opens} to ${model.hours.value.closes}`]) : h.empty

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "Fold and Grind",
  body: h.main([], [
    h.header([], [h.h1([], ["Fold and Grind"]), hoursView(h, model)]),
    specialView(h, model),
    h.section([], [h.h2([], ["Menu"]), menuView(h, model)]),
    h.footer([], [h.button([h.Type("button"), h.OnClick(Message.ClickedReload())], ["Refresh"]), h.span([h.Class("quiet")], ["Prices include VAT."])]),
  ]),
})

const application = Runtime.makeApplication({
  Model,
  init: () => ({ model: { menu: loading, special: loading, hours: loading }, commands: [FetchMenu(), FetchSpecial(), FetchHours()] }),
  update,
  view,
  container: document.getElementById("app"),
  resources: Layer.mergeAll(CafeLive, tracerLayer).pipe(Layer.orDie),
  devTools: false,
})

Runtime.run(application)
