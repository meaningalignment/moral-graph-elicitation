import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db, ensureLoggedIn } from "~/config.server"

/**
 * `POST /api/agents/:agentId/disapprove`
 *
 * Cowpunk-session-authenticated. The human owner of an agent flags one of
 * the agent's actions as a misrepresentation. Inserts an `AgentDisapproval`
 * which surfaces in the agent's next `/api/agent-status` call as a
 * `pending_disapproval` to be corrected.
 *
 * Body: `{ actionType, reason, deliberationId?, targetKey? }`
 *  - actionType: one of articulate_values | vote_on_upgrades | revise_values
 *                | create_deliberation | other
 *  - targetKey: the chatId / "fromId:toId:contextId" / cardId the
 *               disapproval is about. Loose, not FK-checked.
 */

const VALID_ACTION_TYPES = new Set([
  "articulate_values",
  "vote_on_upgrades",
  "revise_values",
  "create_deliberation",
  "other",
])

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } })
  }
  const userId = await ensureLoggedIn(request)
  const agentId = params.agentId!

  const agent = await db.agent.findUnique({ where: { id: agentId } })
  if (!agent) return json({ error: "not_found" }, { status: 404 })
  if (agent.humanUserId !== userId) {
    return json({ error: "forbidden" }, { status: 403 })
  }

  // Accept JSON or form posts.
  let body: any
  try {
    body = await request.json()
  } catch {
    const form = await request.formData()
    body = Object.fromEntries(form.entries())
  }

  const actionType = typeof body.actionType === "string" ? body.actionType : ""
  const reason = typeof body.reason === "string" ? body.reason.trim() : ""
  const targetKey = typeof body.targetKey === "string" ? body.targetKey : null
  const deliberationId =
    body.deliberationId != null && Number.isFinite(Number(body.deliberationId))
      ? Number(body.deliberationId)
      : null

  if (!VALID_ACTION_TYPES.has(actionType)) {
    return json({ error: "invalid_action_type" }, { status: 422 })
  }
  if (!reason) {
    return json({ error: "reason_required" }, { status: 422 })
  }

  const disapproval = await db.agentDisapproval.create({
    data: {
      agentId,
      actionType: actionType as any,
      deliberationId,
      targetKey,
      reason,
      createdBy: userId,
    },
  })

  return json({ disapproval_id: disapproval.id, status: disapproval.status }, { status: 201 })
}
