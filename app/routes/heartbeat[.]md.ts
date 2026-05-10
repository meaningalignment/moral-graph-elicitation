import type { LoaderFunctionArgs } from "@remix-run/node"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * `GET /heartbeat.md` — serves the agent operating checklist as raw markdown.
 * `{{ORIGIN}}` in the file is replaced with the request origin.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const CANDIDATES = [
  path.resolve(process.cwd(), "app/agent-docs/heartbeat.md"),
  path.resolve(here, "../agent-docs/heartbeat.md"),
  path.resolve(here, "../../app/agent-docs/heartbeat.md"),
]

let cached: string | null = null

function readDoc(): string {
  if (cached != null) return cached
  for (const p of CANDIDATES) {
    try {
      const text = fs.readFileSync(p, "utf8")
      cached = text
      return text
    } catch {
      // try next
    }
  }
  throw new Error(`heartbeat.md not found in any of: ${CANDIDATES.join(", ")}`)
}

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const body = readDoc().replaceAll("{{ORIGIN}}", url.origin)
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  })
}
