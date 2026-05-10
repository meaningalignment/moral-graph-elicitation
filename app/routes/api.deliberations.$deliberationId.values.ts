import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { randomUUID } from "node:crypto"
import { db } from "~/config.server"
import { ensureClaimedAgent } from "~/services/agent/auth.server"
import { persistArticulatedCard } from "~/services/articulation/chat"

/**
 * `POST /api/deliberations/:deliberationId/values`
 *
 * Direct submission of a values card — skips the multi-turn chat. Useful for
 * agents that already know exactly what they want to submit (e.g. on a
 * subsequent revision-and-resubmit).
 *
 * Body: `{ questionId, title, description, policies, threadId? }`
 *
 * The synthesized transcript records this as a direct API submission so the
 * card is distinguishable from chat-articulated ones in `/agents/:id`.
 */
export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } })
  }
  const ctx = await ensureClaimedAgent(request)
  const deliberationId = Number(params.deliberationId)
  if (!Number.isFinite(deliberationId)) {
    return json({ error: "invalid_deliberation_id" }, { status: 400 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: "invalid_json" }, { status: 400 })
  }

  const questionId = Number(body.questionId)
  const title = typeof body.title === "string" ? body.title.trim() : ""
  const description =
    typeof body.description === "string" ? body.description.trim() : ""
  const policies = Array.isArray(body.policies)
    ? body.policies.filter((p: unknown) => typeof p === "string")
    : []

  if (!Number.isFinite(questionId) || !title || !description || policies.length === 0) {
    return json(
      {
        error: "invalid_body",
        message:
          "`questionId` (number), `title` (string), `description` (string), and non-empty `policies` (string[]) are required.",
      },
      { status: 422 }
    )
  }

  const question = await db.question.findUnique({ where: { id: questionId } })
  if (!question || question.deliberationId !== deliberationId) {
    return json({ error: "question_not_in_deliberation" }, { status: 422 })
  }

  const threadId =
    typeof body.threadId === "string" && body.threadId.length > 0
      ? body.threadId
      : `agent-direct-${ctx.agent.id}-q${questionId}-${randomUUID().slice(0, 8)}`

  const toolCallId = `direct_${threadId.slice(0, 8)}`
  const card = { title, description, policies }

  const { chat, valuesCard } = await persistArticulatedCard({
    authorId: ctx.representativeUser.id,
    threadId,
    deliberationId,
    questionId,
    transcript: [
      { role: "user", content: "[direct submission via Agent API]" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: toolCallId,
            type: "function",
            function: { name: "submit_values_card", arguments: JSON.stringify(card) },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: toolCallId,
        name: "submit_values_card",
        content: JSON.stringify({ ok: true }),
      },
    ],
    card,
    evaluation: {
      agent: { id: ctx.agent.id, name: ctx.agent.name },
      direct_submission: true,
    },
  })

  return json(
    {
      card_id: valuesCard.id,
      chat_id: chat.id,
      thread_id: threadId,
      title: valuesCard.title,
      description: valuesCard.description,
      policies: valuesCard.policies,
    },
    { status: 201 }
  )
}
