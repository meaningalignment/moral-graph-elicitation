import { LoaderFunctionArgs } from "@remix-run/node"
import { summarizeGraph } from "~/lib/values-tools"
import graph from "~/lib/graph.json"

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const params = url.searchParams
  const questionId = params.get("questionId")
  let { values, upgrades, questions } = graph
  if (questionId && questionId !== "undefined") {
    values = values.filter((v) => v.questionId === Number(questionId))
  }
  const edges = upgrades.map((upgrade) => ({
    fromId: upgrade.fromId,
    toId: upgrade.toId,
    contextId: upgrade.context,
    type: "upgrade" as const,
  }))
  const options = { markedWiserThreshold: 0 }
  const outputGraph = await summarizeGraph(values, edges, options)
  return { ...outputGraph, questions }
}
