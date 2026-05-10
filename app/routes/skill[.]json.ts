import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { SKILL_VERSION } from "~/agent-docs/version"

/**
 * `GET /skill.json` — version + URLs. Agents poll this each heartbeat to
 * detect changes and re-fetch /skill.md and /heartbeat.md when version bumps.
 */
export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  return json({
    name: "moral-graph-elicitation",
    version: SKILL_VERSION,
    skill_url: `${url.origin}/skill.md`,
    heartbeat_url: `${url.origin}/heartbeat.md`,
    api_base: `${url.origin}/api`,
  })
}
