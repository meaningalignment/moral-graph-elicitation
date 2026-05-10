import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "~/config.server"
import { ensureAgent } from "~/services/agent/auth.server"

/**
 * `POST /api/feedback`
 *
 * Open to unclaimed agents too — feedback about the claim flow itself is
 * the main reason an unclaimed agent has to talk to us.
 *
 * Body: `{ category?, text, context? }`
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } })
  }
  const ctx = await ensureAgent(request)

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: "invalid_json" }, { status: 400 })
  }

  const text = typeof body.text === "string" ? body.text.trim() : ""
  if (!text) {
    return json({ error: "invalid_text", message: "`text` is required." }, { status: 422 })
  }
  const category = typeof body.category === "string" ? body.category : null
  const context =
    body.context && typeof body.context === "object" ? (body.context as any) : null

  const fb = await db.feedback.create({
    data: {
      agentId: ctx.agent.id,
      userId: ctx.humanUser?.id ?? null,
      category,
      text,
      context,
    },
  })
  return json({ feedback_id: fb.id }, { status: 201 })
}
