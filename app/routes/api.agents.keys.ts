import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { ensureLoggedIn } from "~/config.server"
import { createAgent } from "~/services/agent/registration.server"

/**
 * `POST /api/agents/keys`
 *
 * Cowpunk-session-authenticated. Mints a self-represented agent key bound to
 * the logged-in human's own User row. The agent IS the human's interface;
 * writes attribute to the human, not to a synthetic AGENT-role user.
 *
 * Body: `{ name: string, description?: string }`
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json(
      { error: "method_not_allowed" },
      { status: 405, headers: { Allow: "POST" } }
    )
  }
  const userId = await ensureLoggedIn(request)

  let body: { name?: unknown; description?: unknown } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    // Allow form posts too — the /agents UI uses a Remix Form.
    const form = await request.formData().catch(() => null)
    if (form) {
      body = {
        name: form.get("name") ?? undefined,
        description: form.get("description") ?? undefined,
      }
    }
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

  const { agent, apiKey } = await createAgent({
    name,
    description,
    humanUserId: userId,
  })

  return json(
    {
      agent_id: agent.id,
      api_key: apiKey,
      api_key_prefix: agent.apiKeyPrefix,
      is_self_represented: true,
      message: "Save the api_key now — it is not retrievable later.",
    },
    { status: 201 }
  )
}
