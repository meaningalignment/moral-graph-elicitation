import { LoaderFunctionArgs } from "@remix-run/node"
import { summarizeGraph } from "~/lib/values-tools"
import { db } from "~/config.server"

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const params = url.searchParams
  const questionId = params.get("questionId")
  const deliberationId = params.get("deliberationId")
  const contextId = params.get("contextId")

  if (!deliberationId) {
    return { status: 400, error: "Must specify deliberationId" }
  }

  const [values, edges] = await Promise.all([
    db.canonicalValuesCard.findMany({
      where: { deliberationId: Number(deliberationId), isArchived: false },
    }),
    db.edge.findMany({
      where: {
        deliberationId: Number(deliberationId),
        from: { isArchived: false },
        to: { isArchived: false },
        context: contextId
          ? {
              id: String(contextId),
              ContextsForQuestions: questionId
                ? {
                    some: {
                      questionId: Number(questionId),
                      question: {
                        isArchived: false,
                      },
                    },
                  }
                : undefined,
            }
          : questionId
          ? {
              ContextsForQuestions: {
                some: {
                  questionId: Number(questionId),
                  question: {
                    isArchived: false,
                  },
                },
              },
            }
          : undefined,
      },
    }),
  ])

  const options = { markedWiserThreshold: 0 } // For now!
  const graph = await summarizeGraph(values, edges, options)
  return graph
}
