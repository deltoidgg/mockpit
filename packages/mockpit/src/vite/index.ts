/**
 * Vite plugin. In dev it injects MockPit, attaches to any MSW worker the app
 * creates, persists the ledger to `.mockpit/ledger.json`, scans source for
 * visible literals and component locations, and reports the git SHA and the
 * Alchemy stage the app talks to. Nothing is added to production builds.
 *
 *   import { mockpit } from "mockpit/vite"
 *   export default { plugins: [mockpit()] }
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { Plugin, ViteDevServer } from "vite"
import { mergeLedgers, serialiseLedger } from "../engine/ledger.js"
import { type ComponentLocation, type DevEnv, type Literal, decodeLedger, decodeLocalPrefs } from "../schema/index.js"
import { scanSource } from "./source.js"

export interface MockpitPluginOptions {
  /** Ledger file, relative to the project root. */
  readonly ledger?: string
  /** Project name shown in the drawer and the ledger. Defaults to package.json `name`. */
  readonly project?: string
  /** Scan source for visible literals. Default true. */
  readonly literals?: boolean
  /** Inject the client into index.html. Default true. */
  readonly inject?: boolean
  /** Attach to `setupWorker(...)` calls automatically. Default true. */
  readonly attachWorkers?: boolean
  /** Alchemy stack directory to read stage state from. Default `.alchemy`. */
  readonly alchemyDir?: string
  /** Files to scan for literals. */
  readonly include?: RegExp
}

const VIRTUAL = "virtual:mockpit/client"
const RESOLVED = `\0${VIRTUAL}`
const SOURCE_FILE = /\.(?:[jt]sx?|mts|cts)$/
const ENDPOINT = "/__mockpit"

const readBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolveBody, reject) => {
    let data = ""
    request.setEncoding("utf8")
    request.on("data", (chunk: string) => {
      data += chunk
      if (data.length > 8 * 1024 * 1024) reject(new Error("ledger too large"))
    })
    request.on("end", () => resolveBody(data))
    request.on("error", reject)
  })

const send = (response: ServerResponse, status: number, body?: unknown) => {
  response.statusCode = status
  if (body === undefined) {
    response.end()
    return
  }
  response.setHeader("content-type", "application/json")
  response.end(typeof body === "string" ? body : JSON.stringify(body))
}

const git = (root: string, args: string[]): string | undefined => {
  try {
    return execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined
  } catch {
    return undefined
  }
}

/** Read Alchemy v2 local state: `.alchemy/state/<Stack>/<stage>/<Resource>.json`. */
export const readAlchemyState = (root: string, dir = ".alchemy"): DevEnv["alchemy"] | undefined => {
  const stateDir = join(root, dir, "state")
  if (!existsSync(stateDir)) return undefined
  try {
    const stacks = readdirSync(stateDir).filter((name) => statSync(join(stateDir, name)).isDirectory())
    const preferred = process.env["ALCHEMY_STAGE"] ?? (process.env["USER"] ? `dev_${process.env["USER"]}` : undefined)
    let best: { stack: string; stage: string; mtime: number } | undefined
    for (const stack of stacks) {
      for (const stage of readdirSync(join(stateDir, stack))) {
        const path = join(stateDir, stack, stage)
        if (!statSync(path).isDirectory()) continue
        const mtime = statSync(path).mtimeMs + (stage === preferred ? 1e15 : 0)
        if (!best || mtime > best.mtime) best = { stack, stage, mtime }
      }
    }
    if (!best) return undefined
    const stagePath = join(stateDir, best.stack, best.stage)
    const workers: Array<{ fqn: string; url?: string }> = []
    for (const file of readdirSync(stagePath).filter((name) => name.endsWith(".json"))) {
      try {
        const raw = JSON.parse(readFileSync(join(stagePath, file), "utf8")) as Record<string, unknown>
        const type = String(raw["type"] ?? raw["kind"] ?? "")
        if (!/worker|website/i.test(type) && !/worker|api/i.test(file)) continue
        const output = (raw["output"] ?? raw["attr"] ?? raw["attributes"] ?? raw) as Record<string, unknown>
        const url = [output["url"], output["workerUrl"], raw["url"]].find((value): value is string => typeof value === "string")
        workers.push({ fqn: String(raw["fqn"] ?? raw["id"] ?? file.replace(/\.json$/, "")), ...(url ? { url } : {}) })
      } catch {
        // Unreadable resource state is skipped.
      }
    }
    return { stack: best.stack, stage: best.stage, workers }
  } catch {
    return undefined
  }
}

export const mockpit = (options: MockpitPluginOptions = {}): Plugin => {
  let root = process.cwd()
  let project = options.project ?? "app"
  let ledgerPath = ""
  let localPath = ""
  let server: ViteDevServer | undefined
  const literals = new Map<string, Literal[]>()
  const components = new Map<string, ComponentLocation[]>()
  const include = options.include ?? SOURCE_FILE
  let parse: ((file: string, code: string, options: { lang: string }) => { program: unknown; errors: unknown[] }) | undefined

  const ensureDir = () => {
    const dir = dirname(ledgerPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const ignore = join(dir, ".gitignore")
    if (!existsSync(ignore)) writeFileSync(ignore, "local.json\n")
  }

  const readLedgerFile = () => {
    if (!existsSync(ledgerPath)) return undefined
    try {
      return decodeLedger(JSON.parse(readFileSync(ledgerPath, "utf8")))
    } catch {
      return undefined
    }
  }

  const env = (): DevEnv => {
    const sha = git(root, ["rev-parse", "HEAD"])
    const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"])
    const alchemy = readAlchemyState(root, options.alchemyDir)
    return { ...(sha ? { sha } : {}), ...(branch ? { branch } : {}), ...(alchemy ? { alchemy } : {}) }
  }

  const middleware = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = request.url ?? ""
    if (!url.startsWith(ENDPOINT)) return next()
    const path = url.slice(ENDPOINT.length).split("?")[0]
    try {
      if (path === "/ping") return send(response, 200, { name: "mockpit", project })
      if (path === "/ledger" && request.method === "GET") {
        if (!existsSync(ledgerPath)) return send(response, 204)
        return send(response, 200, readFileSync(ledgerPath, "utf8"))
      }
      if (path === "/ledger" && request.method === "POST") {
        const incoming = decodeLedger(JSON.parse(await readBody(request)))
        const current = readLedgerFile()
        const merged = current ? mergeLedgers({ ...incoming, project }, current) : { ...incoming, project }
        const text = serialiseLedger(merged)
        ensureDir()
        const previous = existsSync(ledgerPath) ? readFileSync(ledgerPath, "utf8") : ""
        if (text !== previous) writeFileSync(ledgerPath, text)
        return send(response, 204)
      }
      if (path === "/local" && request.method === "GET") {
        return send(response, 200, existsSync(localPath) ? readFileSync(localPath, "utf8") : "{}")
      }
      if (path === "/local" && request.method === "POST") {
        const prefs = decodeLocalPrefs(JSON.parse(await readBody(request)))
        ensureDir()
        writeFileSync(localPath, `${JSON.stringify(prefs, null, 2)}\n`)
        return send(response, 204)
      }
      if (path === "/env") return send(response, 200, env())
      if (path === "/source") {
        return send(response, 200, { literals: [...literals.values()].flat(), components: [...components.values()].flat() })
      }
      return send(response, 404, { error: "unknown mockpit endpoint" })
    } catch (error) {
      return send(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  return {
    name: "mockpit",
    apply: "serve",
    enforce: "pre",
    async configResolved(config) {
      root = config.root
      ledgerPath = resolve(root, options.ledger ?? ".mockpit/ledger.json")
      localPath = join(dirname(ledgerPath), "local.json")
      if (!options.project) {
        try {
          project = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name?: string }).name ?? project
        } catch {
          // No package.json at the Vite root.
        }
      }
      const vite = (await import("vite")) as unknown as { parseSync?: typeof parse }
      parse = vite.parseSync
    },
    configureServer(devServer) {
      server = devServer
      // The overlay is a Foldkit program. Answer its Model preservation request
      // (nothing preserved) so it starts at once without asking for
      // @foldkit/vite-plugin. Apps that use that plugin answer their own ids.
      devServer.ws.on("foldkit:request-model", (data: { id?: unknown }, client: { send: (event: string, payload: unknown) => void }) => {
        if (typeof data?.id === "string" && data.id.startsWith("mockpit-")) client.send("foldkit:restore-model", { id: data.id })
      })
      devServer.middlewares.use((request, response, next) => {
        void middleware(request, response, next)
      })
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : undefined
    },
    load(id) {
      if (id !== RESOLVED) return undefined
      return `import { start, getEngine } from "mockpit"
start({ project: ${JSON.stringify(project)} })
if (import.meta.hot) {
  import.meta.hot.on("mockpit:source", () => { void getEngine().refreshSource() })
}
`
    },
    transformIndexHtml() {
      if (options.inject === false) return []
      const tags: Array<{ tag: string; attrs?: Record<string, string>; children?: string; injectTo: "head-prepend" }> = []
      // Seed per-developer toggles synchronously so they apply before the first request.
      if (existsSync(localPath)) {
        try {
          const prefs = JSON.stringify(decodeLocalPrefs(JSON.parse(readFileSync(localPath, "utf8"))))
          const key = JSON.stringify(`mockpit:${project}:local`)
          tags.push({ tag: "script", children: `try{if(!localStorage.getItem(${key}))localStorage.setItem(${key},${JSON.stringify(prefs).replace(/</g, "\\u003c")})}catch(e){}`, injectTo: "head-prepend" })
        } catch {
          // A broken local.json is ignored.
        }
      }
      tags.push({ tag: "script", attrs: { type: "module", src: `/@id/__x00__${VIRTUAL}` }, injectTo: "head-prepend" })
      return tags
    },
    transform(code, id) {
      const file = id.split("?")[0]!
      if (!include.test(file) || file.includes("/node_modules/") || !file.startsWith(`${root}/`) || !parse) return undefined
      const scanLiterals = options.literals !== false && (/\.[jt]sx$/.test(file) || code.includes("h."))
      const mayHaveWorker = options.attachWorkers !== false && code.includes("setupWorker")
      if (!scanLiterals && !mayHaveWorker) return undefined
      const lang = file.endsWith(".tsx") ? "tsx" : file.endsWith(".jsx") ? "jsx" : file.endsWith(".ts") || file.endsWith(".mts") || file.endsWith(".cts") ? "ts" : "js"
      let result: { program: unknown; errors: unknown[] }
      try {
        result = parse(file, code, { lang })
      } catch {
        return undefined
      }
      const scanned = scanSource(relative(root, file), code, result.program as never)
      if (scanLiterals) {
        const before = JSON.stringify(literals.get(file) ?? []) + JSON.stringify(components.get(file) ?? [])
        literals.set(file, scanned.literals.map((literal) => ({ ...literal, file })))
        components.set(file, scanned.components.map((component) => ({ ...component, file })))
        const after = JSON.stringify(literals.get(file)) + JSON.stringify(components.get(file))
        if (before !== after) server?.ws.send({ type: "custom", event: "mockpit:source" })
      }
      if (scanned.workers.length === 0) return undefined
      const attach = scanned.workers
        .map(
          (name) =>
            `{ const detach = __mockpitAttach(${name}); if (import.meta.hot) import.meta.hot.dispose(detach) }`,
        )
        .join("\n")
      return { code: `${code}\nimport { attach as __mockpitAttach } from "mockpit/msw"\n${attach}\n`, map: null }
    },
  }
}

export default mockpit
