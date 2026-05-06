#!/usr/bin/env tsx
/**
 * scripts/db.ts — read-only Postgres query helper.
 *
 * Uses Neon's HTTPS serverless driver so it works in environments where
 * raw 5432/tcp is firewalled (CI sandboxes, etc.).
 *
 * Usage:
 *   tsx scripts/db.ts "SELECT COUNT(*) FROM \"Deliberation\""
 *   tsx scripts/db.ts --file path/to/query.sql
 *   tsx scripts/db.ts --json "SELECT * FROM \"User\" LIMIT 3"
 */
import { neon } from "@neondatabase/serverless"
import fs from "node:fs"
import "dotenv/config"

const args = process.argv.slice(2)
let asJson = false
let queryArg: string | undefined

for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === "--json") asJson = true
  else if (a === "--file") queryArg = fs.readFileSync(args[++i], "utf8")
  else if (!queryArg) queryArg = a
}

if (!queryArg) {
  console.error('Usage: tsx scripts/db.ts [--json] "SQL" | --file path.sql')
  process.exit(1)
}

const url = process.env.POSTGRES_URL
if (!url) {
  console.error("POSTGRES_URL is not set. Add it to .env.")
  process.exit(1)
}

const sql = neon(url)

// Use sql.query for free-form strings (sql`` is for tagged template literals).
const rows = await sql.query(queryArg)
if (asJson) {
  process.stdout.write(JSON.stringify(rows, null, 2) + "\n")
} else if (Array.isArray(rows) && rows.length === 0) {
  console.log("(no rows)")
} else {
  console.table(rows)
}
