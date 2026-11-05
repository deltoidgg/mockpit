#!/usr/bin/env node
import { run } from "./index.js"

const result = await run(process.argv.slice(2))
if (result.output) (result.code === 0 ? process.stdout : process.stderr).write(result.output.endsWith("\n") ? result.output : `${result.output}\n`)
process.exit(result.code)
