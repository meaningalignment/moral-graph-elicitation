import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "~/config.server"
import { ensureClaimedAgent } from "~/services/agent/auth.server"
import { castEdgeVote } from "~/services/voting.server"

/**
 * `POST /api/deliberations/:deliberationId/upgrades/vote`
 *
 * Submit one or many edge votes. Each vote is upserted via the shared
 * `castEdgeVote` helper (the same path the web UI uses). The composite PK
 * `(userId, fromId, toId)` makes resubmission idempotent — re-voting on the
 * same upgrade replaces the previous vote rather than erroring.
 *
 * If `story` is omitted, we look it up from the corresponding `EdgeHypothesis`
 * row so the agent doesn't need to echo it back.
 *
 * Body: `{ votes: [{ from_id, to_id, context_id, type, comment? }] }`
 */
type VoteInput = {
  from_id?: unknown
  to_id?: unknown
  context_id?: unknown
  type?: unknown
  comment?: unknown
  story?: unknown
}

const VALID_TYPES = new Set(["upgrade", "no_upgrade", "not_sure"])

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } })
  }
  const ctx = await ensureClaimedAgent(request)
  const deliberationId = Number(params.deliberationId)
  if (!Number.isFinite(deliberationId)) {
    return json({ error: "invalid_deliberation_id" }, { status: 400 })
  }

  let body: { votes?: VoteInput[] }
  try {
    body = (await request.json()) as { votes?: VoteInput[] }
  } catch {
    return json({ error: "invalid_json" }, { status: 400 })
  }

  const votes = Array.isArray(body.votes) ? body.votes : []
  if (votes.length === 0) {
    return json({ error: "no_votes", message: "Provide a non-empty `votes` array." }, { status: 422 })
  }

  const repId = ctx.representativeUser.id
  const accepted: Array<{ from_id: number; to_id: number; context_id: string; type: string }> = []
  const rejected: Array<{ index: number; reason: string; detail?: string }> = []

  for (let i = 0; i < votes.length; i++) {
    const v = votes[i]
    const fromId = Number(v.from_id)
    const toId = Number(v.to_id)
    const contextId = typeof v.context_id === "string" ? v.context_id : ""
    const type = typeof v.type === "string" ? v.type : ""
    const comment = typeof v.comment === "string" ? v.comment : null

    if (
      !Number.isFinite(fromId) ||
      !Number.isFinite(toId) ||
      !contextId ||
      !VALID_TYPES.has(type)
    ) {
      rejected.push({ index: i, reason: "invalid_fields" })
      continue
    }

    // Look up story from the hypothesis if the agent didn't supply one. The
    // hypothesis is also our existence-check that this edge is votable.
    let story = typeof v.story === "string" ? v.story : ""
    if (!story) {
      const hyp = await db.edgeHypothesis.findUnique({
        where: {
          fromId_toId_contextId_deliberationId: {
            fromId,
            toId,
            contextId,
            deliberationId,
          },
        },
      })
      if (!hyp) {
        rejected.push({ index: i, reason: "hypothesis_not_found" })
        continue
      }
      story = hyp.story ?? ""
    }

    try {
      await castEdgeVote({
        userId: repId,
        deliberationId,
        fromId,
        toId,
        contextId,
        type: type as any,
        story,
        comment,
      })
      accepted.push({ from_id: fromId, to_id: toId, context_id: contextId, type })
    } catch (e) {
      rejected.push({ index: i, reason: "upsert_failed", detail: (e as Error).message })
    }
  }

  return json({
    accepted: accepted.length,
    rejected,
    votes: accepted,
  })
}
