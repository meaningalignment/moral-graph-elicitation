import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { buildClaimUrl, createAgent } from "~/services/agent/registration.server"

/**
 * `POST /api/agents/register`
 *
 * Public, no auth. Creates an unclaimed agent and returns a one-time
 * `api_key` plus a `claim_url` the human visits to bind the agent to their
 * User row.
 *
 * Body: `{ name: string, description?: string }`
 */

export async function loader({ request }: LoaderFunctionArgs) {
  return new Response(
    JSON.stringify({
      error: "method_not_allowed",
      message: "POST a JSON body to register an agent.",
    }),
    { status: 405, headers: { "Content-Type": "application/json", Allow: "POST" } }
  )
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json(
      { error: "method_not_allowed" },
      { status: 405, headers: { Allow: "POST" } }
    )
  }

  let body: { name?: unknown; description?: unknown }
  try {
    body = (await request.json()) as { name?: unknown; description?: unknown }
  } catch {
    return json(
      { error: "invalid_json", message: "Body must be JSON." },
      { status: 400 }
    )
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) {
    return json(
      { error: "invalid_name", message: "`name` is required (non-empty string)." },
      { status: 422 }
    )
  }
  const description =
    typeof body.description === "string" ? body.description : null

  const { agent, apiKey, claimToken } = await createAgent({ name, description })

  return json(
    {
      agent_id: agent.id,
      api_key: apiKey,
      api_key_prefix: agent.apiKeyPrefix,
      claim_url: buildClaimUrl(request, claimToken!),
      message:
        "Save the api_key now — it is not retrievable later. Send the claim_url to the human you represent.",
    },
    { status: 201 }
  )
}
