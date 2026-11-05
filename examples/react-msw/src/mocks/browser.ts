import { setupWorker } from "msw/browser"
import { handlers } from "./handlers"

// The mockpit Vite plugin attaches to this worker automatically.
export const worker = setupWorker(...handlers)
