import { useEffect, useState } from "react"
import { MoralGraph } from "~/components/moral-graph"
import { Loader2, Settings as SettingsIcon, X } from "lucide-react"
import MoralGraphSettings, {
  GraphSettings,
  defaultGraphSettings,
} from "~/components/moral-graph-settings"
import { useLoaderData, useParams, useSearchParams } from "@remix-run/react"
import { LoaderFunctionArgs } from "@remix-run/node"
import { db } from "~/config.server"
import { Question } from "@prisma/client"
import { cn } from "~/lib/utils"

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
  const [settingsOpen, setSettingsOpen] = useState(false)
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
    <div className="flex flex-col md:flex-row min-h-screen w-full overflow-x-hidden relative">
      {/* Graph */}
      <div className="grow min-w-0">
        {graph && graph.values.length < 2 && graph.edges.length < 2 && (
          <div className="h-screen w-full flex items-center justify-center px-6">
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

      {/* Mobile toggle button */}
      <button
        type="button"
        aria-label="Toggle graph settings"
        onClick={() => setSettingsOpen((s) => !s)}
        className="md:hidden fixed top-4 right-4 z-40 rounded-full border border-border bg-card shadow p-2 text-foreground"
      >
        {settingsOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <SettingsIcon className="h-5 w-5" />
        )}
      </button>

      {/* Mobile overlay */}
      {settingsOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setSettingsOpen(false)}
        />
      )}

      <div
        className={cn(
          "shrink-0 w-full md:w-80 md:max-w-sm bg-card md:static fixed inset-y-0 right-0 z-40 transition-transform duration-200 md:translate-x-0",
          settingsOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
        )}
      >
        <MoralGraphSettings
          key={JSON.stringify(settings)}
          initialSettings={settings}
          onUpdateSettings={(s) => {
            fetchData(s)
            setSettingsOpen(false)
          }}
          contexts={contexts}
        />
      </div>
    </div>
  )
}
