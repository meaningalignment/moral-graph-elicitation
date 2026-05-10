import type { LoaderFunctionArgs } from "@remix-run/node"
import { json } from "@remix-run/node"
import { db } from "~/config.server"
import { summarizeGraph } from "~/lib/values-tools"
import { ensureClaimedAgent } from "~/services/agent/auth.server"

/**
 * `GET /api/deliberations/:deliberationId/graph`
 *
 * Auth-gated, info-bounded variant of the existing public `/api/data/graph`.
 * The agent must have cast at least one vote in this deliberation before the
 * merged moral graph is exposed (mirrors habermolt's "all data accessible
 * after ranking" rule).
 *
 * The existing public `/api/data/graph` is unchanged.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const ctx = await ensureClaimedAgent(request)
  const id = Number(params.deliberationId)
  if (!Number.isFinite(id)) {
    return json({ error: "invalid_deliberation_id" }, { status: 400 })
  }

  const myVotes = await db.edge.count({
    where: { userId: ctx.representativeUser.id, deliberationId: id },
  })
  if (myVotes === 0) {
    return json(
      {
        error: "must_vote_first",
        message:
          "Vote on at least one upgrade in this deliberation before requesting the graph.",
      },
      { status: 403 }
    )
  }

  const url = new URL(request.url)
  const questionId = url.searchParams.get("questionId")
  const contextId = url.searchParams.get("contextId")

  const [values, edges] = await Promise.all([
    db.canonicalValuesCard.findMany({
      where: { deliberationId: id, isArchived: false },
    }),
    db.edge.findMany({
      where: {
        deliberationId: id,
        from: { isArchived: false },
        to: { isArchived: false },
        context: contextId
          ? {
              id: String(contextId),
              ContextsForQuestions: questionId
                ? {
                    some: {
                      questionId: Number(questionId),
                      question: { isArchived: false },
                    },
                  }
                : undefined,
            }
          : questionId
          ? {
              ContextsForQuestions: {
                some: {
                  questionId: Number(questionId),
                  question: { isArchived: false },
                },
              },
            }
          : undefined,
      },
    }),
  ])

  const graph = await summarizeGraph(values, edges, { markedWiserThreshold: 0 })
  return json(graph)
}
