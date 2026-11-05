/**
 * Foldkit adapter.
 *
 *   Runtime.makeApplication({ ..., resources: Layer.mergeAll(AppResources, mockpit.resources()) })
 *
 * `resources()` provides the RPC-aware HttpClient and the lineage tracer to
 * every Command. Commands that `yield* HttpClient.HttpClient` are observed
 * with their Command name. Commands that provide `Http.layer` themselves
 * still go through `fetch`, which the fetch sensor or MSW sees.
 *
 * `facts` and `subscriptionEntry` put served-by facts into your own Message
 * stream so they appear in Foldkit DevTools next to the Messages they caused.
 */
import { Effect, Layer, Queue, Schema, Stream } from "effect"
import { Subscription } from "foldkit"
import { type Engine, getEngine } from "../engine/engine.js"
import { ServedBy } from "../schema/index.js"
import { type FetchOptions, layer, register, tracerLayer } from "../effect/index.js"

export const resources = (options: FetchOptions = {}) => {
  register(options.engine ?? getEngine())
  return Layer.mergeAll(layer(options), tracerLayer)
}

export const Fact = Schema.Struct({
  key: Schema.String,
  servedBy: ServedBy,
  status: Schema.Number,
  command: Schema.NullOr(Schema.String),
})
export type Fact = typeof Fact.Type

/** A stream of served-by facts, one per response the engine sees. */
export const facts = (engine: Engine = getEngine()): Stream.Stream<Fact> =>
  Stream.callback<Fact>((queue) => {
    const offer = (fact: Fact) => queueOffer(queue as unknown as Queue.Queue<Fact, never>, fact)
    const seen = new Map<string, number>()
    const unsubscribe = engine.subscribe((state) => {
      for (const [key, entry] of Object.entries(state.session)) {
        if (entry.lastAt === undefined || seen.get(key) === entry.lastAt || !entry.lastServedBy) continue
        seen.set(key, entry.lastAt)
        offer({ key, servedBy: entry.lastServedBy, status: entry.lastStatus ?? 0, command: entry.command ?? null })
      }
    })
    return Effect_acquire(unsubscribe)
  })

/** A Subscription entry that turns facts into your Messages. */
export const subscriptionEntry = <Message>(toMessage: (fact: Fact) => Message, engine?: Engine) =>
  Subscription.persistentEntry(Stream.map(facts(engine), toMessage))

const queueOffer = <A>(queue: Queue.Queue<A, never>, value: A) => {
  Queue.offerUnsafe(queue, value)
}

const Effect_acquire = (release: () => void) => Effect.addFinalizer(() => Effect.sync(release))
