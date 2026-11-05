/**
 * Deploys the API Worker. `alchemy dev` runs it in workerd locally; the
 * mockpit Vite plugin reads `.alchemy/state` to show which stage the real
 * calls reach.
 */
import * as Alchemy from "alchemy"
import * as Cloudflare from "@alchemy.run/cloudflare"
import { Effect } from "effect"
import CafeApi from "./worker/index.js"

export default Alchemy.Stack(
  "FoldAndGrind",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const api = yield* CafeApi
    return { url: api.url }
  }),
)
