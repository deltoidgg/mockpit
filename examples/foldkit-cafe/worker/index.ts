/** The API Worker, deployed by alchemy.run.ts. */
import * as Cloudflare from "@alchemy.run/cloudflare"
import { Effect, Layer } from "effect"
import * as RpcSerialization from "effect/rpc/RpcSerialization"
import * as RpcServer from "effect/rpc/RpcServer"
import { BackendCafeApi, BackendHandlers } from "./api.js"

export default Cloudflare.Worker(
  "CafeApi",
  { main: import.meta.url },
  Effect.gen(function* () {
    const rpc = yield* RpcServer.toHttpEffect(BackendCafeApi)
    return { fetch: rpc }
  }).pipe(Effect.provide(Layer.mergeAll(BackendHandlers, RpcSerialization.layerJson))),
)
