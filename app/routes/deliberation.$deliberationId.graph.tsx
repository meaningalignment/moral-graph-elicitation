import { useEffect, useState } from "react"
import { MoralGraph } from "~/components/moral-graph"
import { Loader2 } from "lucide-react"
import MoralGraphSettings, {
  GraphSettings,
  defaultGraphSettings,
} from "~/components/moral-graph-settings"
import { useLoaderData, useParams, useSearchParams } from "@remix-run/react"
import { LoaderFunctionArgs } from "@remix-run/node"
import { db } from "~/config.server"
import { Question } from "@prisma/client"

function LoadingScreen() {
  return (
    <div className="h-screen w-full mx-auto flex items-center justify-center">
      <Loader2 className="h-4 w-4 animate-spin" />
    </div>
  )
}

export async function loader({ params }: LoaderFunctionArgs) {
  const questions = await db.question.findMany({
    where: { deliberationId: Number(params.deliberationId), isArchived: false },
  })
  const contexts = await db.context.findMany({
    where: {
      deliberationId: Number(params.deliberationId),
      ContextsForQuestions: {
        some: {
          question: {
            deliberationId: Number(params.deliberationId),
            isArchived: false,
          },
        },
      },
    },
    include: {
      ContextsForQuestions: {
        select: {
          question: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  })
  return { questions, contexts }
}

export default function GraphPage() {
  const { questions, contexts } = useLoaderData<typeof loader>()
  const [searchParams] = useSearchParams()
  const contextIdParam = searchParams.get("contextId")

  const [settings, setSettings] = useState<GraphSettings>({
    questions,
    questionId: null,
    contextId: contextIdParam,
    visualizeEdgeCertainty: true,
    visualizeWisdomScore: true,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [graph, setGraph] = useState<any>(null)
  const { deliberationId } = useParams()

  useEffect(() => {
    setIsLoading(true)
    if (!graph && !isLoading) {
      fetchData(settings)
    }
  }, [contextIdParam])

  const fetchData = async (newSettings: GraphSettings) => {
    setIsLoading(true)

    const headers = { "Content-Type": "application/json" }
    const params: Record<string, string> = {}

    params.deliberationId = deliberationId!

    if (newSettings.questionId) {
      params.questionId = newSettings.questionId.toString()
    }

    if (newSettings.contextId) {
      params.contextId = newSettings.contextId
    }

    const graph = await fetch(
      "/api/data/graph?" + new URLSearchParams(params).toString(),
      { headers }
    ).then((res) => res.json())

    setSettings((prevSettings) => ({
      ...prevSettings,
      ...newSettings,
    }))
    setGraph(graph)
    setIsLoading(false)
  }

  return (
    <div style={{ display: "flex", flexDirection: "row" }}>
      {/* Graph */}
      <div className="grow">
        {graph && graph.values.length < 2 && graph.edges.length < 2 && (
          <div className="h-screen w-full flex items-center justify-center">
            <div>
              <h1 className="font-serif text-2xl font-semibold tracking-tight text-center">
                Not Enough Data
              </h1>
              <p className="text-center text-muted-foreground mt-4">
                We don't have enough data to show a graph yet. Please try again
                later.
              </p>
            </div>
          </div>
        )}

        {isLoading || !graph ? (
          <LoadingScreen />
        ) : (
          <MoralGraph
            nodes={graph.values}
            edges={graph.edges}
            settings={settings}
          />
        )}
      </div>

      <div className="md:block flex-shrink-0 max-w-sm">
        <MoralGraphSettings
          key={JSON.stringify(settings)}
          initialSettings={settings}
          onUpdateSettings={fetchData}
          contexts={contexts}
        />
      </div>
    </div>
  )
}
