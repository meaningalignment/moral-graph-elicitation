import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "~/config.server"
import { ensureAgent } from "~/services/agent/auth.server"
import { buildClaimUrl } from "~/services/agent/registration.server"
import { drawFreceny } from "~/services/hypothesis-selection"
import { SKILL_VERSION } from "~/agent-docs/version"

/**
 * `GET /api/agent-status` — the single endpoint a heartbeating agent calls
 * each cycle. Returns:
 *
 *   - `is_claimed`: false → no work; surface claim_url to the human
 *   - `actions[]`: pending tasks across deliberations the agent has joined
 *   - `discovered[]`: deliberations the agent hasn't yet joined
 *   - `pending_disapprovals[]`: human-flagged actions that need correction
 *
 * Bumps `lastHeartbeatAt`. Allowed for unclaimed agents (returns is_claimed: false).
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const ctx = await ensureAgent(request)

  if (!ctx.isClaimed) {
    return json({
      is_claimed: false,
      claim_url: ctx.agent.claimToken
        ? buildClaimUrl(request, ctx.agent.claimToken)
        : null,
      message:
        "Send the claim_url to your human. They must claim this agent before any actions are available.",
      skill_version: SKILL_VERSION,
    })
  }

  const repId = ctx.representativeUser.id
  const agentId = ctx.agent.id

  // Bump heartbeat marker (best-effort, fire-and-forget).
  db.agent
    .update({ where: { id: agentId }, data: { lastHeartbeatAt: new Date() } })
    .catch(() => {})

  // Compute joined deliberations: any chat OR edge attributed to the rep user.
  const [chats, edges] = await Promise.all([
    db.chat.findMany({
      where: { userId: repId },
      select: { deliberationId: true, questionId: true },
    }),
    db.edge.findMany({
      where: { userId: repId },
      select: { deliberationId: true, fromId: true, toId: true },
    }),
  ])

  const joinedDeliberationIds = new Set<number>([
    ...chats.map((c) => c.deliberationId),
    ...edges.map((e) => e.deliberationId),
  ])

  // For each joined deliberation, build action items.
  const joinedDeliberations =
    joinedDeliberationIds.size > 0
      ? await db.deliberation.findMany({
          where: { id: { in: [...joinedDeliberationIds] } },
          include: {
            questions: { where: { isArchived: false }, select: { id: true, title: true, question: true } },
          },
        })
      : []

  const articulatedByDeliberation = new Map<number, Set<number>>()
  for (const c of chats) {
    if (!articulatedByDeliberation.has(c.deliberationId)) {
      articulatedByDeliberation.set(c.deliberationId, new Set())
    }
    // A chat may not have produced a card; we conservatively treat the
    // existence of a Chat as "started" — the actual article presence check
    // happens via the joined ValuesCard rows below for finer-grain output.
  }

  // Pull any ValuesCard rows the rep authored, grouped by (deliberation, question).
  const cards = await db.valuesCard.findMany({
    where: { chat: { userId: repId } },
    select: { deliberationId: true, questionId: true, id: true },
  })
  const cardsByDQ = new Map<string, number>()
  for (const c of cards) {
    cardsByDQ.set(`${c.deliberationId}:${c.questionId}`, c.id)
  }

  const actions: Array<Record<string, unknown>> = []

  for (const d of joinedDeliberations) {
    // Articulation gaps: any question without a submitted card.
    for (const q of d.questions) {
      if (!cardsByDQ.has(`${d.id}:${q.id}`)) {
        actions.push({
          type: "articulate_values",
          deliberation_id: d.id,
          deliberation_title: d.title,
          question_id: q.id,
          question_title: q.title,
          why: "You started this deliberation but haven't submitted a values card for this question yet.",
        })
      }
    }

    // Voting opportunities: drawFreceny will return current options. We don't
    // pre-filter against existing votes here (the agent fetches /upgrades to
    // get the live list and the `your_previous_vote` field). Just signal that
    // there's something to vote on.
    const draw = await drawFreceny(d.id, 5).catch(() => [])
    if (draw.length > 0) {
      actions.push({
        type: "vote_on_upgrades",
        deliberation_id: d.id,
        deliberation_title: d.title,
        count_available: draw.length,
        why: "There are wisdom-upgrade stories drawn for you to vote on.",
      })
    }
  }

  // Discovery: deliberations the agent hasn't joined. Limit to 5.
  const allReady = await db.deliberation.findMany({
    where: { setupStatus: "ready", id: { notIn: [...joinedDeliberationIds] } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      topic: true,
      createdAt: true,
      _count: { select: { questions: true, chats: true } },
    },
  })

  const discovered = allReady.map((d) => ({
    deliberation_id: d.id,
    title: d.title,
    topic: d.topic,
    num_questions: d._count.questions,
    num_participants_approx: d._count.chats,
    created_at: d.createdAt.toISOString(),
  }))

  // Pending disapprovals.
  const disapprovals = await db.agentDisapproval.findMany({
    where: { agentId, status: "pending" },
    orderBy: { createdAt: "asc" },
  })

  const pending_disapprovals = disapprovals.map((d) => ({
    notification_id: d.id,
    action_type: d.actionType,
    deliberation_id: d.deliberationId,
    target_key: d.targetKey,
    reason: d.reason,
    created_at: d.createdAt.toISOString(),
  }))

  return json({
    is_claimed: true,
    is_self_represented: ctx.isSelfRepresented,
    human: ctx.humanUser
      ? { id: ctx.humanUser.id, name: ctx.humanUser.name, email: ctx.humanUser.email }
      : null,
    agent: {
      id: agentId,
      name: ctx.agent.name,
      api_key_prefix: ctx.agent.apiKeyPrefix,
      last_heartbeat_at: new Date().toISOString(),
    },
    actions,
    discovered,
    pending_disapprovals,
    skill_version: SKILL_VERSION,
  })
}
