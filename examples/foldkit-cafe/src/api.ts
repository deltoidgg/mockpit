/**
 * The shared contract, as the prototype grew it. The frontend team added
 * allergens and a pairing to the special while designing; the deployed
 * backend (worker/api.ts) is one contract version behind.
 */
import { Schema } from "effect"
import * as Rpc from "effect/rpc/Rpc"
import * as RpcGroup from "effect/rpc/RpcGroup"

export const MenuItem = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  price: Schema.Number,
  allergens: Schema.Array(Schema.String),
})
export type MenuItem = typeof MenuItem.Type

export const Special = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  price: Schema.Number,
  pairing: Schema.String,
})
export type Special = typeof Special.Type

export const Hours = Schema.Struct({ opens: Schema.String, closes: Schema.String })
export type Hours = typeof Hours.Type

export class CafeApi extends RpcGroup.make(
  Rpc.make("ListMenu", { success: Schema.Array(MenuItem) }),
  Rpc.make("GetSpecial", { success: Special }),
  Rpc.make("GetHours", { success: Hours }),
) {}

export const RPC_PATH = "/api/rpc"
