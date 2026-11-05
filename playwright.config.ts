import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: { viewport: { width: 1280, height: 860 } },
  webServer: [
    {
      command: "rm -rf .mockpit && npx vite --host 127.0.0.1 --port 5190 --strictPort",
      cwd: "examples/react-msw",
      url: "http://127.0.0.1:5190/__mockpit/ping",
      reuseExistingServer: false,
    },
    {
      command: "rm -rf .mockpit && npx vite --host 127.0.0.1 --port 5191 --strictPort",
      cwd: "examples/foldkit-cafe",
      url: "http://127.0.0.1:5191/__mockpit/ping",
      reuseExistingServer: false,
    },
  ],
})
