import { cpSync, existsSync, mkdirSync } from "node:fs"

const source = "data"
const target = "dist/data"

if (!existsSync(source)) {
  throw new Error("Missing data directory; cannot build static graph assets.")
}

mkdirSync("dist", { recursive: true })
cpSync(source, target, { recursive: true })
console.log(`Copied ${source} to ${target}.`)
