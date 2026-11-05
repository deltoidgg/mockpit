/**
 * mockpit CLI. Reads and writes `.mockpit/ledger.json`; never needs a browser
 * except for `crawl`.
 *
 *   mockpit report  [--base <ref>] [--only-changed] [--ledger <path>] [--out <file>]
 *   mockpit check   [--base <ref>] [--allow-regressions] [--max-mocked <n>] [--min-parity <0..1>]
 *   mockpit merge   <base> <ours> <theirs>        git merge driver
 *   mockpit init                                    .mockpit, .gitattributes, merge driver
 *   mockpit crawl   --url <url> --routes /,/a     visit routes with Playwright and record
 *   mockpit promote <key> --handlers <file> --out <dir> [--remove]
 *   mockpit clean-workers                           how to drop stale mock service workers
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { httpKey } from "../engine/key.js"
import { mergeLedgers, serialiseLedger } from "../engine/ledger.js"
import { checkLedger, toMarkdown } from "../engine/report.js"
import { type Ledger, decodeLedger, emptyLedger } from "../schema/index.js"

export interface CliResult {
  readonly code: number
  readonly output: string
}

type Args = { readonly positional: string[]; readonly flags: Record<string, string | boolean> }

export const parseArgs = (argv: readonly string[]): Args => {
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!
    if (!token.startsWith("--")) {
      positional.push(token)
      continue
    }
    const [name, inline] = token.slice(2).split("=", 2) as [string, string | undefined]
    if (inline !== undefined) flags[name] = inline
    else if (argv[index + 1] && !argv[index + 1]!.startsWith("--")) flags[name] = argv[++index]!
    else flags[name] = true
  }
  return { positional, flags }
}

const DEFAULT_LEDGER = ".mockpit/ledger.json"

const readLedger = (path: string): Ledger | undefined => {
  if (!existsSync(path)) return undefined
  return decodeLedger(JSON.parse(readFileSync(path, "utf8")))
}

const gitShow = (cwd: string, ref: string, path: string): Ledger | undefined => {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim()
    const relativePath = relative(root, resolve(cwd, path)).split("\\").join("/")
    const text = execFileSync("git", ["show", `${ref}:${relativePath}`], { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString()
    return decodeLedger(JSON.parse(text))
  } catch {
    return undefined
  }
}

const ledgerPath = (cwd: string, args: Args) => resolve(cwd, String(args.flags["ledger"] ?? DEFAULT_LEDGER))

const report = (cwd: string, args: Args): CliResult => {
  const path = ledgerPath(cwd, args)
  const ledger = readLedger(path)
  if (!ledger) return { code: 1, output: `No ledger at ${relative(cwd, path)}. Run the app with the mockpit Vite plugin first.` }
  const baseRef = typeof args.flags["base"] === "string" ? args.flags["base"] : undefined
  const base = baseRef ? (gitShow(cwd, baseRef, path) ?? emptyLedger(ledger.project)) : undefined
  const markdown = toMarkdown(ledger, { ...(base ? { base } : {}), ...(baseRef ? { baseLabel: baseRef } : {}), onlyChanged: args.flags["only-changed"] === true })
  if (typeof args.flags["out"] === "string") writeFileSync(resolve(cwd, args.flags["out"]), markdown)
  return { code: 0, output: markdown }
}

const check = (cwd: string, args: Args): CliResult => {
  const path = ledgerPath(cwd, args)
  const ledger = readLedger(path)
  if (!ledger) return { code: 1, output: `No ledger at ${relative(cwd, path)}.` }
  const baseRef = typeof args.flags["base"] === "string" ? args.flags["base"] : undefined
  const base = baseRef ? gitShow(cwd, baseRef, path) : undefined
  const number = (name: string) => (typeof args.flags[name] === "string" ? Number(args.flags[name]) : undefined)
  const maxMocked = number("max-mocked")
  const minParity = number("min-parity")
  const result = checkLedger(ledger, base, {
    noRegressions: args.flags["allow-regressions"] !== true,
    ...(maxMocked !== undefined ? { maxMocked } : {}),
    ...(minParity !== undefined ? { minParity } : {}),
  })
  return result.ok
    ? { code: 0, output: "mockpit check passed." }
    : { code: 1, output: `mockpit check failed:\n${result.failures.map((failure) => `- ${failure}`).join("\n")}` }
}

/** git merge driver: `mockpit merge %O %A %B`. Writes the result to %A. */
const merge = (cwd: string, args: Args): CliResult => {
  const [basePath, oursPath, theirsPath] = args.positional
  if (!oursPath || !theirsPath) return { code: 2, output: "usage: mockpit merge <base> <ours> <theirs>" }
  try {
    const ours = readLedger(resolve(cwd, oursPath))
    const theirs = readLedger(resolve(cwd, theirsPath))
    if (!ours || !theirs) return { code: 1, output: "Both sides must be mockpit ledgers." }
    void basePath
    writeFileSync(resolve(cwd, oursPath), serialiseLedger(mergeLedgers(ours, theirs)))
    return { code: 0, output: "Merged mockpit ledgers." }
  } catch (error) {
    return { code: 1, output: `Could not merge ledgers: ${error instanceof Error ? error.message : String(error)}` }
  }
}

const init = (cwd: string): CliResult => {
  const dir = resolve(cwd, ".mockpit")
  mkdirSync(dir, { recursive: true })
  if (!existsSync(join(dir, ".gitignore"))) writeFileSync(join(dir, ".gitignore"), "local.json\n")
  const attributes = resolve(cwd, ".gitattributes")
  const line = ".mockpit/ledger.json merge=mockpit"
  const current = existsSync(attributes) ? readFileSync(attributes, "utf8") : ""
  if (!current.includes(line)) writeFileSync(attributes, `${current}${current && !current.endsWith("\n") ? "\n" : ""}${line}\n`)
  const lines = ["Created .mockpit/ and registered the ledger merge driver in .gitattributes."]
  try {
    execFileSync("git", ["config", "merge.mockpit.name", "mockpit ledger"], { cwd, stdio: "ignore" })
    execFileSync("git", ["config", "merge.mockpit.driver", "npx mockpit merge %O %A %B"], { cwd, stdio: "ignore" })
    lines.push("Configured git merge.mockpit.driver for this clone.")
  } catch {
    lines.push("Not a git repository: skipped the merge driver config.")
  }
  lines.push("", "Add the plugin to vite.config.ts:", "", '  import { mockpit } from "mockpit/vite"', "  export default { plugins: [mockpit()] }")
  return { code: 0, output: lines.join("\n") }
}

const crawl = async (cwd: string, args: Args): Promise<CliResult> => {
  const url = String(args.flags["url"] ?? "http://localhost:5173")
  const routes = String(args.flags["routes"] ?? "/").split(",").map((route) => route.trim()).filter(Boolean)
  const wait = Number(args.flags["wait"] ?? 1500)
  let playwright: { chromium: { launch: () => Promise<any> } }
  try {
    playwright = (await import(/* @vite-ignore */ String("playwright"))) as typeof playwright
  } catch {
    try {
      playwright = (await import(/* @vite-ignore */ String("@playwright/test"))) as typeof playwright
    } catch {
      return { code: 1, output: "mockpit crawl needs playwright: npm i -D playwright" }
    }
  }
  const browser = await playwright.chromium.launch()
  const page = await browser.newPage()
  let ledger: Ledger | undefined
  try {
    for (const route of routes) {
      await page.goto(new URL(route, url).href, { waitUntil: "networkidle" })
      await page.waitForFunction(() => Boolean((window as any).__MOCKPIT__?.state().loaded), undefined, { timeout: 10000 })
      await page.waitForTimeout(wait)
      ledger = await page.evaluate(async () => {
        const hook = (window as any).__MOCKPIT__
        await hook.flush()
        return hook.ledger()
      })
    }
  } finally {
    await browser.close()
  }
  if (!ledger) return { code: 1, output: "No ledger came back from the page." }
  const path = ledgerPath(cwd, args)
  const existing = readLedger(path)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, serialiseLedger(existing ? mergeLedgers(decodeLedger(ledger), existing) : decodeLedger(ledger)))
  return { code: 0, output: `Crawled ${routes.length} route(s); ledger at ${relative(cwd, path)} has ${Object.keys(decodeLedger(ledger).endpoints).length} endpoints.` }
}

// promote ---------------------------------------------------------------------

type AstNode = { type: string; start: number; end: number; [key: string]: unknown }

const findHandlerCalls = (program: AstNode): AstNode[] => {
  const calls: AstNode[] = []
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return
    const current = node as AstNode
    if (current.type === "CallExpression") {
      const callee = current["callee"] as AstNode | undefined
      const object = callee?.["object"] as AstNode | undefined
      if (object?.type === "Identifier" && object["name"] === "http") calls.push(current)
    }
    for (const key in current) {
      if (key === "start" || key === "end" || key === "type") continue
      const value = current[key]
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === "object") visit(value)
    }
  }
  visit(program)
  return calls
}

const slug = (key: string) => key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

export const promoteSource = (source: string, program: AstNode, key: string): { readonly method: string; readonly path: string; readonly resolver: string; readonly start: number; readonly end: number } | undefined => {
  for (const call of findHandlerCalls(program)) {
    const method = String(((call["callee"] as AstNode)["property"] as AstNode)["name"] ?? "").toUpperCase()
    const [pathArg, resolverArg] = call["arguments"] as AstNode[]
    if (!pathArg || !resolverArg || typeof pathArg["value"] !== "string") continue
    const path = pathArg["value"] as string
    if (httpKey(method === "ALL" ? "GET" : method, path) !== key) continue
    return { method, path, resolver: source.slice(resolverArg.start, resolverArg.end), start: call.start, end: call.end }
  }
  return undefined
}

const ROUTER = `// Generated by mockpit. A minimal router for promoted endpoints.
// Mount it in your Worker before your real routes:
//   const promoted = await handlePromoted(request); if (promoted) return promoted
import { routes } from "./index.js"

const compile = (path: string) =>
  new RegExp("^" + path.replace(/[.+?^\${}()|[\\]\\\\]/g, "\\\\$&").replace(/:(\\w+)/g, "(?<$1>[^/]+)").replace(/\\*/g, ".*") + "/?$")

export const handlePromoted = async (request: Request): Promise<Response | undefined> => {
  const url = new URL(request.url)
  for (const route of routes) {
    if (route.method !== "ALL" && route.method !== request.method) continue
    const match = compile(new URL(route.path, url.origin).pathname).exec(url.pathname)
    if (match) return route.handler({ request, params: match.groups ?? {}, requestId: crypto.randomUUID() })
  }
  return undefined
}
`

const promote = async (cwd: string, args: Args): Promise<CliResult> => {
  const key = args.positional[0]
  const handlersFile = typeof args.flags["handlers"] === "string" ? resolve(cwd, args.flags["handlers"]) : undefined
  const outDir = resolve(cwd, String(args.flags["out"] ?? "worker/promoted"))
  if (!key || !handlersFile) return { code: 2, output: 'usage: mockpit promote "GET /api/x" --handlers src/mocks/handlers.ts [--out worker/promoted] [--remove]' }
  let parseSync: (file: string, code: string, options: { lang: string }) => { program: unknown }
  try {
    parseSync = ((await import(/* @vite-ignore */ String("vite"))) as { parseSync: typeof parseSync }).parseSync
  } catch {
    return { code: 1, output: "mockpit promote needs vite installed (it uses Vite's oxc parser)." }
  }
  const source = readFileSync(handlersFile, "utf8")
  const lang = handlersFile.endsWith(".tsx") ? "tsx" : handlersFile.endsWith(".ts") ? "ts" : "js"
  const found = promoteSource(source, parseSync(handlersFile, source, { lang }).program as AstNode, key)
  if (!found) return { code: 1, output: `No http.* handler for ${key} in ${relative(cwd, handlersFile)}.` }

  mkdirSync(outDir, { recursive: true })
  const file = `${slug(key)}.ts`
  writeFileSync(
    join(outDir, file),
    `// Promoted from ${relative(outDir, handlersFile).split("\\").join("/")} by mockpit.
// This serves the prototype's fixture from the edge, so the endpoint is real
// infrastructure while the real implementation is written. Replace the body.
import { HttpResponse } from "msw"

export const method = ${JSON.stringify(found.method)}
export const path = ${JSON.stringify(found.path)}
export const handler = ${found.resolver}
`,
  )
  const indexPath = join(outDir, "index.ts")
  const modules = new Set<string>(existsSync(indexPath) ? [...readFileSync(indexPath, "utf8").matchAll(/from "\.\/([^"]+)\.js"/g)].map((match) => match[1]!) : [])
  modules.add(file.replace(/\.ts$/, ""))
  const names = [...modules].sort()
  writeFileSync(
    indexPath,
    `// Generated by mockpit promote.\n${names.map((name, index) => `import * as route${index} from "./${name}.js"`).join("\n")}\n\nexport const routes: ReadonlyArray<{ method: string; path: string; handler: (info: { request: Request; params: Record<string, string>; requestId: string }) => Response | Promise<Response> }> = [\n${names.map((_, index) => `  route${index} as never,`).join("\n")}\n]\n`,
  )
  writeFileSync(join(outDir, "router.ts"), ROUTER)

  const lines = [`Promoted ${key} to ${relative(cwd, join(outDir, file))}.`]
  if (args.flags["remove"] === true) {
    let end = found.end
    while (end < source.length && /[\s,]/.test(source[end]!) && source[end] !== "\n") end += 1
    if (source[end] === "\n") end += 1
    let start = found.start
    while (start > 0 && /[ \t]/.test(source[start - 1]!)) start -= 1
    writeFileSync(handlersFile, source.slice(0, start) + source.slice(end))
    lines.push(`Removed the MSW handler from ${relative(cwd, handlersFile)}; the ledger will show it as real on next load.`)
    const path = ledgerPath(cwd, args)
    const ledger = readLedger(path)
    const entry = ledger?.endpoints[key]
    if (ledger && entry) {
      writeFileSync(path, serialiseLedger({ ...ledger, endpoints: { ...ledger.endpoints, [key]: { ...entry, note: "stubbed on edge" } } }))
    }
  } else {
    lines.push("Run again with --remove to delete the MSW handler once the route is deployed.")
  }
  lines.push(`Mount ${relative(cwd, join(outDir, "router.ts"))} in your Worker's fetch handler.`)
  return { code: 0, output: lines.join("\n") }
}

const cleanWorkers = (): CliResult => ({
  code: 0,
  output: [
    "Mock service workers are registered per browser profile, so the CLI cannot reach them.",
    "The mockpit strip warns when a stale registration is intercepting requests; use its Unregister action,",
    "or run this in the browser console:",
    "",
    "  for (const r of await navigator.serviceWorker.getRegistrations()) if (r.active?.scriptURL.endsWith('mockServiceWorker.js')) await r.unregister()",
  ].join("\n"),
})

const HELP = `mockpit: see what is still mock, watch it become real.

  mockpit report  [--base <ref>] [--only-changed] [--ledger <path>] [--out <file>]
  mockpit check   [--base <ref>] [--allow-regressions] [--max-mocked <n>] [--min-parity <0..1>]
  mockpit merge   <base> <ours> <theirs>
  mockpit init
  mockpit crawl   --url <url> --routes /,/customers [--wait <ms>]
  mockpit promote "<METHOD /path>" --handlers <file> [--out <dir>] [--remove]
  mockpit clean-workers
`

export const run = async (argv: readonly string[], cwd = process.cwd()): Promise<CliResult> => {
  const [command, ...rest] = argv
  const args = parseArgs(rest)
  switch (command) {
    case "report":
      return report(cwd, args)
    case "check":
      return check(cwd, args)
    case "merge":
      return merge(cwd, args)
    case "init":
      return init(cwd)
    case "crawl":
      return crawl(cwd, args)
    case "promote":
      return promote(cwd, args)
    case "clean-workers":
      return cleanWorkers()
    case undefined:
    case "help":
    case "--help":
      return { code: 0, output: HELP }
    default:
      return { code: 2, output: `Unknown command: ${command}\n\n${HELP}` }
  }
}
