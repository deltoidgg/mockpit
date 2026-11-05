import { describe, expect, it } from "vitest"
import { parseSync } from "vite"
import { scanSource } from "../vite/source.js"

const scan = (file: string, code: string) => scanSource(file, code, parseSync(file, code, { lang: file.endsWith(".tsx") ? "tsx" : "ts" }).program as never)

describe("source scan", () => {
  it("finds visible literals and components in TSX", () => {
    const result = scan(
      "src/Header.tsx",
      `export function Header({ c }: { c: { name: string } }) {
  return <div title="Account header"><h1>{c.name}</h1><p>Welcome back</p>{"Static"}<span>{42}</span></div>
}
const helper = () => null
export const PREFS_KEY = "x"`,
    )
    expect(result.literals.map((literal) => [literal.text, literal.line, literal.component])).toEqual([
      ["Account header", 2, "Header"],
      ["Welcome back", 2, "Header"],
      ["Static", 2, "Header"],
    ])
    expect(result.components.map((component) => component.name)).toEqual(["Header"])
  })

  it("finds Foldkit h.* text and setupWorker declarations", () => {
    const result = scan(
      "src/main.ts",
      `import { setupWorker } from "msw/browser"
export const worker = setupWorker()
const view = (h) => h.div([h.Title("Menu title")], [h.p([], ["Prices include VAT."]), h.span([], [model.name])])`,
    )
    expect(result.workers).toEqual(["worker"])
    expect(result.literals.map((literal) => literal.text)).toEqual(["Menu title", "Prices include VAT."])
    expect(result.literals[1]?.component).toBe("view")
  })
})
