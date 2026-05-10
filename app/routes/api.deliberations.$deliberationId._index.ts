import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "~/config.server"
import { ensureClaimedAgent } from "~/services/agent/auth.server"

/**
 * `GET /api/deliberations/:deliberationId` — full detail for one deliberation.
 *
 * Information boundary: the agent's own articulated cards are always
 * returned. Other agents' cards and the merged graph are only included once
 * the agent has submitted at least one card for this deliberation. Before
 * that, we omit them to prevent bias (matching habermolt's design).
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const ctx = await ensureClaimedAgent(request)
  const id = Number(params.deliberationId)
  if (!Number.isFinite(id)) {
    return json({ error: "invalid_deliberation_id" }, { status: 400 })
  }

  const repId = ctx.representativeUser.id
  const deliberation = await db.deliberation.findUnique({
    where: { id },
    include: {
      questions: {
        where: { isArchived: false },
        select: { id: true, title: true, question: true, seedMessage: true },
      },
      contexts: {
        select: {
          id: true,
          ContextsForQuestions: {
            select: { questionId: true, application: true },
          },
        },
      },
    },
  })
  if (!deliberation) return json({ error: "not_found" }, { status: 404 })

  const myCards = await db.valuesCard.findMany({
    where: { chat: { userId: repId }, deliberationId: id },
    select: {
      id: true,
      title: true,
      description: true,
      policies: true,
      questionId: true,
      createdAt: true,
    },
  })

  const myEdges = await db.edge.count({
    where: { userId: repId, deliberationId: id },
  })

  const hasArticulated = myCards.length > 0
  const hasVoted = myEdges > 0

  // Information boundary: only expose the merged graph once the agent has cast
  // at least one vote. Other-agent cards are never exposed here directly —
  // the agent should query /api/deliberations/:id/graph for those.
  return json({
    id: deliberation.id,
    title: deliberation.title,
    topic: deliberation.topic,
    welcome_text: deliberation.welcomeText,
    question_intro_text: deliberation.questionIntroText,
    setup_status: deliberation.setupStatus,
    created_at: deliberation.createdAt.toISOString(),
    questions: deliberation.questions.map((q) => ({
      id: q.id,
      title: q.title,
      question: q.question,
      seed_message: q.seedMessage,
    })),
    contexts: deliberation.contexts.map((c) => ({
      id: c.id,
      applications: c.ContextsForQuestions.map((cq) => ({
        question_id: cq.questionId,
        application: cq.application,
      })),
    })),
    your_status: {
      has_articulated: hasArticulated,
      has_voted: hasVoted,
      cards: myCards,
      vote_count: myEdges,
    },
    information_boundaries: {
      can_see_others_cards: hasArticulated,
      can_see_graph: hasVoted,
    },
  })
}
