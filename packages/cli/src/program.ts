import { mkdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import {
  createExportManifest,
  defineMockPitConfig,
  routeAuditToMarkdown,
  type MockPitConfig,
  type RouteAuditExport,
} from "@mockpit/core"

type PlaywrightModule = typeof import("playwright")

export interface CliResult {
  readonly exitCode: number
  readonly message: string
}

export const runMockPitCli = async (
  argv: readonly string[],
  cwd = process.cwd(),
): Promise<CliResult> => {
  const [command = "help", ...rest] = argv
  if (command === "init") return initCommand(cwd)
  if (command === "doctor") return doctorCommand(parseArgs(rest), cwd)
  if (command === "audit") return auditCommand(parseArgs(rest), cwd)
  const message = helpText()
  console.log(message)
  return { exitCode: 0, message }
}

export const initCommand = async (cwd = process.cwd()): Promise<CliResult> => {
  const configPath = resolve(cwd, "mockpit.config.mjs")
  if (!existsSync(configPath)) {
    await writeFile(
      configPath,
      `import { defineMockPitConfig } from "@mockpit/core"\n\nexport default defineMockPitConfig({\n  project: "my-app",\n  resources: [],\n  sections: [],\n  capture: [],\n})\n`,
      "utf8",
    )
  }
  const clientPath = resolve(cwd, "src/mockpit/client.ts")
  if (!existsSync(clientPath)) {
    await mkdir(dirname(clientPath), { recursive: true })
    await writeFile(
      clientPath,
      `import { createMockPitClient } from "@mockpit/browser"\nimport config from "../../mockpit.config.mjs"\n\nexport const mockpit = createMockPitClient({ config })\n`,
      "utf8",
    )
  }
  const message = "MockPit initial files are ready."
  console.log(message)
  return { exitCode: 0, message }
}

export const doctorCommand = async (
  args: Record<string, string | boolean>,
  cwd = process.cwd(),
): Promise<CliResult> => {
  const configPath = resolve(cwd, String(args.config ?? "mockpit.config.mjs"))
  const issues: string[] = []
  let config: MockPitConfig

  try {
    config = await loadConfig(configPath)
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error))
    config = defineMockPitConfig({ project: "invalid" })
  }

  if (config.redaction.default === "include-values" && !config.redaction.maskPatterns?.length) {
    issues.push("Redaction includes values but no mask patterns are configured.")
  }
  if (config.resources.length === 0) issues.push("No resources are configured yet.")
  if (String(args.msw ?? "") === "true" && !existsSync(resolve(cwd, "public/mockServiceWorker.js"))) {
    issues.push("MSW was requested but public/mockServiceWorker.js was not found.")
  }

  const message = issues.length
    ? `MockPit doctor found ${issues.length} issue(s):\n${issues.map((issue) => `- ${issue}`).join("\n")}`
    : "MockPit doctor found no issues."
  console.log(message)
  return { exitCode: issues.length ? 1 : 0, message }
}

export const auditCommand = async (
  args: Record<string, string | boolean>,
  cwd = process.cwd(),
): Promise<CliResult> => {
  const baseUrl = String(args["base-url"] ?? args.baseUrl ?? "http://localhost:5173")
  const routes = String(args.routes ?? "/")
    .split(",")
    .map((route) => route.trim())
    .filter(Boolean)
  const outDir = resolve(cwd, String(args.out ?? "mockpit-report"))
  const failOnCaptureFail = Boolean(args["fail-on-capture-fail"])
  const playwright = await loadPlaywright()
  const browser = await playwright.chromium.launch()
  const page = await browser.newPage()
  const exports: RouteAuditExport[] = []

  try {
    for (const route of routes) {
      await page.goto(new URL(route, baseUrl).toString(), { waitUntil: "load" })
      await page.waitForFunction(() => Boolean(window.__MOCKPIT__), undefined, { timeout: 5000 })
      const routeExport = await page.evaluate(() => window.__MOCKPIT__?.exportRoute())
      if (!routeExport) throw new Error(`MockPit global hook did not return an export for ${route}.`)
      exports.push(routeExport)
    }
  } finally {
    await browser.close()
  }

  await mkdir(resolve(outDir, "routes"), { recursive: true })
  for (const routeExport of exports) {
    await writeFile(
      resolve(outDir, "routes", `${slugRoute(routeExport.routePath)}.json`),
      `${JSON.stringify(routeExport, null, 2)}\n`,
      "utf8",
    )
  }
  const config = defineMockPitConfig({ project: exports[0]?.project ?? "mockpit" })
  const manifest = createExportManifest(config, exports)
  await writeFile(resolve(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  await writeFile(
    resolve(outDir, "summary.md"),
    exports.map((routeExport) => routeAuditToMarkdown(routeExport)).join("\n"),
    "utf8",
  )

  const blocked = exports.filter((routeExport) => routeExport.summary.capture?.status === "blocked")
  if (failOnCaptureFail && blocked.length > 0) {
    const message = `MockPit audit found ${blocked.length} blocked route(s).`
    console.error(message)
    return { exitCode: 1, message }
  }

  const message = `MockPit audit wrote ${exports.length} route(s) to ${outDir}.`
  console.log(message)
  return { exitCode: 0, message }
}

const loadConfig = async (configPath: string): Promise<MockPitConfig> => {
  if (!existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`)
  }
  const imported = (await import(pathToFileURL(configPath).href)) as { default?: MockPitConfig }
  if (!imported.default) throw new Error(`Config has no default export: ${configPath}`)
  return imported.default
}

const loadPlaywright = async (): Promise<PlaywrightModule> => {
  try {
    return (await Function("specifier", "return import(specifier)")("playwright")) as PlaywrightModule
  } catch (error) {
    throw new Error("mockpit audit requires Playwright. Install playwright in the project to use audit.", {
      cause: error,
    })
  }
}

const parseArgs = (argv: readonly string[]): Record<string, string | boolean> => {
  const args: Record<string, string | boolean> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token?.startsWith("--")) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith("--")) {
      args[key] = true
    } else {
      args[key] = next
      index += 1
    }
  }
  return args
}

const slugRoute = (routePath: string): string =>
  routePath.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "index"

const helpText = (): string =>
  `MockPit commands:\n  mockpit init\n  mockpit doctor --config mockpit.config.mjs\n  mockpit audit --base-url http://localhost:5173 --routes /,/customers --out mockpit-report`

declare global {
  interface Window {
    __MOCKPIT__?: {
      readonly exportRoute: () => RouteAuditExport
    }
  }
}
