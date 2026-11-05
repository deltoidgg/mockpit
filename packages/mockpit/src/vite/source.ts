/**
 * Static scan of app source with oxc (via Vite's `parseSync`): string
 * literals that render as visible text, React component locations, and MSW
 * `setupWorker` declarations to attach to.
 */
import type { ComponentLocation, Literal } from "../schema/index.js"

type Node = { type: string; start: number; end: number; [key: string]: unknown }

export interface SourceScan {
  readonly literals: Literal[]
  readonly components: ComponentLocation[]
  readonly workers: string[]
}

const TEXT_ATTRIBUTES = new Set(["title", "alt", "aria-label", "placeholder", "label"])
const FOLDKIT_TEXT_ATTRIBUTES = new Set(["Title", "Alt", "AriaLabel", "Placeholder"])
const HAS_LETTER = /\p{L}/u

const lineIndex = (source: string) => {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) if (source.charCodeAt(index) === 10) starts.push(index + 1)
  return (offset: number) => {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const mid = (low + high + 1) >> 1
      if (starts[mid]! <= offset) low = mid
      else high = mid - 1
    }
    return { line: low + 1, column: offset - starts[low]! + 1 }
  }
}

const isNode = (value: unknown): value is Node => typeof value === "object" && value !== null && typeof (value as Node).type === "string"

const children = (node: Node): Node[] => {
  const out: Node[] = []
  for (const key in node) {
    if (key === "parent" || key === "start" || key === "end" || key === "type") continue
    const value = node[key]
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) out.push(item)
    } else if (isNode(value)) {
      out.push(value)
    }
  }
  return out
}

const nameOf = (node: Node): string | undefined => {
  if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ClassDeclaration") {
    const id = node["id"] as Node | null
    return id && typeof id["name"] === "string" ? (id["name"] as string) : undefined
  }
  if (node.type === "VariableDeclarator") {
    const id = node["id"] as Node
    const init = node["init"] as Node | null
    if (id?.type === "Identifier" && init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression" || init.type === "CallExpression")) {
      return id["name"] as string
    }
  }
  return undefined
}

const isComponentName = (name: string | undefined): name is string => !!name && /^[A-Z][a-z0-9]/.test(name)

const calleeName = (node: Node): string | undefined => {
  const callee = node["callee"] as Node | undefined
  if (!callee) return undefined
  if (callee.type === "Identifier") return callee["name"] as string
  if (callee.type === "MemberExpression" || callee.type === "StaticMemberExpression") {
    const property = callee["property"] as Node | undefined
    return property ? (property["name"] as string) : undefined
  }
  return undefined
}

const isFoldkitBuilderCall = (node: Node): boolean => {
  const callee = node["callee"] as Node | undefined
  if (!callee || (callee.type !== "MemberExpression" && callee.type !== "StaticMemberExpression")) return false
  const object = callee["object"] as Node | undefined
  const property = callee["property"] as Node | undefined
  return object?.type === "Identifier" && object["name"] === "h" && typeof property?.["name"] === "string" && /^[a-z]/.test(property["name"] as string)
}

const stringValue = (node: Node | undefined): string | undefined => {
  if (!node) return undefined
  if ((node.type === "Literal" || node.type === "StringLiteral") && typeof node["value"] === "string") return node["value"] as string
  if (node.type === "TemplateLiteral" && Array.isArray(node["expressions"]) && (node["expressions"] as unknown[]).length === 0) {
    const quasi = (node["quasis"] as Node[])[0]
    const value = quasi?.["value"] as { cooked?: string } | undefined
    return value?.cooked ?? undefined
  }
  return undefined
}

export const scanSource = (file: string, source: string, program: Node): SourceScan => {
  const jsx = /\.[jt]sx$/.test(file)
  const position = lineIndex(source)
  const literals: Literal[] = []
  const components: ComponentLocation[] = []
  const workers: string[] = []
  const push = (offset: number, raw: string, component: string | undefined) => {
    const text = raw.replace(/\s+/g, " ").trim()
    if (!text || text.length > 300 || !HAS_LETTER.test(text)) return
    const { line, column } = position(offset)
    literals.push({ file, line, column, text, ...(component ? { component } : {}) })
  }

  const visit = (node: Node, component: string | undefined) => {
    const name = nameOf(node)
    let scope = component
    if (name) {
      if (jsx && isComponentName(name)) {
        const { line } = position(node.start)
        components.push({ name, file, line })
      }
      scope = name
    }
    switch (node.type) {
      case "JSXText":
        push(node.start, String(node["value"] ?? ""), scope)
        break
      case "JSXAttribute": {
        const attrName = (node["name"] as Node | undefined)?.["name"]
        const value = node["value"] as Node | undefined
        const text = stringValue(value)
        if (typeof attrName === "string" && TEXT_ATTRIBUTES.has(attrName) && text) push(value!.start, text, scope)
        break
      }
      case "JSXExpressionContainer": {
        const text = stringValue(node["expression"] as Node | undefined)
        if (text) push(node.start, text, scope)
        break
      }
      case "VariableDeclarator": {
        const init = node["init"] as Node | null
        const id = node["id"] as Node
        if (init?.type === "CallExpression" && calleeName(init) === "setupWorker" && id?.type === "Identifier") workers.push(id["name"] as string)
        break
      }
      case "CallExpression": {
        if (isFoldkitBuilderCall(node)) {
          const args = node["arguments"] as Node[]
          const childList = args[1]
          if (childList?.type === "ArrayExpression") {
            for (const element of (childList["elements"] as Array<Node | null>) ?? []) {
              const text = stringValue(element ?? undefined)
              if (text && element) push(element.start, text, scope)
            }
          }
        } else {
          const callee = calleeName(node)
          if (callee && FOLDKIT_TEXT_ATTRIBUTES.has(callee)) {
            const arg = (node["arguments"] as Node[])[0]
            const text = stringValue(arg)
            if (text && arg) push(arg.start, text, scope)
          }
        }
        break
      }
    }
    for (const child of children(node)) visit(child, scope)
  }
  visit(program, undefined)
  return { literals, components: dedupeComponents(components), workers }
}

const dedupeComponents = (components: ComponentLocation[]) => {
  const seen = new Set<string>()
  return components.filter((component) => {
    const id = `${component.name}:${component.file}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}
