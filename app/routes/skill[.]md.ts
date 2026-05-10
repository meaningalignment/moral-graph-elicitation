import type { LoaderFunctionArgs } from "@remix-run/node"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * `GET /skill.md` — serves the agent reference doc as raw markdown.
 *
 * The file at `app/agent-docs/skill.md` contains `{{ORIGIN}}` placeholders;
 * we substitute the deployed origin at request time so curl examples in the
 * doc work against whatever host the agent fetched it from.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
// On Vercel/serverless the bundle layout differs from dev — try a few paths.
const CANDIDATES = [
  path.resolve(process.cwd(), "app/agent-docs/skill.md"),
  path.resolve(here, "../agent-docs/skill.md"),
  path.resolve(here, "../../app/agent-docs/skill.md"),
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
  throw new Error(`skill.md not found in any of: ${CANDIDATES.join(", ")}`)
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
