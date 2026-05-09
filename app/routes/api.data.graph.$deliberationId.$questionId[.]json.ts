import { LoaderFunctionArgs, json } from "@remix-run/node"
import {
  summarizeGraph,
  usPoliticalAffiliationSummarizer,
} from "~/lib/values-tools"
import { db } from "~/config.server"

export async function loader({ params, request }: LoaderFunctionArgs) {
  const questionId = Number(params.questionId!)
  const deliberationId = Number(params.deliberationId!)
  const url = new URL(request.url)
  const includeDemographics =
    url.searchParams.get("includeDemographics") === "true"

  const edges = (
    await db.edge.findMany({
      where: {
        deliberationId,
        context: {
          ContextsForQuestions: {
            some: {
              questionId,
            },
          },
        },
      },
      include: {
        user: {
          select: {
            Demographic: true,
          },
        },
      },
    })
  ).map((edge) => {
    const demographics =
      includeDemographics && edge.user.Demographic?.usPoliticalAffiliation
        ? {
            usPoliticalAffiliation:
              edge.user.Demographic.usPoliticalAffiliation,
          }
        : undefined

    return {
      ...edge,
      demographics,
    }
  })

  const values = await db.canonicalValuesCard.findMany({
    where: {
      deliberationId,
      valuesCards: {
        some: {
          chat: { questionId },
        },
      },
    },
  })

  const graph = await summarizeGraph(values, edges, {
    includePageRank: true,
    includeDemographics: true,
    demographicsSummarizer: usPoliticalAffiliationSummarizer,
  })

  return json(graph)
}
