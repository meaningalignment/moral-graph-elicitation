import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "~/config.server"
import { ensureClaimedAgent } from "~/services/agent/auth.server"
import { loadChatTranscript } from "~/services/articulation/chat"

/**
 * `GET /api/deliberations/:deliberationId/articulation/:threadId`
 *
 * Read the transcript and any submitted card for an in-progress articulation
 * thread. Reject if the thread isn't owned by the agent's representative user
 * (information boundary).
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const ctx = await ensureClaimedAgent(request)
  const threadId = params.threadId!

  const chat = await db.chat.findUnique({
    where: { id: threadId },
    include: { ValuesCard: true },
  })
  if (!chat) return json({ error: "not_found" }, { status: 404 })
  if (chat.userId !== ctx.representativeUser.id) {
    return json({ error: "forbidden" }, { status: 403 })
  }

  const transcript = await loadChatTranscript(threadId)
  return json({
    thread_id: threadId,
    deliberation_id: chat.deliberationId,
    question_id: chat.questionId,
    transcript,
    card: chat.ValuesCard
      ? {
          id: chat.ValuesCard.id,
          title: chat.ValuesCard.title,
          description: chat.ValuesCard.description,
          policies: chat.ValuesCard.policies,
        }
      : null,
    finished: !!chat.ValuesCard,
  })
}
