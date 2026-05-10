import type { ActionFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { randomUUID } from "node:crypto"
import { db } from "~/config.server"
import { ensureClaimedAgent } from "~/services/agent/auth.server"
import {
  loadChatTranscript,
  persistArticulatedCard,
  runArticulationTurn,
  type ChatMessage,
} from "~/services/articulation/chat"

/**
 * `POST /api/deliberations/:deliberationId/articulate`
 *
 * Drive one user-turn of the values-articulation chat. Wraps
 * `runArticulationTurn` (services/articulation/chat.ts:38) — the same
 * primitive the human-facing `/api/chat-assistant` and the simulation runner
 * use, so agent and human articulations produce identical artifacts.
 *
 * Body: `{ questionId, message, threadId?, reasoningEffort? }`
 *
 * The agent calls this endpoint repeatedly, supplying its `threadId` from the
 * first response, until `submitted_card` is returned (typically 6-10 turns).
 *
 * Sync, with `maxDuration: 300` to absorb gpt-5 reasoning latency.
 */
export const config = { maxDuration: 300 }

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } })
  }
  const ctx = await ensureClaimedAgent(request)
  const deliberationId = Number(params.deliberationId)
  if (!Number.isFinite(deliberationId)) {
    return json({ error: "invalid_deliberation_id" }, { status: 400 })
  }

  let body: {
    questionId?: unknown
    message?: unknown
    threadId?: unknown
    reasoningEffort?: unknown
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: "invalid_json" }, { status: 400 })
  }

  const questionId = Number(body.questionId)
  const message = typeof body.message === "string" ? body.message : ""
  if (!Number.isFinite(questionId) || !message.trim()) {
    return json(
      { error: "invalid_body", message: "`questionId` (number) and `message` (string) are required." },
      { status: 422 }
    )
  }
  const reasoningEffort =
    typeof body.reasoningEffort === "string"
      ? (body.reasoningEffort as "minimal" | "low" | "medium" | "high")
      : "minimal"

  const repId = ctx.representativeUser.id
  const threadId =
    typeof body.threadId === "string" && body.threadId.length > 0
      ? body.threadId
      : `agent-${ctx.agent.id}-q${questionId}-${randomUUID().slice(0, 8)}`

  // Verify the deliberation + question exist and the question belongs to it.
  const question = await db.question.findUnique({ where: { id: questionId } })
  if (!question || question.deliberationId !== deliberationId) {
    return json({ error: "question_not_in_deliberation" }, { status: 422 })
  }
  const deliberation = await db.deliberation.findUnique({ where: { id: deliberationId } })
  if (!deliberation) return json({ error: "deliberation_not_found" }, { status: 404 })

  // Load (or create empty) transcript. If the chat exists we enforce the same
  // ownership boundary as the read endpoint.
  const existing = await db.chat.findUnique({ where: { id: threadId } })
  if (existing && existing.userId !== repId) {
    return json({ error: "thread_owned_by_other" }, { status: 403 })
  }

  let transcript: ChatMessage[] = existing
    ? await loadChatTranscript(threadId)
    : []

  // If brand new, ensure the chat row exists so subsequent reads succeed
  // even if the agent abandons the thread before submitting.
  if (!existing) {
    await db.chat.create({
      data: {
        id: threadId,
        userId: repId,
        deliberationId,
        questionId,
        transcript: [] as any,
        evaluation: { agent: { id: ctx.agent.id, name: ctx.agent.name } } as any,
      },
    })
  }

  const turn = await runArticulationTurn({
    transcript,
    userMessage: message,
    topic: deliberation.topic,
    questionTitle: question.title,
    reasoningEffort,
  })

  let cardId: number | null = null
  if (turn.submittedCard) {
    const { valuesCard } = await persistArticulatedCard({
      authorId: repId,
      threadId,
      deliberationId,
      questionId,
      transcript: turn.transcript,
      card: turn.submittedCard,
      evaluation: { agent: { id: ctx.agent.id, name: ctx.agent.name } },
    })
    cardId = valuesCard.id
  } else {
    await db.chat.update({
      where: { id: threadId },
      data: { transcript: turn.transcript as any },
    })
  }

  return json({
    thread_id: threadId,
    assistant_text: turn.assistantText,
    transcript: turn.transcript,
    submitted_card: turn.submittedCard
      ? {
          id: cardId,
          title: turn.submittedCard.title,
          description: turn.submittedCard.description,
          policies: turn.submittedCard.policies,
        }
      : null,
    finished: !!turn.submittedCard,
  })
}
