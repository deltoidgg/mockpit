#!/usr/bin/env node

export * from "./program"

import { runMockPitCli } from "./program"

if (isEntrypoint()) {
  runMockPitCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

function isEntrypoint(): boolean {
  const invoked = process.argv[1]
  return Boolean(invoked && (invoked.endsWith("/mockpit") || invoked.endsWith("/index.js")))
}
