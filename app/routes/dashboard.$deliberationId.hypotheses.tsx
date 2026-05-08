import { LoaderFunctionArgs, json } from "@remix-run/node"
import {
  NavLink,
  Outlet,
  useLoaderData,
  useParams,
  useFetcher,
} from "@remix-run/react"
import { db, inngest } from "~/config.server"
import { cn, encodeString } from "~/lib/utils"
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert"
import { AlertCircle } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Button } from "~/components/ui/button"
import { useState } from "react"

export async function loader({ params }: LoaderFunctionArgs) {
  const { deliberationId } = params

  // Awaited directly. defer() doesn't stream on Vercel's Node runtime.
  const [hypotheses, questions, contexts] = await Promise.all([
    db.edgeHypothesis.findMany({
      orderBy: { createdAt: "desc" },
      where: { deliberationId: Number(deliberationId)! },
      select: {
        fromId: true,
        toId: true,
        story: true,
        hypothesisRunId: true,
        createdAt: true,
        contextId: true,
        from: { select: { id: true, title: true, description: true } },
        to: { select: { id: true, title: true, description: true } },
      },
    }),
    db.question.findMany({
      where: { deliberationId: Number(deliberationId) },
      select: {
        id: true,
        title: true,
        ContextsForQuestions: { select: { contextId: true } },
      },
    }),
    db.context.findMany({
      where: { deliberationId: Number(deliberationId) },
      include: {
        ContextsForQuestions: { select: { questionId: true } },
      },
    }),
  ])

  return json({ hypotheses, questions, contexts })
}

export async function action({ request, params }: LoaderFunctionArgs) {
  const { deliberationId } = params

  await inngest.send({
    name: "hypothesize",
    data: { deliberationId: Number(deliberationId) },
  })

  return json({ success: true })
}

export default function AdminHypotheses() {
  const data = useLoaderData<typeof loader>()
  return <HypothesesView data={data} />
}

function HypothesesView({
  data,
}: {
  data: {
    hypotheses: any[]
    questions: any[]
    contexts: any[]
  }
}) {
  const { deliberationId } = useParams()
  const fetcher = useFetcher()
  const [selectedQuestion, setSelectedQuestion] = useState<string>("all")
  const [selectedContext, setSelectedContext] = useState<string>("all")
  const [selectedRunId, setSelectedRunId] = useState<string>("all")

  // Filter hypotheses based on selected question/context
  const filteredHypotheses = data.hypotheses.filter((hypothesis) => {
    if (
      selectedQuestion === "all" &&
      selectedContext === "all" &&
      selectedRunId === "all"
    )
      return true

    if (selectedContext !== "all" && hypothesis.contextId !== selectedContext)
      return false

    if (
      selectedRunId !== "all" &&
      hypothesis.hypothesisRunId?.toString() !== selectedRunId
    )
      return false

    if (selectedQuestion !== "all") {
      // Find if the context is linked to the selected question
      const context = data.contexts.find((c) => c.id === hypothesis.contextId)
      return context?.ContextsForQuestions.some(
        (cq) => cq.questionId.toString() === selectedQuestion
      )
    }

    return true
  })

  // Get unique run IDs with their dates
  const runIdsWithDates = Array.from(
    new Set(data.hypotheses.map((h) => h.hypothesisRunId))
  )
    .filter(Boolean)
    .map((runId) => {
      const firstHypothesis = data.hypotheses.find(
        (h) => h.hypothesisRunId === runId
      )
      return {
        runId,
        date: firstHypothesis
          ? new Date(firstHypothesis.createdAt)
          : new Date(),
      }
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime()) // Sort by date descending

  return (
    <div className="flex h-[calc(100vh-4rem)] -mt-4 -mx-4 sm:-mx-6">
      <aside className="w-80 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="px-4 pt-5 pb-3 border-b border-border">
          <h2 className="text-base font-semibold tracking-tight">Hypotheses</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filteredHypotheses.length} upgrade
            {filteredHypotheses.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="px-4 py-3 space-y-2 border-b border-border">
          <Select value={selectedQuestion} onValueChange={setSelectedQuestion}>
            <SelectTrigger className="h-9 w-full text-sm">
              <SelectValue placeholder="All questions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All questions</SelectItem>
              {data.questions.map((question) => (
                <SelectItem key={question.id} value={question.id.toString()}>
                  {question.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedContext} onValueChange={setSelectedContext}>
            <SelectTrigger className="h-9 w-full text-sm">
              <SelectValue placeholder="All contexts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All contexts</SelectItem>
              {data.contexts.map((context) => (
                <SelectItem key={context.id} value={context.id}>
                  {context.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedRunId} onValueChange={setSelectedRunId}>
            <SelectTrigger className="h-9 w-full text-sm">
              <SelectValue placeholder="All runs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All runs</SelectItem>
              {runIdsWithDates.map(({ runId, date }) => (
                <SelectItem key={runId} value={runId}>
                  {date.toLocaleDateString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <fetcher.Form method="post" className="w-full pt-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle" ? "Generating…" : "Generate more"}
            </Button>
          </fetcher.Form>
        </div>

        <div className="flex-1 overflow-y-auto">
          <ul className="divide-y divide-border">
            {filteredHypotheses.map((hypothesis) => (
              <li
                key={`${hypothesis.fromId}-${hypothesis.toId}-${hypothesis.contextId}`}
              >
                <NavLink
                  prefetch="intent"
                  to={`/dashboard/${deliberationId}/hypotheses/${
                    hypothesis.fromId
                  }/${hypothesis.toId}/${encodeString(hypothesis.contextId)}`}
                  className={({ isActive, isPending }) =>
                    cn(
                      "relative block px-4 py-3 hover:bg-muted/60 transition-colors",
                      (isPending || isActive) && "bg-secondary/60",
                      isActive &&
                        "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-primary"
                    )
                  }
                >
                  <div
                    className="text-sm font-medium leading-snug truncate"
                    title={`${hypothesis.from!.title} → ${hypothesis.to!.title}`}
                  >
                    {hypothesis.from!.title}{" "}
                    <span className="text-muted-foreground">→</span>{" "}
                    {hypothesis.to!.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {new Date(hypothesis.createdAt).toLocaleDateString()}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground truncate">
                      · {hypothesis.contextId}
                    </span>
                  </div>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          {filteredHypotheses.length === 0 ? (
            <Alert className="bg-muted">
              <div className="flex flex-row space-x-2">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No hypotheses found</AlertTitle>
              </div>
              <AlertDescription>
                {selectedQuestion !== "all" || selectedContext !== "all"
                  ? "No hypotheses match your selected filters."
                  : "No hypotheses available. Hypothesized value upgrades will appear here once they are generated."}
              </AlertDescription>
            </Alert>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </div>
  )
}
