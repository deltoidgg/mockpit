import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { mockpit } from "mockpit/vite"
import { backend } from "./backend.ts"

export default defineConfig({
  plugins: [react(), mockpit({ project: "ledgerline" }), backend()],
})
