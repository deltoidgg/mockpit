import { describe, expect, it } from "vitest"
import { Context, Effect, Layer, Schema } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/http"
import * as Rpc from "effect/rpc/Rpc"
import * as RpcClient from "effect/rpc/RpcClient"
import * as RpcGroup from "effect/rpc/RpcGroup"
import * as RpcSerialization from "effect/rpc/RpcSerialization"
import * as RpcServer from "effect/rpc/RpcServer"
import { Engine } from "../engine/engine.js"
import { memoryLedgerStore } from "../engine/store.js"
import { causeOf, contracts, makeFetch, mockLayer, realLayer, shapeOfSchema, switchLayer, tracerLayer } from "../effect/index.js"

const Customer = Schema.Struct({ id: Schema.Number, name: Schema.String, email: Schema.String, nickname: Schema.optionalKey(Schema.String) })
class Api extends RpcGroup.make(Rpc.make("GetCustomer", { payload: { id: Schema.Number }, success: Customer })) {}
// The backend has not caught up with the contract yet: no email.
class BackendApi extends RpcGroup.make(Rpc.make("GetCustomer", { payload: { id: Schema.Number }, success: Schema.Struct({ id: Schema.Number, name: Schema.String }) })) {}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30))
const makeEngine = async () => {
  const engine = new Engine({ project: "t", store: memoryLedgerStore(), persistPrefs: false, writeDelay: 0 })
  await engine.ready
  return engine
}

describe("effect adapter", () => {
  it("keys RPC calls by procedure, traces them to the calling span, and checks the Schema contract", async () => {
    const engine = await makeEngine()
    contracts(Api, engine)
    const handlers = BackendApi.toLayer({ GetCustomer: ({ id }) => Effect.succeed({ id, name: "Real Ada" }) })
    const app = RpcServer.layerHttp({ group: BackendApi, path: "/api/rpc", protocol: "http" }).pipe(Layer.provide([handlers, RpcSerialization.layerJson]))
    const { handler } = HttpRouter.toWebHandler(app, { disableLogger: true })
    const fetch = makeFetch({ engine, fetch: (input, init) => handler(new Request(input as RequestInfo, init)) })
    const client = RpcClient.layerProtocolHttp({ url: "http://app.test/api/rpc" }).pipe(
      Layer.provide([FetchHttpClient.layer, RpcSerialization.layerJson]),
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
    )
    const program = Effect.gen(function* () {
      const rpc = yield* RpcClient.make(Api)
      return yield* rpc.GetCustomer({ id: 3 })
    }).pipe(Effect.withSpan("FetchCustomer"), Effect.scoped, Effect.provide(Layer.mergeAll(client, tracerLayer)))
    await Effect.runPromise(program).catch(() => undefined)
    await settle()
    const state = engine.getState()
    expect(state.session["RPC GetCustomer"]).toMatchObject({ lastServedBy: "real", command: "FetchCustomer", via: "effect" })
    const entry = engine.getLedger().endpoints["RPC GetCustomer"]!
    expect(entry.stage).toBe("unmocked")
    expect(entry.parity?.against).toBe("schema")
    expect(entry.parity?.diffs.map((diff) => `${diff.kind} ${diff.path}`)).toContain("missing $.email")
    expect(entry.parity?.diffs.some((diff) => diff.path === "$.nickname")).toBe(false)
  })

  it("registers mock Layers as inventory and reports calls without a network", async () => {
    const engine = await makeEngine()
    class Customers extends Context.Service<Customers, { readonly GetCustomer: (id: number) => Effect.Effect<{ id: number; name: string }> }>()("Customers") {}
    const memory = Layer.succeed(Customers, { GetCustomer: (id) => Effect.succeed({ id, name: "Mock Ada" }) })
    const tagged = mockLayer(Customers, memory, { engine, group: Api })
    expect(engine.getState().inventory).toContain("RPC GetCustomer")
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const customers = yield* Customers
        return yield* customers.GetCustomer(1)
      }).pipe(Effect.withSpan("LoadProfile"), Effect.provide(Layer.mergeAll(tagged, tracerLayer))),
    )
    expect(result.name).toBe("Mock Ada")
    await settle()
    expect(engine.getState().session["RPC GetCustomer"]).toMatchObject({ lastServedBy: "mock", command: "LoadProfile" })
    expect(engine.getLedger().endpoints["RPC GetCustomer"]?.stage).toBe("mocked")
    expect(engine.values.lookup("s:mock ada")).toHaveLength(1)

    const live = realLayer(Customers, Layer.succeed(Customers, { GetCustomer: (id) => Effect.succeed({ id, name: "Real Ada" }) }), { engine })
    await Effect.runPromise(Effect.gen(function* () { return yield* (yield* Customers).GetCustomer(2) }).pipe(Effect.provide(live)))
    await settle()
    expect(engine.getLedger().endpoints["RPC GetCustomer"]?.stage).toBe("shadowed")
  })

  it("describes Schemas as shapes and picks the nearest named cause", () => {
    const shape = shapeOfSchema(Schema.Struct({ items: Schema.Array(Schema.Struct({ id: Schema.String })), note: Schema.optionalKey(Schema.String) }))
    expect(shape.fields.find((field) => field.path === "$.items[].id")?.presence).toBe(1)
    expect(shape.fields.find((field) => field.path === "$.note")?.presence).toBeLessThan(0.5)
    expect(causeOf(["Runtime", "FetchCustomer", "RpcClient.GetCustomer", "http.client POST"], "GetCustomer")).toBe("FetchCustomer")
  })

  it("switches one procedure between mock and real per endpoint", async () => {
    const engine = await makeEngine()
    class Menu extends Context.Service<Menu, { readonly ListItems: () => Effect.Effect<string[], Error>; readonly GetSpecial: () => Effect.Effect<string, Error> }>()("Menu") {}
    let realDown = false
    const layer = switchLayer(
      Menu,
      {
        mock: Layer.succeed(Menu, { ListItems: () => Effect.succeed(["mock tea"]), GetSpecial: () => Effect.succeed("mock scone") }),
        real: Layer.succeed(Menu, {
          ListItems: () => (realDown ? Effect.fail(new Error("down")) : Effect.succeed(["real tea"])),
          GetSpecial: () => Effect.succeed("real scone"),
        }),
      },
      { engine },
    )
    const call = <A,>(f: (menu: Menu["Service"]) => Effect.Effect<A, Error>) =>
      Effect.runPromise(Effect.gen(function* () { return yield* f(yield* Menu) }).pipe(Effect.provide(layer), Effect.scoped))
    expect(await call((menu) => menu.ListItems())).toEqual(["mock tea"])
    expect(engine.canControl("RPC ListItems")).toBe(true)
    await engine.flip("RPC ListItems", "real")
    expect(await call((menu) => menu.ListItems())).toEqual(["real tea"])
    expect(await call((menu) => menu.GetSpecial())).toBe("mock scone")
    await settle()
    expect(engine.getLedger().endpoints["RPC ListItems"]?.stage).toBe("shadowed")
    expect(engine.getLedger().endpoints["RPC GetSpecial"]?.stage).toBe("mocked")
    realDown = true
    await engine.setSafetyNet("RPC ListItems", true)
    expect(await call((menu) => menu.ListItems())).toEqual(["mock tea"])
  })
})
