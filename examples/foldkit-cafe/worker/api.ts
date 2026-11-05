/**
 * The real backend. It still runs the previous contract version: menu items
 * have no allergens yet, the special has no pairing, and hours are not built.
 */
import { Effect, Layer, Schema } from "effect"
import { HttpRouter } from "effect/http"
import * as Rpc from "effect/rpc/Rpc"
import * as RpcGroup from "effect/rpc/RpcGroup"
import * as RpcSerialization from "effect/rpc/RpcSerialization"
import * as RpcServer from "effect/rpc/RpcServer"

export class BackendCafeApi extends RpcGroup.make(
  Rpc.make("ListMenu", { success: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, description: Schema.String, price: Schema.Number })) }),
  Rpc.make("GetSpecial", { success: Schema.Struct({ name: Schema.String, description: Schema.String, price: Schema.Number }) }),
) {}

const menu = [
  { id: "flat-white", name: "Flat white", description: "Double ristretto, steamed whole milk.", price: 3.4 },
  { id: "filter", name: "Filter of the day", description: "Washed Ethiopian, brewed to order.", price: 3.1 },
  { id: "cardamom-bun", name: "Cardamom bun", description: "Laminated dough, cardamom sugar.", price: 3.6 },
]

export const BackendHandlers = BackendCafeApi.toLayer({
  ListMenu: () => Effect.succeed(menu),
  GetSpecial: () => Effect.succeed({ name: "Rye and miso cookie", description: "Brown butter, dark rye flour, white miso.", price: 2.9 }),
})

export const RpcApp = RpcServer.layerHttp({ group: BackendCafeApi, path: "/api/rpc", protocol: "http" }).pipe(
  Layer.provide([BackendHandlers, RpcSerialization.layerJson]),
)

/** A fetch handler for local dev; the Worker uses the same group and handlers. */
export const makeWebHandler = () => HttpRouter.toWebHandler(RpcApp, { disableLogger: true }).handler
