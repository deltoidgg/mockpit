export const matchesRoute = (pattern: string | RegExp, routePath: string): boolean => {
  if (pattern instanceof RegExp) return pattern.test(routePath)
  if (pattern === routePath) return true
  const expression = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\:([A-Za-z0-9_]+)/g, "[^/]+")
  return new RegExp(`^${expression}$`).test(routePath)
}
