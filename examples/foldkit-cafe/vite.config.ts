import type { IncomingMessage } from "node:http"
import { defineConfig, type Plugin } from "vite"
import { foldkit } from "@foldkit/vite-plugin"
import { mockpit } from "mockpit/vite"
import { RPC_PATH } from "./src/api.ts"

/** Serve the Worker's RPC handler in dev, the way `alchemy dev` would. */
const localWorker = (): Plugin => ({
  name: "local-worker",
  configureServer(server) {
    let handler: ((request: Request) => Promise<Response>) | undefined
    server.middlewares.use(async (request: IncomingMessage, response, next) => {
      if (!request.url?.startsWith(RPC_PATH)) return next()
      handler ??= (await server.ssrLoadModule("/worker/api.ts")).makeWebHandler()
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(chunk as Buffer)
      const web = await handler!(
        new Request(`http://localhost${request.url}`, {
          method: request.method ?? "POST",
          headers: request.headers as Record<string, string>,
          body: chunks.length > 0 ? Buffer.concat(chunks) : null,
        }),
      )
      response.statusCode = web.status
      web.headers.forEach((value, key) => response.setHeader(key, value))
      response.end(Buffer.from(await web.arrayBuffer()))
    })
  },
})

export default defineConfig({
  plugins: [foldkit(), mockpit({ project: "fold-and-grind" }), localWorker()],
})
