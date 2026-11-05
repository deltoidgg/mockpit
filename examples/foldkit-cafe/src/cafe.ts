/**
 * The Cafe service has two implementations. Memory is the prototype's mock;
 * Rpc talks to the Worker. `switchLayer` provides both and lets mockpit route
 * each procedure, so one endpoint can go real while the rest stay mocked.
 */
import { Context, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import * as RpcClient from "effect/rpc/RpcClient"
import * as RpcSerialization from "effect/rpc/RpcSerialization"
import { fetchLayer, switchLayer } from "mockpit/effect"
import { CafeApi, type Hours, type MenuItem, RPC_PATH, type Special } from "./api"

export class Cafe extends Context.Service<
  Cafe,
  {
    readonly ListMenu: () => Effect.Effect<ReadonlyArray<MenuItem>, unknown>
    readonly GetSpecial: () => Effect.Effect<Special, unknown>
    readonly GetHours: () => Effect.Effect<Hours, unknown>
  }
>()("Cafe") {}

export const Memory = Layer.succeed(Cafe, {
  ListMenu: () =>
    Effect.succeed([
      { id: "flat-white", name: "Flat white", description: "Double ristretto, steamed whole milk.", price: 3.4, allergens: ["milk"] },
      { id: "filter", name: "Filter of the day", description: "Washed Ethiopian, brewed to order.", price: 3.1, allergens: [] },
      { id: "cardamom-bun", name: "Cardamom bun", description: "Laminated dough, cardamom sugar.", price: 3.6, allergens: ["gluten", "milk", "egg"] },
      { id: "oat-cortado", name: "Oat cortado", description: "Equal parts espresso and steamed oat.", price: 3.2, allergens: ["oats"] },
    ]).pipe(Effect.delay("150 millis")),
  GetSpecial: () =>
    Effect.succeed({ name: "Rye and miso cookie", description: "Brown butter, dark rye flour, white miso.", price: 2.9, pairing: "Filter of the day" }).pipe(
      Effect.delay("150 millis"),
    ),
  GetHours: () => Effect.succeed({ opens: "07:30", closes: "16:00" }),
})

export const Rpc = Layer.effect(
  Cafe,
  Effect.gen(function* () {
    const client = yield* RpcClient.make(CafeApi)
    return { ListMenu: () => client.ListMenu(), GetSpecial: () => client.GetSpecial(), GetHours: () => client.GetHours() }
  }),
).pipe(
  Layer.provide(RpcClient.layerProtocolHttp({ url: RPC_PATH })),
  Layer.provide([FetchHttpClient.layer, RpcSerialization.layerJson]),
  // mockpit's RPC-aware fetch records each procedure's raw response.
  Layer.provide(fetchLayer({ rpcPath: RPC_PATH })),
)

export const CafeLive = switchLayer(Cafe, { mock: Memory, real: Rpc }, { group: CafeApi })
