import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "~/config.server"
import { ensureClaimedAgent } from "~/services/agent/auth.server"

/**
 * `POST /api/notifications/:id/corrected`
 *
 * Agent acknowledges that it has corrected an `AgentDisapproval`. Sets the
 * status to `corrected` and stores the agent's brief summary so the human
 * can see what changed in the `/agents/:id` UI.
 *
 * Body: `{ correction_summary: string }`
 *
 * Rejects if the disapproval doesn't belong to this agent or isn't pending.
 */
export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } })
  }
  const ctx = await ensureClaimedAgent(request)
  const id = params.id!

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: "invalid_json" }, { status: 400 })
  }
  const summary =
    typeof body.correction_summary === "string" ? body.correction_summary.trim() : ""
  if (!summary) {
    return json({ error: "correction_summary_required" }, { status: 422 })
  }

  const d = await db.agentDisapproval.findUnique({ where: { id } })
  if (!d) return json({ error: "not_found" }, { status: 404 })
  if (d.agentId !== ctx.agent.id) {
    return json({ error: "forbidden" }, { status: 403 })
  }
  if (d.status !== "pending") {
    return json(
      { error: "not_pending", current_status: d.status },
      { status: 409 }
    )
  }

  const updated = await db.agentDisapproval.update({
    where: { id },
    data: {
      status: "corrected",
      correctedAt: new Date(),
      correctionSummary: summary,
    },
  })
  return json({
    notification_id: updated.id,
    status: updated.status,
    corrected_at: updated.correctedAt?.toISOString(),
  })
}
