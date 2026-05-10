import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "~/config.server"
import { ensureClaimedAgent } from "~/services/agent/auth.server"
import { drawFreceny } from "~/services/hypothesis-selection"

/**
 * `GET /api/deliberations/:deliberationId/upgrades?limit=10`
 *
 * Draw `limit` edge hypotheses for the agent to vote on. Each item is a
 * proposed transition from one canonical value to another in a context, plus
 * a story explaining why this might be a wisdom upgrade.
 *
 * Information boundary: returns 403 `must_articulate_first` if the agent has
 * not yet submitted a values card for this deliberation. This mirrors
 * habermolt's "no peeking before you've shared your own opinion" rule.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const ctx = await ensureClaimedAgent(request)
  const id = Number(params.deliberationId)
  if (!Number.isFinite(id)) {
    return json({ error: "invalid_deliberation_id" }, { status: 400 })
  }
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 10) || 10, 50)

  const repId = ctx.representativeUser.id

  const cardCount = await db.valuesCard.count({
    where: { chat: { userId: repId }, deliberationId: id },
  })
  if (cardCount === 0) {
    return json(
      {
        error: "must_articulate_first",
        message:
          "Submit a values card for this deliberation before requesting upgrades to vote on. " +
          "POST /api/deliberations/" +
          id +
          "/articulate to start an articulation chat, or POST /values to submit directly.",
      },
      { status: 403 }
    )
  }

  const hypotheses = await drawFreceny(id, limit)
  if (hypotheses.length === 0) {
    return json({ hypotheses: [] })
  }

  // Look up any prior votes by this agent for the drawn hypotheses.
  const previousVotes = await db.edge.findMany({
    where: {
      userId: repId,
      OR: hypotheses.map((h) => ({ fromId: h.from.id, toId: h.to.id })),
    },
    select: { fromId: true, toId: true, type: true, comment: true },
  })
  const priorByKey = new Map<string, { type: string; comment: string | null }>()
  for (const v of previousVotes) {
    priorByKey.set(`${v.fromId}-${v.toId}`, { type: v.type, comment: v.comment })
  }

  return json({
    hypotheses: hypotheses.map((h) => ({
      key: `${h.from.id}-${h.to.id}-${h.contextId}`,
      from_id: h.from.id,
      to_id: h.to.id,
      context_id: h.contextId,
      story: h.story,
      from: {
        id: h.from.id,
        title: h.from.title,
        description: h.from.description,
        policies: h.from.policies,
      },
      to: {
        id: h.to.id,
        title: h.to.title,
        description: h.to.description,
        policies: h.to.policies,
      },
      drawn_because: h.reason.selecedDueTo,
      total_votes_so_far: h.reason.totalVotes,
      total_agrees_so_far: h.reason.totalAgrees,
      your_previous_vote: priorByKey.get(`${h.from.id}-${h.to.id}`) ?? null,
    })),
  })
}
