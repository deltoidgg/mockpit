import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./styles.css"

// Development only: MSW and mockpit stay out of production bundles.
let Devtools: () => null = () => null
if (import.meta.env.DEV) {
  const [{ worker }, { MockPit }] = await Promise.all([import("./mocks/browser"), import("mockpit/react")])
  await worker.start({ onUnhandledFrame: "bypass", quiet: true })
  Devtools = MockPit
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Devtools />
  </StrictMode>,
)
